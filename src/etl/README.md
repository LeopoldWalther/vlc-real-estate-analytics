# Idealista Listings Collector Lambda Function

Modern, production-ready Lambda function for collecting Valencia real estate listings from the Idealista API.

## Features

- **Secure Credential Management**: Uses AWS Secrets Manager for API credentials
- **Clean Architecture**: Modular design with proper separation of concerns
- **Error Handling**: Comprehensive error handling with custom exceptions
- **Logging**: Structured logging for CloudWatch Logs
- **Type Hints**: Full Python type annotations for better IDE support
- **Modern Python**: Uses Python 3.12 runtime

## Architecture

### Lambda Function
- **Runtime**: Python 3.12
- **Timeout**: 5 minutes
- **Memory**: 256 MB
- **Trigger**: EventBridge (weekly on Sundays at 12:00 UTC)

### Dependencies
- `requests`: HTTP library for API calls
- `boto3`: AWS SDK for Python (S3 and Secrets Manager)

### IAM Permissions
- **S3**: PutObject on listings bucket
- **Secrets Manager**: GetSecretValue for API credentials
- **CloudWatch Logs**: Write logs

## Files

- `idealista_listings_collector.py`: Main Lambda function code
- `valenciaIdealistaSalesRentLambda.py`: Legacy function (kept for reference)
- `requirements.txt`: Python dependencies
- `lambda_layers/requests/`: Lambda layer with requests library

## Infrastructure

The Lambda function is deployed via Terraform:

```
infrastructure/
  modules/
    lambda/
      main.tf       # Lambda function, IAM roles, EventBridge
      variables.tf  # Module inputs
      outputs.tf    # Module outputs
```

## Configuration

Environment variables (set by Terraform):
- `S3_BUCKET`: Target S3 bucket for listings
- `SECRET_NAME_LVW`: Secrets Manager secret for Leopold's credentials
- `SECRET_NAME_PMV`: Secrets Manager secret for Paula's credentials
- `AWS_REGION`: AWS region (eu-central-1)

## Search Parameters

- **Location**: Valencia city center (39.4693441, -0.379561)
- **Radius**: 1500 meters
- **Property Type**: Homes
- **Size**: 100-160 m²
- **Features**: Elevator, air conditioning, good preservation
- **Operations**: Sale (using lvw credentials) and Rent (using pmv credentials)

## Deployment

Deploy with Terraform:

```bash
cd infrastructure/environments/dev
terraform init
terraform plan -var-file="secrets.tfvars"
terraform apply -var-file="secrets.tfvars"
```

## Manual Invocation

To test the Lambda function manually:

```bash
aws lambda invoke \
  --function-name dev-idealista-collector \
  --region eu-central-1 \
  response.json
```

## Monitoring

- **CloudWatch Logs**: `/aws/lambda/dev-idealista-collector`
- **Log Retention**: 30 days
- **Metrics**: Duration, invocations, errors (automatically tracked by Lambda)

## Output Format

Listings are stored in S3 with the following naming convention:
- Sale: `sale_YYYYMMDD_HHMMSS_PAGE.json`
- Rent: `rent_YYYYMMDD_HHMMSS_PAGE.json`

## Migration Notes

### Changes from Legacy Function

1. **Credentials**: Moved from hardcoded to AWS Secrets Manager
2. **Python Version**: Upgraded from Python 3.x to Python 3.12
3. **Code Quality**: Added type hints, error handling, logging
4. **Configuration**: Moved to environment variables
5. **S3 Bucket**: Updated to use new bucket name pattern
6. **IAM**: Follows principle of least privilege
7. **Scheduling**: Moved from manual/cron to EventBridge
8. **Infrastructure**: Fully managed by Terraform

### Backward Compatibility

The JSON output format is identical to the legacy function, ensuring compatibility with existing analysis notebooks.
