# Review — FEATURE-002: Idealista Web Scraper — OOP Service on AWS Fargate

**Reviewer:** `@reviewer` · **Date:** 2026-06-06 · **Plan:** [FEATURE-002](../plans/FEATURE-002-idealista-web-scraper.md)
**Verdict:** ⚠️ Changes Recommended

> Full re-review of the rewritten plan (OOP core → Docker → ECS Fargate behind rotating proxies).
> Supersedes the prior review of the notebook-MVP + Lambda design.

## Summary

The rewrite is a strong architectural upgrade: an object-oriented core with clean DI boundaries, the right compute choice (Fargate over Lambda for a long, proxied scrape), and a credible cost model. Two things must change before implementation: (1) the task slicing is **not** TDD — tests are bundled into one late task instead of riding with each module, and (2) the **compliance/ToS safeguards and the operational kill switch from the previous review were dropped** and need to come back. Both are encoded into the regenerated technical plan (v2.0); confirm them and the package-import path, then proceed.

## Strengths

- ✅ **Right compute for the job.** Fargate sidesteps Lambda's 15-min cap and packaging limits for a long, network-heavy proxied scrape. The rationale is explicit and correct.
- ✅ **Genuinely OOP core.** Strategy/Builder/Adapter/Factory/Template-Method/Repository are mapped to concrete abstractions with SOLID drivers; `Listing` as a validated domain object (not a dict) is the right call.
- ✅ **Storage-agnostic by design.** `ListingRepository` (S3 vs Local) and `NullProxyProvider` let the entire core run locally with no AWS/proxy creds — excellent for the requested learning notebook.
- ✅ **API-compatible envelope.** `to_envelope()`/`to_dict()` targeting the `elementList` camelCase schema keeps downstream silver/gold source-agnostic.
- ✅ **Reuses existing patterns.** S3/SNS/Secrets modules, the `bronze/idealista-scraper/` namespace, and the weekly-schedule-offset convention all align with the current codebase.
- ✅ **Honest cost model.** The NAT-vs-public-IP call (~$32/mo avoided) and the external proxy cost being flagged separately are exactly right.

## Findings

### 🔴 H1 — Tasks are not TDD slices; tests are bundled at the end

- **Problem:** The plan builds the whole OOP core (Phase 1) and only adds tests in Phase 2 task 2.3 as a single ~5 h block. This contradicts the ARI contract ("each task a clean RED → GREEN → REFACTOR slice") and `copilot-instructions.md` ("ALL new features MUST include tests").
- **Impact:** A core designed without its tests tends to drift from testability; a 5 h test backlog at the end hides coverage gaps and rework right before the infra phase.
- **Recommendation:** Co-locate each test module with the unit it covers — `domain.py`+`test_domain.py`, `parser.py`+`test_parser.py`, etc. The regenerated technical plan splits Phase 1 accordingly so every task ships with its tests.
- **Evidence:** Existing collector follows this (`tests/test_idealista_collector.py` beside the module).

### 🔴 H2 — Compliance/ToS safeguard and operational kill switch regressed

- **Problem:** The previous review made a `SCRAPER_ENABLED` runtime kill switch and a ToS/compliance checklist **mandatory**. The rewrite dropped both, while *adding* rotating residential proxies specifically to defeat Cloudflare bot detection — which materially raises ToS/legal/ethical exposure.
- **Impact:** No way to disable a misbehaving scraper without a redeploy; no documented acknowledgment that scraping Idealista's public site (and circumventing its anti-bot controls) is permissible for this use.
- **Recommendation:** Re-introduce (a) a `SCRAPER_ENABLED` env flag honoured by both the CLI and the container entry point (default-off in a new env), (b) a short compliance/ToS acknowledgment + polite-scraping defaults (respect rate limits, randomized delays already present) in `DATA_COLLECTION_LAYER.md`, and (c) keep the official API collector as the primary source where quotas allow. Encoded as tasks 1.10 (kill switch) and 2.3 (compliance docs).
- **Note:** I'm flagging this as the responsible engineering control, not blocking the feature — but the acknowledgment must be explicit and owned.

### 🟡 M1 — Task 1.3 ("abstractions + strategies + proxies") is oversized

- **Problem:** One 4 h task creates errors, `OperationStrategy`, `IdealistaUrlBuilder`, `ProxyProvider` (3 impls + factory), `PageFetcher`, `ListingParser`, and `ListingRepository` — 7+ classes across 6 files. That is several slices, not one.
- **Recommendation:** Split into urls (1.3), proxies (1.4), fetcher (1.5), parser (1.7), repository (1.8) — each with its own tests. Done in the technical plan.
- **Effort:** S (re-slicing only).

### 🟡 M2 — Package import path `etl.data_collection.scraper` is unverified

- **Problem:** The CLI (`python -m etl.data_collection.scraper`) and Docker `CMD` assume `etl.data_collection.scraper` is importable as a package, but the existing code is flat top-level modules (`idealista_listings_collector.py`) imported without an `etl` namespace. There is no `etl/__init__.py` chain today.
- **Recommendation:** Decide the import root explicitly: either add the `__init__.py` chain and set `PYTHONPATH=src` (for pytest and the Dockerfile `WORKDIR`), or invoke via a relative package root. Verify `pytest` discovery and the container `CMD` resolve identically. Captured in task 1.1 acceptance criteria.
- **Effort:** S.

### 🟡 M3 — `cloudscraper` may not beat current Cloudflare even with proxies

- **Problem:** `cloudscraper` is intermittently maintained and Cloudflare's managed challenges increasingly defeat it; rotating residential IPs help with IP bans but not JS challenges.
- **Recommendation:** Keep `cloudscraper` for the MVP, but the `PageFetcher` abstraction must make a later swap to a headless browser (Playwright) a drop-in. Add a single note + ensure no Cloudflare-specific logic leaks outside `fetcher.py`. Captured in task 1.5.
- **Effort:** S now / M if a browser fetcher is needed later.

### 🟢 L1 — `__main__.py` vs `run_task.py` overlap

- **Suggestion:** Both are entry points (local CLI vs container). Document that `__main__.py` wires `Null`/`Local` for humans and `run_task.py` wires the AWS graph for Fargate, so the duplication is intentional.
- **Why:** Prevents a future "why two mains?" refactor — safe to skip.

### 🟢 L2 — No existing ECS cluster to reuse

- **Suggestion:** The plan says "ECS cluster (or reuse a shared one)" — there is none in the repo today, so the module must create one. Make that unambiguous in task 3.1.
- **Why:** Avoids an implementer assuming a cluster exists.

### 🟢 L3 — Public-subnet Fargate task needs an egress-only security group

- **Suggestion:** With a public IP, ensure the task SG allows **no inbound** and outbound 443 only.
- **Why:** Closes an easy misconfiguration; safe to skip if covered by module defaults.

## Alternatives considered

- **Lambda + container image (10 GB) instead of Fargate** — would reuse the existing EventBridge→Lambda pattern. Trade-off: still capped at 15 min, which is too short for the full inventory behind throttled, proxied requests. Verdict: stick with Fargate.
- **Official API only (raise quota / pay tier)** — no scraping, no ToS risk, no proxies. Trade-off: cost and quota ceilings; the whole point of this feature is to exceed them. Verdict: keep scraper, but retain the API collector as primary where quotas allow (see H2).

## Risks

| Risk | Likelihood | Impact | Severity | Mitigation |
| --- | --- | --- | --- | --- |
| ToS/legal exposure from anti-bot circumvention | Medium | High | 🔴 | Explicit acknowledgment + kill switch (H2); polite delays; API stays primary |
| Cloudflare defeats `cloudscraper` despite proxies | Medium | High | 🟡 | `PageFetcher` abstraction allows Playwright swap (M3) |
| DOM selectors change before/after implementation | High | Medium | 🟡 | Capture real fixture first; selectors isolated in `DOM_SELECTORS` |
| Proxy credentials leak / misconfig | Medium | High | 🟡 | Secrets Manager only; task role scoped to one secret; `secrets.tfvars` |
| Fargate subnet can't reach internet | Medium | High | 🟡 | Validate public subnet + IP (no NAT) in dev before first run |
| Import-path mismatch breaks CLI/Docker/pytest | Medium | Medium | 🟡 | Fix `PYTHONPATH`/`__init__.py` in task 1.1 (M2) |

## Effort check

- **Plan estimate:** L (6–8 days / ~32 h)
- **Reviewer estimate:** L (~34 h / 7–8.5 days) — confidence Medium
- **Why it differs / hidden complexity:** Proper TDD slicing adds a little overhead but lowers end-phase risk; selector/proxy iteration and the import-path/Cloudflare unknowns are the main swing factors. Number is essentially confirmed, slightly higher.

## Reuse & conflicts

- **Reuse:** `infrastructure/modules/s3`, `.../sns`, `.../secrets` (proxy secret); `lambda_bronze` EventBridge/log-group pattern as the reference for the scheduler + CloudWatch; `idealista_listings_collector.py` for the exception + DI style.
- **Conflict / coordinate with:** None active. Do **not** touch `lambda_bronze`/`lambda_silver` modules or `idealista_listings_collector.py`. Prod wiring is deferred (mirrors FEATURE-003); a future `deploy-scraper.yml` is out of scope.

## Approval criteria

- **Blockers (must fix):** H1 (TDD-slice the tasks — done in technical plan), H2 (restore kill switch + compliance docs — done in technical plan; product owner must own the ToS acknowledgment).
- **Recommended:** M1 (split 1.3 — done), M2 (confirm import root), M3 (keep fetcher swappable).
- **Optional:** L1–L3.

## Next step

The technical plan ([FEATURE-002-technical-plan.yaml](../plans/technical/FEATURE-002-technical-plan.yaml)) has been regenerated to v2.0 with H1/H2/M1 already encoded. Confirm the H2 ToS acknowledgment and the M2 import root, then:

```
@implementer Implement FEATURE-002
```

---

### Post-implementation notes
*Filled in after the task ships.*

- **Worked well:** <…>
- **Missed in review:** <…>
- **Estimated vs. actual:** <X> vs. <Y>
