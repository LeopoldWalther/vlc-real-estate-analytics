# Review — FEATURE-014: Dashboard UX refinements (health thresholds, trend counts, population dropdown, footer cleanup, Data Basis shared filter-bar)

**Reviewer:** `@reviewer` · **Date:** 2026-07-19 · **Plan:** [FEATURE-014](../plans/FEATURE-014-dashboard-ux-refinements.md)
**Verdict:** ⚠️ Changes Recommended

## Summary

The plan is well-researched and both of its load-bearing factual claims check out against the live
codebase: `count_listings` is genuinely already present on `price_time_series_district`/
`price_time_series_neighborhood` (item 3 is pure frontend), and `#data-updated` is genuinely dead
markup (item 5 is a safe deletion). The main problem is scope concentration: item 2 (Data Basis
filters) bundles a low-risk shared-filter-bar UI change with a high-risk backend re-dimensioning of
4 gold aggregations plus 4 bespoke frontend re-aggregation adapters — by itself nearly 40% of the
plan's total estimated effort and its only 🔴-risk slice. I am splitting that backend/re-aggregation
work into a new follow-up feature and shipping the four small, independent items plus the
shared-filter-bar UI (scoped to the one chart that already supports it) as FEATURE-014. I also found
and fixed a technical-plan schema defect (non-canonical task status) and a real numbering collision
risk (FEATURE-015 is not available for the follow-up).

## Strengths

- ✅ Both claims underpinning the plan's two riskiest feasibility assumptions are verified true by
  direct code inspection (see Findings, evidence below) — the architect did its homework instead of
  assuming.
- ✅ Items 1, 3, 4, 5 are genuinely small, independent, and low-risk; the technical plan correctly
  marks them `can_run_parallel_with` each other.
- ✅ The rejected-alternative reasoning for a shared global filter state (vs. a duplicated local Data
  Basis filter) is sound and correctly avoids DOM id collisions and confusing dual-filter UX.
- ✅ The architect explicitly flagged the Data Basis backend work as the plan's highest risk/effort
  item and pre-emptively proposed the exact split this review lands on — good self-awareness, made
  the review faster.
- ✅ TDD framing (RED before GREEN) is present in nearly every task's acceptance criteria.
- ✅ Honest, near-zero cost model; no new AWS resources.

## Findings

### 🔴 H1 — Item 2's backend dimensioning + re-aggregation work is too large and too risky to land in this feature

- **Problem:** Tasks 14.10 (district/neighbourhood dimensions on 4 gold aggregations, 4.5h), 14.11
  (additive `data_basis_relevant` population split, 2.5h), 14.12 (docs, 1h), and 14.15 (4 bespoke
  frontend re-aggregation adapters, 3.5h) together account for ~11.5h of the original ~30h plan
  (~38%) and are the only slice touching shared golden-master fixtures used by other tests. The
  re-aggregation adapters in 14.15 are the single riskiest piece: each of 4 renderers needs a private
  "collapse rows back to bin grain" step that must reproduce today's unfiltered totals exactly, with
  four independent chances for an off-by-one/double-counting regression.
- **Impact:** Landing this alongside 4 unrelated small UX fixes means a regression in the golden
  master or a re-aggregation bug blocks or delays the four independent, otherwise-shippable items,
  and inflates the PR review surface for a single feature well beyond what one reviewer can
  confidently sign off on in one pass.
- **Recommendation:** Split. **Done** — see "Alternatives considered" and "What changed" below.
  FEATURE-014 now ships the shared filter-bar UI and scopes only `listing-locations-map` (which
  already carries district/neighborhood on every record today). The backend dimensioning, the
  additive `data_basis_relevant` split, and the 4 renderer re-aggregation adapters move to
  **FEATURE-016** (see H2 for why not FEATURE-015), which needs its own architect/reviewer pass
  before implementation.
- **Evidence:** `dev/plans/FEATURE-014-dashboard-ux-refinements.md`'s own "Open questions & risks"
  section explicitly flagged this exact risk and proposed exactly this split as a fallback.

### 🔴 H2 — FEATURE-015 is not available for the proposed follow-up; the plan's own suggested number collides with stray files

- **Problem:** The architect plan (and its own risk note) suggested naming a split-out follow-up
  "FEATURE-015". `git status --porcelain=v1 --untracked-files=all` and `git ls-files` show that
  `dev/plans/FEATURE-015-idealista-web-scraper.md`,
  `dev/plans/technical/FEATURE-015-technical-plan.yaml`, and `dev/reviews/REVIEW-FEATURE-015.md`
  already exist as untracked, stray files from an unrelated session (the real, tracked idealista
  scraper feature is `FEATURE-002-idealista-web-scraper.md`, so these 015 files are an orphaned
  duplicate under the wrong number).
- **Impact:** Naming the Data Basis follow-up "FEATURE-015" would either collide with those stray
  files once they are eventually committed, or confuse future numbering if they are cleaned up
  first.
- **Recommendation:** Use **FEATURE-016** for the follow-up instead. **Done** — created
  `dev/plans/FEATURE-016-data-basis-dimensioned-filters.md` as a stub, registered it in
  `dev/plans/README.md`, and did not touch any of the stray FEATURE-015 files.
- **Evidence:** `git ls-files | grep -i FEATURE-015` returns nothing (untracked); `ls dev/plans/`
  shows `FEATURE-015-idealista-web-scraper.md` present on disk but unregistered in `README.md`.

### 🔴 H3 — Technical plan task status values do not match the ARI contract

- **Problem:** Every task in the original `FEATURE-014-technical-plan.yaml` used `status: "planned"`.
  The reviewer technical-plan contract (and the precedent set by `REVIEW-FEATURE-013.md` finding H2)
  requires `not_started` / `in_progress` / `done`.
- **Impact:** Tooling and the Implementer's status-sync expectations are built around the canonical
  three-state enum; `"planned"` is a plan-file status marker (🔵), not a task-status value, and mixing
  the two vocabularies risks silent misinterpretation by automation or future reviewers.
- **Recommendation:** **Done** — every task's `status` was changed to `"not_started"` in the
  regenerated `FEATURE-014-technical-plan.yaml` (v2.0).
- **Evidence:** `dev/reviews/REVIEW-FEATURE-013.md` H2 flagged the identical defect in the prior
  (wrongly-numbered) technical plan for this codebase.

### 🟡 M1 — Task 14.14's original scope silently depended on backend work being split into this same feature

- **Problem:** The original task 14.14 ("Scope Data Basis renderers to population/district/
  neighbourhood filters") depended on both 14.11 (`data_basis_relevant`, now deferred) and 14.13
  (shared filter-bar), and its acceptance criteria described selecting `data_basis`/
  `data_basis_relevant` by population for *all* Data Basis renderers — which is no longer buildable
  once 14.11 moves to FEATURE-016.
- **Recommendation:** **Done** — rewrote 14.14 to scope only `listing-locations-map` by
  district/neighbourhood (no population split), explicitly documenting that the population toggle
  has no effect on the Data Basis tab until FEATURE-016 lands, and dropped its dependency on the
  now-removed 14.11.
- **Effort:** S (already applied).

### 🟡 M2 — Boundary-semantics assumption for the new thresholds should be confirmed with the project owner before Phase 1

- **Problem:** The plan assumes yellow is `[60s, 120s]` and red is `> 120s` (mirroring the old `>=`/`>`
  operators), but this is stated as an assumption, not a confirmed requirement.
- **Recommendation:** Confirm with the project owner before task 14.1 starts; if wrong, it's a
  one-line constant/comparison-operator fix, so low risk either way — kept as a should-fix, not a
  blocker.
- **Effort:** S.

### 🟢 L1 — Consider whether 4 near-identical re-aggregation adapters (deferred to FEATURE-016) should share a helper

- **Suggestion:** When FEATURE-016 gets its own review, weigh whether `weekly_listing_volume.js`,
  `size_histogram.js`, `rooms_distribution.js`, `price_per_area_histogram.js` each writing a private
  "collapse to bin grain" function is justified (current convention: one function per chart semantic)
  versus factoring a shared `collapseToBinGrain(rows, binKeyFn)` helper to avoid four independent
  chances for the same class of bug.
- **Why:** Not blocking now since the code doesn't exist yet; flagged so FEATURE-016's own review
  considers it explicitly. Added as a "risk to re-litigate" note in the FEATURE-016 stub.

## What changed (this review's edits)

- `dev/plans/technical/FEATURE-014-technical-plan.yaml` (v1.0 → v2.0): removed tasks 14.10, 14.11,
  14.12, 14.15 (moved to FEATURE-016); rewrote task 14.14 to scope only `listing-locations-map`;
  changed every task `status` from `"planned"` to `"not_started"`; updated `metadata.total_tasks`
  (16 → 12), `estimated_hours` (30 → 22.5), `risk_level` (`medium` → `low`), and `critical_path`.
- `dev/plans/FEATURE-014-dashboard-ux-refinements.md`: updated the numbering note (FEATURE-015 is the
  stray idealista slot, not a usable follow-up number), rewrote Phase 5 to drop 5a/5b and trim 5d to
  `listing-locations-map` only, updated the Files list, Success criteria, Design & patterns section,
  Estimated monthly cloud cost (now $0), Open questions & risks (resolved the split question), and
  the Progress log; updated the header Effort to M–L (~22.5h) and added a Dependencies edge to
  FEATURE-016.
- Created `dev/plans/FEATURE-016-data-basis-dimensioned-filters.md` (stub top-level plan; no
  technical plan yet — needs its own architect/reviewer pass).
- `dev/plans/README.md`: updated the FEATURE-014 row (title/effort), added a FEATURE-016 row, and
  added the `F014 --> F016` dependency edge.
- Did not touch any file under the stray, untracked FEATURE-015 idealista-scraper set.

## Alternatives considered

- **Ship all 16 original tasks in one feature:** Rejected — H1 explains why; the risk/effort
  concentration in 14.10/14.11/14.15 doesn't match the low-risk, independent nature of the other 4
  items, and bundling them would force one review/merge cycle to cover both regimes.
- **Defer all of item 2 (including the shared filter-bar) to the follow-up:** Rejected — the shared
  filter-bar hoist (5a in the trimmed plan) and `listing-locations-map` scoping are low-risk,
  self-contained, and deliver real, visible value (the Data Basis tab gets working filter controls
  and at least one chart respects them) without needing any backend change; deferring them too would
  waste an easy, safe win.
- **Name the follow-up FEATURE-015 anyway, since the stray files are "unrelated":** Rejected — the
  files exist on disk today regardless of git tracking status, and this project's own workflow
  conventions (`git ls-files`, `dev/plans/README.md` as source of truth) make FEATURE-015 an
  ambiguous, collision-prone number the moment anyone else registers or commits those files.

## Risks

| Risk | Likelihood | Impact | Severity | Mitigation |
| --- | --- | --- | --- | --- |
| Data Basis re-aggregation adapters ship with a subtle regression | Med | High | 🔴 (deferred) | Moved to FEATURE-016 with its own review; explicit unfiltered-input-unchanged regression test required per renderer |
| FEATURE-015/016 numbering confusion recurs in a future session | Low | Med | 🟡 | This review documents the collision explicitly in both plan files and the README |
| Population toggle visibly present but inert on Data Basis tab confuses users | Med | Low | 🟡 | Documented explicitly in UI copy/success criteria as a known, temporary limitation |
| Hoisting `.filter-bar` breaks existing Trend Analysis layout relative to `#kpi-row` | Low | Med | 🟡 | Task 14.13 acceptance criteria explicitly require the existing layout to stay visually unchanged |
| New 60s/120s boundary semantics don't match the owner's intent | Low | Low | 🟢 | One-line fix if wrong; confirm before task 14.1 (M2) |

## Effort check

- **Plan estimate (original, all 16 tasks):** L (~28–32h)
- **Reviewer estimate (FEATURE-014, trimmed to 12 tasks):** M–L (~22.5h) — confidence High
- **FEATURE-016 (deferred, pending its own review):** M (~11.5h, provisional — will likely grow once
  golden-master fixture impact is fully scoped)
- **Why it differs:** Removing the 4 backend/re-aggregation tasks removes ~11.5h and the plan's only
  large/high-risk complexity rating in one move; the remaining 12 tasks are consistently
  small/medium and independently verifiable.

## Reuse & conflicts

- **Reuse:** `frontend/src/charts/price_time_series_district.js` (Factory pattern for the two new
  count charts), `.scope-dropdown`/`.scope-options`/`.scope-badge` CSS classes (population dropdown),
  `GoldAggregator._run_population()` pattern (referenced design for FEATURE-016's eventual
  `data_basis_relevant`, not built in this feature).
- **Conflict / coordinate with:** None active for FEATURE-014. FEATURE-016 must coordinate with
  whatever consumes today's unfiltered `data_basis` key to guarantee no behavioural change.
- **Do not touch:** `dev/plans/FEATURE-015-idealista-web-scraper.md`,
  `dev/plans/technical/FEATURE-015-technical-plan.yaml`, `dev/reviews/REVIEW-FEATURE-015.md` (stray,
  untracked, unrelated session).

## Approval criteria

- **Blockers (must fix):** H1 (done — split), H2 (done — renumbered to FEATURE-016), H3 (done —
  status enum fixed).
- **Recommended:** M1 (done — task 14.14 rewritten), M2 (confirm threshold boundary semantics with
  project owner before task 14.1).
- **Optional:** L1 (revisit during FEATURE-016's own review).

## Next step

All 🔴 blockers are already fixed in this pass (technical plan v2.0, plan.md updated, FEATURE-016
stub created, README updated). Confirm M2 (threshold boundary semantics) with the project owner, then:

```
@implementer Implement FEATURE-014
```

FEATURE-016 requires its own `@architect`/`@reviewer` cycle before implementation — do not hand its
stub directly to `@implementer`.

---

### Post-implementation notes
*Filled in after the task ships.*

- **Worked well:** <…>
- **Missed in review:** <…>
- **Estimated vs. actual:** <X> vs. <Y>
