# VLC Real Estate Analytics — Frontend Visualization Layer

## Overview

The frontend is a plain HTML + ESM module single-page application that fetches
`gold/aggregations/latest.json` from the same CloudFront distribution that serves the assets
(same-origin, no CORS) and renders eight interactive Plotly.js charts. It is statically hosted in a
private S3 bucket behind CloudFront.

## Architecture

```
CloudFront (dual origin: assets + gold/aggregations/*)
   │
   ├── /gold/aggregations/latest.json   ← listings S3 bucket (1 h TTL)
   └── /*                               ← frontend-assets S3 bucket (long TTL)
              │
              ▼
      index.html  ←  <script type="module" src="app.js">
              │
              ▼
          app.js (ESM entry — thin orchestration only)
              │
              ├── DataSource.load()        ← fetch + schema_version guard
              ├── dashboard_state.js       ← theme/viewport/rerender/lifecycle (pure)
              ├── summary.js               ← KPI headline row aggregation (pure)
              ├── chart_theme.js           ← buildLayout(viewport, colorScheme) (pure)
              ├── GENERAL_ONLY_RENDERERS   ← always use data.general
              └── TOGGLE_RENDERERS         ← switch between data.general / data.relevant
                       │
                       ▼
              Plotly.js v2.35.2 (vendored same-origin, vendor/plotly.min.js)
```

### Rendering path

1. `app.js` calls `DataSource.load()` — fetches `latest.json`, validates `schema_version == "1.0"`,
   rejects on mismatch so a schema bump is never silently swallowed. The load-lifecycle
   (`dashboard_state.createLoadState` / `transition`) drives loading skeletons and the retry/error
   block; a `retry` event resets the lifecycle to `loading` and reruns `run()`.
2. On success, `summary.summaryStats(data.general)` computes the KPI headline row (median rent
   €/m²/mo, median sale €/m², implied gross yield %, total listings, last updated), formatted via
   `formatKpi` and written into the `#kpi-row` cards.
3. All eight renderers are called once with the initial `data.general` population block and a
   `{ viewport, colorScheme }` context resolved by `dashboard_state.resolveViewport(window.innerWidth)`
   / `resolveTheme(storedTheme, systemPrefersDark)`. General-only renderers always use
   `data.general`. Toggle renderers use the active population. Each renderer's `render(block, context)`
   passes `context` straight into `chart_theme.buildLayout` so every chart shares one responsive,
   themed layout.
4. If `data.relevant` is present, the population toggle is shown with a label derived from
   `data.relevant_filter` (via `buildRelevantLabel`) — never hardcoded.
5. On toggle change, `Plotly.react` (diff, not full teardown) re-renders the four toggle charts with
   the selected population and stamps the active population into the chart titles.
6. A debounced (200 ms) `resize` listener and a `prefers-color-scheme` `change` listener recompute
   the `{ viewport, colorScheme }` context; `dashboard_state.shouldRerender(prev, next)` gates
   whether charts actually re-render (only on an actual viewport-bucket or color-scheme change, not
   on every resize tick). An explicit theme choice from the header toggle button is persisted to
   `localStorage` and always wins over the system preference.

## Responsive & theming architecture (FEATURE-009)

Three small, pure (DOM-free) modules carry all of the redesign's non-trivial logic so `app.js` stays
a thin DOM-applying consumer:

- **`src/chart_theme.js` — `buildLayout({ viewport, colorScheme, overrides })`** (Strategy +
  Factory). `viewport` ('mobile'/'desktop') and `colorScheme` ('light'/'dark') are independent
  config axes — margins/legend/font-size come from viewport geometry, colors/gridlines/colorway
  come from the color scheme, and caller `overrides` (axis titles, `boxmode`, etc.) are deep-merged
  on top. The returned layout never carries a `title` key — chart titles are owned by each renderer,
  and `app.js` appends the active population label for toggle charts.
- **`src/dashboard_state.js`** — pure helpers, no `document`/`window`/`fetch` references:
  `resolveTheme(stored, systemPrefers)` (explicit choice wins, else system preference),
  `resolveViewport(width)` (768 px breakpoint), `shouldRerender(prev, next)` (true only on a
  viewport-bucket or color-scheme change), and the load lifecycle `createLoadState()` / `transition()`
  (`loading → ready | error`, with `retry` always resetting to `loading`).
- **`src/summary.js`** — pure `summaryStats(populationBlock)` computing a count-weighted median
  rent/sale price, an implied gross yield (`(12 / mean_sales_price_by_rent_ratio) * 100`, weighted by
  listing count), and total listing counts from `boxplot_by_neighborhood` /
  `rent_vs_sale_ratio`; every field is null-able so missing/empty source arrays never throw. Plus
  `formatKpi(value, kind)` for display formatting (`eur_per_m2_month`, `eur_per_m2`, `percent`,
  `count`, `date`).

Each of the five chart renderer modules was migrated to `chart_theme.buildLayout` one module per
commit (a deliberate risk mitigation — the suite stayed green after every single migration) and now
accepts an optional `render(populationBlock, context)` second parameter defaulting to
`{ viewport: 'desktop', colorScheme: 'light' }` so every pre-existing call site/test keeps working
unchanged.

## Chart Inventory

| Container ID | Renderer | Population | Data key |
|---|---|---|---|
| `price-time-series-rent` | `priceTimeSeriesRentRenderer` | general only | `neighbourhood_price_by_date` (rent) |
| `price-time-series-sale` | `priceTimeSeriesSaleRenderer` | general only | `neighbourhood_price_by_date` (sale) |
| `price-time-series-district-rent` | `priceTimeSeriesDistrictRentRenderer` | general only | `district_price_by_date` (rent) |
| `price-time-series-district-sale` | `priceTimeSeriesDistrictSaleRenderer` | general only | `district_price_by_date` (sale) |
| `rent-vs-sale-ratio` | `rentVsSaleRatioRenderer` | toggle | `neighbourhood_rent_vs_sale` |
| `rent-vs-sale-ratio-time-series` | `ratioTimeSeriesRenderer` | toggle | `rent_vs_sale_ratio_time_series` |
| `boxplot-by-neighborhood-rent` | `boxplotRentRenderer` | toggle | `neighbourhood_price_distribution` (rent) |
| `boxplot-by-neighborhood-sale` | `boxplotSaleRenderer` | toggle | `neighbourhood_price_distribution` (sale) |

Rent and sale boxplots are split into separate charts because rent (€10–25/m²/month) and sale
(€2 000–6 000/m²) differ by ~300×; a shared Y-axis would make one population unreadable.

## Design Patterns

### Strategy — ChartRenderer

Each chart is an independent module exporting one or more renderer objects with the contract:

```js
{ id: string, title: string, render(populationBlock) -> { data, layout } }
```

Adding a new chart requires only a new renderer module imported into `app.js` — no changes to
the data layer or orchestration. The contract is validated by `FakeDataSource` in every renderer
unit test.

### Adapter + Dependency Inversion — DataSource

`DataSource` wraps `fetch()` behind a `load()` method. `FakeDataSource` satisfies the same
interface and returns a local fixture without any network call. Tests never touch the network:

```js
// Production
const source = new DataSource(window.CONFIG.DATA_URL);

// Tests
const source = new FakeDataSource(fixture);
```

The schema guard throws `Error('Unsupported schema_version: ...')` on a version mismatch so a
gold-schema bump is caught immediately instead of silently rendering broken charts.

### Strategy + Factory — ChartTheme

`chart_theme.buildLayout({ viewport, colorScheme, overrides })` produces the shared Plotly `layout`
base (margins, legend, fonts, colors, gridlines) every renderer consumes, with `viewport` and
`colorScheme` as independent, interchangeable strategies and `overrides` deep-merged on top. A new
breakpoint or palette is a config change in one file, not an edit across five chart modules
(Open/Closed). Deliberately a plain factory function rather than a class hierarchy — the two axes
are independent config inputs, not polymorphic behaviours, so a config-producing function avoids
over-engineering.

## Source Code Layout

```
frontend/
├── index.html                          # Single HTML page; KPI row; 8 chart containers; toggle; theme button
├── app.js                              # Entry — thin orchestration; wires DataSource + pure modules + renderers
├── styles.css                          # Design tokens (light/dark), responsive card grid, skeletons, a11y
├── favicon.svg                         # Inline SVG brand mark
├── vendor/
│   └── plotly.min.js                   # Vendored Plotly.js v2.35.2 (same-origin, no CDN)
├── src/
│   ├── data_source.js                  # DataSource (fetch + schema guard) + FakeDataSource
│   ├── transforms.js                   # Pure formatSeries / formatRatioSeries helpers
│   ├── chart_theme.js                  # buildLayout(viewport, colorScheme, overrides) factory
│   ├── dashboard_state.js              # Pure theme/viewport/rerender/lifecycle helpers
│   ├── summary.js                      # Pure summaryStats + formatKpi (KPI headline row)
│   └── charts/
│       ├── price_time_series.js        # Factory: priceTimeSeriesRentRenderer + SaleRenderer
│       ├── price_time_series_district.js # Factory: district rent + sale
│       ├── rent_vs_sale_ratio.js       # rentVsSaleRatioRenderer (scatter)
│       ├── rent_vs_sale_ratio_time_series.js  # ratioTimeSeriesRenderer (line)
│       └── boxplot_by_neighborhood.js  # makeBoxplotRenderer; separate rent + sale renderers
└── tests/
    ├── fixtures/
    │   └── latest.sample.json          # Schema-v1.0 fixture used by all tests
    ├── data_source.test.js
    ├── transforms.test.js
    ├── transforms_additional.test.js
    ├── chart_theme.test.js
    ├── dashboard_state.test.js
    ├── summary.test.js
    ├── price_time_series.test.js
    ├── price_time_series_district.test.js
    ├── rent_vs_sale_ratio.test.js
    ├── rent_vs_sale_ratio_time_series.test.js
    └── boxplot_by_neighborhood.test.js
```

## Infrastructure

The frontend is provisioned by `infrastructure/modules/frontend/`:

- **`aws_s3_bucket.assets`** — private bucket (`${environment}-vlc-frontend-assets`). Block Public
  Access fully on; served only via OAC.
- **CloudFront distribution** — two origins, both via OAC:
  - Origin 1: frontend assets bucket (long TTL for HTML/JS/CSS).
  - Origin 2: listings bucket `gold/aggregations/*` path (1 h TTL so chart data refreshes within
    one collection cycle).
- **Route 53 A + AAAA** — alias records pointing the custom domain at CloudFront.
- **ACM certificate** — wildcard `*.leopoldwalther.com` (us-east-1, CloudFront requirement);
  sourced from the shared `infrastructure/shared/dns` remote state.
- **Custom domains** — `vlc-report-dev.leopoldwalther.com` (dev) · `vlc-report.leopoldwalther.com`
  (prod, FEATURE-006).

## Deploy Workflow

`deploy-frontend.yml` (workflow_dispatch, environment `dev` / `prod`):

1. `npm ci` + `npm test` — all 106 Vitest tests must pass before any upload.
2. `terraform output -raw frontend_asset_bucket_name` — reads the bucket name from state.
3. `aws s3 sync frontend/ s3://<bucket>/ --delete` — excludes `tests/`, `node_modules/`,
   `coverage/`, `*.test.js`.
4. `aws cloudfront create-invalidation --paths "/*"` — **must** follow every sync; the long-TTL
   policy means stale assets otherwise persist until the TTL expires.

## Gold / Silver Ordering Constraint

**The frontend must never be deployed before gold is current.** If gold is re-run while silver is
still being backfilled, charts will show a near-empty history (the same issue hit during initial dev
setup). The correct order before deploying to a fresh environment is:

1. Run the silver backfill and **verify the parquet count** for both operations.
2. Invoke the gold aggregator and confirm `latest.json` contains the full date history.
3. Only then trigger the frontend deploy + CloudFront invalidation.

## Local Development

```bash
cd frontend

# Install dependencies (Vitest only — no runtime deps)
npm ci

# Run tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

## Testing

Tests use [Vitest](https://vitest.dev/) with `FakeDataSource` and a local fixture
(`tests/fixtures/latest.sample.json`). No DOM, no network, no Plotly mock at module level —
Plotly is injected via `vi.stubGlobal` where needed. `app.js` itself has no dedicated unit tests
(kept intentionally thin, DOM-only orchestration — see FEATURE-009 review finding M2) and is
excluded from coverage; all non-trivial logic lives in the pure `src/*.js` modules, which are all
covered. The suite runs in < 350 ms.

```bash
# Full suite (106 tests)
cd frontend && npm test
```
