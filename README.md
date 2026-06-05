# VLC Real Estate Analytics

An automated real estate data collection and processing platform for Valencia, Spain, using a medallion architecture on AWS Lambda and Terraform.

## Project Overview

This project collects, cleans, and stores real estate listing data from the Idealista API for market analysis and trend tracking in the Valencia (VLC) region. Data is collected weekly via scheduled Lambda functions, stored as raw JSON in S3 (bronze layer), and automatically cleaned into Parquet (silver layer) for downstream analytics.

### Key Features

- **Automated Data Collection** — Weekly Bronze Collector Lambda, Sundays 12:00 UTC
- **Automated Data Cleaning** — Weekly Silver Cleaner Lambda, Sundays 12:30 UTC (30 min after collector)
- **Medallion Architecture** — Bronze (raw JSON) → Silver (cleaned Parquet) → Gold (aggregations, future)
- **Real Estate Listings** — Sale and rental property data from Idealista API v3.5
- **Historical Time-Series** — Append-only S3 storage for long-term market trend analysis
- **Multi-Environment** — Separate `dev` and `prod` environments; dev runs in `test_mode` (1 page/op)
- **Secure Secrets** — API credentials managed via AWS Secrets Manager
- **Serverless & Cost-Efficient** — Estimated < $5/month across both environments

## Technology Stack

### Application
- **Runtime**: Python 3.12
- **AWS Services**: Lambda, S3, Secrets Manager, EventBridge, CloudWatch, SNS
- **API Integration**: Idealista Property Search API v3.5 (OAuth2)
- **Data Processing**: pandas + pyarrow via AWS-managed Lambda layer
- **Data Analysis**: Jupyter Notebooks

### Infrastructure
- **IaC Tool**: Terraform v1.14.3
- **Cloud Provider**: AWS (eu-central-1)
- **Compute**: Lambda Functions (serverless)
- **Storage**: S3 (AES-256 encrypted at rest)
- **Secrets**: AWS Secrets Manager
- **Scheduling**: EventBridge (cron)
- **Alerting**: SNS topics (error notifications)
- **Monitoring**: CloudWatch Logs + Metric Alarms
- **State Management**: S3 with native S3 locking

## Architecture

### Data Flow

```
┌──────────────────┐
│   EventBridge    │  cron(0 12 ? * SUN *)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌─────────────────────────┐
│  Bronze Collector│────▶│  AWS Secrets Manager     │
│  Python 3.12     │     │  (LVW + PMV API creds)   │
│  256 MB / 900 s  │     └─────────────────────────┘
└────────┬─────────┘
         │  PutObject  bronze/idealista/{op}_{date}_{time}_{page}.json
         ▼
┌──────────────────┐     ┌─────────────────────────┐
│  S3 Bronze Layer │     │  SNS Topic               │
│  bronze/idealista│     │  (error alerts)          │
└────────┬─────────┘     └─────────────────────────┘
         │
         │  (30 min later)
         ▼
┌──────────────────┐
│   EventBridge    │  cron(30 12 ? * SUN *)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Silver Cleaner  │  Reads all bronze pages for latest snapshot,
│  Python 3.12     │  drops nulls / invalid prices / zero bathrooms,
│  512 MB / 300 s  │  injects snapshot_date, writes partitioned Parquet
└────────┬─────────┘
         │  PutObject  silver/idealista/operation={op}/snapshot_date=YYYY-MM-DD/part.parquet
         ▼
┌──────────────────┐
│  S3 Silver Layer │
│  silver/idealista│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Jupyter         │  valenciaRealEstatePriceAnalysis.ipynb
│  Notebooks       │  pandas reads silver Parquet directly
└──────────────────┘
```

### S3 Medallion Layout

| Layer | S3 Prefix | Format | Written by |
|---|---|---|---|
| Bronze | `bronze/idealista/{op}_{YYYYMMDD}_{HHMMSS}_{page}.json` | Raw JSON (Idealista API response) | Bronze Collector |
| Silver | `silver/idealista/operation={op}/snapshot_date=YYYY-MM-DD/part.parquet` | Parquet (Hive-partitioned) | Silver Cleaner |

### Silver Cleaning Rules

| Rule | Detail |
|---|---|
| Drop null `priceByArea` | Missing price per m² — unusable for analysis |
| Drop blank/missing `neighborhood` | Cannot attribute to a district |
| Drop `bathrooms <= 0` | Data quality issue |
| Sale filter: `1000 ≤ priceByArea ≤ 10000` | Removes outliers outside Valencia market range |
| Inject `snapshot_date` | Derived from bronze S3 key (no `dateDownload` in payload) |
| Keep individual listings | Silver stores one row per listing, not aggregated |

### Infrastructure Layout

```
infrastructure/
├── bootstrap/              # Remote state S3 bucket + DynamoDB lock (one-time)
├── modules/
│   ├── lambda_bronze/      # Bronze Collector: Lambda, IAM, EventBridge, CloudWatch
│   ├── lambda_silver/      # Silver Cleaner: Lambda, IAM, EventBridge, CW Alarm
│   ├── s3/                 # S3 listings bucket (AES-256 encryption)
│   ├── secrets/            # Secrets Manager secrets for API credentials
│   └── sns/                # SNS topic for error alerting
└── environments/
    ├── dev/                # Dev environment (test_mode=true for collector)
    └── prod/               # Production environment
```

### Source Code Layout

```
src/
├── etl/
│   ├── data_collection/
│   │   ├── idealista_listings_collector.py  # Bronze Lambda handler
│   │   ├── requirements.txt                 # Runtime: requests, boto3
│   │   └── tests/                           # pytest unit + integration
│   ├── data_processing/
│   │   ├── silver_transform.py              # Pure Bronze→Silver transform (no AWS)
│   │   ├── silver_cleaning_lambda.py        # Silver Lambda handler
│   │   ├── requirements.txt                 # Runtime: boto3 (pandas via layer)
│   │   └── tests/                           # pytest unit + integration
│   ├── lambda_layers/                       # requests library as Lambda Layer
│   └── requirements-dev.txt                 # Dev: pytest, moto, black, ruff, mypy
└── notebooks/
    ├── valenciaRealEstatePriceAnalysis.ipynb
    ├── idealista_listings_collector.ipynb
    └── copy_s3_listings.ipynb
```

## Getting Started

### Prerequisites

1. **AWS Account** with IAM permissions for: Lambda, S3, Secrets Manager, EventBridge, CloudWatch, SNS, IAM
2. **Terraform 1.14.3+**
3. **Python 3.12+**
4. **Idealista API Credentials** (two credential sets: LVW + PMV)

### Local Development Setup

```bash
# Clone the repository
git clone https://github.com/LeopoldWalther/vlc-real-estate-analytics.git
cd vlc-real-estate-analytics

# Create Python virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install all dev dependencies (testing, linting, type-checking)
pip install -r src/etl/requirements-dev.txt
# Also install runtime deps for local testing
pip install -r src/etl/data_collection/requirements.txt
pip install -r src/etl/data_processing/requirements.txt

# Run tests
cd src/etl
pytest data_collection/tests/ data_processing/tests/ -v --cov

# Pre-commit hooks (black, ruff, mypy, terraform fmt/validate, pytest)
pip install pre-commit
pre-commit install
```

### Infrastructure Deployment

```bash
# 1. Setup remote state (one-time only)
cd infrastructure/bootstrap
terraform init && terraform apply

# 2. Create secrets.tfvars (gitignored) with your API credentials
cd ../environments/dev
cat > secrets.tfvars << 'EOF'
idealista_api_key_lvw    = "your-lvw-api-key"
idealista_api_secret_lvw = "your-lvw-api-secret"
idealista_api_key_pmv    = "your-pmv-api-key"
idealista_api_secret_pmv = "your-pmv-api-secret"
notification_email       = "your@email.com"
EOF

# 3. Deploy dev environment (deploys all modules)
terraform init
terraform plan  -var-file="secrets.tfvars"
terraform apply -var-file="secrets.tfvars"
```

> **Note**: The dev Collector runs with `test_mode = true` (1 page per operation per week = 2 API calls total) to stay within Idealista API limits. Prod runs full collection.

## Deployment

### Dev vs. Prod Differences

| Setting | Dev | Prod |
|---|---|---|
| Collector `test_mode` | `true` — 1 page/op, no SNS mail | `false` — full collection |
| Silver Cleaner | deployed | prod wiring pending dev soak |
| `pandas_layer_arn` | `AWSSDKPandas-Python312:16` (eu-central-1 default) | same, set via variable |

### Manual Deploy

```bash
# Dev
cd infrastructure/environments/dev
terraform apply -var-file="secrets.tfvars"

# Prod
cd infrastructure/environments/prod
terraform apply -var-file="secrets.tfvars"
```

### Resources Created (Dev)

| Resource | Name |
|---|---|
| S3 Bucket | `dev-vlc-real-estate-analytics-listings` |
| Bronze Lambda | `dev-idealista-collector` |
| Silver Lambda | `dev-silver-cleaner` |
| EventBridge (bronze) | `dev-idealista-collector-weekly` — `cron(0 12 ? * SUN *)` |
| EventBridge (silver) | `dev-silver-cleaner-weekly` — `cron(30 12 ? * SUN *)` |
| Log Groups | `/aws/lambda/dev-idealista-collector`, `/aws/lambda/dev-silver-cleaner` |
| Secrets | `dev/idealista/lvw-api-credentials`, `dev/idealista/pmv-api-credentials` |
| SNS Topic | `dev-idealista-notifications` |
| CW Alarm | `dev-silver-cleaner-errors` |

### Invoke Manually

```bash
# Bronze Collector — full run (prod)
aws lambda invoke \
  --function-name prod-idealista-collector \
  --region eu-central-1 \
  response.json && cat response.json | jq .

# Bronze Collector — test run (1 page each)
aws lambda invoke \
  --function-name dev-idealista-collector \
  --region eu-central-1 \
  --cli-binary-format raw-in-base64-out \
  --payload '{"test_mode": true}' \
  response.json

# Silver Cleaner — trigger manually
aws lambda invoke \
  --function-name dev-silver-cleaner \
  --region eu-central-1 \
  response.json && cat response.json | jq .

# Check CloudWatch logs
aws logs tail /aws/lambda/dev-silver-cleaner --region eu-central-1 --follow

# Verify silver Parquet files in S3
aws s3 ls s3://dev-vlc-real-estate-analytics-listings/silver/idealista/ \
  --recursive --region eu-central-1
```

## Testing

### Python Tests

```bash
cd src/etl

# All tests with coverage
pytest data_collection/tests/ data_processing/tests/ \
  --cov=data_collection --cov=data_processing \
  --cov-report=term-missing -v

# Individual suites
pytest data_collection/tests/ -v       # Bronze Collector (26 tests)
pytest data_processing/tests/ -v       # Silver transform + handler (26 tests)
```

### Infrastructure Tests

```bash
cd infrastructure/environments/dev
terraform fmt -check
terraform validate
terraform plan -var-file="secrets.tfvars"
```

## Monitoring & Alerting

| Signal | Where | Action |
|---|---|---|
| Bronze Lambda error | CloudWatch Logs | SNS email (prod only) |
| Silver Lambda error | CW Alarm `dev-silver-cleaner-errors` | SNS topic → email |
| No silver output | Check S3 prefix | Re-invoke manually |

```bash
# Tail logs
aws logs tail /aws/lambda/prod-idealista-collector --region eu-central-1 --follow
aws logs tail /aws/lambda/dev-silver-cleaner       --region eu-central-1 --follow
```

## Security

- **API Credentials**: Stored in AWS Secrets Manager, never in code or git
- **S3 Encryption**: AES-256 at rest
- **IAM Least Privilege**: Silver Cleaner reads only `bronze/idealista/*`, writes only `silver/*`
- **`secrets.tfvars`**: Excluded from version control via `.gitignore`
- **Log Retention**: 30 days on all CloudWatch log groups

## Cost Estimate

| Service | Dev | Prod |
|---|---|---|
| Lambda (2 functions × 4 invocations/month) | < $0.01 | < $0.01 |
| S3 (JSON + Parquet storage) | < $0.50 | < $0.50 |
| Secrets Manager (4 secrets) | ~$1.60 | ~$1.60 |
| CloudWatch Logs | < $0.50 | < $0.50 |
| SNS | < $0.01 | < $0.01 |
| **Total** | **~$2–3/month** | **~$2–3/month** |

## Troubleshooting

| Problem | Solution |
|---|---|
| Terraform state lock | `terraform force-unlock <LOCK_ID>` |
| Lambda times out | Check CloudWatch logs; silver cleaner needs pandas layer ARN |
| Silver Parquet missing | Run silver cleaner manually; check bronze prefix has data |
| API rate limit | Dev uses `test_mode`; prod rotates LVW/PMV credentials |
| `terraform plan` from wrong dir | Must run from `infrastructure/environments/dev` or `prod` |

## Documentation

- [DATA_COLLECTION_LAYER.md](documentation/DATA_COLLECTION_LAYER.md) — Bronze Collector architecture
- [DATA_PROCESSING_LAYER.md](documentation/DATA_PROCESSING_LAYER.md) — Silver Cleaner architecture

## Contributing

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Write tests first (TDD: RED → GREEN → REFACTOR)
3. Ensure all hooks pass: `pre-commit run --all-files`
4. Open a Pull Request

## License

MIT License — see [LICENSE](LICENSE).

---

**Last Updated**: 2026-06-05
