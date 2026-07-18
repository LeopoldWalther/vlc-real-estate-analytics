# FEATURE-010 — Rolling 3-month median for rent/sale KPI tiles

**Status:** 🟡 In Progress (backend merged to main; frontend PR pending) · **Effort:** M (~1–1.5 d) · **Priority:** Medium
**Branch root:** `feature/rolling-3m-median-kpis` · **Created:** 2026-02-16 · **Updated:** 2026-02-16

> Authored by `@architect`. Reviewed by `@reviewer` (see `dev/reviews/REVIEW-FEATURE-010.md`).
> Implemented by `@implementer` from `dev/plans/technical/FEATURE-010-technical-plan.yaml`.

## Objective

Make the `medianRentEurPerM2Month` and `medianSaleEurPerM2` KPI tiles reflect **current market
conditions** by basing them on a rolling 3-month window of listings (relative to the latest
`snapshot_date` in the data), instead of the full all-time history — without breaking the
existing all-time boxplot chart or its frozen schema-v1.0 contract.

## Context

`_boxplot_by_neighborhood()` in `src/etl/data_processing/gold_aggregate.py` (lines 419–458)
computes a 5-number summary (`min`, `q1`, `median`, `q3`, `max`, `count`) per
`(operation, district, neighborhood)` over **every snapshot ever ingested** (data goes back to
April 2023 per `documentation/DATA_GOLD_LAYER.md`). There is currently no `snapshot_date`
dimension in this aggregation — dedup happens only within `(operation, snapshot_date,
propertyCode)` (`_dedup`, lines 132–151), but the boxplot groups across all snapshot dates at
once.

The frontend (`frontend/src/summary.js`, `summaryStats()` / `countWeightedMedian()`, lines
94–108 and 20–38) reads `general.boxplot_by_neighborhood`, splits it into `rent`/`sale` groups,
and count-weights each neighborhood's `median` into a single headline figure. Because the
source boxplot is all-time, a neighborhood's April-2023 prices carry the same weight as last
week's — misleading in a market that has moved meaningfully since then.

`general.boxplot_by_neighborhood` is also consumed by the **existing** all-time box-and-whisker
chart on the dashboard (`frontend/src/charts/boxplot_by_neighborhood.js` and
`frontend/tests/boxplot_by_neighborhood.test.js`), which is explicitly a "full history" view and
must keep working unchanged. This drives the key design decision below: add a new field rather
than mutate the existing one.

## Dependencies

- **Needs:** FEATURE-004 (gold aggregation Lambda), FEATURE-008 (OOP/Strategy refactor of
  `gold_aggregator.py`) — this feature adds a new `Aggregation` strategy on top of that pattern.
- **Unblocks:** none directly; makes the KPI tiles trustworthy for future dashboard iterations
  (e.g. FEATURE-009 follow-ups).

## Decision: new field, not a breaking change

**Recommendation: add `boxplot_by_neighborhood_last_3m` as a new field; keep
`boxplot_by_neighborhood` (all-time) exactly as is.**

| Option | Pros | Cons |
|---|---|---|
| **A — Add new field** `boxplot_by_neighborhood_last_3m` (chosen) | No breaking change to schema v1.0; existing all-time chart (`boxplot_by_neighborhood.test.js`) keeps working untouched; golden-master fixture for the old field stays valid; rollback is a one-line frontend revert | Slightly larger `latest.json` (one more dataset per population); two near-identical helper functions to maintain |
| **B — Replace** `boxplot_by_neighborhood` in place with a 3-month-windowed version | Smaller payload; no new field to explain | Silently changes the meaning of a **frozen, documented** field without a version bump — violates the explicit "do not change field names or structure without a schema-version bump" rule in `gold_aggregate.py` (lines 9–11) and `DATA_GOLD_LAYER.md` ("This schema is frozen"); breaks the existing all-time chart contract and its test suite; any other undiscovered consumer of the field silently gets different numbers |

Option A is chosen: it is additive, keeps the frozen v1.0 contract frozen, and preserves the
all-time chart as a legitimate, separate view ("how has this neighborhood evolved since 2023"
vs. "what does it cost right now"). The `relevant` population block gets the same new field for
symmetry (it already ships `boxplot_by_neighborhood` there too).

## Design & patterns

The existing `Aggregation` Strategy pattern in `gold_aggregator.py` (Protocol `Aggregation`,
lines 62–78; `default_populations()`, lines 145–173) is the natural extension point — **Open/Closed**:
we add a new strategy class, we do not modify `NeighborhoodBoxplot` or the population-block
assembly logic.

- **New pure function** `_boxplot_by_neighborhood_windowed(df, window_start)` in
  `gold_aggregate.py` — same 5-number-summary logic as `_boxplot_by_neighborhood`, but the
  caller pre-filters `df` to `snapshot_date >= window_start` before grouping. To avoid
  duplicating the groupby/quantile logic, `_boxplot_by_neighborhood` is refactored to accept
  the already-filtered frame; the "windowing" itself is a filtering step applied *before*
  calling the (unchanged) core function — no duplicate quantile math, single source of truth.
- **New named constant** `ROLLING_KPI_WINDOW_MONTHS: int = 3` in `gold_aggregate.py`, next to
  `SCOPE_DISTRICTS` / `_DEFAULT_MIN_COUNT`. Never hard-code `3` or `90` in the aggregation
  functions or Lambda env handling — this is the single place to bump to `6` later.
- **New helper** `_rolling_window_start(df, window_months)` — pure function: computes
  `max(snapshot_date) - relativedelta(months=window_months)` from the (already scoped, deduped)
  DataFrame. Encapsulates the "relative to latest snapshot, not wall-clock now" rule from the
  objective, and the graceful short-history fallback (see risks below): if the resulting window
  contains fewer snapshot dates than exist in the data, it simply contains whatever history is
  available — no special-casing needed, because `df[df.snapshot_date >= window_start]` returns
  all rows when the property has less than 3 months of history.
- **New strategy** `NeighborhoodBoxplotLast3Months` (mirrors `NeighborhoodBoxplot`, lines
  135–142) with `key = "boxplot_by_neighborhood_last_3m"`, delegating to the new pure function.
  Added to both `general` and `relevant` tuples in `default_populations()` — **Polymorphism**:
  `GoldAggregator._run_population` treats it identically to every other strategy via the common
  `Aggregation` Protocol, no branching required in `GoldAggregator` itself.
- **Dependency Injection** stays intact: `GoldAggregator.__init__` still accepts
  `general_aggregations`/`relevant_aggregations` overrides for testing, unaffected by the new
  strategy being appended to the defaults.
- No new design patterns are introduced beyond what FEATURE-008 already established — this is
  intentionally the *simplest* extension (one strategy, one constant, one filter helper), not a
  new abstraction layer.

**Library note:** the repo does not currently depend on `python-dateutil`. `relativedelta` gives
correct "3 calendar months back" semantics (unlike a fixed `timedelta(days=90)`, which would
silently drift across months of different lengths). Confirm `python-dateutil` is already a
transitive dependency of `pandas`/available in the Lambda's pandas layer before relying on it;
if not available in the `AWSSDKPandas-Python312` layer, fall back to
`pd.DateOffset(months=window_months)` (pandas-native, no new dependency) — **prefer the pandas
built-in to avoid adding a new runtime dependency to the Lambda package.**

## Approach

Ordered, atomic, TDD-sliced tasks. Each task = failing test → minimal implementation → cleanup.

### Phase 1 — Backend: windowed boxplot in the pure aggregation module
- [x] **1.1** Add failing unit tests in `test_gold_aggregate.py` for a new
  `_rolling_window_start(df, window_months)` helper: given a DataFrame with snapshot dates
  spanning >3 months, returns `max(snapshot_date) - 3 months`; given a DataFrame with <3 months
  of history, returns the earliest available `snapshot_date` (i.e. window naturally shrinks,
  never errors); given an empty DataFrame, returns `None`. Then implement the helper using
  `pd.DateOffset(months=ROLLING_KPI_WINDOW_MONTHS)`.
- [x] **1.2** Add failing unit tests asserting `_boxplot_by_neighborhood_windowed(df)` returns
  the same five-number-summary shape as `_boxplot_by_neighborhood` but only reflects rows within
  the rolling window (construct a fixture with an old outlier snapshot outside the window and
  assert it does not affect `min`/`max`/`median`). Implement by filtering on
  `_rolling_window_start` then delegating to the existing `_boxplot_by_neighborhood` core logic
  (extract shared grouping code if needed to avoid duplication).
- [x] **1.3** Add `ROLLING_KPI_WINDOW_MONTHS = 3` constant next to `SCOPE_DISTRICTS` /
  `_DEFAULT_MIN_COUNT`; update `build_population_block()` to also emit
  `boxplot_by_neighborhood_last_3m` for both populations. Add a failing/then-passing test
  asserting the new key is present in both `general` and `relevant` blocks alongside the
  unchanged `boxplot_by_neighborhood`.

### Phase 2 — Backend: wire the new dataset into the Strategy-based aggregator
- [x] **2.1** Add failing test in `test_gold_aggregator.py` asserting `default_populations()`
  includes a strategy with `key == "boxplot_by_neighborhood_last_3m"` in both the general and
  relevant tuples. Implement `NeighborhoodBoxplotLast3Months` class and register it.
- [x] **2.2** Regenerate the golden-master fixture: run `test_gold_golden_master.py` locally
  against `fixtures/silver_fixture.json`, confirm the new field appears with plausible values,
  then update `fixtures/gold_latest_golden.json` to the new byte-for-byte expected output.
  Re-run `test_gold_aggregator.py::test_aggregate_matches_golden_master_byte_for_byte` to
  confirm it passes deterministically (frozen `_FROZEN_NOW`, no wall-clock dependency).
- [x] **2.3** Add/extend an integration test in `test_gold_aggregation_lambda.py` (moto S3) that
  asserts the Lambda's written `latest.json` contains `boxplot_by_neighborhood_last_3m` for both
  populations.

### Phase 3 — Documentation
- [x] **3.1** Update `documentation/DATA_GOLD_LAYER.md`: add
  `boxplot_by_neighborhood_last_3m` to the "Datasets per Population" table for both `general`
  and `relevant`, document `ROLLING_KPI_WINDOW_MONTHS` in the "Key Design Decisions" table, add
  a sample record to the "Population Block" JSON example, and note the short-history fallback
  behaviour (window shrinks to available data, never errors or returns empty).

### Phase 4 — Frontend: consume the rolling-window field for KPI tiles
- [ ] **4.1** Add failing Vitest cases in `frontend/tests/summary.test.js`: `summaryStats()`
  should read `medianRentEurPerM2Month`/`medianSaleEurPerM2` from
  `boxplot_by_neighborhood_last_3m` instead of `boxplot_by_neighborhood`; add a case proving an
  old, out-of-window outlier group present only in `boxplot_by_neighborhood` does not affect the
  KPI value (i.e. `summaryStats` genuinely reads the new field, not the old one).
- [ ] **4.2** Update `frontend/src/summary.js`: change the two lines in `summaryStats()` that
  currently read `data?.boxplot_by_neighborhood` to read `data?.boxplot_by_neighborhood_last_3m`
  for the two median KPIs only. The all-time `boxplot_by_neighborhood` field remains untouched
  and continues to feed the existing box-and-whisker chart.
- [ ] **4.3** Verify `frontend/tests/boxplot_by_neighborhood.test.js` (the chart renderer test)
  needs **no change** — it consumes `boxplot_by_neighborhood` (all-time), which is unmodified.
  Run the full Vitest suite to confirm no regression.
- [ ] **4.4** Manual check against a locally-fetched `latest.json` from the dev bucket (or the
  updated fixture): confirm the KPI tiles show a plausible, materially different number from the
  all-time chart's median for at least one neighborhood with a clear recent trend.

### Phase 5 — Deployment
- [x] **5.1** Deploy the updated gold Lambda to **dev** only (`terraform apply` scoped to the
  dev workspace / environment). Do not touch prod in this phase.
- [x] **5.2** Manually invoke the dev gold Lambda against real S3 silver data (per the existing
  "Running the Backfill" recipe in `DATA_GOLD_LAYER.md`), download the resulting
  `latest.json`, and eyeball `general.boxplot_by_neighborhood_last_3m` /
  `relevant.boxplot_by_neighborhood_last_3m`: counts and medians should look sane (no empty
  arrays if there is recent data; medians closer to today's asking prices than the all-time
  chart's medians).
- [ ] **5.3** Point the dev frontend at the refreshed dev `latest.json` and visually confirm the
  KPI tiles render a plausible 3-month figure, with no "n/a"/placeholder regressions on
  neighborhoods that do have recent data.
- [ ] **5.4** Only after dev verification passes: deploy the gold Lambda change to **prod**
  (separate `terraform apply`/CI promotion step, following the existing prod-promotion pattern
  from FEATURE-006). No frontend deploy is needed for the frontend PR alone if the frontend is
  already redeployed continuously from `main`/CI — confirm the actual CD trigger before assuming
  this.

## Files

- **Change:** `src/etl/data_processing/gold_aggregate.py` — add `ROLLING_KPI_WINDOW_MONTHS`
  constant, `_rolling_window_start()`, `_boxplot_by_neighborhood_windowed()`; extend
  `build_population_block()` to emit `boxplot_by_neighborhood_last_3m`.
- **Change:** `src/etl/data_processing/gold_aggregator.py` — add `NeighborhoodBoxplotLast3Months`
  strategy; register it in `default_populations()` for both `general` and `relevant`.
- **Change:** `src/etl/data_processing/tests/test_gold_aggregate.py` — unit tests for
  `_rolling_window_start` and `_boxplot_by_neighborhood_windowed` (happy path, short-history
  fallback, empty-input edge case).
- **Change:** `src/etl/data_processing/tests/test_gold_aggregator.py` — strategy-registration
  test + golden-master byte-for-byte assertion (updated).
- **Change:** `src/etl/data_processing/tests/fixtures/gold_latest_golden.json` — regenerated
  golden-master output including the new field (verify this exact filename before editing).
- **Change:** `src/etl/data_processing/tests/test_gold_aggregation_lambda.py` — integration
  assertion that the new field is present in the Lambda's written output.
- **Change:** `documentation/DATA_GOLD_LAYER.md` — schema table, design-decisions table, sample
  JSON updated with the new field.
- **Change:** `frontend/src/summary.js` — `summaryStats()` reads
  `boxplot_by_neighborhood_last_3m` for the two median KPIs.
- **Change:** `frontend/tests/summary.test.js` — updated/added cases for the new source field.
- **No change (verify only):** `frontend/tests/boxplot_by_neighborhood.test.js` — confirm it
  still targets `boxplot_by_neighborhood` (all-time) and needs no edits.

## Test strategy

- **Unit (Python):**
  - `_rolling_window_start`: full-history input, <3-month input, empty input.
  - `_boxplot_by_neighborhood_windowed`: excludes rows older than the window; includes rows
    exactly at the window boundary (define and test the boundary as inclusive,
    `snapshot_date >= window_start`); returns `[]` for an empty DataFrame; a neighborhood with
    zero rows in the window is simply absent from the result list (not a zero/`None` entry).
  - `build_population_block`: both `boxplot_by_neighborhood` and
    `boxplot_by_neighborhood_last_3m` present, independently correct, for both populations.
  - Golden-master byte-for-byte regression (`test_gold_golden_master.py`) — must be
    deliberately regenerated as part of this feature, not accidentally broken.
- **Integration (Python):** `test_gold_aggregation_lambda.py` moto-backed test confirms the new
  field survives the full read-silver → aggregate → write-S3 round trip.
- **Unit (JS/Vitest):** `summary.test.js` — KPI computed from `boxplot_by_neighborhood_last_3m`
  only, proven insensitive to all-time-only outliers; existing count-weighted-median tests keep
  passing against the (renamed input field) fixtures. `boxplot_by_neighborhood.test.js` unchanged
  and still green (proves no accidental coupling to the new field).
- **Manual:** dev Lambda invocation + dev dashboard KPI-tile sanity check (Phase 5) before any
  prod deployment.

## Estimated monthly cloud cost

No new AWS resources are introduced — this reuses the existing `dev-gold-aggregator` /
`prod-gold-aggregator` Lambda, its existing EventBridge schedule, and its existing S3
read/write paths. The only change is a few extra JSON records per weekly `latest.json` (bounded
by neighborhood count, negligible size increase, no additional S3 storage tier or request-count
impact worth modeling).

- **Cost drivers & cheaper alternatives:** none — this is a pure code change to an existing,
  already-provisioned Lambda.
- **External / non-AWS costs:** none.
- **Budget check:** no incremental cost; well within budget.

## Success criteria

- [ ] `latest.json` (`general` and `relevant` blocks) contains a new
  `boxplot_by_neighborhood_last_3m` field with the same shape as
  `boxplot_by_neighborhood` (`operation`, `district`, `neighborhood`, `count`, `min`, `q1`,
  `median`, `q3`, `max`), reflecting only listings within
  `ROLLING_KPI_WINDOW_MONTHS` of the latest `snapshot_date`.
- [ ] `boxplot_by_neighborhood` (all-time) is byte-for-byte unchanged for the same input, apart
  from the addition of the new sibling field — the existing golden-master assertion for that
  field still passes.
- [ ] `frontend/src/summary.js` KPI tiles (`medianRentEurPerM2Month`,
  `medianSaleEurPerM2`) are computed from `boxplot_by_neighborhood_last_3m`.
- [ ] The existing all-time box-and-whisker chart renders unchanged (no visual regression;
  `boxplot_by_neighborhood.test.js` passes unmodified).
- [ ] `ROLLING_KPI_WINDOW_MONTHS` is a single named constant, not hard-coded in more than one
  place.
- [ ] Neighborhoods/snapshots with less than 3 months of history still produce a usable
  (non-error, non-empty-when-data-exists) boxplot entry using whatever history is available.
- [ ] Verified in dev against real S3 data before any prod deployment.
- [ ] Tests pass (`pytest` for backend, `vitest` for frontend) and coverage holds ≥80% on new
  code.
- [ ] `documentation/DATA_GOLD_LAYER.md` reflects the new field and constant.

## Open questions & risks

- **Question:** Should the frontend show an explicit "based on last 3 months" label /
  tooltip on the KPI tiles, to set user expectations correctly now that the number can shift
  week to week more than the old all-time figure did? *Recommendation: yes, small scope addition
  — a static label change in the KPI tile component, no new data needed. Confirm with product
  owner before Phase 4.*
- **Question:** Should the min-count exclusion (`min_count`, default 5) that already protects
  `rent_vs_sale_ratio` also apply to the new windowed boxplot, to avoid a KPI tile flipping
  wildly based on 1–2 listings in a sparse recent window? *Recommendation: yes — apply the same
  `min_count` threshold to `_boxplot_by_neighborhood_windowed` groups (exclude
  `(operation, district, neighborhood)` groups with fewer than `min_count` listings in the
  window). This must be decided before Phase 1 since it changes the function signature; flagging
  for reviewer sign-off.*
- **Risk:** Short-history neighborhoods (e.g. a new neighborhood with 2 weeks of data) will show
  a "3-month" KPI computed from only 2 weeks — statistically less stable, but per objective #7 we
  use whatever history is available rather than showing "n/a", since "n/a" would silently hide
  the neighborhood everywhere the dataset is consumed generically (not just the two headline
  city-wide KPI tiles, which aggregate across *all* neighborhoods anyway — a single sparse
  neighborhood barely moves the count-weighted city-wide median). *Mitigation: the
  `min_count` filter above already suppresses genuinely too-sparse groups; the city-wide KPI
  tiles are computed by `countWeightedMedian` across all neighborhoods so a single sparse
  neighborhood has limited influence by construction.*
- **Risk:** Golden-master byte-for-byte test is intentionally strict (FEATURE-008 design). This
  feature *must* touch `fixtures/gold_latest_golden.json` deliberately — a forgotten regeneration
  will fail CI loudly, which is the intended safety net, not a false negative to silence.
- **Risk:** `relativedelta`/`DateOffset` month-boundary semantics (e.g. running on the 31st of a
  month, going back 3 months to a 28/30-day month) — *Mitigation: use `pd.DateOffset(months=3)`
  (pandas' own calendar-aware offset, already a transitive dependency, no new package) and add an
  explicit unit test for a `snapshot_date` on the 31st of a month.*
- **Assumption:** "3 months" means calendar months relative to the maximum `snapshot_date`
  present in the *scoped, deduped* silver data for that run — not wall-clock "now" — matching the
  objective's explicit wording ("relativ zum jeweils aktuellsten snapshot_date in den Daten").
- **Assumption:** This should ship as **two separate PRs**: (1) backend/gold-layer
  (`gold_aggregate.py`, `gold_aggregator.py`, docs, Python tests, golden-master fixture) deployed
  and verified in dev first per Phase 5; (2) frontend (`summary.js`, Vitest tests) opened once
  the dev `latest.json` is confirmed to contain the new field and looks plausible. This lets the
  backend PR merge and deploy to dev independently for real-data verification (per objective #6)
  without a frontend change blocking on it, and keeps the two Vitest/pytest CI pipelines and
  review scopes cleanly separated. The two PRs share this one FEATURE-010 plan and one technical
  plan, executed as two branch lineages
  (`feature/rolling-3m-median-kpis/1.x…3.x` for backend+docs,
  `feature/rolling-3m-median-kpis/4.x` for frontend).

## Progress log

- **2026-02-16** — Plan drafted by `@architect` after reviewing
  `gold_aggregate.py`, `gold_aggregator.py`, `summary.js`,
  `documentation/DATA_GOLD_LAYER.md`, and the existing test/fixture layout. Two open questions
  (KPI-tile labeling, min-count on the new boxplot) flagged for `@reviewer` before task 1.1
  starts.
- **2026-07-18** — `@implementer` completed PR 1 (backend/gold-layer + docs, technical-plan
  tasks 10.1–10.6) and dev verification (task 10.9): `ROLLING_KPI_WINDOW_MONTHS`, the shared
  `_boxplot_summary` core, `_boxplot_by_neighborhood_last_months`, the
  `NeighborhoodBoxplotLast3Months` Strategy, the regenerated golden-master fixture, the extended
  Lambda integration test, and `documentation/DATA_GOLD_LAYER.md` updates all merged to `main`
  (backend pytest suite: 111 passed / 3 skipped). Deployed the updated `dev-gold-aggregator`
  Lambda via `terraform apply` (dev environment only) and manually invoked it against real S3
  silver data: `latest.json` now contains `boxplot_by_neighborhood_last_3m` in both `general`
  and `relevant` blocks, with plausible counts (e.g. 214 rolling vs. 3100 all-time listings for
  one neighborhood/operation) and medians close to but distinct from the all-time boxplot.
  Frontend consumption (tasks 10.7–10.8, PR 2) and prod promotion (task 10.10) are next.
