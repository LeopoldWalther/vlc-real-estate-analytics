# Review — FEATURE-013: Pipeline Health tab detailed views & history

**Reviewer:** `@reviewer` · **Date:** 2026-07-18 · **Plan:** [FEATURE-013](../plans/FEATURE-013-pipeline-health-detail-views.md)
**Verdict:** ⚠️ Changes Recommended

## Summary

The plan is technically feasible and fits the existing FEATURE-012 architecture: backend checks remain Strategy-style, AWS clients stay at the Lambda edge, and frontend chart renderers follow existing pure Plotly figure-builder conventions. The main blocker is administrative but important: the intended FEATURE-013 is registered and referenced as FEATURE-014 in multiple places, which will confuse implementation and likely fail workflow consistency checks.

## Strengths

- ✅ Reuses existing `PipelineHealthAggregator`, `HealthCheck` strategies, Logs Insights adapter, Cost Explorer client, Plotly, i18n, and chart-theme conventions.
- ✅ Keeps the schema change additive and avoids new infrastructure or frontend dependencies.
- ✅ Correctly identifies that API quota history already exists and does not need backend work.
- ✅ Good TDD posture: backend parsing/history tests, frontend chart-shape tests, null/malformed data paths, and deployment smoke checks are all called out.

## Findings

### 🔴 H1 — FEATURE-013 / FEATURE-014 numbering mismatch must be normalized

- **Problem:** `dev/plans/FEATURE-013-pipeline-health-detail-views.md` is the intended plan, but its header, prose, README registration, dependency graph, and existing technical plan refer to FEATURE-014.
- **Impact:** Implementer may execute the wrong artifact; workflow consistency validation may fail because `dev/reviews/REVIEW-FEATURE-014.md` does not exist and the README points to FEATURE-014.
- **Recommendation:** Treat this feature as FEATURE-013. Update the plan header/internal references, README row/dependency edge, and replace/supersede the wrong-numbered technical plan with `dev/plans/technical/FEATURE-013-technical-plan.yaml`.
- **Evidence:** `dev/plans/README.md` registers FEATURE-014 for this work; `dev/plans/FEATURE-013-pipeline-health-detail-views.md` line 1 says FEATURE-014; `dev/plans/technical/FEATURE-014-technical-plan.yaml` has `metadata.for_feature: "FEATURE-014"`.

### 🔴 H2 — Existing technical plan does not match the required contract

- **Problem:** The wrong-numbered technical plan uses task statuses such as `planned`, while the Reviewer technical-plan contract requires `not_started` / `in_progress` / `done`. Its validation checks are shell commands rather than normalized CI gate names.
- **Impact:** Automation or implementer tooling may reject or misinterpret task state and validation requirements.
- **Recommendation:** Emit a fresh FEATURE-013 YAML using `not_started`, normalized check names, `metadata.for_feature: "FEATURE-013"`, `reviewed_plan: "dev/reviews/REVIEW-FEATURE-013.md"`, and task IDs `13.x`.
- **Evidence:** Existing YAML lines 13-20 and task statuses use command strings and `planned`.

### 🟡 M1 — Strict `schema_version === "1.1"` is risky during rollout

- **Problem:** The architect plan proposes accepting only schema `1.1` after frontend update.
- **Impact:** If frontend deploys before the backend has published `latest.json` v1.1, the Pipeline Health tab will degrade to unavailable even though v1.0 data remains valid for the existing summary UI.
- **Recommendation:** Accept both `1.0` and `1.1` in `PipelineHealthDataSource`; detail charts should render empty/neutral states when v1.1-only fields are missing.
- **Effort:** S

### 🟡 M2 — i18n/helper task dependency is inverted

- **Problem:** The existing technical plan has helper code reading new i18n keys before the i18n task runs.
- **Recommendation:** Add i18n keys before implementing `thresholdRuleText()` and dependent UI/chart wiring.
- **Effort:** S

### 🟡 M3 — Mobile and RTL readiness needs explicit acceptance criteria

- **Problem:** The plan says charts stack on mobile, but does not set concrete viewport/overflow criteria or consider Arabic RTL caption length.
- **Recommendation:** Add acceptance criteria for common mobile widths and long localized threshold captions.
- **Effort:** M

### 🟢 L1 — Consider deriving current and historical cost from one CE call later

- **Suggestion:** The current two-call Cost Explorer design is acceptable at weekly cadence, but a future refactor could derive current MTD and prior completed-month history from one broader call.
- **Why:** Slightly less CE API cost and simpler rate-limit story; safe to defer.

## Alternatives considered

- **Frontend-only feature:** Rejected because execution history and AWS cost history are not fully present in v1.0 JSON.
- **New endpoint for history:** Rejected; additive enrichment of `gold/pipeline_health/latest.json` is simpler and consistent with current static-dashboard architecture.
- **Class hierarchy for charts:** Rejected; existing frontend chart modules use pure object literals and no shared behavior requires inheritance.

## Risks

| Risk | Likelihood | Impact | Severity | Mitigation |
| --- | --- | --- | --- | --- |
| Feature numbering remains inconsistent | High | High | 🔴 | Normalize FEATURE-013 artifacts before implementation |
| Frontend deploy precedes backend v1.1 data | Med | Med | 🟡 | Accept schema `1.0` and `1.1`; render missing detail fields gracefully |
| Cost Explorer response shape differs for zero-cost/omitted services | Med | Med | 🟡 | Stub tests for empty, partial, omitted-service, and multi-service months |
| Long translated threshold captions overflow mobile layout | Med | Low | 🟡 | Add mobile/RTL CSS acceptance criteria |
| Lambda name changes break diagram status mapping | Low | Low | 🟢 | Fall back to unknown status and document coupling |

## Effort check

- **Plan estimate:** L (~33-34h)
- **Reviewer estimate:** L (~35h) — confidence Medium
- **Why it differs:** Adds workflow-numbering cleanup, schema rollout compatibility, and stronger mobile/RTL acceptance criteria.

## Reuse & conflicts

- **Reuse:** `src/etl/pipeline_health/health_checks.py`, `pipeline_health_aggregator.py`, `pipeline_health_lambda.py`
- **Reuse:** `frontend/src/pipeline_health.js`, `pipeline_health_data_source.js`, `chart_theme.js`, `frontend/src/charts/*.js`, `frontend/src/i18n.js`
- **Conflict / coordinate with:** Existing wrong-numbered `dev/plans/technical/FEATURE-014-technical-plan.yaml` and README FEATURE-014 registration.

## Approval criteria

- **Blockers:** H1, H2
- **Recommended:** M1, M2, M3
- **Optional:** L1

## Next step

Save the corrected FEATURE-013 review and technical plan, normalize README/plan numbering, then run:

`@implementer Implement FEATURE-013`

---

### Post-implementation notes

*Filled in after the task ships.*
