# Review — FEATURE-010: Rolling 3-month median for rent/sale KPI tiles

**Reviewer:** `@reviewer` · **Date:** 2026-07-17 · **Plan:** [FEATURE-010](../plans/FEATURE-010-rolling-3month-median-kpis.md)
**Verdict:** ⚠️ Changes Recommended

## Summary

The plan is directionally sound: the current KPI medians are indeed derived from the all-time `boxplot_by_neighborhood` aggregate, while the dashboard needs a current-market metric. The additive data-contract approach is the right default for a frozen schema, but implementation must tighten three points before coding: frontend fallback during rollout, `min_count` semantics for sparse 3-month groups, and explicit KPI labeling so users understand the time basis.

No return to Architect is needed. The technical plan folds the required changes into executable tasks.

## Strengths

- ✅ Preserves the frozen schema-v1.0 meaning of `boxplot_by_neighborhood` and keeps the existing all-time boxplot chart contract intact.
- ✅ Extends the FEATURE-008 Strategy design by adding one aggregation strategy instead of branching inside `GoldAggregator`.
- ✅ Places the rolling window in the gold layer, where `snapshot_date` is available, rather than trying to infer it in the frontend from already-aggregated all-time summaries.
- ✅ Uses latest data timestamp, not wall-clock time, which makes backfills and delayed collection runs deterministic.
- ✅ Recognizes deployment sequencing: backend/gold output must exist in dev before frontend depends on it.

## Findings

### 🔴 H1 — Frontend needs backward-compatible fallback during rollout

- **Problem:** The Architect plan's Phase 4 initially says `summaryStats()` should read only `boxplot_by_neighborhood_last_3m`.
- **Impact:** If frontend deploys before the dev/prod gold JSON is refreshed, KPI median tiles would show placeholders even though `boxplot_by_neighborhood` still exists. This creates avoidable production instability during the two-PR rollout.
- **Recommendation:** Implement `summaryStats()` to prefer `boxplot_by_neighborhood_last_3m` and fall back to `boxplot_by_neighborhood`. Add a Vitest case proving the new field wins when both are present, and a separate case proving the fallback preserves current behavior when the new field is absent.
- **Evidence:** `frontend/src/summary.js` currently reads `data?.boxplot_by_neighborhood ?? []`; `frontend/tests/summary.test.js` already covers old-field behavior and should remain valid as the fallback test.

### 🔴 H2 — Sparse recent groups require an explicit `min_count` rule

- **Problem:** The plan flags `min_count` as an open question for the 3-month boxplot. Without a decision, two implementations are plausible: include every recent group or filter sparse groups.
- **Impact:** A rolling 3-month median can swing heavily if a neighborhood-operation pair has only 1–2 recent listings. That undermines the KPI's "current market" value and makes dev/prod validation ambiguous.
- **Recommendation:** Apply the existing `min_count` threshold to the new windowed boxplot groups. This keeps sparse recent groups out of the KPI source while preserving the all-time `boxplot_by_neighborhood` behavior. Add Python tests for both included and excluded groups.
- **Evidence:** `gold_aggregate.py` documents `min_count` as the existing stability guard for ratio datasets; the same rationale applies more strongly to a shorter rolling window.

### 🟡 M1 — KPI labels should disclose the 3-month basis

- **Problem:** The current KPI labels in `frontend/index.html` and `frontend/src/i18n.js` say only "Median rent" / "Median sale".
- **Impact:** Users may compare the KPI cards to the all-time boxplot chart and assume they are computed from the same historical population.
- **Recommendation:** Update KPI labels across all supported locales to communicate "last 3 months" or "3-month median". Keep the all-time chart titles unchanged.
- **Effort:** S

### 🟡 M2 — Date normalization must handle strings and date-like objects safely

- **Problem:** Existing gold helpers convert `snapshot_date` to strings for JSON output, while tests and fixtures may contain strings, `date`, or pandas-compatible values before aggregation.
- **Impact:** A direct comparison against `pd.Timestamp` can fail or behave inconsistently if the column is object-typed.
- **Recommendation:** Normalize `snapshot_date` with `pd.to_datetime(..., errors="coerce")` inside the rolling-window helper, reject/ignore null dates deterministically, and add tests for ISO strings and `date`/`Timestamp` inputs.
- **Effort:** M

### 🟡 M3 — Avoid duplicating quantile math

- **Problem:** The new field has the same output shape as `_boxplot_by_neighborhood`; copying the groupby/quantile implementation would create two sources of truth.
- **Impact:** Future fixes to quartile behavior or output ordering could diverge between all-time and rolling-window boxplots.
- **Recommendation:** Add a shared private helper for the core boxplot calculation, or make `_boxplot_by_neighborhood_windowed()` filter first and delegate to `_boxplot_by_neighborhood()` with a new `min_count` parameter. The all-time call must retain current behavior by default.
- **Effort:** S

### 🟢 L1 — Surface window metadata only if it stays cheap

- **Suggestion:** Consider adding top-level metadata such as `rolling_kpi_window_months: 3` or `boxplot_by_neighborhood_last_3m_window_start` later.
- **Why:** It would help debugging and UI tooltips, but it is not required for this feature because the field name and KPI label already communicate the time basis.

## Alternatives considered

- **Replace `boxplot_by_neighborhood` in place** — smaller payload and simpler frontend lookup, but it silently changes the meaning of a frozen schema field and breaks the all-time boxplot contract. Verdict: reject.
- **Compute 3-month medians in the frontend from time-series means** — avoids backend change, but time-series datasets contain means, not per-listing medians or distribution summaries. Verdict: reject due to incorrect metric.
- **Add fully date-grained boxplot history** — more flexible for future rolling windows, but significantly larger schema and payload for a single KPI need. Verdict: defer until there is a concrete chart/use case.

## Risks

| Risk | Likelihood | Impact | Severity | Mitigation |
| --- | --- | --- | --- | --- |
| Frontend deployed before gold JSON includes new field | Med | Med | 🔴 | Prefer new field, fall back to old field until both environments are refreshed. |
| Sparse 3-month data makes KPI volatile | Med | Med | 🔴 | Apply existing `min_count` threshold to rolling-window groups and test exclusion. |
| Date parsing differs between strings and date objects | Med | Med | 🟡 | Normalize with pandas-native datetime handling and add mixed-type tests. |
| Golden-master fixture update masks unintended all-time changes | Low | High | 🟡 | Add focused assertions that old all-time field remains semantically unchanged for existing fixture rows, and review fixture diff carefully. |
| Payload grows modestly | Low | Low | 🟢 | Additive array is bounded by operation x district x neighborhood; no new AWS resources. |

## Effort check

- **Plan estimate:** M (~1–1.5 d)
- **Reviewer estimate:** M (~10–14 h) — confidence Medium
- **Why it differs / hidden complexity:** The core backend change is small, but the safe rollout needs golden-master regeneration, docs, frontend fallback/i18n, and dev data validation. Two PRs reduce risk but add coordination overhead.

## Reuse & conflicts

- **Reuse:** `src/etl/data_processing/gold_aggregator.py` Strategy pattern — add `NeighborhoodBoxplotLast3Months` rather than branching in orchestration.
- **Reuse:** `src/etl/data_processing/gold_aggregate.py` `_boxplot_by_neighborhood` output contract — use the same calculation after window filtering.
- **Reuse:** `frontend/src/summary.js` `countWeightedMedian()` — keep the KPI aggregation algorithm, only change the input source selection.
- **Conflict / coordinate with:** FEATURE-009 frontend redesign already changed KPI labels and i18n; update translations carefully without altering unrelated chart labels.

## Approval criteria

- **Blockers (must fix):** H1 frontend fallback; H2 `min_count` rule.
- **Recommended:** M1 KPI label disclosure; M2 robust date normalization; M3 shared quantile logic.
- **Optional:** L1 extra window metadata.

## Next step

Proceed with `@implementer Implement FEATURE-010` using `dev/plans/technical/FEATURE-010-technical-plan.yaml`. Implement as two PRs/branch lineages: backend/gold-layer + docs first, frontend KPI consumption/labels second.

---

### Post-implementation notes
*Filled in after the task ships.*

- **Worked well:** TBD
- **Missed in review:** TBD
- **Estimated vs. actual:** TBD
