# Review — FEATURE-005: Static Visualization Web App (S3 + CloudFront)

**Reviewer:** `@reviewer` · **Date:** 2026-06-09 · **Plan:** [FEATURE-005](../plans/FEATURE-005-static-visualization-webapp.md)
**Verdict:** ✅ Approved (retroactive)

> **Retroactive review.** Tasks 5.1–5.7 already shipped; 5.8 (tests CI + docs) is outstanding. This
> review documents the as-built design, records the decisions taken during implementation, and lists
> the cleanup needed before the feature branch merges to `main`. The executable task list lives in
> [FEATURE-005-technical-plan.yaml](../plans/technical/FEATURE-005-technical-plan.yaml).

## Summary

The static frontend is the right architecture for a weekly-updated, read-only dashboard: plain HTML
+ ESM modules + vendored Plotly.js on S3 (private) behind CloudFront (dual origin, OAC), no bundler
and no framework. The `ChartRenderer` Strategy and `DataSource` Adapter keep new charts cheap and
tests AWS-free (70/70 green). The headline cleanup items are a now-dead `Dashboard` class left behind
by the `app.js` refactor and the still-missing 5.8 CI/doc task.

## Strengths

- ✅ **No build step.** Native ESM imports + vendored `plotly.min.js` (same-origin) — zero CDN risk,
  no webpack/vite to maintain.
- ✅ **`ChartRenderer` Strategy + Open/Closed.** Each chart is one module exposing
  `{ id, title, render(block) }`. Adding a chart = add a module + container + test; `app.js` data
  flow is untouched.
- ✅ **`DataSource` Adapter + DI + schema guard.** `FakeDataSource` satisfies the same `load()`
  interface so every test runs without network or AWS; `schema_version !== '1.0'` throws loudly.
- ✅ **CloudFront dual origin + OAC.** Assets (long TTL) and `gold/aggregations/*` (1 h TTL) served
  same-origin → no CORS, no public bucket, OAC (not deprecated OAI).
- ✅ **ACM/us-east-1 + wildcard cert handled correctly.** Dev domain `vlc-report-dev.leopoldwalther.com`
  respects the one-level wildcard constraint of `*.leopoldwalther.com`.

## Findings

### 🟡 M1 — `Dashboard` class is now dead production code

- **Problem:** `app.js` was refactored to inline orchestration in `run()` and no longer imports
  `frontend/src/dashboard.js`. The `Dashboard` class survives only because `dashboard.test.js` still
  exercises it directly.
- **Impact:** A reader of the plan expects `Dashboard` (the SRP orchestrator) to be the live entry
  point; instead two orchestration paths exist (one shipped, one tested-but-unused), which is
  misleading and drifts from the documented design.
- **Recommendation:** Pick one. Either (a) restore `app.js` to construct and `mount()` a `Dashboard`
  so the SRP design in the plan is the one that runs, or (b) delete `dashboard.js` + `dashboard.test.js`
  and update the plan's Design section to describe the inlined `run()`. Option (a) is preferred —
  it keeps the orchestration testable and matches the plan.
- **Evidence:** [frontend/src/dashboard.js](../../frontend/src/dashboard.js) vs the inlined loop in
  [frontend/app.js](../../frontend/app.js#L58); `grep dashboard app.js` shows only log-string matches, no import.

### 🟡 M2 — Task 5.8 (CI + docs) not done

- **Problem:** No `node-test.yml` runs Vitest in CI, no frontend pre-commit hook, no
  `documentation/FRONTEND_LAYER.md`, and the README medallion diagram / Source Code Layout omit the
  frontend layer.
- **Recommendation:** Complete 5.8 before merge. Vitest must gate PRs the way `python-test.yml` gates
  the ETL — otherwise a broken transform reaches `main` undetected.
- **Effort:** S (~2 h).

### 🟡 M3 — Gold/silver ordering is an operational footgun

- **Problem:** Gold was first generated while the silver backfill was still writing sale parquets,
  producing only 5 of 168 sale dates. It self-corrected only after a manual re-run.
- **Recommendation:** Document the invariant — *silver backfill must fully complete before gold runs* —
  in the FEATURE-006 prod runbook, and verify with a parquet count
  (`aws s3 ls silver/…/operation=sale/ | wc -l`) before invoking gold. FEATURE-007 (Step Functions)
  removes this race by sequencing the stages.
- **Effort:** S.

### 🟢 L1 — Deprecated combined renderers kept for tests

- **Suggestion:** `priceTimeSeriesRenderer`, `priceTimeSeriesDistrictRenderer`, and `boxplotRenderer`
  (combined, id without `-rent`/`-sale`) are exported only for test back-compat. Once the split
  renderers have their own coverage, migrate the tests and drop the combined exports to avoid a third
  rendering path. Safe to skip for now.

### 🟢 L2 — Population toggle only affects 3 of 7 charts

- **Suggestion:** The 4 price time-series charts are always "All listings" because gold's `relevant`
  block omits price series (too sparse). This is correct but non-obvious to users. A short caption
  under the toggle ("affects ratio & distribution charts only") would prevent confusion. Optional.

## Risks

| Risk | Likelihood | Impact | Severity | Mitigation |
| --- | --- | --- | --- | --- |
| Broken JS transform reaches `main` (no CI) | Med | Med | 🟡 | Complete 5.8 `node-test.yml` before merge |
| Gold runs before silver backfill done | Med | High | 🟡 | Verify parquet count; sequence via FEATURE-007 |
| Gold schema v1.0 drift breaks frontend silently | Low | High | 🟢 | `DataSource` schema-version guard throws loudly |
| Stale gold served after manual re-run | Med | Low | 🟢 | CloudFront invalidation `/*` after every deploy/regen |
| Two orchestration paths diverge | Low | Med | 🟡 | Resolve M1 (one path) |

## Effort check

- **Plan estimate:** M (~1.5–2 d) for the whole feature.
- **Reviewer estimate (remaining):** S (~3–4 h) — M1 cleanup (~1 h) + M2 task 5.8 (~2 h) + M3 doc (~0.5 h).
  Confidence: High (implementation is done; only cleanup + CI/docs remain).

## Reuse & conflicts

- **Reuse:** `infrastructure/modules/frontend` and the shared DNS remote state are already wired in
  dev — FEATURE-006 reuses both verbatim for prod (`vlc-report.leopoldwalther.com`).
- **Coordinate with:** FEATURE-006 (prod promotion) consumes the same frozen gold schema v1.0;
  FEATURE-007 (Step Functions) removes the silver→gold timing race (M3).

## Approval criteria

- **Blockers (must fix):** none.
- **Recommended:** M1 (dead `Dashboard`), M2 (task 5.8 CI/docs), M3 (runbook ordering note).
- **Optional:** L1 (drop combined renderers), L2 (toggle caption).

## Next step

Resolve M1, then `@implementer Implement FEATURE-005` task 5.8 to land CI + docs, then open the PR to
`main`.

---

### Post-implementation notes

- **Worked well:** Strategy/Adapter split made the rent/sale chart split a pure factory change; the
  `schema_version` guard and `FakeDataSource` kept the test suite fast and deterministic.
- **Missed in review (caught in implementation):** the rent/sale Y-axis scale mismatch (200×) and the
  `async` toggle-handler SyntaxError — both would have been flagged by an up-front review.
- **Estimated vs. actual:** plan M (~1.5–2 d); actual close, plus extra iterations on chart scaling,
  data backfill, and the dedicated dev subdomain.
