terraform {
  required_version = ">= 1.2, < 2.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0, < 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = ">= 2.0"
    }
  }
}

# Data source to archive the Lambda function code
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_file = "${path.module}/../../../src/etl/data_collection/idealista_listings_collector.py"
  output_path = "${path.module}/lambda_function.zip"
}

# IAM role for Lambda function
resource "aws_iam_role" "lambda_role" {
  name = "${var.environment}-idealista-collector-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${var.environment}-idealista-collector-lambda-role"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Policy for CloudWatch Logs
resource "aws_iam_role_policy" "lambda_logging" {
  name = "${var.environment}-idealista-collector-logging"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${var.aws_region}:*:log-group:/aws/lambda/${var.environment}-idealista-collector:*"
      }
    ]
  })
}

# Policy for S3 write access
resource "aws_iam_role_policy" "lambda_s3" {
  name = "${var.environment}-idealista-collector-s3"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl"
        ]
        Resource = "${var.s3_bucket_arn}/*"
      }
    ]
  })
}

# Policy for Secrets Manager read access
resource "aws_iam_role_policy" "lambda_secrets" {
  name = "${var.environment}-idealista-collector-secrets"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          var.secret_arn_lvw,
          var.secret_arn_pmv
        ]
      }
    ]
  })
}

# Lambda Layer for requests library
resource "aws_lambda_layer_version" "requests" {
  filename            = "${path.module}/../../../src/etl/lambda_layers/requests/requests.zip"
  layer_name          = "${var.environment}-requests-layer"
  compatible_runtimes = ["python3.12"]

  description = "Requests library for Python 3.12"
}

# Lambda function
resource "aws_lambda_function" "idealista_collector" {
  filename         = data.archive_file.lambda_zip.output_path
  function_name    = "${var.environment}-idealista-collector"
  role             = aws_iam_role.lambda_role.arn
  handler          = "idealista_listings_collector.lambda_handler"
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  runtime          = "python3.12"
  timeout          = 900 # 15 minutes
  memory_size      = 256

  layers = [aws_lambda_layer_version.requests.arn]

  environment {
    variables = {
      S3_BUCKET       = var.s3_bucket_name
      S3_PREFIX       = "bronze/idealista/"
      SECRET_NAME_LVW = var.secret_name_lvw
      SECRET_NAME_PMV = var.secret_name_pmv
    }
  }

  # Prevent accidental deletion of Lambda function
  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name        = "${var.environment}-idealista-collector"
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = "valencia-real-estate"
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/${aws_lambda_function.idealista_collector.function_name}"
  retention_in_days = 30

  tags = {
    Name        = "${var.environment}-idealista-collector-logs"
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = "valencia-real-estate"
  }
}

# EventBridge rule to trigger Lambda weekly (every Sunday at 12:00 UTC)
resource "aws_cloudwatch_event_rule" "weekly_trigger" {
  name                = "${var.environment}-idealista-collector-weekly"
  description         = "Trigger Idealista listings collector weekly"
  schedule_expression = "cron(0 12 ? * SUN *)" # Every Sunday at 12:00 UTC

  tags = {
    Name        = "${var.environment}-idealista-collector-weekly"
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = "valencia-real-estate"
  }
}

# EventBridge target
resource "aws_cloudwatch_event_target" "lambda_target" {
  rule      = aws_cloudwatch_event_rule.weekly_trigger.name
  target_id = "IdealistaCollectorLambda"
  arn       = aws_lambda_function.idealista_collector.arn
}

# Permission for EventBridge to invoke Lambda
resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.idealista_collector.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.weekly_trigger.arn
}
