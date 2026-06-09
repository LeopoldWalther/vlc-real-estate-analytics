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
          app.js (ESM entry)
              │
              ├── DataSource.load()        ← fetch + schema_version guard
              ├── GENERAL_ONLY_RENDERERS   ← always use data.general
              └── TOGGLE_RENDERERS         ← switch between data.general / data.relevant
                       │
                       ▼
              Plotly.js v2.35.2 (vendored same-origin, vendor/plotly.min.js)
```

### Rendering path

1. `app.js` calls `DataSource.load()` — fetches `latest.json`, validates `schema_version == "1.0"`,
   rejects on mismatch so a schema bump is never silently swallowed.
2. All eight renderers are called once with the initial `data.general` population block. General-only
   renderers always use `data.general`. Toggle renderers use the active population.
3. If `data.relevant` is present, the population toggle is shown with a label derived from
   `data.relevant_filter` (via `buildRelevantLabel`) — never hardcoded.
4. On toggle change, `Plotly.react` (diff, not full teardown) re-renders the four toggle charts with
   the selected population and stamps the active population into the chart titles.

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

## Source Code Layout

```
frontend/
├── index.html                          # Single HTML page; 8 chart containers; population toggle
├── app.js                              # Entry — wires DataSource + all renderers; toggle handler
├── styles.css                          # Layout; .chart-container overflow:hidden
├── vendor/
│   └── plotly.min.js                   # Vendored Plotly.js v2.35.2 (same-origin, no CDN)
├── src/
│   ├── data_source.js                  # DataSource (fetch + schema guard) + FakeDataSource
│   ├── transforms.js                   # Pure formatSeries / formatRatioSeries helpers
│   ├── dashboard.js                    # (removed — orchestration lives in app.js run())
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

1. `npm ci` + `npm test` — all 70 Vitest tests must pass before any upload.
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
Plotly is injected via `vi.stubGlobal` where needed. The suite runs in < 250 ms.

```bash
# Full suite (70 tests)
cd frontend && npm test
```
