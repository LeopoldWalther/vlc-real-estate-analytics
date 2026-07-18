# Pipeline Health Layer — Data Architecture & JSON Contract

## Overview

The pipeline-health layer is an independent **observer** Lambda that monitors the 3 medallion
pipeline Lambdas (bronze/silver/gold), the Idealista API quota, and the project's AWS spend. It runs
on its own weekly schedule (every Sunday at 13:00 UTC, 15 minutes after the gold aggregator) and
writes a single traffic-light summary file:

```
s3://<bucket>/gold/pipeline_health/latest.json
```

Unlike the gold aggregator, this Lambda is **not** wired into the Step Functions
`pipeline_orchestrator` state machine — it observes the pipeline, it does not participate in it,
and must keep reporting even if the orchestrated bronze → silver → gold run itself fails.

---

## Medallion Architecture Position

```
Bronze / Silver / Gold Lambdas (medallion pipeline, own EventBridge/orchestrator schedule)
        ↓  (observed via CloudWatch Logs Insights, CloudWatch Metrics, Cost Explorer)
pipeline-health Lambda           cron(0 13 ? * SUN *)
        ↓
gold/pipeline_health/latest.json  (this layer)
        ↓
FEATURE-005 static visualization web app — "Pipeline Health" tab
```

---

## Source Code

| File | Purpose |
|---|---|
| `src/etl/common/metrics_publisher.py` | `MetricsPublisher` Protocol + `CloudWatchMetricsPublisher` adapter (Idealista API-request quota instrumentation) |
| `src/etl/pipeline_health/health_checks.py` | `HealthCheckResult` / `HealthCheck` domain model, `worst_status`, and the 4 Ampel-rule Strategy classes |
| `src/etl/pipeline_health/pipeline_health_aggregator.py` | `PipelineHealthAggregator` — orchestration only, composes the overall status and writes the JSON via `ObjectStore` |
| `src/etl/pipeline_health/pipeline_health_lambda.py` | Thin Lambda handler — `build_aggregator` Factory wiring up boto3 clients, plus the handler entrypoint |
| `src/etl/pipeline_health/tests/` | Unit tests per check + aggregator + lambda handler integration test |
| `src/etl/data_collection/bronze_collector.py` | Injected `MetricsPublisher`; emits the `ApiRequests` quota metric per attempted search-page request |

### Design

Each Ampel rule is a **Strategy** exposing one `evaluate() -> HealthCheckResult` method behind the
`HealthCheck` Protocol (**Interface Segregation**, **Polymorphism**) — a 5th sub-light would be one
more injected check, never an edit to the aggregator (**Open/Closed**). `PipelineHealthAggregator`
mirrors `GoldAggregator`'s orchestration shape exactly: it only composes the checks' results via
`worst_status` and persists through the existing `ObjectStore` Adapter — no new storage abstraction
was introduced. Every check evaluation is wrapped in `_safe_evaluate()`, so one check raising an
exception never prevents the others from producing a result; the aggregator instead substitutes a
synthetic `red` result documenting the failure in `details.error`/`details.error_type`. Cross-cutting
AWS collaborators (`logs`, `cloudwatch`, `ce`, `S3ObjectStore`) are constructed once, at the Lambda
handler's edge, inside `build_aggregator()` — never inside the check or aggregator classes
(**Dependency Inversion**).

---

## JSON Contract v1.0

### Top-Level Structure

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-08-11T13:02:07.123456+00:00",
  "overall_status": "green",
  "execution_success": { "status": "green", "summary": "...", "details": { ... }, "evaluated_at": "..." },
  "execution_duration": { "status": "green", "summary": "...", "details": { ... }, "evaluated_at": "..." },
  "api_quota": { "status": "yellow", "summary": "...", "details": { ... }, "evaluated_at": "..." },
  "aws_cost": { "status": "green", "summary": "...", "details": { ... }, "evaluated_at": "..." }
}
```

| Field | Type | Description |
|---|---|---|
| `schema_version` | string | Currently `"1.0"` (`pipeline_health_aggregator.SCHEMA_VERSION`) |
| `generated_at` | string | ISO-8601 UTC timestamp of this aggregation run |
| `overall_status` | string | `worst_status()` across all 4 checks — `"green"` \| `"yellow"` \| `"red"` |
| `execution_success` | object | Ampel rule 1 result |
| `execution_duration` | object | Ampel rule 2 result |
| `api_quota` | object | Ampel rule 3 result |
| `aws_cost` | object | Ampel rule 4 result |

Every named check serializes through the same `HealthCheckResult.to_dict()` shape
(`health_checks.py`):

| Field | Type | Description |
|---|---|---|
| `status` | string | `"green"` \| `"yellow"` \| `"red"` for this check |
| `summary` | string | One-line human-readable summary |
| `details` | object | Check-specific evidence (see per-rule sections below) — JSON-safe only |
| `evaluated_at` | string | ISO-8601 timestamp of when this individual check ran |

If a check itself raises, its `details` becomes `{"error": "<message>", "error_type": "<ExceptionType>"}`
and its `status` is forced to `"red"` (`pipeline_health_aggregator._safe_evaluate`) — a bad check can
never crash the whole aggregation or produce an empty document.

---

## The 4 Ampel Rules (verbatim, as implemented)

### Rule 1 — Execution success (`execution_success`, `ExecutionSuccessCheck`)

Evaluates the last **5** invocations (`EXECUTION_HISTORY_WINDOW = 5`) of each of the 3 monitored
pipeline Lambdas (bronze/silver/gold), read via a shared bounded-polling CloudWatch Logs Insights
adapter (`_LogsInsightsExecutionHistory`) that parses each invocation's `REPORT` log line for a
duration and a failure marker (`Task timed out`, `ERROR`, `Process exited before completing
request`). Per function:

- **red** — the most recent invocation failed.
- **yellow** — the most recent invocation succeeded, but at least one earlier invocation in the
  window failed; OR the Logs Insights query itself failed/timed out (`query_error` detail); OR
  there is no invocation history at all yet (`insufficient_history: true`, `invocations_checked: 0`).
- **green** — the most recent invocation succeeded and no earlier invocation in the window failed.
  If fewer than 5 invocations exist, the result is still green but carries `insufficient_history: true`
  alongside `invocations_checked` (see "Insufficient-history behavior" below).

The overall `execution_success` status is `worst_status()` across all 3 monitored functions.

### Rule 2 — Execution duration (`execution_duration`, `ExecutionDurationCheck`)

Reads the same per-invocation records as Rule 1 (shared `_LogsInsightsExecutionHistory` evidence,
same 5-invocation window) and takes the **maximum** invocation duration per function:

- **red** — `max_duration_seconds > 600` (`DURATION_RED_THRESHOLD_SECONDS = 10 * 60`).
- **yellow** — `max_duration_seconds >= 300` (`DURATION_YELLOW_THRESHOLD_SECONDS = 5 * 60`) and
  `<= 600`; OR the Logs Insights query failed/timed out; OR there is no invocation history yet.
- **green** — `max_duration_seconds < 300`.

The overall `execution_duration` status is `worst_status()` across all 3 monitored functions.

### Rule 3 — API quota (`api_quota`, `ApiQuotaCheck`)

Reads the custom `VlcRealEstate/Idealista` / `ApiRequests` CloudWatch metric (published by
`BronzeCollector` per attempted search-page request — including failed/partial requests, per review
H1) via `GetMetricData`, summed **per calendar month**, over the last **5 fully-completed calendar
months** (`API_QUOTA_EVALUATION_MONTHS = 5`; the current in-progress month is always excluded so
partial-month data can never bias the result green). Evaluated per credential set (`LVW`, `PMV`):

- **red** — any evaluated month's summed requests `>= 95` (`API_QUOTA_RED_THRESHOLD_REQUESTS`), i.e.
  ≥ 95% of the 100-request/month Idealista quota (`API_QUOTA_MONTHLY_REQUESTS`).
- **yellow** — any evaluated month's summed requests `>= 80` (`API_QUOTA_YELLOW_THRESHOLD_REQUESTS`),
  i.e. ≥ 80% of quota, and no red month.
- **green** — every evaluated month is below 80% of quota.

The overall `api_quota` status is `worst_status()` across both credential sets.

### Rule 4 — AWS cost (`aws_cost`, `AwsCostCheck`)

Reads Cost Explorer's `GetCostAndUsage`, grouped by `SERVICE`, for the current month-to-date, and
sums `UnblendedCost` across all services **except** the excluded domain/registrar services (see
below), producing `included_total_usd`:

- **red** — `included_total_usd >= 5.0` (`AWS_COST_RED_THRESHOLD_USD`).
- **yellow** — `included_total_usd >= 2.0` (`AWS_COST_YELLOW_THRESHOLD_USD`) and `< 5.0`.
- **green** — `included_total_usd < 2.0`.

---

## Quota Metric Dimensions & Scope (review M3)

The `ApiRequests` metric is published to namespace **`VlcRealEstate/Idealista`** with two
dimensions at publish time (`BronzeCollector._publish_attempt_metric`):

- **`CredentialSet`** — `"LVW"` or `"PMV"`.
- **`Operation`** — `"sale"` or `"rent"` (LVW is always used for sale, PMV always for rent — this
  1:1 mapping means `CredentialSet` alone is sufficient to distinguish the two quota buckets;
  `Operation` is carried on the metric for auditability but `ApiQuotaCheck` filters by
  `CredentialSet` only).

**Quota is treated as credential-global, not environment-local.** This repo's dev and prod
environments share the same LVW/PMV Idealista credentials (confirmed during review), so
`ApiQuotaCheck` never adds or filters by an `Environment` dimension — dev and prod both read and
report the *same* combined LVW/PMV monthly usage. This decision is echoed directly in the JSON
output as `api_quota.details.credential_scope = "global"` and a human-readable
`credential_scope_note`. If dev and prod ever use separate Idealista credentials, an `Environment`
dimension would need to be added at the publish site (`bronze_collector.py`) and filtered in
`ApiQuotaCheck` — this is explicitly called out as future work in the code, not implemented today.

Per-credential-set human labels (`CREDENTIAL_SET_LABELS`) are `LVW → "sale"`, `PMV → "rent"` — the
JSON never exposes anything beyond these two approved labels (no raw secret names).

---

## AWS Cost — Excluded Services & Client Region (review M1)

Cost Explorer has no native "exclude domain registration" filter, so `AwsCostCheck` excludes two
service names from the `included_total_usd` threshold total (`DEFAULT_EXCLUDED_SERVICES`):

- `"Amazon Registrar"`
- `"Amazon Route 53 Domains"`

Their combined cost is still reported separately as `excluded_total_usd` / `excluded_services` in
the JSON `details`, so nothing is silently dropped — it is simply not counted against the pipeline's
own $2/$5 thresholds, since domain registration is not a pipeline running cost.

Cost Explorer is effectively a global API, reached via the AWS-documented `us-east-1` endpoint,
while the rest of this stack runs in `eu-central-1`. `AwsCostCheck` itself never constructs its own
client — the Lambda factory (`pipeline_health_lambda.build_aggregator`) is solely responsible for
constructing the Cost Explorer client with `boto3.client("ce", region_name="us-east-1")`
(`COST_EXPLORER_REGION`), independent of the `logs`/`cloudwatch`/`s3` clients' region.

---

## Insufficient-History Behavior (review M2)

A fresh deployment (or any environment with fewer than 5 recorded invocations) must never crash or
report a misleading status. `ExecutionSuccessCheck` and `ExecutionDurationCheck` handle this
explicitly, never as an exception:

- **0 invocations found** — both checks return **yellow** with
  `{"insufficient_history": true, "invocations_checked": 0}` (rather than a false green with no
  evidence at all).
- **1–4 invocations found (< the 5-invocation window)** — both checks still evaluate normally against
  whatever invocations exist (e.g. "did the most recent one succeed", "what was the max duration
  among what's available") and additionally set `"insufficient_history": true` alongside the real
  `invocations_checked` count in `details`, so the dashboard/reader can see the result is based on a
  partial window rather than the full 5.
- **Logs Insights query failure or bounded-polling timeout** — surfaced as **yellow** with a
  `query_error` detail string (`LogsInsightsQueryError`), never allowed to propagate out of
  `evaluate()` and never treated as red (a query outage is not evidence of a pipeline failure).
- **≥ 5 invocations found** — normal full-window evaluation, no `insufficient_history` flag.

---

## CloudFront Path (review H2)

`gold/pipeline_health/latest.json` is served through the same CloudFront distribution as the gold
aggregations JSON, via a second `ordered_cache_behavior` in `infrastructure/modules/frontend/main.tf`
scoped to `/${var.pipeline_health_prefix}/*` (default `gold/pipeline_health`), using the same
short-TTL data cache policy as `/${var.gold_prefix}/*`. A matching listings-bucket policy statement
grants the distribution's Origin Access Control read access to
`${var.listings_bucket_arn}/${var.pipeline_health_prefix}/*`. Before this fix, the frontend module
only served `gold/aggregations/*`, so a browser fetch of `/gold/pipeline_health/latest.json` would
have fallen through to the asset origin or an HTML error page — this is now resolved and must be
re-confirmed after each environment's Terraform apply (see "Manual dev invocation & verification"
below).

---

## Infrastructure

### Terraform Module

`infrastructure/modules/lambda_pipeline_health/` — reusable module, mirrors `lambda_gold/`'s
structure and least-privilege IAM pattern.

| Resource | Detail |
|---|---|
| Lambda | `{env}-pipeline-health`, python3.12, 256 MB, 300 s timeout |
| Deployment package | Bundles `src/etl/pipeline_health/*.py` at the zip root plus `src/etl/common/*.py` under `common/` (via `fileset()`, non-recursive — test directories are never bundled) |
| IAM — Logs | Own log group write access; `logs:StartQuery`/`GetQueryResults`/`StopQuery` scoped to the 3 monitored pipeline Lambdas' log groups; `logs:DescribeLogGroups` on `Resource: "*"` (AWS does not support ARN scoping for this list-style action) |
| IAM — Metrics/Cost | `cloudwatch:GetMetricData` and `ce:GetCostAndUsage` on `Resource: "*"` (AWS design limitation — no ARNs exist for metric data or cost/usage data) |
| IAM — S3 | Write `gold/pipeline_health/*` only |
| EventBridge | `cron(0 13 ? * SUN *)` — every Sunday 13:00 UTC, independent of the `pipeline_orchestrator` state machine |
| CloudWatch Logs | 30-day retention |

### Environment Variables

| Variable | Description |
|---|---|
| `S3_BUCKET` | (required) S3 bucket name |
| `PIPELINE_FUNCTION_NAMES` | (required) Comma-separated Lambda function names to monitor for execution success/duration (bronze, silver, gold) |

### S3 Layout

```
s3://<bucket>/
├── bronze/idealista/          ← raw API JSON (FEATURE-001)
├── silver/idealista/          ← cleaned Parquet history
├── gold/aggregations/
│   └── latest.json            ← dashboard aggregations (DATA_GOLD_LAYER.md)
└── gold/pipeline_health/
    └── latest.json            ← frozen schema v1.0 (this layer)
```

---

## Manual Dev Invocation & Verification

Follow this order when deploying: apply Terraform to **dev only** first, manually verify, and only
then promote to prod with a separate apply. Do not skip the dev verification step — instructions
below, none of these commands have been executed as part of this documentation task.

### 1. Apply Terraform to dev

```bash
cd infrastructure/environments/dev
terraform init
terraform plan
terraform apply
```

### 2. Manually invoke the pipeline-health Lambda in dev

```bash
aws lambda invoke \
    --function-name dev-pipeline-health \
    --invocation-type RequestResponse \
    --payload '{}' \
    --region eu-central-1 \
    pipeline-health-response.json && cat pipeline-health-response.json
```

Expect a 200 response with `key`, `bytes`, and `overall_status` fields. On a fresh dev environment
with fewer than 5 historical pipeline invocations, expect `execution_success`/`execution_duration`
to report `insufficient_history: true` rather than crashing or reporting a misleading red — this is
the intended, tested behavior (see "Insufficient-History Behavior" above).

### 3. Verify the S3 object was written

```bash
aws s3api head-object \
    --bucket <dev-listings-bucket-name> \
    --key gold/pipeline_health/latest.json \
    --region eu-central-1

aws s3 cp s3://<dev-listings-bucket-name>/gold/pipeline_health/latest.json - | python3 -m json.tool
```

Confirm the JSON matches the schema above: `schema_version`, `generated_at`, `overall_status`, and
all 4 named checks.

### 4. Fetch via the CloudFront URL to confirm H2 is resolved

```bash
curl -sS https://<dev-cloudfront-domain>/gold/pipeline_health/latest.json | python3 -m json.tool
```

This must return the same JSON (not an HTML error page and not a 403/404) — this is the concrete,
post-deployment confirmation that the CloudFront `ordered_cache_behavior` and bucket-policy fix for
review H2 actually works end to end, not just in `terraform validate`.

### 5. Promote to prod (separate apply, only after dev verification passes)

```bash
cd infrastructure/environments/prod
terraform init
terraform plan
terraform apply
```

Repeat steps 2–4 against the prod function name (`prod-pipeline-health`), prod bucket, and prod
CloudFront domain before considering the feature fully deployed.

---

## Deferred Scope

**SNS red-status alerting is out of scope for this MVP** (review L1). The pipeline-health Lambda and
JSON provide the requested at-a-glance monitoring value via the dashboard tab; wiring a `red` overall
status (or a `red` `execution_success`/`aws_cost` sub-status) to the existing SNS topic for active
push notifications is a deliberate follow-up, not implemented here. Revisit only if explicitly
requested.

---

## Testing

```bash
# Unit tests (pure health-check logic + aggregator, stubbed/moto AWS clients)
cd src/etl/pipeline_health
pytest tests/ -v

# Full backend suite (regression check across the whole src/etl tree)
cd src/etl
pytest -q
```
