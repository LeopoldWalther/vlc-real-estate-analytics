# TASK-003: Silver Cleaning Lambda (Bronze → Silver Parquet)

**Status:** 🟢 Complete
**Branch:** `feature/silver-cleaning-lambda`
**Assignee:** Unassigned
**Created:** 2026-06-03
**Updated:** 2026-06-05
**Estimated Effort:** M (1.5–2 days)
**Priority:** High

> **Revised after [REVIEW-TASK-003](../reviews/REVIEW-TASK-003.md) (2026-06-04).** Key changes: real bronze data is **JSON only** and has **no `dateDownload`** field (must be parsed from the object key); trigger is a **scheduled EventBridge** run (not per-object); silver is partitioned by **`snapshot_date`** (no monthly overwrite); testing with **real S3 data happens early in Phase 1**.
>
> **Re-scoped 2026-06-05 (medallion split).** The real two-stage workflow is in [src/notebooks/valenciaRealEstatePriceAnalysis.ipynb](src/notebooks/valenciaRealEstatePriceAnalysis.ipynb): **§1.3 + §3** clean the many JSONs into **one cleaned table of individual listings** (NOT aggregated), and only **§6 / wrangle_data.py** aggregate for visualization. Therefore: **TASK-003 = Silver (cleaned individual listings)**, the new **TASK-004 = Gold (aggregations)**, and the web app becomes **TASK-005**. Aggregation logic and `latest.json` are removed from this task and moved to TASK-004.

## Objective
Add a second AWS Lambda that **cleans** raw Idealista **JSON** files from the bronze S3 layer and writes Parquet of **cleaned individual listings** partitioned by `operation`/`snapshot_date` to a new silver layer. No aggregation and no `latest.json` here — those belong to the Gold layer (TASK-004).

## Context
Today only the bronze layer exists (raw **JSON** written weekly by [src/etl/data_collection/idealista_listings_collector.py](src/etl/data_collection/idealista_listings_collector.py)). Each weekly snapshot is split across **multiple paginated files** (rent ~6, sale ~14–17), named `{operation}_{YYYYMMDD}_{HHMMSS}_{page}.json`.
The real cleaning logic lives in the notebook [src/notebooks/valenciaRealEstatePriceAnalysis.ipynb](src/notebooks/valenciaRealEstatePriceAnalysis.ipynb) §1.3 (read all pages → `df_all_pages`) and §3 "Clean Data" (Issues 1–4). Silver replicates the **data-validity** parts of that cleaning and keeps **one row per listing**; the **analytical scope** filter (only 3 districts) and all aggregation move to Gold (TASK-004). Data volume is small, so a single Lambda per stage is the most cost-efficient option (no Glue/Athena/Step Functions needed).

### Verified bronze schema (from real files in `data/s3/`)
Each element in `elementList` has: `priceByArea` ✅, `neighborhood` ✅, `operation` ✅, `price`/`size` ✅ (fallback). **`dateDownload` does NOT exist** — the snapshot date/time is only in the object key. Some elements may have `priceByArea: null` or a missing `neighborhood`.

## Dependencies
**Requires:**
- Bronze layer collector (existing) producing files under `bronze/idealista/...`

**Blocks:**
- TASK-004 (Gold Aggregation Lambda) — consumes silver cleaned listings
- TASK-005 (Frontend) — transitively, via Gold aggregations

**Related:**
- Existing infra modules in [infrastructure/modules/lambda/](infrastructure/modules/lambda) and [infrastructure/modules/s3/](infrastructure/modules/s3)

## Implementation Plan

### Phase 1: Schema contract + real-data validation (FIRST — no AWS infra yet)
- [ ] Add `parse_key_metadata(key: str) -> tuple[str, date, int]` deriving `(operation, snapshot_date, page)` from the object key `{operation}_{YYYYMMDD}_{HHMMSS}_{page}.json`
- [ ] Commit a small curated set of **real** bronze samples (3–5 gekürzte echte Dateien) under `src/etl/data_processing/tests/fixtures/bronze/` (note: `data/s3/` is gitignored → copy deliberately)
- [ ] Schema-contract test (RED) asserting on real fixtures: `elementList` present/non-empty; each element has `priceByArea`, `neighborhood`, `operation`
- [ ] Exploratory script `src/etl/data_processing/explore_bronze.py` (or notebook) that loads real files from local `data/s3/` and reports distributions + edge cases (null `priceByArea`, missing `neighborhood`) **before** building transform/infra

### Phase 2: Cleaning core (pure Python, no AWS) — replicates notebook §3
- [ ] Cleaning logic in `src/etl/data_processing/silver_transform.py` returning **cleaned individual listings** (one row per listing), NOT aggregations
  - Pure functions taking a list of dicts (`elementList`) → cleaned list of dicts / `pd.DataFrame`
  - Inject `snapshot_date` (from `parse_key_metadata`) as a column; **do not** rely on a non-existent `dateDownload`
  - **Issue 1 (column reduction):** keep the relevant columns only (`operation`, `province`, `municipality`, `district`, `neighborhood`, `latitude`, `longitude`, `distance`, `address`, `propertyCode`, `propertyType`, `price`, `priceByArea`, `size`, `floor`, `exterior`, `rooms`, `bathrooms`, `status`, `newDevelopment`, `hasLift`, `parkingSpace`, `snapshot_date`)
  - **Issue 2 (validity):** drop listings with `bathrooms <= 0`
  - **Issue 4 (validity):** for `sale`, keep only `1000 < priceByArea < 10000`; keep all `rent`
  - **Null handling:** drop rows with null `priceByArea` or missing/empty `neighborhood`
  - **NOT in Silver:** the district scope filter (`Extramurs`/`Ciutat Vella`/`L'Eixample`) and any aggregation — those live in Gold (TASK-004). Silver stays a broad, reusable cleaned-listings layer.

### Phase 3: Lambda handler (AWS edges only)
- [ ] Create `src/etl/data_processing/silver_cleaning_lambda.py` with `lambda_handler(event, context)`
  - Triggered by **scheduled EventBridge** (shortly after the collector); list the latest snapshot's pages under `bronze/idealista/`
  - Read objects via boto3 (**JSON only**), combine all pages of the snapshot
  - Call `silver_transform.clean(...)` with key-derived `snapshot_date` → cleaned individual listings
  - Write Parquet of cleaned listings to `s3://<bucket>/silver/idealista/operation={op}/snapshot_date=YYYY-MM-DD/part.parquet`
  - **No aggregation / no `latest.json` here** — Gold (TASK-004) reads this silver Parquet history
- [ ] Use AWS-managed layer `AWSSDKPandas-Python312` (avoids large custom pyarrow layer)
- [ ] Idempotent: deterministic output keys derived from `snapshot_date` (full date, no monthly overwrite)

### Phase 4: Infrastructure (Terraform)
- [ ] New module `infrastructure/modules/lambda_silver/` (or parameterize existing `lambda` module)
- [ ] **Scheduled EventBridge rule** (e.g. `cron(30 12 ? * SUN *)`) → triggers silver Lambda (NOT per-object S3 notification)
- [ ] IAM least privilege: read `bronze/idealista/*`, write `silver/*` only
- [ ] CloudWatch log group + SNS error alarm (reuse existing SNS topic)
- [ ] Managed-layer ARN as a region-aware variable (not hardcoded)
- [ ] Wire in `infrastructure/environments/dev` and `prod`

### Phase 5: Tests & docs
- [ ] Unit tests for transform (pandas in-memory + real fixtures)
- [ ] Lambda handler tests with `moto` (S3 mocking)
- [ ] Optional gated real-bucket smoke test (`RUN_S3_IT=1` + dev creds) reading 1–2 real objects from the **dev** bucket
- [ ] Add `documentation/DATA_PROCESSING_LAYER.md` (silver layer architecture)

## TDD Strategy (Mandatory)

### RED
- [ ] Failing test: `test_parse_key_metadata_extracts_operation_date_page`
- [ ] Failing test: `test_real_fixture_has_pricebyarea_neighborhood_operation` (real bronze fixtures)
- [ ] Failing test: `test_clean_injects_snapshot_date_and_keeps_individual_listings`
- [ ] Failing test: `test_clean_drops_zero_bathrooms_and_invalid_sale_price`
- [ ] Failing test: `test_clean_drops_null_pricebyarea_and_missing_neighborhood`
- [ ] Failing test: `test_lambda_combines_pages_writes_partitioned_parquet` (moto)

### GREEN
- [ ] Implement minimal `parse_key_metadata`, `clean`, and handler to pass

### REFACTOR
- [ ] Split helpers, ensure type hints + docstrings, re-run suite

## Files to Modify/Create

### New
- `src/etl/data_processing/silver_transform.py` (incl. `parse_key_metadata`, `clean` → cleaned individual listings)
- `src/etl/data_processing/silver_cleaning_lambda.py`
- `src/etl/data_processing/explore_bronze.py` (exploratory real-data validation)
- `src/etl/data_processing/requirements.txt` (`boto3`, `pandas`, `pyarrow` if not using managed layer)
- `src/etl/data_processing/tests/fixtures/bronze/*.json` (small, real, curated samples)
- `src/etl/data_processing/tests/test_silver_transform.py`
- `src/etl/data_processing/tests/test_silver_cleaning_lambda.py`
- `infrastructure/modules/lambda_silver/*.tf` (or extension of existing lambda module)
- `documentation/DATA_PROCESSING_LAYER.md`

### Modified
- `infrastructure/environments/dev/main.tf` — instantiate silver lambda + EventBridge schedule
- `infrastructure/environments/prod/main.tf` — same
- `infrastructure/modules/s3/main.tf` — only if a separate silver prefix/bucket policy is needed (no per-object notification)

## Testing Requirements

### Unit
- [ ] `parse_key_metadata` extracts `(operation, snapshot_date, page)` from real key formats
- [ ] Empty `elementList` → empty output, no crash
- [ ] Null `priceByArea` / missing `neighborhood` rows are dropped
- [ ] `bathrooms <= 0` rows are dropped; `sale` rows outside `1000<priceByArea<10000` are dropped
- [ ] Multiple pages of the same snapshot → cleaned listings keep one row per listing (no aggregation)
- [ ] `snapshot_date` column is injected from the object key

### Integration (moto)
- [ ] Scheduled run combines all snapshot pages; cleaned-listings Parquet appears under `operation/snapshot_date`
- [ ] Re-running same snapshot is idempotent (same key, deterministic output)

### Real-data (early + gated)
- [ ] Schema-contract test runs against committed **real** bronze fixtures (Phase 1)
- [ ] Optional `RUN_S3_IT=1` smoke test reads 1–2 real objects from the **dev** bucket

### Manual
- [ ] Deploy to dev, run schedule manually, verify silver artifacts
- [ ] Confirm CloudWatch logs + no SNS alarms

## Success Criteria
- [ ] Silver Parquet of **cleaned individual listings** partitioned by `operation/snapshot_date` (full date — no monthly overwrite)
- [ ] Validity filters applied (column reduction, `bathrooms>0`, sale `priceByArea` 1000–10000, null drop); **no** district-scope filter, **no** aggregation
- [ ] Lambda <30s typical runtime, 512 MB memory
- [ ] Coverage ≥ 80% for new modules
- [ ] All CI checks (`python-lint-and-test`, `terraform-validate`, `workflow-consistency`) green

## Technical Notes

### Architecture
- Scheduled (EventBridge → Lambda) — no Step Functions, no Glue, no Athena (kostenoptimiert)
- **Snapshot-level processing:** one weekly snapshot = many paginated JSON files, combined into one silver write
- Silver Parquet (cleaned individual listings) als Datenquelle für Ad-hoc-Analysen (Notebooks) **und** als Input für die Gold-Aggregation (TASK-004)
- Aggregation + pre-aggregiertes JSON sind **nicht** Teil von Silver — sie liegen in Gold (TASK-004)

### Layers
- Verwende AWS-managed Layer `AWSSDKPandas-Python312` statt eigener pyarrow-Build → kleineres Deployment, weniger Wartung

### Performance
- Bei aktuellem Volumen (< 100 MB/Woche) deutlich unter Lambda-Limits; 512 MB für pandas/pyarrow Cold Start

### Gotchas
- `dateDownload` existiert NICHT in den Rohdaten → aus dem Object-Key ableiten
- Trigger ist **scheduled**, nicht per-Object — sonst partielle Aggregation + viele Läufe
- Partition braucht **volles** `snapshot_date`, sonst überschreiben sich Wochen im selben Monat
- Bronze ist **nur JSON** — kein CSV-Pfad

## Questions/Risks

### Open Questions (resolved per review)
- ✅ Ein Bucket mit Prefixes `bronze/` + `silver/` (kein zweiter Bucket)
- ✅ Bronze-Inputformat ist **JSON** (CSV-Pfad gestrichen)
- ✅ `dateDownload` aus Object-Key parsen

### Risks
- **Schema-Drift Idealista:** Cleaning bricht still → *Mitigation:* Schema-Contract-Test auf echten Fixtures + SNS-Alarm bei Parse-Fehlern
- **Lambda Cold Start mit pandas/pyarrow:** *Mitigation:* AWS-managed Layer + 512 MB Memory
- **Silver Parquet wächst mit Historie:** *Mitigation:* partitioniert nach `operation`/`snapshot_date`; Gold (TASK-004) liest nur, aggregiert klein

### Assumptions
- Bronze Layout: `bronze/idealista/{operation}_{YYYYMMDD}_{HHMMSS}_{page}.json`
- Datenmenge bleibt klein (Lambda statt Glue ausreichend)

## Planning Summary (For Quick Reference)

**One-line objective:**
Add a silver-layer Lambda that cleans bronze Idealista JSON into partitioned Parquet of **cleaned individual listings** (validity filters only; no aggregation).

**Critical decisions:**
- Architektur: Lambda + **scheduled EventBridge** (kein Step Functions/Glue/Athena) — kostenoptimal bei kleinen Daten
- `dateDownload` aus Object-Key; Partition nach `operation`/`snapshot_date`
- Silver = bereinigte Einzel-Listings (Notebook §3 Issues 1/2/4 + null-Drop); **kein** district-Scope, **keine** Aggregation (→ Gold/TASK-004)
- Nur JSON (kein CSV); Layer: AWS-managed `AWSSDKPandas`

**Subtasks at a glance:**
| Task | Priority | Est. Hours | Dependencies |
|------|----------|------------|--------------|
| 3.1 Schema contract + real fixtures + explore | P0 | 3h | None |
| 3.2 Cleaning core (pure, individual listings)  | P0 | 3h | 3.1 |
| 3.3 Lambda handler (combine pages)            | P0 | 3h | 3.2 |
| 3.4 Terraform (scheduled)                     | P0 | 3h | 3.3 |
| 3.5 Tests + docs                              | P0 | 2h | 3.1–3.4 |

**Key files to modify:**
- `src/etl/data_processing/silver_transform.py` (+ `parse_key_metadata`, `clean`)
- `src/etl/data_processing/silver_cleaning_lambda.py`
- `src/etl/data_processing/tests/fixtures/bronze/*.json`
- `infrastructure/modules/lambda_silver/*.tf`
- `infrastructure/environments/{dev,prod}/main.tf`

**Watch-outs for reviewer:**
- IAM scoped to prefixes, nicht bucket-weit
- Scheduled trigger (kein per-Object), Snapshot gebündelt verarbeiten
- Partition mit vollem `snapshot_date` (idempotent, kein Overwrite)
- Silver bleibt **cleaned listings** — keine Aggregation, kein district-Filter (gehört zu Gold/TASK-004)

**Blockers or open questions:**
- Keine offen — per Review geklärt (ein Bucket, JSON-only, key-derived date)

## Progress Log
- 2026-06-03: Plan erstellt
- 2026-06-04: Überarbeitet nach REVIEW-TASK-003 (JSON-only, key-derived `snapshot_date`, scheduled trigger, snapshot_date-Partition, echtes S3-Testing in Phase 1)
