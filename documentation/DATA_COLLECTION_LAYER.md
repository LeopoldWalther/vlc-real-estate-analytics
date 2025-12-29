# Valencia Real Estate Analytics - Data Collection Layer

## Overview

Automated infrastructure for collecting Valencia real estate listings from the Idealista API using AWS Lambda, Secrets Manager, and S3.

## Components

### 1. Lambda Function

**File**: [src/lambda/idealista_listings_collector.py](../src/lambda/idealista_listings_collector.py)

**Features**:
- Python 3.12 with type hints
- AWS Secrets Manager integration for API credentials
- Test mode support (limits to 1 page per operation)
- Comprehensive error handling and logging
- Structured configuration via `SearchConfig` class
- HTTP timeouts (30s) to prevent hanging

**Search Parameters**:
- Location: Valencia city center (39.4693441,-0.379561)
- Radius: 1500m
- Property type: Homes
- Size: 100-160 m²
- Features: Elevator, air conditioning, good preservation

### 2. Terraform Module Structure

Lambda module: `infrastructure/modules/lambda/`

```
modules/
  lambda/
    ├── main.tf        # Lambda function, IAM, EventBridge
    ├── variables.tf   # Input variables
    └── outputs.tf     # Module outputs
```

#### Resources Created:

**Lambda Function**:
- Runtime: Python 3.12
- Timeout: 900 seconds (15 minutes)
- Memory: 256 MB
- Handler: `idealista_listings_collector.lambda_handler`

**IAM Role & Policies**:
- CloudWatch Logs: Write permissions
- S3: PutObject on listings bucket
- Secrets Manager: GetSecretValue for both credential sets

**Lambda Layer**:
- Requests library (Python 3.12 compatible)
- Reusable across Lambda versions

**EventBridge Scheduling**:
- Trigger: Weekly on Sundays at 12:00 UTC
- Cron expression: `cron(0 12 ? * SUN *)`

**CloudWatch Log Group**:
- Log retention: 30 days
- Auto-created with proper naming

### 3. Integration with Existing Infrastructure

```terraform
module "idealista_collector" {
  source = "../../modules/lambda"

  environment      = var.environment
  aws_region       = var.aws_region
  s3_bucket_name   = module.listings_bucket.listings_bucket_name
  s3_bucket_arn    = module.listings_bucket.listings_bucket_arn
  secret_name_lvw  = module.idealista_secrets.secret_name_lvw
  secret_arn_lvw   = module.idealista_secrets.secret_arn_lvw
  secret_name_pmv  = module.idealista_secrets.secret_name_pmv
  secret_arn_pmv   = module.idealista_secrets.secret_arn_pmv
}
```

### 4. Security Best Practices

✅ **Principle of Least Privilege**: IAM policies grant only necessary permissions
✅ **No Hardcoded Secrets**: All credentials in Secrets Manager
✅ **Encrypted Storage**: S3 bucket has server-side encryption
✅ **Log Retention**: Automatic cleanup after 30 days
✅ **Version Control**: `.gitignore` excludes sensitive files

### 5. Additional Files

- [src/lambda/README.md](../src/lambda/README.md): Function documentation
- [src/lambda/requirements.txt](../src/lambda/requirements.txt): Python dependencies (requests, boto3)
- [src/lambda/lambda_layers/requests/requests.zip](../src/lambda/lambda_layers/requests/): Python 3.12 requests library
- [src/notebooks/copy_s3_listings.ipynb](../src/notebooks/copy_s3_listings.ipynb): Notebook to migrate data from old bucket
- Updated [.gitignore](../.gitignore): Excludes Lambda ZIP files and secrets.tfvars

## Architecture Diagram

```
┌─────────────────┐
│  EventBridge    │ Weekly trigger (Sundays 12:00 UTC)
│   Cron Rule     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│     Lambda      │
│   Function      │
│  (Python 3.12)  │
└────────┬────────┘
         │
         ├─────────► AWS Secrets Manager
         │           ├─ lvw credentials
         │           └─ pmv credentials
         │
         └─────────► S3 Bucket
                     ├─ dev-vlc-real-estate-analytics-listings
                     └─ prod-vlc-real-estate-analytics-listings
```

## Deployment Instructions

### Environments

Two environments are configured:
- **Dev**: `infrastructure/environments/dev/` - For testing
- **Prod**: `infrastructure/environments/prod/` - For production data collection

### Prerequisites

1. Ensure secrets are populated in `secrets.tfvars` (excluded from git)
2. Navigate to the environment directory

### Deploy Infrastructure

```bash
# For Dev
cd infrastructure/environments/dev

# For Prod
cd infrastructure/environments/prod

# Initialize Terraform (first time only)
terraform init

# Review changes
terraform plan -var-file="secrets.tfvars"

# Apply changes
terraform apply -var-file="secrets.tfvars"
```

### Expected Resources Created

**Dev Environment**:
1. **Lambda Function**: `dev-idealista-collector`
2. **IAM Role**: `dev-idealista-collector-lambda-role`
3. **Lambda Layer**: `dev-requests-layer`
4. **Log Group**: `/aws/lambda/dev-idealista-collector`
5. **EventBridge Rule**: `dev-idealista-collector-weekly`
6. **S3 Bucket**: `dev-vlc-real-estate-analytics-listings`
7. **Secrets**: `dev/idealista/lvw-api-credentials`, `dev/idealista/pmv-api-credentials`

**Prod Environment**:
Same resources with `prod-` prefix instead of `dev-`

### Test the Lambda Function

```bash
# Test mode (only 2 API calls - 1 sale page + 1 rent page)
aws lambda invoke \
  --function-name dev-idealista-collector \
  --region eu-central-1 \
  --cli-binary-format raw-in-base64-out \
  --payload '{"test_mode": true}' \
  response.json

cat response.json | jq .

# Full production run
aws lambda invoke \
  --function-name prod-idealista-collector \
  --region eu-central-1 \
  --cli-binary-format raw-in-base64-out \
  response.json

# View logs
aws logs tail /aws/lambda/prod-idealista-collector --region eu-central-1 --follow

# Check S3 uploads
aws s3 ls s3://prod-vlc-real-estate-analytics-listings/ --region eu-central-1
```
## Cost Estimate

### Lambda
- Invocations: ~4/month (weekly)
- Duration: ~2 minutes per invocation
- Memory: 256 MB
- **Estimated cost**: <$1/month (within free tier)

### Secrets Manager
- 2 secrets
- ~4 retrievals/month
- **Estimated cost**: ~$0.80/month

### S3
- Storage: Minimal (JSON files)
- Requests: ~200 PUT operations/month
- **Estimated cost**: <$1/month

### CloudWatch Logs
- Log data: ~10 MB/month
- Retention: 30 days
- **Estimated cost**: <$0.50/month

**Total estimated cost**: ~$2-3/month

## Monitoring & Troubleshooting

### CloudWatch Metrics
- **Invocations**: Number of times Lambda runs
- **Duration**: Execution time
- **Errors**: Failed invocations
- **Throttles**: Rate limit hits

### Common Issues

**Problem**: Lambda times out
- **Solution**: Increase timeout in `modules/lambda/main.tf`

**Problem**: Permission denied on S3
- **Solution**: Check IAM policy in `modules/lambda/main.tf`

**Problem**: Cannot retrieve secrets
- **Solution**: Verify secret names and IAM permissions

**Problem**: API rate limit exceeded
- **Solution**: Reduce frequency or stagger requests

## Future Enhancements

1. **Dead Letter Queue (DLQ)**: Capture failed invocations
2. **X-Ray Tracing**: Detailed performance insights
3. **SNS Notifications**: Alert on failures
5. **CI/CD Pipeline**: Automated deployments
6. **Unit Tests**: Test Lambda function logic
7. **API Gateway**: Trigger Lambda via HTTP endpoint

## Rollback Plan

If issues occur, you can:

1. **Disable EventBridge rule**: Prevents automatic execution
   ```bash
   aws events disable-rule --name dev-idealista-collector-weekly
   ```

2. **Revert to manual execution**: Use AWS Console to invoke legacy function

3. **Destroy Terraform resources**:
   ```bash
   terraform destroy -var-file="secrets.tfvars"
   ```

## References

- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [Python Type Hints](https://docs.python.org/3/library/typing.html)
- [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/)

## Questions & Support

For issues or questions about this infrastructure:
1. Check CloudWatch Logs for Lambda errors
2. Review Terraform plan output before applying
3. Consult AWS documentation for service-specific issues
