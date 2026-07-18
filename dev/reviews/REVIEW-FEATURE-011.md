# Review — FEATURE-011: Tab navigation + Data Basis tab

**Reviewer:** `@reviewer` · **Date:** 2026-07-18 · **Plan:** [FEATURE-011](../plans/FEATURE-011-dashboard-tabs-data-basis.md)
**Verdict:** ⚠️ Changes Recommended

## Summary

The plan is feasible and fits the current architecture: tab navigation is a natural frontend extension, while a new additive `data_basis` gold block is the right place for collection-methodology datasets. The main correction before implementation is privacy: the plan must not export raw per-listing coordinates, even if Silver contains latitude/longitude.

No return to Architect is needed. The technical plan below folds the findings into executable tasks.

## Strengths

- ✅ Keeps FEATURE-012 out of scope while building a tab shell that can later host Pipeline Health.
- ✅ Uses the existing gold Strategy pattern rather than adding special-case orchestration.
- ✅ Treats `data_basis` as an additive top-level block, preserving existing `general`/`relevant` consumers.
- ✅ Keeps the frontend zero-build and same-origin-only by avoiding Leaflet/OSM/Mapbox tiles.
- ✅ Sources search parameters from a shared backend constant instead of duplicating UI text and collector config.

## Findings

### 🔴 H1 — Do not expose raw per-listing coordinates

- **Problem:** The Architect plan proposes `listing_locations_last_3m` rows with raw `latitude`/`longitude` values.
- **Impact:** Even without `propertyCode`, raw coordinates can reveal individual listing locations and make it easier to re-identify properties by matching against public portals.
- **Recommendation:** Emit a privacy-safe aggregate such as `listing_location_grid_last_3m`: round coordinates to a coarse grid (for example 3 decimals, roughly 80–110 m in Valencia), group by `(operation, district, neighborhood, latitude_rounded, longitude_rounded)`, and include only `count_listings`. Do not export `propertyCode`, address-like fields, exact price, or exact per-listing coordinates.
- **Evidence:** The dashboard is public-facing and meant as a portfolio site; `latest.json` is public via CloudFront/S3.

### 🔴 H2 — Existing `general`/`relevant` blocks must stay compatible

- **Problem:** Adding a new top-level block is safe only if the established market-analysis blocks remain unchanged in shape and meaning.
- **Impact:** Existing charts, filters, FEATURE-010 rolling KPI behavior, and downstream consumers could regress if the gold assembly path changes deduping/scoping globally.
- **Recommendation:** Build `data_basis` through a separate strategy sequence over the raw Silver DataFrame. Keep `apply_scope()` and existing per-snapshot dedup semantics untouched for `general` and `relevant`. Add focused tests proving the old population blocks still exist and key datasets are unchanged for the golden fixture.
- **Evidence:** `frontend/app.js` and chart renderers consume `general`/`relevant`; FEATURE-010 just stabilized rolling median behavior on those blocks.

### 🟡 M1 — Plotly coordinate-plane map is acceptable but must be labelled honestly

- **Problem:** A Plotly lat/lon scatter with a radius shape is not a street map and lacks basemap context.
- **Impact:** Users may expect a Google/OSM-like map, especially because the prompt included a map screenshot.
- **Recommendation:** Proceed with the zero-external-call Plotly approach, but label it as "Listing location distribution" / "schematic coordinate map" and explain that it intentionally avoids external map tiles. No additional user approval is needed unless street-level map tiles are requested later.
- **Effort:** S

### 🟡 M2 — Search config needs a stable public schema

- **Problem:** Moving collector literals into a shared constant is good, but the UI should not consume collector-internal naming directly.
- **Impact:** Renaming collector parameters later could become a frontend breaking change.
- **Recommendation:** Add a small serialization helper for the public `data_basis.search_config` shape, with stable keys such as `center_lat`, `center_lon`, `distance_m`, `min_size_m2`, `max_size_m2`, `elevator`, `preservation`, `property_type`, and credential labels.
- **Effort:** S

### 🟡 M3 — Avoid overloading `app.js` with tab/chart orchestration

- **Problem:** The plan adds tab wiring, lazy rendering, search-config rendering, and five new charts to `app.js`.
- **Impact:** `app.js` is already the side-effect owner; careless additions could turn it into a hard-to-test god file.
- **Recommendation:** Keep state and data transforms pure (`tab_state.js`, per-chart modules, `search_config.js`) and make `app.js` only bind DOM events and call renderers.
- **Effort:** M

### 🟢 L1 — Bathrooms/floor can remain follow-up distributions

- **Suggestion:** Keep the first iteration to weekly volume, size, rooms, price/m², and privacy-safe geo distribution.
- **Why:** This covers the user's request and creates the pattern for additional distributions without bloating the first implementation.

## Alternatives considered

- **Tile-based map (Leaflet/OSM/Mapbox)** — better user familiarity and street context, but violates the established no-external-network frontend principle and introduces token/privacy/cache questions. Verdict: defer.
- **Raw listing-location export** — simpler and visually precise, but inappropriate for a public dataset. Verdict: reject.
- **Separate backend feature for `data_basis` before tabs** — lower PR size, but user value requires both the data and the tab UI. Verdict: keep one feature with backend/frontend phases.

## Risks

| Risk | Likelihood | Impact | Severity | Mitigation |
| --- | --- | --- | --- | --- |
| Public JSON exposes listing-level location | Med | High | 🔴 | Aggregate to rounded grid with counts only; test no forbidden fields are emitted. |
| Existing trend charts regress from changed gold assembly | Low | High | 🔴 | Keep `data_basis` strategy separate; golden-master and focused schema tests. |
| Coordinate-plane map is misunderstood as a real map | Med | Med | 🟡 | Honest labels/copy; no external tiles unless explicitly approved later. |
| `app.js` becomes difficult to maintain | Med | Med | 🟡 | Pure modules for state/transforms; DOM-only wiring in app.js. |
| Payload grows too large from location points | Low | Med | 🟡 | Grid aggregation and last-3-month window bound payload size. |

## Effort check

- **Plan estimate:** L (~3–3.5 d)
- **Reviewer estimate:** L (~22–30 h) — confidence Medium
- **Why it differs / hidden complexity:** The backend aggregations are straightforward, but safe privacy aggregation, golden-master updates, five new chart modules, i18n for five locales, and mobile/a11y verification make this a multi-day feature.

## Reuse & conflicts

- **Reuse:** `gold_aggregator.py` `Aggregation` Protocol and strategy registration.
- **Reuse:** FEATURE-010 rolling-window helper for last-3-month datasets.
- **Reuse:** `chart_theme.js` and existing chart renderer test patterns.
- **Reuse:** `dashboard_state.js` design style for pure `tab_state.js`.
- **Conflict / coordinate with:** FEATURE-012 should depend only on tab-shell extensibility and must not be implemented here.

## Approval criteria

- **Blockers (must fix):** H1 privacy-safe geo aggregation; H2 unchanged existing population blocks.
- **Recommended:** M1 honest map labeling; M2 stable search-config schema; M3 pure modules around thin `app.js` wiring.
- **Optional:** L1 additional bathroom/floor distributions later.

## Next step

Proceed with `@implementer Implement FEATURE-011` using `dev/plans/technical/FEATURE-011-technical-plan.yaml`.

---

### Post-implementation notes
*Filled in after the task ships.*

- **Worked well:** TBD
- **Missed in review:** TBD
- **Estimated vs. actual:** TBD
