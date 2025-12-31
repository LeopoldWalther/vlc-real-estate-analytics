# VLC Real Estate Analytics

An automated real estate data collection platform for Valencia, Spain, using AWS Lambda and infrastructure managed through Terraform.

## Project Overview

This project collects and stores real estate listing data from the Idealista API for market analysis and trend tracking in the Valencia (VLC) region. Data is collected weekly via scheduled Lambda functions and stored in S3 for downstream analytics.

### Key Features

- **Automated Data Collection** - Weekly Lambda execution via EventBridge scheduler
- **Real Estate Listings** - Sale and rental property data from Idealista API
- **Historical Data** - Time-series data storage for market trend analysis
- **Scalable Infrastructure** - AWS serverless architecture with Lambda and S3
- **Multi-Environment** - Separate dev and production environments
- **Secure Secrets** - API credentials managed via AWS Secrets Manager

## Technology Stack

### Application
- **Runtime**: Python 3.12
- **AWS Services**: Lambda, S3, Secrets Manager, EventBridge, CloudWatch
- **API Integration**: Idealista Property Search API v3.5
- **Data Analysis**: Jupyter Notebooks

### Infrastructure
- **IaC Tool**: Terraform v1.14.3
- **Cloud Provider**: AWS (eu-central-1)
- **Compute**: Lambda Functions (serverless)
- **Storage**: S3 (encrypted at rest)
- **Secrets**: AWS Secrets Manager
- **Scheduling**: EventBridge (cron)
- **Monitoring**: CloudWatch Logs
- **State Management**: S3 with locking

## Project Structure

```
vlc-real-estate-analytics/
├── src/                               # Source code
│   ├── lambda/                        # Lambda functions
│   │   ├── idealista_listings_collector.py  # Main Lambda handler
│   │   ├── requirements.txt           # Lambda dependencies
│   │   ├── lambda_layers/             # Lambda layers
│   │   │   └── requests/              # Requests library layer
│   │   └── README.md                  # Lambda documentation
│   └── notebooks/                     # Jupyter notebooks for analysis
│       ├── valenciaRealEstatePriceAnalysis.ipynb
│       ├── idealista_listings_collector.ipynb
│       └── copy_s3_listings.ipynb
│
├── infrastructure/                     # Terraform configuration
│   ├── bootstrap/                     # Remote state setup
│   ├── modules/                       # Reusable Terraform modules
│   │   ├── lambda/                    # Lambda function module
│   │   ├── s3/                        # S3 bucket module
│   │   └── secrets/                   # Secrets Manager module
│   └── environments/                  # Environment-specific configs
│       ├── dev/                       # Development environment
│       └── prod/                      # Production environment
│
├── data/                              # Data directory
│   ├── images/                        # Documentation images
│   └── s3/                            # Local S3 data (gitignored)
│
├── documentation/                     # Project documentation
│   ├── DATA_COLLECTION_LAYER.md       # Data collection architecture
│   ├── property-search-api-v3_5.pdf   # Idealista API docs
│   └── oauth2-documentation.pdf       # OAuth2 reference
│
├── .gitignore                         # Git ignore rules
├── LICENSE                            # License file
└── README.md                          # This file
```

## Getting Started

### Prerequisites

1. **AWS Account** with appropriate IAM permissions:
   - Lambda, S3, Secrets Manager, EventBridge, CloudWatch, IAM
2. **Terraform 1.14.3+** for infrastructure
3. **Python 3.12+** for local development and testing
4. **Git** for version control
5. **Idealista API Credentials** (API key and secret)

### Local Development Setup

```bash
# Clone the repository
git clone https://github.com/LeopoldWalther/vlc-real-estate-analytics.git
cd vlc-real-estate-analytics

# Create Python virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install Lambda dependencies for local testing
cd src/etl
pip install -r data_collection/requirements.txt

# Install development dependencies (if available)
pip install -r requirements-dev.txt  # For testing, linting, etc.
```

### Infrastructure Deployment

Detailed deployment instructions in [DATA_COLLECTION_LAYER.md](documentation/DATA_COLLECTION_LAYER.md).

Quick start:
```bash
# 1. Setup remote state (one-time)
cd infrastructure/bootstrap
terraform init
terraform apply

# 2. Create secrets.tfvars with your API credentials
cd ../environments/dev
cat > secrets.tfvars << EOF
lvw_api_key = "your-api-key"
lvw_api_secret = "your-api-secret"
pmv_api_key = "your-api-key"
pmv_api_secret = "your-api-secret"
EOF

# 3. Deploy dev environment
terraform init
terraform plan -var-file="secrets.tfvars"
terraform apply -var-file="secrets.tfvars"
```

## Configuration

### Lambda Function Configuration

The Lambda function retrieves configuration from:
- **Environment Variables**: Set via Terraform
  - `LISTINGS_BUCKET`: S3 bucket for storing listing data
  - `LVW_SECRET_NAME`: Secrets Manager secret for LVW API credentials
  - `PMV_SECRET_NAME`: Secrets Manager secret for PMV API credentials

- **AWS Secrets Manager**: API credentials stored securely
  ```json
  {
    "api_key": "your-idealista-api-key",
    "api_secret": "your-idealista-api-secret"
  }
  ```

### Terraform Variables

Each environment has `terraform.tfvars` and `secrets.tfvars`:

**terraform.tfvars** (committed):
```hcl
aws_region  = "eu-central-1"
environment = "dev"
```

**secrets.tfvars** (gitignored):
```hcl
lvw_api_key    = "your-api-key"
lvw_api_secret = "your-api-secret"
pmv_api_key    = "your-api-key"
pmv_api_secret = "your-api-secret"
```

## Deployment

### Manual Deployment

```bash
# Deploy to dev environment
cd infrastructure/environments/dev
terraform plan -var-file="secrets.tfvars"
terraform apply -var-file="secrets.tfvars"

# Deploy to prod environment
cd infrastructure/environments/prod
terraform plan -var-file="secrets.tfvars"
terraform apply -var-file="secrets.tfvars"
```

### Testing Lambda Function

```bash
# Test with test_mode (limited API calls)
aws lambda invoke \
  --function-name dev-idealista-collector \
  --region eu-central-1 \
  --cli-binary-format raw-in-base64-out \
  --payload '{"test_mode": true}' \
  response.json

# View response
cat response.json | jq .

# Check CloudWatch logs
aws logs tail /aws/lambda/dev-idealista-collector --follow
```

### Automated Scheduling

Lambda functions run automatically via EventBridge:
- **Schedule**: Weekly on Sundays at 12:00 UTC
- **Cron Expression**: `cron(0 12 ? * SUN *)`
- **Operations**: Both sale and rent listings collected

## Architecture

### High-Level Overview

```
┌─────────────────┐
│  EventBridge    │  Weekly trigger (Sundays 12:00 UTC)
│  Cron Rule      │
└────────┬────────┘
         │
         v
┌─────────────────┐
│  Lambda         │  Python 3.12, 15 min timeout
│  Function       │  Collects sale & rent listings
└────────┬────────┘
         │
         ├──────> AWS Secrets Manager (API credentials)
         │
         └──────> S3 Bucket (JSON data storage)
                  - Encrypted at rest
                  - Organized by date/operation
```

See [DATA_COLLECTION_LAYER.md](documentation/DATA_COLLECTION_LAYER.md) for detailed architecture and design decisions.

## Testing

### Lambda Function Testing
```bash
# Test with limited API calls (test mode)
aws lambda invoke \
  --function-name dev-idealista-collector \
  --payload '{"test_mode": true}' \
  --region eu-central-1 \
  response.json

# Check S3 for uploaded files
aws s3 ls s3://dev-vlc-real-estate-analytics-listings/ --region eu-central-1
```

### Infrastructure Testing
```bash
# Validate Terraform configuration
cd infrastructure/environments/dev
terraform fmt -check
terraform validate
terraform plan -var-file="secrets.tfvars"
```

### Local Python Testing
```bash
# Run tests (once test suite is created)
cd src/etl
pytest data_collection/tests/

# Type checking
mypy data_collection/idealista_listings_collector.py

# Linting
ruff check .
black --check .
```

## Monitoring & Logging

CloudWatch monitoring includes:
- **Lambda Execution Logs**: `/aws/lambda/dev-idealista-collector`
- **Function Metrics**: Invocations, errors, duration, throttles
- **Custom Metrics**: API call counts, S3 upload success/failures

Access logs:
```bash
# Tail live logs
aws logs tail /aws/lambda/prod-idealista-collector --region eu-central-1 --follow

# Query specific time range
aws logs filter-log-events \
  --log-group-name /aws/lambda/prod-idealista-collector \
  --start-time $(date -u -d '1 hour ago' +%s)000 \
  --region eu-central-1
```

## Security

- **API Credentials**: Stored in AWS Secrets Manager, never in code
- **S3 Encryption**: AES-256 encryption at rest
- **IAM Roles**: Least privilege access for Lambda execution
- **Network**: Lambda runs in AWS managed VPC
- **Secrets**: `secrets.tfvars` excluded from version control
- **Logging**: CloudWatch logs retained for 30 days

## Cost Optimization

- **Lambda**: Pay-per-invocation (weekly = 4-5 invocations/month)
- **S3**: Standard storage with minimal costs for JSON files
- **Secrets Manager**: $0.40/secret/month
- **EventBridge**: Free tier covers weekly scheduling
- **CloudWatch Logs**: 30-day retention, minimal volume

**Estimated Monthly Cost**: < $5 USD for dev + prod environments

## Troubleshooting

### Lambda Function Issues
- **Check logs**: `aws logs tail /aws/lambda/prod-idealista-collector --follow`
- **Test manually**: Invoke with test_mode to verify API connectivity
- **Check permissions**: Verify IAM role has S3 and Secrets Manager access
- **API errors**: Check Idealista API status and rate limits

### Infrastructure Issues
- **Terraform state lock**: `terraform force-unlock <LOCK_ID>`
- **AWS credentials**: `aws sts get-caller-identity`
- **Plan drift**: `terraform refresh && terraform plan -var-file="secrets.tfvars"`
- **Secrets access**: Verify secrets exist in Secrets Manager

### Data Issues
- **Missing S3 files**: Check Lambda logs for upload errors
- **Empty responses**: API may be rate-limited or credentials invalid
- **Old data**: Verify EventBridge rule is enabled and triggering

See [DATA_COLLECTION_LAYER.md](documentation/DATA_COLLECTION_LAYER.md) for more details.

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/my-feature`
3. Make changes and test locally
4. Commit: `git commit -am 'Add feature'`
5. Push: `git push origin feature/my-feature`
6. Create Pull Request

## License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details.

## Contact

For questions or support, please open an issue on GitHub.

---

**Last Updated**: December 29, 2025
