# TASK-004: Gold Aggregation Lambda (Silver → Gold Aggregations JSON)

**Status:** 🔵 Planned
**Branch:** `feature/gold-aggregation-lambda`
**Assignee:** Unassigned
**Created:** 2026-06-05
**Updated:** 2026-06-05
**Estimated Effort:** M (1–1.5 days)
**Priority:** High

> **Created 2026-06-05 (medallion split).** Inserted between Silver (TASK-003) and the web app (now TASK-005). The real workflow in [src/notebooks/valenciaRealEstatePriceAnalysis.ipynb](src/notebooks/valenciaRealEstatePriceAnalysis.ipynb) §6 and the former CSV prototype `wrangle_data.py` (since removed from the repo) aggregate cleaned listings into a small dashboard-ready dataset. That aggregation (and the dashboard `latest.json`) was removed from TASK-003 and lives here.

## Objective
Add a Gold-layer AWS Lambda that reads the **silver cleaned-listings Parquet history**, applies the analytical scope filter (city-center districts), computes the dashboard aggregations, and writes a small pre-aggregated `gold/aggregations/latest.json` (full time-series, with `schema_version`) for the frontend.

## Context
TASK-003 produces silver Parquet of **cleaned individual listings** partitioned by `operation`/`snapshot_date` (validity filters only, no scope filter, no aggregation). For visualization we need a compact, query-friendly aggregate. The notebook does this in two analytical steps:

- **Scope filter** (notebook §3 Issue 3): keep only districts `Extramurs`, `Ciutat Vella`, `L'Eixample`.
- **Aggregations** (notebook §4 / §6, wrangle_data.py):
  1. **Mean priceByArea time-series** per `(operation, district, neighborhood, snapshot_date)` with `count`, `mean_size`, `mean_price`.
  2. **Rent-vs-sale ratio** per neighborhood (`mean_priceByArea_sale / mean_priceByArea_rent`, with counts ≥ threshold).
  3. **Listing counts** per `(operation, neighborhood, snapshot_date)` over time.

Data volume is small, so a single scheduled Lambda (running shortly after the silver Lambda) is the most cost-efficient option (no Glue/Athena/Step Functions).

### Verified input (silver cleaned listings)
Each silver row has: `operation`, `district`, `neighborhood`, `priceByArea`, `size`, `price`, `snapshot_date`, plus the other reduced columns. Validity filters already applied upstream (`bathrooms>0`, sale `priceByArea` 1000–10000, null drop).

## Dependencies
**Requires:**
- TASK-003 (Silver Cleaning Lambda) — produces `silver/idealista/operation=.../snapshot_date=.../part.parquet`

**Blocks:**
- TASK-005 (Frontend) — consumes `gold/aggregations/latest.json`

**Related:**
- Prototype aggregation logic (former `wrangle_data.py`, since removed) and notebook §4/§6

## Implementation Plan

### Phase 1: Aggregation core (pure Python, no AWS) — replicates notebook §4/§6
- [ ] Add `src/etl/data_processing/gold_aggregate.py` with pure functions over a `pd.DataFrame` of silver cleaned listings:
  - [ ] `apply_scope(df) -> df`: keep only districts `["Extramurs", "Ciutat Vella", "L'Eixample"]`
  - [ ] `price_time_series(df) -> df`: groupby `operation, district, neighborhood, snapshot_date` → `count_listings`, `mean_priceByArea`, `mean_size`, `mean_price`
  - [ ] `rent_vs_sale_ratio(df, min_count=5) -> df`: merge sale/rent per neighborhood, compute `mean_sales_price_by_rent_ratio`, filter `count_listings_* >= min_count`
  - [ ] `listing_counts(df) -> df`: groupby `operation, neighborhood, snapshot_date` → counts over time
  - [ ] `build_aggregation_json(df) -> dict`: assemble the three datasets into one dashboard JSON **with `schema_version`** (full time-series)
- [ ] Reuse the curated real bronze→silver fixtures (or a small silver fixture) for deterministic tests

### Phase 2: Lambda handler (AWS edges only)
- [ ] Create `src/etl/data_processing/gold_aggregation_lambda.py` with `lambda_handler(event, context)`
  - Triggered by **scheduled EventBridge** (shortly after the silver Lambda)
  - Read the **entire** silver Parquet history under `silver/idealista/` via boto3 + pandas
  - Call the pure `gold_aggregate.build_aggregation_json(...)`
  - Write `s3://<bucket>/gold/aggregations/latest.json` (small, full time-series, `schema_version`)
- [ ] Use AWS-managed layer `AWSSDKPandas-Python312`
- [ ] Idempotent: deterministic single output key (`latest.json` overwritten each run)

### Phase 3: Infrastructure (Terraform)
- [ ] New module `infrastructure/modules/lambda_gold/` (or parameterize the silver module)
- [ ] **Scheduled EventBridge rule** (e.g. `cron(45 12 ? * SUN *)`, after silver) → triggers gold Lambda
- [ ] IAM least privilege: read `silver/idealista/*`, write `gold/aggregations/*` only
- [ ] CloudWatch log group + SNS error alarm (reuse existing SNS topic)
- [ ] Managed-layer ARN as a region-aware variable (not hardcoded)
- [ ] Wire in `infrastructure/environments/dev` (prod deferred until dev soak)

### Phase 4: Tests & docs
- [ ] Unit tests for each aggregation function (pandas in-memory + small silver fixture)
- [ ] Lambda handler tests with `moto` (S3 mocking; write/read Parquet + latest.json)
- [ ] Optional gated real-bucket smoke test (`RUN_S3_IT=1`) reading silver from the **dev** bucket
- [ ] Extend `documentation/DATA_PROCESSING_LAYER.md` with the gold layer (or new `DATA_GOLD_LAYER.md`)

## TDD Strategy (Mandatory)

### RED
- [ ] Failing test: `test_apply_scope_keeps_only_center_districts`
- [ ] Failing test: `test_price_time_series_aggregates_mean_and_count`
- [ ] Failing test: `test_rent_vs_sale_ratio_filters_low_counts`
- [ ] Failing test: `test_listing_counts_over_time`
- [ ] Failing test: `test_build_aggregation_json_has_schema_version_and_three_datasets`
- [ ] Failing test: `test_gold_lambda_reads_silver_history_and_writes_latest_json` (moto)

### GREEN
- [ ] Implement minimal aggregation functions and handler to pass

### REFACTOR
- [ ] Split helpers, ensure type hints + docstrings, re-run suite

## Files to Modify/Create

### New
- `src/etl/data_processing/gold_aggregate.py` (pure aggregation, incl. `build_aggregation_json`)
- `src/etl/data_processing/gold_aggregation_lambda.py`
- `src/etl/data_processing/tests/test_gold_aggregate.py`
- `src/etl/data_processing/tests/test_gold_aggregation_lambda.py`
- `src/etl/data_processing/tests/fixtures/silver/*.parquet` (or build silver fixtures in-test from bronze)
- `infrastructure/modules/lambda_gold/*.tf` (or extension of the silver lambda module)
- `documentation/DATA_PROCESSING_LAYER.md` (gold section) or `documentation/DATA_GOLD_LAYER.md`

### Modified
- `infrastructure/environments/dev/main.tf` — instantiate gold lambda + EventBridge schedule
- `src/etl/data_processing/requirements.txt` — ensure `pandas`/`pyarrow` (or managed layer)

## Testing Requirements

### Unit
- [ ] `apply_scope` keeps only the three center districts
- [ ] `price_time_series` produces expected mean/count per `(operation, district, neighborhood, snapshot_date)`
- [ ] `rent_vs_sale_ratio` computes ratio and drops neighborhoods below `min_count`
- [ ] `listing_counts` produces per-snapshot counts over time
- [ ] `build_aggregation_json` includes `schema_version` and all three datasets
- [ ] Empty silver history → valid JSON with empty datasets, no crash

### Integration (moto)
- [ ] Handler reads full silver Parquet history; writes `gold/aggregations/latest.json`
- [ ] Re-running is idempotent (single `latest.json` overwritten)

### Real-data (gated)
- [ ] Optional `RUN_S3_IT=1` smoke test reads real silver objects from the **dev** bucket

### Manual
- [ ] Deploy to dev, run schedule manually, verify `gold/aggregations/latest.json`
- [ ] Confirm CloudWatch logs + no SNS alarms

## Success Criteria
- [ ] `gold/aggregations/latest.json` present, small (<200 KB), includes `schema_version` and full time-series
- [ ] Three datasets present: price time-series, rent-vs-sale ratio, listing counts
- [ ] Scope filter applied (only center districts)
- [ ] Lambda <30s typical runtime, 512 MB memory
- [ ] Coverage ≥ 80% for new modules
- [ ] All CI checks (`python-lint-and-test`, `terraform-validate`, `workflow-consistency`) green

## Technical Notes

### Architecture
- Scheduled (EventBridge → Lambda) after the silver Lambda — no Step Functions/Glue/Athena
- Reads the **entire** silver history (small) and rebuilds one compact JSON each run
- Clear medallion separation: Silver = cleaned listings, Gold = analytical aggregates

### Layers
- AWS-managed `AWSSDKPandas-Python312` (no custom pyarrow build)

### Gotchas
- Aggregations must run on the **full** silver history, not a single snapshot, so the time-series is complete
- Scope filter (3 districts) belongs here, not in Silver
- Keep `latest.json` an aggregate (neighborhood×snapshot_date), never raw rows → stays small

## Questions/Risks

### Open Questions
- ❓ Separate `lambda_gold` module vs. parameterized reuse of the silver module?
- ❓ Min-count threshold for rent-vs-sale ratio (notebook uses 5) — keep configurable?

### Risks
- **Schema drift between silver and gold:** *Mitigation:* shared column contract + tests on real fixtures
- **Lambda cold start with pandas/pyarrow:** *Mitigation:* managed layer + 512 MB
- **latest.json grows with history:** *Mitigation:* aggregate only, bounded by neighborhoods × snapshots

### Assumptions
- Silver layout: `silver/idealista/operation={op}/snapshot_date=YYYY-MM-DD/part.parquet`
- Data volume stays small (single Lambda sufficient)

## Planning Summary (For Quick Reference)

**One-line objective:**
Add a gold-layer Lambda that aggregates silver cleaned listings into a small dashboard JSON (`gold/aggregations/latest.json`) with three datasets.

**Critical decisions:**
- Architektur: Lambda + **scheduled EventBridge** (nach Silver) — kostenoptimal bei kleinen Daten
- Scope-Filter (3 city-center districts) + 3 Aggregationen liegen in Gold, nicht in Silver
- Output: `gold/aggregations/latest.json` (full time-series, `schema_version`) als Frontend-Quelle
- Layer: AWS-managed `AWSSDKPandas`

**Subtasks at a glance:**
| Task | Priority | Est. Hours | Dependencies |
|------|----------|------------|--------------|
| 4.1 Aggregation core (pure)        | P0 | 4h | TASK-003 |
| 4.2 Gold Lambda handler (moto)     | P0 | 3h | 4.1 |
| 4.3 Terraform (scheduled gold)     | P0 | 3h | 4.2 |
| 4.4 Dev wire + docs + gated smoke  | P1 | 2h | 4.1–4.3 |

**Key files to modify:**
- `src/etl/data_processing/gold_aggregate.py` (+ `build_aggregation_json`)
- `src/etl/data_processing/gold_aggregation_lambda.py`
- `src/etl/data_processing/tests/test_gold_aggregate.py`
- `infrastructure/modules/lambda_gold/*.tf`
- `infrastructure/environments/dev/main.tf`

**Watch-outs for reviewer:**
- IAM scoped to prefixes (`silver/idealista/*` read, `gold/aggregations/*` write)
- Scheduled trigger after silver; aggregate over full history
- Scope filter (3 districts) here, not in Silver
- `latest.json` stays an aggregate, never raw rows

**Blockers or open questions:**
- Separate gold module vs. reuse silver module
- Configurable min-count threshold for the ratio dataset
