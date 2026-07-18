# Gold Layer — Data Architecture & JSON Contract

## Overview

The gold layer transforms the silver cleaned-listings Parquet history into a
compact, dashboard-ready JSON file consumed by the FEATURE-005 static
visualization web app. It runs as a scheduled AWS Lambda (every Sunday at
12:45 UTC, 15 minutes after the silver cleaner) and writes a single file:

```
s3://<bucket>/gold/aggregations/latest.json
```

The output is **idempotent** — each run overwrites the same key — and covers
the **full time-series history** (all weeks since April 2023).

---

## Medallion Architecture Position

```
Bronze (raw API JSON)
        ↓  silver_cleaning_lambda   cron(30 12 ? * SUN *)
Silver (cleaned listings Parquet, partitioned by operation/snapshot_date)
        ↓  gold_aggregation_lambda  cron(45 12 ? * SUN *)
Gold   (pre-aggregated dashboard JSON — latest.json)
        ↓
FEATURE-005 (static visualization web app)
```

---

## Source Code

| File | Purpose |
|---|---|
| `src/etl/data_processing/gold_aggregate.py` | Pure (AWS-free) aggregation helpers — analytical math, shared by both the legacy entry point and the strategies |
| `src/etl/data_processing/gold_aggregator.py` | `GoldAggregator` + `Aggregation` strategies — orchestration and dataset composition |
| `src/etl/data_processing/gold_aggregation_lambda.py` | Thin Lambda handler — Factory wire-up + response shaping |
| `src/etl/data_processing/tests/test_gold_aggregate.py` | Unit tests for the pure aggregation helpers |
| `src/etl/data_processing/tests/test_gold_aggregator.py` | Unit tests for the strategies + `GoldAggregator` (includes the golden-master gate) |
| `src/etl/data_processing/tests/test_gold_aggregation_lambda.py` | Integration tests with moto S3 mocking |

### Design

Each dashboard dataset (`price_time_series_neighborhood`, `rent_vs_sale_ratio`, `boxplot_by_neighborhood`, …)
is modelled as an **Aggregation Strategy** — a small class exposing `key` + `compute(df)` behind one
common `Protocol` (**Open/Closed**, **Polymorphism**): a new dataset plugs in by adding a class and
listing it in `default_populations()`, never by editing a switch or `isinstance` ladder. `GoldAggregator`
**composes** the strategies for the `general`/`relevant` population blocks, depends only on the
`ObjectStore` protocol (**Dependency Inversion**), and assembles the frozen schema-v1.0 document. The
numeric implementations stay as pure functions in `gold_aggregate.py`, called unchanged by the
strategies — the **golden-master test** (`test_gold_aggregator.py`) asserts the resulting JSON is
byte-for-byte identical to the pre-refactor output. `gold_aggregation_lambda.py` is reduced to a
**Factory** (`build_aggregator`) plus a thin call to `aggregate()`.

---

## Aggregations

### Scope Filter

Only listings from the three city-centre districts are included:

```python
SCOPE_DISTRICTS = ["Extramurs", "Ciutat Vella", "L'Eixample"]
```

### Two Populations

All aggregations are computed for **two symmetric populations**:

| Population | Filter |
|---|---|
| `general` | All scoped listings (no additional filter) |
| `relevant` | "Apartments like ours": `hasLift=True`, `floor != "1"`, `size > 120 m²`, `rooms >= 2`, `bathrooms >= 2` |

### Datasets per Population

**`general` population:**
- `price_time_series_neighborhood` — weekly mean `priceByArea` per `(operation, district, neighborhood, snapshot_date)`
- `price_time_series_district` — weekly count-weighted mean per `(operation, district, snapshot_date)` (NOT mean-of-means)
- `rent_vs_sale_ratio` — full-history ratio `mean_priceByArea_sale / mean_priceByArea_rent` per neighborhood
- `rent_vs_sale_ratio_time_series` — same ratio computed per `snapshot_date`
- `boxplot_by_neighborhood` — 5-number summary (min/q1/median/q3/max + count) per `(operation, neighborhood)` over full history
- `boxplot_by_neighborhood_last_3m` — rolling 3-month 5-number summary per `(operation, neighborhood)` (see [Rolling 3-Month KPI Boxplot](#rolling-3-month-kpi-boxplot) below)

**`relevant` population:**
- `rent_vs_sale_ratio`
- `rent_vs_sale_ratio_time_series`
- `boxplot_by_neighborhood`
- `boxplot_by_neighborhood_last_3m`

### Deduplication

Dedup is applied **only within** `(operation, snapshot_date, propertyCode)` — NOT globally. This preserves time-series: the same property appearing in multiple weekly snapshots contributes to each snapshot's aggregate point.

### Ratio Min-Count

Neighborhoods where either the sale or rent side has fewer than `min_count` listings (default: **5**) are excluded from ratio datasets. Configurable via the `RATIO_MIN_COUNT` Lambda environment variable.

### Rolling 3-Month KPI Boxplot

`boxplot_by_neighborhood_last_3m` (FEATURE-010) is an **additive** sibling of the frozen, all-time `boxplot_by_neighborhood` field. It exists so the dashboard's median rent/sale KPI tiles reflect *current* market conditions instead of the full multi-year history.

- **Constant:** `ROLLING_KPI_WINDOW_MONTHS = 3` in `gold_aggregate.py` is the single named source of the window length — no literal `3`/`90-day` window is duplicated elsewhere in the aggregation logic.
- **Window anchor:** the window is relative to `max(snapshot_date)` in the scoped/deduped silver data for that population — **never wall-clock "now"** — so backfills and delayed collection runs stay deterministic.
- **Inclusive lower boundary:** a row is in-window when `snapshot_date >= max(snapshot_date) - 3 calendar months`. A listing snapshotted exactly on the boundary date is included.
- **`min_count` applies inside the window:** the same stability guard used for ratio datasets (default **5**, configurable via `RATIO_MIN_COUNT`) is applied to `(operation, district, neighborhood)` groups computed *within* the rolling window. Sparse recent groups (fewer than `min_count` listings in the last 3 months) are excluded from `boxplot_by_neighborhood_last_3m`, even though the same group may still appear in the all-time `boxplot_by_neighborhood` (which is never filtered by `min_count`).
- **Short history:** when fewer than 3 months of history exist, the window naturally includes every available row; the same `min_count` rule still applies, so a neighborhood with too few total listings is excluded just as it would be with a longer history.
- **Shared math, no duplication:** both `boxplot_by_neighborhood` and `boxplot_by_neighborhood_last_3m` delegate to the same private quantile/groupby helper in `gold_aggregate.py` — the rolling variant only pre-filters rows by date and passes a `min_count` threshold. This avoids two independently-maintained boxplot implementations.
- **`boxplot_by_neighborhood` remains all-time and unfiltered by `min_count`** — its meaning is unchanged from schema-v1.0. The rolling field is purely additive; existing consumers of `boxplot_by_neighborhood` (e.g. the all-time box-and-whisker chart) are unaffected.

---

## JSON Contract v1.0

This schema is **frozen**. FEATURE-005 depends on this exact shape. Do not change field names or structure without bumping `schema_version`.

### Top-Level Structure

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-06-08T12:45:33.123456+00:00",
  "scope_districts": ["Extramurs", "Ciutat Vella", "L'Eixample"],
  "min_count": 5,
  "relevant_filter": {
    "hasLift": true,
    "floor_not": "1",
    "size_gt": 120,
    "rooms_gte": 2,
    "bathrooms_gte": 2
  },
  "general": { ... },
  "relevant": { ... }
}
```

### Population Block

```json
{
  "price_time_series_neighborhood": [
    {
      "operation": "sale",
      "district": "Extramurs",
      "neighborhood": "Patraix",
      "snapshot_date": "2023-04-09",
      "count_listings": 12,
      "mean_priceByArea": 2450.5,
      "mean_size": 128.3,
      "mean_price": 314200.0
    }
  ],
  "price_time_series_district": [
    {
      "operation": "sale",
      "district": "Extramurs",
      "snapshot_date": "2023-04-09",
      "count_listings": 45,
      "mean_priceByArea": 2390.1,
      "mean_size": 130.0,
      "mean_price": 310800.0
    }
  ],
  "rent_vs_sale_ratio": [
    {
      "district": "Extramurs",
      "neighborhood": "Patraix",
      "mean_priceByArea_sale": 2450.5,
      "mean_priceByArea_rent": 10.2,
      "mean_sales_price_by_rent_ratio": 240.2,
      "count_listings_sale": 45,
      "count_listings_rent": 22
    }
  ],
  "rent_vs_sale_ratio_time_series": [
    {
      "district": "Extramurs",
      "neighborhood": "Patraix",
      "snapshot_date": "2023-04-09",
      "mean_priceByArea_sale": 2450.5,
      "mean_priceByArea_rent": 10.2,
      "mean_sales_price_by_rent_ratio": 240.2,
      "count_listings_sale": 12,
      "count_listings_rent": 8
    }
  ],
  "boxplot_by_neighborhood": [
    {
      "operation": "sale",
      "district": "Extramurs",
      "neighborhood": "Patraix",
      "count": 200,
      "min": 1800.0,
      "q1": 2100.0,
      "median": 2400.0,
      "q3": 2750.0,
      "max": 4200.0
    }
  ],
  "boxplot_by_neighborhood_last_3m": [
    {
      "operation": "sale",
      "district": "Extramurs",
      "neighborhood": "Patraix",
      "count": 28,
      "min": 2200.0,
      "q1": 2350.0,
      "median": 2480.0,
      "q3": 2650.0,
      "max": 3100.0
    }
  ]
}
```

> The `relevant` block omits `price_time_series_neighborhood` and `price_time_series_district`.
> `boxplot_by_neighborhood_last_3m` is additive (schema still v1.0): it has the identical record shape as `boxplot_by_neighborhood` but is scoped to the last `ROLLING_KPI_WINDOW_MONTHS` (3) calendar months relative to `max(snapshot_date)`, with `min_count` applied inside the window. See [Rolling 3-Month KPI Boxplot](#rolling-3-month-kpi-boxplot).

### Key Design Decisions

| Decision | Rationale |
|---|---|
| No global dedup | Preserves time-series — same property in multiple weeks contributes to each week's aggregate |
| Count-weighted district mean | Avoids bias from neighborhoods with few listings; `sum(count × mean) / sum(count)` |
| `floor` compared as string `!= "1"` | Idealista API returns floor as a string; numeric comparison would miss this |
| Key is `mean_price` not `mean_prize` | Typo guard; enforced in tests |
| Boxplot ships 5-number summary | Plotly renders box traces from quartiles; raw rows would be too large |

---

## Infrastructure

### Terraform Module

`infrastructure/modules/lambda_gold/` — reusable module, identical pattern to `lambda_silver`.

| Resource | Detail |
|---|---|
| Lambda | `{env}-gold-aggregator`, python3.12, 512 MB, 300 s timeout |
| Layer | `AWSSDKPandas-Python312` (AWS-managed, passed as variable) |
| IAM S3 | Read `silver/idealista/*` only; write `gold/aggregations/*` only |
| EventBridge | `cron(45 12 ? * SUN *)` — every Sunday 12:45 UTC |
| CloudWatch Logs | 30-day retention |
| Alarm | `Errors > 0` → SNS topic |

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `S3_BUCKET` | (required) | S3 bucket name |
| `SILVER_PREFIX` | `silver/idealista` | Input prefix |
| `GOLD_PREFIX` | `gold/aggregations` | Output prefix |
| `RATIO_MIN_COUNT` | `5` | Min listings per side for ratio datasets |
| `SNS_TOPIC_ARN` | (required) | SNS error notification topic |

### S3 Layout

```
s3://<bucket>/
├── bronze/idealista/          ← raw API JSON (FEATURE-001)
├── silver/idealista/
│   ├── operation=rent/
│   │   └── snapshot_date=YYYY-MM-DD/part.parquet
│   └── operation=sale/
│       └── snapshot_date=YYYY-MM-DD/part.parquet
└── gold/aggregations/
    └── latest.json            ← frozen schema v1.0 (this layer)
```

---

## Running the Backfill

After deploying the gold Lambda to dev, trigger a full historical backfill by invoking it once (it reads the complete silver history on every run):

```bash
aws lambda invoke \
    --function-name dev-gold-aggregator \
    --invocation-type RequestResponse \
    --payload '{}' \
    --region eu-central-1 \
    /tmp/gold-response.json && cat /tmp/gold-response.json
```

---

## Testing

```bash
# Unit tests (pure aggregation logic, no AWS)
cd src/etl/data_processing
pytest tests/test_gold_aggregate.py -v

# Integration tests (moto S3 mocking)
pytest tests/test_gold_aggregation_lambda.py -v

# Gated smoke test against the real dev bucket (requires AWS credentials)
RUN_S3_IT=1 pytest tests/test_gold_smoke.py -v
```
