# FEATURE-011 — Tab navigation + "Data Basis" tab (search params, collection volume, size/rooms/price distributions, geo map)

**Status:** 🟡 In progress (backend tasks 11.1–11.5 done; frontend tasks pending) · **Effort:** L (~3–3.5 d) · **Priority:** Medium
**Branch root:** `feature/dashboard-tabs-data-basis` · **Created:** 2026-08-04 · **Updated:** 2026-08-04

> Authored by `@architect`. Reviewed by `@reviewer` (see `dev/reviews/REVIEW-FEATURE-011.md`).
> Implemented by `@implementer` from `dev/plans/technical/FEATURE-011-technical-plan.yaml`.

## Objective

Turn the dashboard's single view into a tabbed layout — the existing view becomes **"Trend
Analysis"** — and add a second tab, **"Data Basis"**, that makes the collection methodology and
raw data shape transparent: search parameters, weekly collection volume, size/rooms/price
distributions, and a geo scatter of recently collected listings with the search radius overlaid.

## Context

`frontend/index.html` + `frontend/app.js` render one flat page: a filter bar, 5 KPI cards, and an
8-chart grid, all built from `gold/aggregations/latest.json` (schema v1.0). There is no tab or
routing concept anywhere in the frontend (confirmed: no `tab`/`view`/`route` keyword in the
codebase beyond the existing "all vs. filtered population" radio toggle, which switches *data*,
not *views*).

The gold schema's `general`/`relevant` population blocks are deliberately **scoped** to 3
comparison districts (`SCOPE_DISTRICTS = ["Extramurs", "Ciutat Vella", "L'Eixample"]`, see
`gold_aggregate.py`) and **deduped per snapshot** (`_dedup`, scoped to `(operation, snapshot_date,
propertyCode)`). Both restrictions make sense for market analysis but hide exactly the information
this feature wants to surface: how much data was collected, from where, and what its raw shape
looks like — city-wide, not just the 3 headline districts.

Good news from verification: **the Silver schema already has `latitude`/`longitude`** per listing
(`silver_transform.py`, `_SILVER_COLUMNS`), so the geo map has no blocking data dependency. The
search parameters (`center`, `distance`, `minSize`, `maxSize`, `elevator`, `preservation`) live as
literals inside `SearchConfig.__init__` in `src/etl/data_collection/bronze_collector.py` — the only
place they exist today. No `rooms`/`bathrooms`/`floor` API filters exist (Idealista is not queried
by those fields; they are just columns in the response used later for the `relevant_filter`
predicate). The user's request for "further filter criteria such as rooms, bathrooms, floor" is
therefore addressed as **distributions of what came back**, not as additional search filters.

## Dependencies

- **Needs:** FEATURE-009 (chart_theme/dashboard_state/i18n conventions this feature must follow),
  FEATURE-010 (precedent for adding a gold field without bumping `schema_version`)
- **Unblocks:** FEATURE-012 — Pipeline Health tab reuses the tab-navigation infrastructure built
  here (tab bar, `tab_state.js`, ARIA wiring, lazy chart activation)

## Design & patterns

### Backend (gold layer)

- **Strategy pattern, reused as-is.** The existing `Aggregation` Protocol (`key: str`,
  `compute(df) -> list[dict]`) already has the exact shape needed for the new datasets — no new
  interface. This is a deliberate **Liskov/Open-Closed** point: new datasets are added by writing
  one more class, not by touching `GoldAggregator`.
- **New, independent top-level block `data_basis`,** a sibling of `general`/`relevant`, built from
  the **full, unscoped** Silver history (not `apply_scope()`-restricted to the 3 comparison
  districts) — because the goal here is transparency about the whole collection, not the
  market-comparison subset.
- **Two different dedup semantics, used deliberately and documented:**
  - `weekly_listing_volume` uses the existing **per-snapshot** `_dedup()` (removes only
    pagination-overlap duplicates within one `(operation, snapshot_date)` run) — because it must
    reflect actual weekly collection volume, including a listing that reappears week after week.
  - `size_histogram_10sqm`, `rooms_distribution`, `price_per_area_histogram`, and
    `listing_locations_last_3m` use a **new global dedup by `propertyCode`, keeping the most
    recent snapshot row** (`_dedup_latest_by_property`, new helper) so a listing scraped every week
    for 6 months doesn't dominate a size/price/geo distribution 26× over. These four datasets are
    additionally windowed to the **last `ROLLING_KPI_WINDOW_MONTHS` (3, already a named constant
    from FEATURE-010, reused via `_rolling_window_start`)** so the distributions describe *current*
    market composition, not all-time history.
- **Single source of truth for search parameters (no duplication).** Move the literal values out
  of `SearchConfig.__init__` into a new shared constant, `IDEALISTA_SEARCH_PARAMS`, in
  `src/etl/common/search_config.py` (already-bundled into every Lambda's zip via the existing
  `common/` `fileset()` pattern — verified in `lambda_bronze/main.tf`). `SearchConfig.__init__`
  reads from this constant instead of repeating literals; a new gold strategy
  (`SearchConfigSnapshot`) serializes the *same* constant into `data_basis.search_config`. One
  dict, two consumers — zero duplication risk.
- **Factory registration**, mirroring `default_populations()`: a new `default_data_basis()`
  function returns the ordered tuple of `data_basis` strategies, consumed by `GoldAggregator`
  exactly like `general`/`relevant` are today (`build_document()` gains one more key).

### Frontend

- **Tab navigation as pure-function state + thin DOM wiring**, matching the project's established
  split (`dashboard_state.js` = pure reducers, `app.js` = the only place with DOM/fetch side
  effects). New module `frontend/src/tab_state.js`:
  - `TAB_IDS = ['trend-analysis', 'data-basis']` (FEATURE-012 appends `'pipeline-health'`)
  - `resolveActiveTab(hash, validIds, fallbackId)` — pure, deep-linkable via `location.hash`
  - `buildTabHash(tabId)` — pure, inverse of the above
  - No new class/controller is introduced: this generalises the *existing* population-toggle
    wiring pattern in `app.js` (lines 617–633) from 2 states to N tabs, which is the simplest
    design that keeps the single DOM-side-effect owner. A `TabController` class was considered and
    rejected as over-engineering for what is, in the end, "hide one section, show another, remember
    the choice in the URL hash."
  - **Lazy first-render per tab:** each tab's charts are rendered once, on first activation (not
    eagerly at page load), because Plotly cannot size a chart inside a `display:none` container.
    `app.js` tracks a `Set` of already-rendered tab ids and calls `Plotly.Plots.resize()` for any
    tab-owned container on every subsequent activation (handles viewport changes while a tab was
    hidden).
- **5 new chart renderer modules**, one per dataset, following the exact
  `price_time_series.js` factory pattern (Strategy + Factory: a `render(populationBlock, context)`
  function returning `{data, layout}`, `buildLayout()` from `chart_theme.js` for theming):
  - `frontend/src/charts/weekly_listing_volume.js`
  - `frontend/src/charts/size_histogram.js`
  - `frontend/src/charts/rooms_distribution.js`
  - `frontend/src/charts/price_per_area_histogram.js`
  - `frontend/src/charts/listing_locations_map.js`
- **Search config panel is not a chart.** `frontend/src/search_config.js` exports a pure
  `formatSearchConfigSummary(searchConfig, locale)` (mirrors `summary.js`'s
  `formatKpi`/`summaryStats` pattern) rendered as plain i18n'd text/definition-list markup by
  `app.js` — no Plotly needed for static parameters.

### Map / search-radius trade-off (decision needed from user)

The project's frontend has **zero external network calls** by design (FEATURE-009 review, M3:
"Plotly.js vendored same-origin, no CDN"). A tile-based map (Leaflet+OSM, Mapbox) would break this
either via tile requests or a Mapbox token/API call. **Recommendation (chosen approach): a single
Plotly `scattergl` trace using `latitude`/`longitude` as plain `y`/`x` data coordinates** — no
basemap, no tiles, no external call:

- One marker series per district (categorical colour from the existing `chart_theme.js` colorway)
  plots `listing_locations_last_3m`.
- The **1500 m search radius is drawn as a `layout.shapes` circle** centred on
  `(39.4693441, -0.379561)`, with the ellipse's x/y radii corrected for the fact that 1° longitude
  ≠ 1° latitude in metres at Valencia's latitude (`radius_lat_deg = 1500 / 111_320`,
  `radius_lon_deg = 1500 / (111_320 · cos(lat))`).
  `layout.yaxis.scaleanchor/scaleratio` is set so the plot preserves true aspect ratio (a
  well-supported native Plotly feature, no extra library).
- **This merges the "search radius map" and "listings distribution map" into one chart** — both
  requirements are visually satisfied by the same figure (points inside vs. outside/near the
  radius boundary, coloured by district). Flagged explicitly as an **architect recommendation to
  confirm in review**: the alternative is two separate charts if the user prefers the radius shown
  without real listing points (e.g., as a static, schematic illustration next to the search-config
  panel instead).
- **Trade-off accepted:** no street context, no pan/zoom basemap, no district polygon outlines —
  just relative point positions on an aspect-corrected plane. This is judged sufficient for "where
  are the listings, coloured by district" and keeps the zero-external-call principle intact at
  $0 extra cost. If real street-level context is later required, that must be a separate,
  explicitly-approved exception to the no-CDN principle (out of scope here).

### Additional ideas proposed (architect's own additions, kept intentionally small)

- A tiny **"data freshness" line** on the Data Basis tab ("Last collection run: 2026-08-03 · 187
  listings collected that week") computed from the last row of `weekly_listing_volume` — near-zero
  extra effort, reuses the KPI-card CSS already in `styles.css`.
- `rooms_distribution` and `price_per_area_histogram` were chosen as the "further statistical
  properties" over bathrooms/floor because rooms and price/m² are the two dimensions users most
  often use to reason about comparability; bathrooms/floor distributions are called out as a cheap
  follow-up (same strategy class shape) if the reviewer wants them in scope now instead.

## Approach

### Phase 1 — Backend: shared search-config constant (no behaviour change)
- [ ] Add `src/etl/common/search_config.py` with `IDEALISTA_SEARCH_PARAMS` (dict: `center_lat`,
      `center_lon`, `distance_m`, `property_type`, `min_size_m2`, `max_size_m2`, `elevator`,
      `preservation`, `sale_credential_label='LVW'`, `rent_credential_label='PMV'`).
- [ ] Update `SearchConfig.__init__` in `bronze_collector.py` to read from
      `IDEALISTA_SEARCH_PARAMS` instead of inline literals. Existing bronze collector tests must
      pass unmodified (byte-identical `build_url()` output) — this is a pure refactor.

### Phase 2 — Backend: `data_basis` gold strategies (TDD)
- [ ] `_dedup_latest_by_property(df)` in `gold_aggregate.py` — new pure helper, unit-tested
      (keeps latest `snapshot_date` row per `(operation, propertyCode)`; empty-input safe).
- [ ] `_weekly_listing_volume(df)` — groups per-snapshot-deduped, **unscoped** silver rows by
      `(operation, snapshot_date)` → `count_listings`.
- [ ] `_size_histogram_10sqm(df)` — 10 m² bins from `floor(min size)` to `ceil(max size)`, per
      operation, on the last-3-months/global-deduped frame.
- [ ] `_rooms_distribution(df)` — count per `(operation, rooms)`.
- [ ] `_price_per_area_histogram(df)` — 10 equal-width bins per operation (computed from observed
      min/max, since rent €/m²/mo and sale €/m² are on very different scales).
- [ ] `_listing_locations_last_3m(df)` — `(operation, district, neighborhood, latitude,
      longitude)` rows, last-3-months/global-deduped.
- [ ] New `Aggregation`-conformant classes in `gold_aggregator.py`: `SearchConfigSnapshot`,
      `WeeklyListingVolume`, `SizeHistogram`, `RoomsDistribution`, `PriceAreaHistogram`,
      `ListingLocations`. Add `default_data_basis()` factory function.
- [ ] `GoldAggregator.build_document()` gains `"data_basis": self._run_data_basis(silver_df)` —
      **not** scope-filtered, using the dedicated dedup rules above. Update/regenerate golden
      master fixture; assert the existing `general`/`relevant` blocks stay byte-for-byte unchanged.

### Phase 3 — Frontend: tab navigation infrastructure
- [x] `frontend/src/tab_state.js` + `frontend/tests/tab_state.test.js` — `TAB_IDS`,
      `resolveActiveTab()`, `buildTabHash()`, fully pure, no DOM.
- [x] `index.html`: add `<nav role="tablist">` with 2 buttons (`role="tab"`,
      `aria-selected`, `aria-controls`), wrap the existing `<main>` content in
      `<section role="tabpanel" id="panel-trend-analysis">`, add an empty
      `<section role="tabpanel" id="panel-data-basis" hidden>`.
- [x] Rename the existing view's user-facing label to **"Trend Analysis"**
      (`app.title`/new `tabs.trendAnalysis` i18n key) in all 5 locales.
- [x] `app.js`: wire tab clicks + `hashchange`, toggle `hidden`/`aria-selected`, call each tab's
      lazy-render callback once, call `Plotly.Plots.resize()` on re-activation.
- [x] `styles.css`: tab bar styling, mobile-first (horizontal scroll on narrow viewports, ≥44px
      touch targets per existing convention), dark/light tokens reused from FEATURE-009.

### Phase 4 — Frontend: Data Basis tab charts
- [x] 5 new chart renderer modules (listed above) + Vitest unit tests per renderer (layout from
      `buildLayout()`, trace shape from fixture data), mirroring `price_time_series.test.js`.
- [x] `frontend/src/search_config.js` + tests — pure formatting of `data_basis.search_config`.
- [x] Extend `frontend/tests/fixtures/latest.sample.json` with a `data_basis` block.
- [x] Wire the 6 new sections (5 charts + search-config panel) into `panel-data-basis`,
      lazy-rendered on first tab activation.

### Phase 5 — i18n, accessibility, responsiveness
- [x] New i18n keys for tab labels + all new chart titles/axes/search-config panel text, added to
      all 5 locale dictionaries (`en`, `de`, `es`, `ar`, `tr`) in `i18n.js`.
- [ ] RTL check for Arabic tab bar (`isRtl()` already available).
- [ ] Manual check: mobile viewport (tab bar doesn't overflow awkwardly), keyboard tab navigation
      (arrow keys optional/nice-to-have, `Tab`+`Enter` must work), screen-reader announcement on
      tab switch (reuse `#status-announcer`).

### Phase 6 — Docs & deployment
- [ ] `documentation/DATA_GOLD_LAYER.md` — new `data_basis` section: fields, dedup rationale,
      sample JSON, design decision notes (mirrors the FEATURE-010 write-up style).
- [ ] `documentation/FRONTEND_LAYER.md` — tab architecture, new chart modules.
- [ ] Deploy `dev-gold-aggregator` first, manually invoke against real S3 data, download and
      eyeball the new `data_basis` block (per the existing "Running the Backfill" recipe), then
      point the dev frontend at it and visually confirm the new tab renders sane charts/map with
      no console errors on both desktop and mobile widths. **Only then** promote the gold Lambda
      change to prod via a separate `terraform apply` (same two-step pattern as FEATURE-006/010).
      Frontend redeploys continuously from `main`, no separate frontend promotion step needed.

## Files

- **Create:**
  - `src/etl/common/search_config.py` — shared search-parameter constants
  - `frontend/src/tab_state.js`, `frontend/src/search_config.js`
  - `frontend/src/charts/weekly_listing_volume.js`, `size_histogram.js`, `rooms_distribution.js`,
    `price_per_area_histogram.js`, `listing_locations_map.js`
  - `frontend/tests/tab_state.test.js`, `search_config.test.js`, and one test file per new chart
    module
- **Change:**
  - `src/etl/data_collection/bronze_collector.py` — `SearchConfig` reads shared constants
  - `src/etl/data_processing/gold_aggregate.py` — new pure helpers + constants
  - `src/etl/data_processing/gold_aggregator.py` — new strategies + `default_data_basis()` +
    `build_document()` wiring
  - `frontend/index.html` — tab bar + tabpanel wrapper markup
  - `frontend/app.js` — tab wiring, lazy render, resize-on-activation
  - `frontend/src/i18n.js` — new keys, all 5 locales
  - `frontend/styles.css` — tab bar styles
  - `documentation/DATA_GOLD_LAYER.md`, `documentation/FRONTEND_LAYER.md`
- **Tests:**
  - `src/etl/data_processing/tests/test_gold_aggregate.py`,
    `test_gold_aggregator.py` — new helper/strategy unit tests + updated golden master
  - `src/etl/data_collection/tests/test_bronze_collector.py` — unchanged-output regression after
    the constants refactor
  - `frontend/tests/*` — as listed above

## Test strategy

- **Unit (Python):** every new pure helper tested for empty input, single-operation input,
  multi-district/multi-week input, and bin-edge correctness (size/price histograms); dedup helper
  tested for "same propertyCode across 5 snapshots → 1 row, latest kept."
- **Unit (JS/Vitest):** each chart renderer asserts on trace shape + `buildLayout()` usage from
  fixture data (including empty-array safety, matching existing renderer test convention);
  `tab_state.js` tested purely (hash resolution, invalid-hash fallback); geo chart tested for
  correct `layout.shapes` circle math (radius-in-degrees calculation) and `scaleratio`.
- **Integration:** golden-master regression proves `general`/`relevant` blocks are untouched;
  a moto-backed `GoldAggregator.aggregate()` test proves `data_basis` survives silver→S3 round trip.
  Manual dev-environment check per Phase 6.
- **Manual:** mobile + desktop, light + dark, all 5 locales' tab labels, keyboard-only tab
  switching, Lighthouse pass on the new tab (matches FEATURE-009 precedent).

## Estimated monthly cloud cost

| Component | Pricing basis | Assumption | Est. / month |
|---|---|---|---|
| Gold Lambda (existing) | unchanged invocation count/duration | one more block computed per run, same schedule | ~$0.00 |
| S3 storage (existing) | unchanged | `latest.json` grows by a few KB | ~$0.00 |
| **Total (new AWS components)** | | | **~$0.00/month** |

- **Cost drivers & cheaper alternatives:** none — this is a code-only change reusing the existing
  Lambda, schedule, and S3 object. No new infrastructure is created.
- **External / non-AWS costs:** none.
- **Budget check:** yes — $0 incremental, well within the project's `< $5/month` target.

## Success criteria

- [ ] Dashboard has a working tab bar; the former single view is now labelled "Trend Analysis" in
      all 5 locales and behaves exactly as before inside its tab
- [ ] "Data Basis" tab shows: search parameters, weekly collection volume (sale + rent), a 10 m²
      size histogram (sale + rent), rooms distribution, price/m² histogram, and a geo scatter of
      last-3-months listings coloured by district with the 1500 m search radius overlaid
- [ ] `gold/aggregations/latest.json`'s `general`/`relevant` blocks are byte-for-byte unchanged
      (golden master passes)
- [ ] No external network calls introduced (map is same-origin Plotly, no tiles/CDN)
- [ ] Tests pass, coverage holds >80% on new code (both Python and JS)
- [ ] Docs updated (`DATA_GOLD_LAYER.md`, `FRONTEND_LAYER.md`)
- [ ] Deployed to dev, manually verified, then promoted to prod

## Open questions & risks

- **Question:** Should the search-radius circle and the listing-location scatter really be one
  combined chart (architect's recommendation), or two separate charts (schematic radius diagram +
  separate scatter map)? Needs a decision before Phase 4 starts.
- **Question:** Is a 3-month window the right recency cut for the geo map and
  size/rooms/price distributions, or should "Data Basis" show all-time data (unlike the KPI tiles,
  which are deliberately rolling per FEATURE-010)? Proposed default: 3 months, reusing the existing
  constant, but this is a judgement call worth confirming.
- **Risk:** `data_basis` computed from unscoped, full-city data could reveal districts/areas the
  3-district market comparison intentionally excludes, which may look inconsistent to a user
  switching tabs (KPIs only reflect 3 districts, Data Basis reflects the whole 1500 m radius). —
  *Mitigation:* label the tab clearly ("collection area," not "your target districts") and note
  the scope difference in the search-config panel copy.
- **Risk:** Lazy-render-on-first-activation adds real DOM-timing complexity (container must be
  visible before `Plotly.newPlot` sizes correctly). — *Mitigation:* activate `hidden` removal
  synchronously before calling `newPlot`, and add a regression test asserting containers are not
  `hidden` at render time.
- **Assumption:** Bathrooms/floor distributions are out of scope for this iteration (rooms and
  price/m² chosen as the two additional distributions) — cheap to add later behind the same
  Strategy interface if requested.

## Progress log

- **2026-08-04** — Plan drafted by `@architect` after codebase verification (frontend, gold/silver
  schema, bronze `SearchConfig`, existing plans/README conventions).
