# VLC Real Estate Analytics — Data Collection Layer (Bronze)

## Overview

The Bronze Collector is a scheduled AWS Lambda function that fetches Valencia real estate listings from the Idealista API and stores raw paginated JSON responses in the S3 bronze layer. It is the entry point of the medallion architecture.

## Architecture

```
┌──────────────────┐
│   EventBridge    │  cron(0 12 ? * SUN *)  — every Sunday 12:00 UTC
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌───────────────────────────────┐
│  Bronze Collector│────▶│  AWS Secrets Manager           │
│  Python 3.12     │     │  lvw-api-credentials           │
│  256 MB / 900 s  │     │  pmv-api-credentials           │
└────────┬─────────┘     └───────────────────────────────┘
         │  OAuth2 token → paginated JSON pages
         │  PutObject: bronze/idealista/{op}_{YYYYMMDD}_{HHMMSS}_{page}.json
         ▼
┌──────────────────┐     ┌───────────────────────────────┐
│  S3 Bronze Layer │     │  SNS Topic (error alerts)      │
│  bronze/idealista│     │  prod only (test_mode skips)   │
└──────────────────┘     └───────────────────────────────┘
```

## S3 Key Format

```
bronze/idealista/{operation}_{YYYYMMDD}_{HHMMSS}_{page}.json
```

Examples:
```
bronze/idealista/sale_20260601_120044_1.json
bronze/idealista/sale_20260601_120044_2.json
bronze/idealista/rent_20260601_120044_1.json
```

Each file is one raw Idealista API response page (up to 50 listings).

## Source Code

**File**: [src/etl/data_collection/idealista_listings_collector.py](../src/etl/data_collection/idealista_listings_collector.py)

### Key Functions

| Function | Purpose |
|---|---|
| `lambda_handler(event, context)` | Entry point; reads `test_mode` from event payload |
| `process_operation(operation, ...)` | Paginates through all API pages for one operation |
| `get_secret(secret_name)` | Reads API credentials from Secrets Manager |
| `send_notification(...)` | Sends SNS email on success (skipped in test_mode) |

### Search Parameters

- **Location**: Valencia city center (39.4693441, −0.379561), 1500 m radius
- **Property Type**: Homes, 100–160 m², elevator, good preservation
- **Operations**: `sale` (LVW credentials) and `rent` (PMV credentials)

### Test Mode

When invoked with `{"test_mode": true}` in the event payload:
- Limits collection to 1 page per operation (2 API calls total)
- Suppresses SNS notification email

In dev, EventBridge automatically passes `{"test_mode": true}` via the target `input` field, so the scheduled run never exceeds 2 API calls per week.

## Terraform Module

**Path**: `infrastructure/modules/lambda_bronze/`

```
modules/lambda_bronze/
├── main.tf        # Lambda, IAM, EventBridge, CloudWatch log group
├── variables.tf   # Input variables (including test_mode)
└── outputs.tf     # function_name, function_arn, log_group_name, etc.
```

### Key Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `environment` | string | — | `dev` or `prod` |
| `aws_region` | string | — | AWS region |
| `s3_bucket_name` | string | — | Target S3 bucket |
| `sns_topic_arn` | string | — | SNS topic for alerts |
| `test_mode` | bool | `false` | Pass `{"test_mode":true}` as EventBridge input |

### Resources Created

| Resource | Name pattern |
|---|---|
| Lambda function | `{env}-idealista-collector` |
| IAM role | `{env}-idealista-collector-lambda-role` |
| Lambda layer | `{env}-requests-layer` |
| EventBridge rule | `{env}-idealista-collector-weekly` |
| CloudWatch log group | `/aws/lambda/{env}-idealista-collector` |

### IAM Permissions

- **CloudWatch Logs**: `CreateLogGroup`, `CreateLogStream`, `PutLogEvents`
- **S3**: `PutObject`, `PutObjectAcl`, `ListBucket` on the listings bucket
- **Secrets Manager**: `GetSecretValue` on LVW + PMV secret ARNs
- **SNS**: `Publish` on the notifications topic

## Deployment

```bash
cd infrastructure/environments/dev   # or prod

# First time
terraform init

# Review
terraform plan -var-file="secrets.tfvars"

# Apply
terraform apply -var-file="secrets.tfvars"
```

**`secrets.tfvars`** (gitignored):
```hcl
idealista_api_key_lvw    = "..."
idealista_api_secret_lvw = "..."
idealista_api_key_pmv    = "..."
idealista_api_secret_pmv = "..."
notification_email       = "your@email.com"
```

## Testing

### Manual Invocation

```bash
# Full run (prod)
aws lambda invoke \
  --function-name prod-idealista-collector \
  --region eu-central-1 \
  response.json && cat response.json | jq .

# Limited run — 1 page each (same as scheduled dev run)
aws lambda invoke \
  --function-name dev-idealista-collector \
  --region eu-central-1 \
  --cli-binary-format raw-in-base64-out \
  --payload '{"test_mode": true}' \
  response.json
```

### Unit & Integration Tests

```bash
cd src/etl
pytest data_collection/tests/ -v --cov=data_collection
```

### Verify S3 Output

```bash
aws s3 ls s3://dev-vlc-real-estate-analytics-listings/bronze/idealista/ \
  --recursive --region eu-central-1
```

## Monitoring

```bash
# Live logs
aws logs tail /aws/lambda/prod-idealista-collector --region eu-central-1 --follow

# Filter errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/prod-idealista-collector \
  --filter-pattern "ERROR" \
  --region eu-central-1
```

## Troubleshooting

| Problem | Solution |
|---|---|
| Lambda times out | Check API rate limits; reduce `max_items` in `SearchConfig` |
| Permission denied on S3 | Verify IAM policy includes the correct bucket ARN |
| Secrets not found | Check secret names in `variables.tf` match Secrets Manager |
| API 401 / token error | Credentials may have expired; rotate in Secrets Manager |
| EventBridge not triggering | Check rule is enabled: `aws events list-rules --region eu-central-1` |
| State lock | `terraform force-unlock <LOCK_ID>` |

## Security

- API credentials stored exclusively in AWS Secrets Manager
- `secrets.tfvars` excluded from version control via `.gitignore`
- S3 bucket has AES-256 server-side encryption
- IAM role follows least-privilege principle
- CloudWatch logs retained 30 days then auto-deleted

## Related Documentation

- [DATA_PROCESSING_LAYER.md](DATA_PROCESSING_LAYER.md) — Silver Cleaner (Bronze → Parquet)
- [../README.md](../README.md) — Project overview and full architecture
