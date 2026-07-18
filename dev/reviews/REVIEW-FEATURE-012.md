# Review — FEATURE-012: Pipeline Health monitoring

**Reviewer:** `@reviewer` · **Date:** 2026-07-18 · **Plan:** [FEATURE-012](../plans/FEATURE-012-pipeline-health-monitoring.md)
**Verdict:** ⚠️ Changes Recommended

## Summary

The plan is feasible and fits the project’s static-frontend/serverless architecture: a scheduled observer Lambda that writes a same-origin JSON is the right shape. The main corrections are operational rather than architectural: API-quota metrics must count failed/partial search attempts, and the frontend CloudFront module currently serves only `gold/aggregations/*`, so `gold/pipeline_health/*` would not be reachable without infrastructure changes.

No return to Architect is required. The technical plan below incorporates the fixes into executable tasks.

## Strengths

- ✅ Preserves the no-browser-AWS-credentials constraint by computing health server-side.
- ✅ Uses the existing Protocol/Adapter/Factory patterns already established in `common/`, `BronzeCollector`, and `GoldAggregator`.
- ✅ Keeps the health Lambda observational and independent from the Step Functions medallion pipeline.
- ✅ Calls out CloudWatch/Cost Explorer IAM limitations instead of pretending they can be fully resource-scoped.
- ✅ Includes frontend failure isolation so missing health JSON does not break the existing dashboard tabs.

## Findings

### 🔴 H1 — Quota metrics must count attempted API search requests, including failed runs

- **Problem:** The plan says the bronze collector emits one metric per operation “after each collection run” using `pages_fetched`. In the current collector, `_collect_operation()` only returns after pages are fetched, parsed, and persisted successfully. If a run fails after consuming one or more Idealista search requests, the metric may never be emitted.
- **Impact:** The quota light can show false green exactly when quota pressure and failures are most important.
- **Recommendation:** Instrument at search-request attempt granularity, or publish accumulated attempts in a `finally` path that survives partial operation failure. Tests must prove failed/partial pages are counted. Track credential labels explicitly: LVW = sale, PMV = rent.
- **Evidence:** `src/etl/data_collection/bronze_collector.py` fetches each page inside `_collect_operation()` and returns `pages_processed` only after the loop completes; exceptions before return bypass any after-operation metric.

### 🔴 H2 — `/gold/pipeline_health/latest.json` is not currently served by CloudFront

- **Problem:** The frontend distribution’s data behavior and bucket policy are scoped to `/${var.gold_prefix}/*`, currently `gold/aggregations/*`.
- **Impact:** A browser fetch to `/gold/pipeline_health/latest.json` would fall through to the asset origin or a custom-error HTML response, causing JSON parsing failures and a permanently unavailable tab even if the Lambda writes the object correctly.
- **Recommendation:** Extend the frontend module to serve both `gold/aggregations/*` and `gold/pipeline_health/*` from the listings bucket with the short data cache policy and OAC bucket policy.
- **Evidence:** `infrastructure/modules/frontend/main.tf` defines one ordered cache behavior for `/${var.gold_prefix}/*` and one listings-bucket policy resource for `${var.listings_bucket_arn}/${var.gold_prefix}/*`.

### 🟡 M1 — Cost Explorer client region and permissions need explicit handling

- **Problem:** Cost Explorer is effectively global and commonly uses the `us-east-1` endpoint, while the stack otherwise runs in `eu-central-1`.
- **Impact:** A default-region `boto3.client("ce")` can fail or behave inconsistently depending on runtime configuration.
- **Recommendation:** Centralize Cost Explorer client construction in the Lambda factory and explicitly use the supported CE endpoint/region. Cover this in tests by asserting the factory path, not by hitting AWS.
- **Effort:** S

### 🟡 M2 — Logs Insights checks need timeout/backoff and insufficient-history semantics

- **Problem:** `StartQuery`/`GetQueryResults` is asynchronous and Lambda log history may have fewer than five invocations in fresh dev/prod environments.
- **Impact:** The health Lambda can time out, return misleading red, or produce unstable output shortly after deployment.
- **Recommendation:** Add a small Logs Insights adapter with bounded polling, clear query failure handling, and documented “insufficient history” output. Tests should cover 0, 1, <5, and ≥5 invocation windows.
- **Effort:** M

### 🟡 M3 — Clarify whether API quota is credential-global or environment-local

- **Problem:** The plan says each environment monitors its own pipeline, but Idealista quota is credential-level. If dev and prod share credentials, quota should likely be combined; if credentials differ, metrics need an `Environment` dimension.
- **Impact:** Without an explicit decision, dev/prod dashboards may disagree with real Idealista quota accounting or double-count/under-count usage.
- **Recommendation:** Treat the quota as credential-global if the same LVW/PMV credentials are shared, and document this in the JSON detail text and docs. If environments use separate credentials, add an `Environment` dimension and filter in `ApiQuotaCheck`.
- **Effort:** S

### 🟢 L1 — Defer SNS red-status alerting

- **Suggestion:** Keep SNS alerting out of the MVP unless the user explicitly wants active alerting.
- **Why:** The tab provides the requested monitoring value; alerting adds state-change semantics, deduping, and notification-noise questions that are better handled as a follow-up.

## Alternatives considered

- **Use CloudWatch metrics only for Lambda execution success** — cheaper and simpler, but cannot reliably answer “last N invocations” success/failure semantics. Verdict: stick with Logs Insights plus bounded polling.
- **Expose a dynamic API endpoint for health** — avoids static JSON cache questions, but violates the project’s static frontend pattern and adds API Gateway/IAM surface. Verdict: reject.
- **Fold health into the gold aggregator Lambda** — fewer Lambdas, but mixes dashboard data generation with operational monitoring and risks the health report disappearing when gold fails. Verdict: keep separate observer Lambda.

## Risks

| Risk | Likelihood | Impact | Severity | Mitigation |
| --- | --- | --- | --- | --- |
| Quota light under-counts failed/partial runs | Med | High | 🔴 | Count attempted search requests at request granularity; test failure paths. |
| Health JSON not reachable through CloudFront | High | High | 🔴 | Add `gold/pipeline_health/*` cache behavior and OAC bucket policy. |
| Logs Insights query polling exceeds Lambda timeout | Med | Med | 🟡 | Bounded polling/backoff; fail the individual check yellow/red with diagnostic detail. |
| Cost Explorer region/IAM assumptions break deployment | Med | Med | 🟡 | Explicit CE client region and Terraform validation; document `Resource: "*"` limitation. |
| Fresh environments have too little invocation history | High | Low | 🟡 | Return “insufficient history” details without crashing or misleading red. |
| API quota semantics differ across shared/separate credentials | Med | Med | 🟡 | Decide/document credential-global vs environment-local metric dimensions. |

## Effort check

- **Plan estimate:** L (~28–32h)
- **Reviewer estimate:** L (~32–36h) — confidence Medium
- **Why it differs / hidden complexity:** CloudFront data-path changes, robust Logs Insights polling, Cost Explorer endpoint handling, and quota failure-path instrumentation add a few hours beyond the original implementation estimate.

## Reuse & conflicts

- **Reuse:** `src/etl/common/object_store.py` for S3 writes.
- **Reuse:** `idealista_listings_collector.py` and `gold_aggregation_lambda.py` factory style.
- **Reuse:** `GoldAggregator` strategy/orchestrator pattern for the health aggregator.
- **Reuse:** `frontend/src/data_source.js`, `dashboard_state.js`, and `tab_state.js` testing style.
- **Conflict / coordinate with:** frontend module currently only exposes `gold/aggregations/*`; FEATURE-012 must update that infrastructure before relying on the new JSON URL.

## Approval criteria

- **Blockers:** H1 quota counting; H2 CloudFront exposure.
- **Recommended:** M1 Cost Explorer client region; M2 Logs Insights bounded polling/history semantics; M3 quota scope documentation.
- **Optional:** L1 SNS alerting follow-up.

## Next step

Proceed with `@implementer Implement FEATURE-012` using `dev/plans/technical/FEATURE-012-technical-plan.yaml`.

---

### Post-implementation notes

*Filled in after the task ships.*

- **Worked well:** TBD
- **Missed in review:** TBD
- **Estimated vs. actual:** TBD
