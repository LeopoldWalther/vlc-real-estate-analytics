# REVIEW — FEATURE-004: Gold Aggregation Lambda (Silver → Gold Aggregations JSON)

**Reviewer:** reviewer_agent
**Reviewed plan:** [dev/plans/FEATURE-004-gold-aggregation-lambda.md](../plans/FEATURE-004-gold-aggregation-lambda.md)
**Date:** 2026-06-05
**Considers downstream:** FEATURE-005 (Static Visualization Web App)

---

## Executive Summary

**Verdict:** ⚠️ **Changes Recommended**

The plan is architecturally sound and consistent with the medallion split already shipped in FEATURE-003 (bronze → silver). The scheduled-Lambda-over-full-silver-history approach is the right cost/complexity choice for this data volume. However, before implementation can proceed, **five correctness issues** must be resolved because they directly determine the public JSON contract that FEATURE-005 depends on:

1. 🔴 **Global `drop_duplicates(propertyCode)` would collapse the time-series.** Dedup only within `(operation, snapshot_date)`.
2. 🔴 **The originally proposed 3-dataset schema did NOT cover all notebook charts.** A full chart-by-chart audit (below) shows the public JSON must carry **two populations** (`general` + `relevant`), **district-level** price series, **ratio time-series**, and **boxplot** distribution stats.
3. 🔴 **Two rent-vs-sale ratio definitions are needed, not one.** Per user decision both ship: `general` (all scoped listings, §4.2) **and** `relevant` (the "apartments like ours" filter, §4.3/prototype).
4. 🟡 **`build_aggregation_json` shape must be frozen** — it is the gold↔frontend contract (full schema v1.0 below).
5. 🟡 **`mean_prize` typo** must not leak into the public JSON; standardize on `mean_price`.

Once the pre-decisions in this review are baked into the technical plan (they are), the task is ready. The technical plan ([dev/plans/technical/FEATURE-004-technical-plan.yaml](technical/FEATURE-004-technical-plan.yaml)) encodes all decisions.

---

## Strengths

- ✅ **Clean medallion separation.** Scope filter + aggregation correctly live in gold, not silver. Matches the already-shipped silver contract.
- ✅ **Cost-optimal architecture.** Scheduled EventBridge → single Lambda reading the full (small) silver history. No Glue/Athena/Step Functions. Consistent with bronze/silver.
- ✅ **Pure/edge split.** `gold_aggregate.py` (pure pandas) vs `gold_aggregation_lambda.py` (AWS edges) mirrors the proven silver design and keeps tests AWS-free.
- ✅ **TDD-first, real fixtures.** Reuses the curated bronze→silver fixtures for deterministic tests.
- ✅ **Idempotent single output** (`latest.json` overwritten) — simple and correct for a rebuild-each-run aggregate.
- ✅ **`schema_version` from day one** — essential for the FEATURE-005 contract.
- ✅ **All notebook charts covered.** After the full §4.1–§6 audit, the two-population schema v1.0 supports every existing visualization (price series per neighborhood/district, both ratio definitions as scatter + time-series, and the relevant-listings boxplots) — the frontend never has to re-derive data from raw rows.

---

## Concerns by Severity

### 🔴 HIGH — H1: Global de-duplication will destroy the time-series

The notebook helper `calculate_mean_sale_and_rent_price_per_neighborhood` (and §4.3) calls:

```python
.drop_duplicates(subset=['propertyCode'], keep='last')
```

with **no `snapshot_date` in the grouping**. In the notebook this was acceptable because each run looked at a slice. **The gold Lambda reads the entire silver history**, where the *same* `propertyCode` legitimately appears in *every weekly snapshot* — that repetition **is** the time-series. A global `drop_duplicates(propertyCode)` would keep only one row per property across all weeks and **flatten the time dimension**, silently producing a near-useless dashboard.

**Decision (baked into technical plan):**
- Aggregations group by `snapshot_date` explicitly. **No global dedup.**
- If intra-snapshot duplicates are a concern (same property across paginated pages), dedup **only within** `(operation, snapshot_date, propertyCode)` — never across snapshots. A test must assert that the same `propertyCode` across two snapshots yields **two** time-series points.

### 🔴 HIGH — H2: The 3-dataset schema is incomplete — full chart audit required

The user explicitly asked: *"Are ALL charts covered — including those only in the notebook, not yet in `app.py`?"* A full audit of **every** notebook visualization (§4.1–§4.5 + §6) says **no** — the original 3-dataset cut missed several. The complete mapping is in the Cross-Task section; the gaps were:

- **District-level price time-series** (§4.5 plots `mean_priceByArea` per **district**). A simple mean-of-neighborhood-means is **wrong**; it must be a count-weighted aggregation, so gold emits it explicitly.
- **Boxplots of the "relevant listings"** (§4.3, sale + rent). A boxplot needs a **distribution** (5-number summary), not a mean — entirely absent from the first cut.
- **The `relevant` population** (the §4.3/§6 "apartments like ours" filter) — absent.
- **Ratio as a time-series** (user request) — absent.

**Decision:** the schema below (H4) carries **two populations** and covers all charts.

### 🔴 HIGH — H3: Two rent-vs-sale ratio definitions ship (general + relevant)

The notebook has **two** different neighborhood aggregations:
- **§4.2** (`df_neighborhoods`): groups **all scoped listings** by `(district, neighborhood, operation)`, merges sale/rent, computes ratio, filters `count >= 5`.
- **§4.3 / `wrangle_data.py`** (`calculate_mean_sale_and_rent_price_per_neighborhood`): first applies the **"relevant listings" filter** (`hasLift == True`, `floor != '1'`, `size > 120`, `rooms >= 2`, `bathrooms >= 2`).

**Decision (per user — both ship):**
- `general` population = **all scoped listings** (§4.2).
- `relevant` population = the **"apartments like ours" filter** (§4.3). The relevant filter is applied **within each `(operation, snapshot_date)`**, then dedup within `(operation, snapshot_date, propertyCode)` — never globally (H1).
- For **both** populations: ratio = `mean_priceByArea_sale / mean_priceByArea_rent`, filtered `count_listings_sale >= min_count AND count_listings_rent >= min_count` (`min_count` default 5, env `RATIO_MIN_COUNT`).
- Each population provides the ratio **both** as a full-history aggregate (one value per neighborhood → scatter) **and** as a **time-series** (per snapshot → line), per user request.

### 🟡 MEDIUM — H4: Frozen gold↔frontend contract (schema v1.0, full coverage)

Because FEATURE-005 (`formatSeries(json)` → Plotly traces) consumes this JSON directly, the structure must be **explicit, records-oriented, and stable** — not a raw `df.to_dict()` dump. Frozen schema v1.0, organized into two populations so the frontend logic is symmetric:

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-06-05T12:45:00Z",
  "scope_districts": ["Extramurs", "Ciutat Vella", "L'Eixample"],
  "min_count": 5,
  "relevant_filter": {"hasLift": true, "floor_not": "1", "size_gt": 120, "rooms_gte": 2, "bathrooms_gte": 2},

  "general": {
    "price_time_series_neighborhood": [
      {"operation": "sale", "district": "Extramurs", "neighborhood": "Arrancapins",
       "snapshot_date": "2026-06-01", "count_listings": 12,
       "mean_priceByArea": 2450.0, "mean_size": 110.0, "mean_price": 270000.0}
    ],
    "price_time_series_district": [
      {"operation": "sale", "district": "Extramurs", "snapshot_date": "2026-06-01",
       "count_listings": 48, "mean_priceByArea": 2510.0, "mean_size": 105.0, "mean_price": 264000.0}
    ],
    "rent_vs_sale_ratio": [
      {"district": "Extramurs", "neighborhood": "Arrancapins",
       "mean_priceByArea_sale": 2450.0, "mean_priceByArea_rent": 13.2,
       "mean_sales_price_by_rent_ratio": 185.6,
       "count_listings_sale": 12, "count_listings_rent": 8}
    ],
    "rent_vs_sale_ratio_time_series": [
      {"district": "Extramurs", "neighborhood": "Arrancapins", "snapshot_date": "2026-06-01",
       "mean_priceByArea_sale": 2450.0, "mean_priceByArea_rent": 13.2,
       "mean_sales_price_by_rent_ratio": 185.6,
       "count_listings_sale": 12, "count_listings_rent": 8}
    ],
    "boxplot_by_neighborhood": [
      {"operation": "sale", "district": "Extramurs", "neighborhood": "Arrancapins",
       "count": 42, "min": 1500.0, "q1": 2100.0, "median": 2400.0, "q3": 2750.0, "max": 3400.0}
    ]
  },

  "relevant": {
    "rent_vs_sale_ratio": [
      {"district": "Extramurs", "neighborhood": "Arrancapins",
       "mean_priceByArea_sale": 2600.0, "mean_priceByArea_rent": 12.8,
       "mean_sales_price_by_rent_ratio": 203.1,
       "count_listings_sale": 6, "count_listings_rent": 5}
    ],
    "rent_vs_sale_ratio_time_series": [
      {"district": "Extramurs", "neighborhood": "Arrancapins", "snapshot_date": "2026-06-01",
       "mean_priceByArea_sale": 2600.0, "mean_priceByArea_rent": 12.8,
       "mean_sales_price_by_rent_ratio": 203.1,
       "count_listings_sale": 6, "count_listings_rent": 5}
    ],
    "boxplot_by_neighborhood": [
      {"operation": "sale", "district": "Extramurs", "neighborhood": "Arrancapins",
       "count": 18, "min": 1800.0, "q1": 2200.0, "median": 2450.0, "q3": 2700.0, "max": 3100.0}
    ]
  }
}
```

- **Records orientation** (list of flat dicts): the frontend groups by `neighborhood`, `x = snapshot_date`, `y = mean_priceByArea` with no reshaping.
- **Two fully symmetric populations** (`general`, `relevant`): **both** carry the same four datasets (`rent_vs_sale_ratio`, `rent_vs_sale_ratio_time_series`, `boxplot_by_neighborhood`, and — general only — the two price-series grains). The frontend renders the same chart twice by swapping the population key. (`general` adds the district/neighborhood price-series; `relevant` omits them because the personal filter is too sparse for a stable per-snapshot price line.)
- **Boxplot 5-number summary** (`min/q1/median/q3/max` + `count`): Plotly `type:'box'` renders directly from precomputed quartiles (no raw values shipped → small payload). Emitted for **both** populations.
- **`listing_counts` dropped** as a separate dataset — Chart "counts over time" derives from `general.price_time_series_neighborhood.count_listings` (removes pure duplication; reverses the earlier H5 suggestion now that the source of truth is explicit).
- `generated_at` (ISO-8601 UTC) + `min_count` + `relevant_filter` make the contract self-describing for cache busting and frontend labels.

### 🟡 MEDIUM — H5: `mean_prize` typo must not enter the public contract

The notebook and prototype use `mean_prize` (typo). The plan mixes `mean_price` and `mean_prize`. Since this JSON is a public, versioned contract consumed by FEATURE-005, **standardize on `mean_price`** everywhere in gold output. Add a test asserting the key is exactly `mean_price`.

### 🟡 MEDIUM — H6: Partition columns must be physically present when reading silver

Gold reads `silver/idealista/operation=*/snapshot_date=*/part.parquet`. Confirmed: the silver writer stores `operation` and `snapshot_date` as **physical columns** (`_SILVER_COLUMNS` in `silver_transform.py` includes both). So a simple per-file `pd.read_parquet` + `concat` is safe and does **not** depend on Hive partition inference.

**Decision:** Read each object explicitly (list → get → `read_parquet` per file → `concat`), relying on the physical columns. Do **not** depend on `pd.read_parquet(dataset_path)` Hive inference (boto3 has no filesystem). Add a test that a silver fixture lacking these columns fails loudly.

### 🟢 LOW — minor pre-decisions

- **L1 — Separate module vs reuse:** Use a **separate** `infrastructure/modules/lambda_gold/` module (consistent with `lambda_bronze` / `lambda_silver`). Parameterizing the silver module would over-couple two different IAM/prefix scopes. *Decision: separate module.*
- **L2 — Schedule:** `cron(45 12 ? * SUN *)` (15 min after silver's `30`). Acceptable; if silver is still running, gold simply uses the previous complete snapshot and self-heals next week. *Keep 45.*
- **L3 — `min_count` threshold:** Function param `min_count=5`, overridable via env `RATIO_MIN_COUNT`. *Keep configurable.*
- **L4 — Output location:** Write to `gold/aggregations/latest.json` in the **same listings bucket** (private). FEATURE-005 serves it via a CloudFront gold origin (OAC). Keep the prefix exactly `gold/aggregations/` so the FEATURE-005 IAM/origin can target it precisely.
- **L5 — District name exactness:** `L'Eixample` contains an apostrophe. Add a scope test using the **real fixture** district strings, not hand-typed literals, to avoid an invisible mismatch.

---

## Cross-Task Analysis: FEATURE-005 (Web App) Dependency — FULL chart audit

The user asked specifically whether **every** notebook chart is covered — including the ones only in the `.ipynb`, not yet in `app.py`. Mapping **all** notebook visualizations (§4.1–§4.5 + §6) to the frozen schema v1.0:

| Notebook chart | Population | Source dataset | Frontend transform |
|---|---|---|---|
| **§4.2 scatter** sale vs rent priceByArea per neighborhood | general | `general.rent_vs_sale_ratio` | x=`mean_priceByArea_sale`, y=`mean_priceByArea_rent`, one marker/neighborhood |
| **§4.3 boxplot** sale priceByArea (relevant listings) per neighborhood | relevant | `relevant.boxplot_by_neighborhood` (op=sale) | Plotly `box` from `min/q1/median/q3/max` |
| **§4.3 boxplot** rent priceByArea (relevant listings) per neighborhood | relevant | `relevant.boxplot_by_neighborhood` (op=rent) | Plotly `box` from quartiles |
| **boxplot** priceByArea (all scoped listings) per neighborhood — *symmetric add* | general | `general.boxplot_by_neighborhood` (sale/rent) | Plotly `box` from quartiles |
| **§4.4 line** count of listings over time per neighborhood (sale/rent, +district filter) | general | `general.price_time_series_neighborhood` | group by `(operation, neighborhood)`, x=`snapshot_date`, y=`count_listings`; filter by `district` |
| **§4.5 line** mean priceByArea over time per **district** (sale/rent) | general | `general.price_time_series_district` | group by `(operation, district)`, x=`snapshot_date`, y=`mean_priceByArea` |
| **§4.5 line** mean priceByArea over time per **neighborhood** (sale, +Extramurs) | general | `general.price_time_series_neighborhood` | group by `(operation, neighborhood)`, x=`snapshot_date`, y=`mean_priceByArea` |
| **§6 graph_one** mean sale priceByArea per neighborhood over time | general | `general.price_time_series_neighborhood` | same as above, op=sale |
| **§6 prototype ratio** (relevant filter) | relevant | `relevant.rent_vs_sale_ratio` | scatter, same as §4.2 but relevant population |
| **(user) ratio over time** per neighborhood | both | `general/relevant.rent_vs_sale_ratio_time_series` | group by `neighborhood`, x=`snapshot_date`, y=`mean_sales_price_by_rent_ratio` |
| §4.1 listings-per-week (diagnostic bar) | general | derived from `price_time_series_district` summed | low-priority diagnostic; derivable, not a separate dataset |

**Coverage verdict:** with the two-population schema, **every** notebook chart is covered. The only non-pre-aggregated item is the §4.1 weekly-count diagnostic, which the frontend can derive by summing district counts (kept out of the contract intentionally — it is a sanity chart, not a dashboard tile).

**Implications enforced by this review:**
- The records-oriented, two-population schema (H4) makes `formatSeries()` a pure group-by with no pandas — ideal for a no-build static frontend, and renders `general`/`relevant` symmetrically.
- `schema_version` + `generated_at` give FEATURE-005 a stable, cache-aware contract.
- Keep `latest.json` **small** (aggregates + 5-number boxplot summaries, never raw rows) so CloudFront delivery stays < 1s (FEATURE-005 success criterion). Payload is bounded by ~20 neighborhoods × weekly snapshots × 2 operations — a few thousand flat records, trivially gzipped.
- The notebook prototype only shipped Chart 1 (sale only). This review ensures gold emits **all** datasets for **both** operations and **both** populations so FEATURE-005 isn't blocked re-deriving data.

---

## Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Global dedup flattens time-series (H1) | High (it's in the prototype) | High | Dedup only within (operation, snapshot_date); test two-snapshot persistence |
| Incomplete schema misses notebook charts (H2) | High (first cut missed 4) | High | Full chart audit + two-population schema v1.0 |
| Wrong/partial ratio shipped (H3) | Medium | High | Both general + relevant populations, full-history + time-series |
| Unstable JSON shape breaks FEATURE-005 (H4) | Medium | High | Frozen schema v1.0 + contract test |
| Boxplot needs distribution not mean | Medium | Medium | Pre-compute 5-number summary per (operation, neighborhood) |
| District price = mean-of-means (wrong) | Medium | Medium | Emit `price_time_series_district` via count-weighted aggregation |
| `mean_prize` typo in public JSON (H5) | Medium | Medium | Standardize `mean_price` + key test |
| Silver schema drift (H6) | Low | Medium | Physical-column read + loud-fail test |
| latest.json grows unbounded | Low | Low | Aggregate/quartiles only; bounded by neighborhoods × snapshots |
| Cold start pandas/pyarrow | Low | Low | Managed layer + 512 MB |

---

## Effort Re-Estimation

Plan estimate (M, ~12h across 4 tasks) was based on **three** datasets. The two-population schema (general + relevant, district-level series, ratio time-series, boxplot stats) roughly **doubles the aggregation surface** in 4.1. Re-estimate 4.1 up; the rest is unchanged.

| Task | Plan | Re-estimate | Note |
|---|---|---|---|
| 4.1 Aggregation core (pure) | 4h | 6–7h | Two populations + boxplot stats + district series + ratio time-series + contract tests |
| 4.2 Gold Lambda handler (moto) | 3h | 3h | Mirrors silver handler closely |
| 4.3 Terraform (lambda_gold) | 3h | 2.5h | Copy/adapt lambda_silver module |
| 4.4 Dev wire + docs + smoke | 2h | 2h | As planned |

**Total re-estimate: ~14–15h.** Consider splitting 4.1 into `4.1a general` and `4.1b relevant + boxplots` if it feels too large in one branch (the technical plan keeps them in one branch but the two populations share a generic helper, so the marginal cost of the second population is low).

---

## Approval Criteria (must be met before "done")

- [ ] H1: no global dedup; dedup only within `(operation, snapshot_date, propertyCode)`; two-snapshot persistence test green
- [ ] H2/H4: `build_aggregation_json` emits the frozen **two-population** schema v1.0 (general + relevant, district + neighborhood price series, ratio full-history + time-series, boxplot 5-number summary, `schema_version`, `generated_at`, `scope_districts`, `min_count`, `relevant_filter`)
- [ ] H3: `general` = all scoped listings (§4.2); `relevant` = hasLift/floor!=1/size>120/rooms>=2/bathrooms>=2 (§4.3); both filtered by `min_count`
- [ ] District price series uses **count-weighted** aggregation (not mean-of-means); test green
- [ ] Boxplot dataset provides `min/q1/median/q3/max` + `count` per `(operation, neighborhood)`; test green
- [ ] H5: output keys use `mean_price` (no `mean_prize`); key test green
- [ ] H6: silver read relies on physical `operation`/`snapshot_date` columns; loud-fail test green
- [ ] Empty silver history → valid JSON with empty datasets in both populations (no crash)
- [ ] IAM scoped: read `silver/idealista/*`, write `gold/aggregations/*` only
- [ ] Coverage ≥ 80% on both new modules
- [ ] `terraform validate` green in dev; module wired in dev only (prod deferred)
- [ ] All CI checks green (`python-lint-and-test`, `terraform-validate`, `workflow-consistency`)

---

## Coder Implementation Notes

**Critical findings (must address before implementation):**
- **Never `drop_duplicates(propertyCode)` globally.** Dedup only within `(operation, snapshot_date, propertyCode)` so the weekly time-series survives.
- **Two populations, not one.** `general` = all scoped listings (§4.2); `relevant` = the "apartments like ours" filter `hasLift==True & floor!='1' & size>120 & rooms>=2 & bathrooms>=2` (§4.3). The relevant filter is applied per `(operation, snapshot_date)` before aggregating.
- **Freeze the JSON schema v1.0 exactly as in H4** — FEATURE-005 depends on it. Records orientation, `general`/`relevant` blocks, district + neighborhood price series, full-history + time-series ratios, boxplot 5-number summary.
- **Write one generic helper** parameterized by a row-filter (identity for general, the relevant predicate for relevant) and call it twice — avoids duplicating aggregation logic across populations.

**Watch-outs (common pitfalls):**
- District price series: use **count-weighted mean** = `sum(count*mean)/sum(count)` across neighborhoods, NOT `mean()` of neighborhood means.
- Boxplots need a **distribution**: emit `min/q1/median/q3/max` (+`count`) per `(operation, neighborhood)` over full history. Don't ship raw rows. Plotly `type:'box'` accepts precomputed quartiles.
- Standardize on `mean_price` — the notebook's `mean_prize` typo must not reach the JSON.
- `floor` is a **string** in the data (`floor != '1'`) — compare as string, not int.
- `L'Eixample` has an apostrophe — assert scope using the real fixture string, not a retyped literal.
- Silver Parquet read: list → get_object → `pd.read_parquet(BytesIO(...))` per file → `concat`. Don't rely on Hive path inference (no filesystem in boto3). `operation`/`snapshot_date` are physical columns — use them.
- Empty silver history (and empty `relevant` subset) must produce valid empty datasets, not a crash.
- Create the boto3 S3 client **inside** `lambda_handler` (lazy), exactly like the silver handler, so `moto.mock_aws()` intercepts it.

**Quick decisions (pre-made):**
- Separate `infrastructure/modules/lambda_gold/` module (don't parameterize lambda_silver).
- Schedule `cron(45 12 ? * SUN *)`.
- `min_count` default 5, env `RATIO_MIN_COUNT` override.
- Output `gold/aggregations/latest.json` in the same listings bucket.
- 512 MB / 300 s, `AWSSDKPandas-Python312` managed layer (ARN as region-aware variable, eu-central-1 default).

**File modification priority (implement in order):**
1. `src/etl/data_processing/gold_aggregate.py` + tests — pure, the contract lives here; everything else depends on it.
2. `src/etl/data_processing/gold_aggregation_lambda.py` + moto tests — depends on (1).
3. `infrastructure/modules/lambda_gold/*.tf` — copy/adapt from `lambda_silver`.
4. `infrastructure/environments/dev/main.tf` + docs — depends on (3).

**Testing shortcuts:**
- `cd src/etl && .venv/bin/pytest data_processing/tests/test_gold_aggregate.py -v`
- Edge cases that MUST be tested: (a) same `propertyCode` in two snapshots → two time-series points; (b) ratio drops neighborhoods below `min_count` in **both** populations; (c) empty history → empty datasets; empty `relevant` subset → empty relevant block; (d) output uses `mean_price` not `mean_prize`; (e) scope keeps only the 3 districts using real fixture strings; (f) district price series is count-weighted (assert against a hand-computed weighted value); (g) boxplot quartiles correct on a known small sample; (h) `schema_version == "1.0"`.
- Reuse the bronze fixtures + `silver_transform.clean()` to build an in-memory silver DataFrame for pure tests (no Parquet round-trip needed for 4.1).

---

## Questions for User / Planner

**All three open questions were resolved by the user (2026-06-05):**

1. **Ratio definition** — ✅ **Both** ship: `general` (all scoped listings, §4.2) **and** `relevant` ("apartments like ours" filter, §4.3).
2. **Ratio over time** — ✅ Ratio ships **both** as a full-history value (scatter) **and** as a time-series (line), for both populations.
3. **Output location** — ✅ `gold/aggregations/latest.json` in the **same** listings bucket.

No open questions remain. Schema v1.0 and `mean_price` confirmed.
