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

# ---------------------------------------------------------------------------
# Deployment package — bundles silver_cleaning_lambda.py + silver_transform.py
# ---------------------------------------------------------------------------
data "archive_file" "silver_lambda_zip" {
  type = "zip"
  # Include both the handler and the pure-transform module it imports.
  source_dir  = "${path.module}/../../../src/etl/data_processing"
  output_path = "${path.module}/silver_cleaning_lambda.zip"
  excludes = [
    "tests",
    "tests/**",
    "__pycache__",
    "**/__pycache__/**",
    "*.pyc",
    "explore_bronze.py",
    "requirements.txt",
  ]
}

# ---------------------------------------------------------------------------
# IAM role
# ---------------------------------------------------------------------------
resource "aws_iam_role" "silver_lambda_role" {
  name = "${var.environment}-silver-cleaner-lambda-role"

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
    Name        = "${var.environment}-silver-cleaner-lambda-role"
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = "valencia-real-estate"
  }
}

# CloudWatch Logs write access
resource "aws_iam_role_policy" "silver_lambda_logging" {
  name = "${var.environment}-silver-cleaner-logging"
  role = aws_iam_role.silver_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "arn:aws:logs:${var.aws_region}:*:log-group:/aws/lambda/${var.environment}-silver-cleaner:*"
      }
    ]
  })
}

# S3 access — read bronze/idealista/* + write silver/* (prefix-scoped, least privilege)
resource "aws_iam_role_policy" "silver_lambda_s3" {
  name = "${var.environment}-silver-cleaner-s3"
  role = aws_iam_role.silver_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ListBucket"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = var.s3_bucket_arn
        Condition = {
          StringLike = {
            "s3:prefix" = ["bronze/idealista/*", "silver/*"]
          }
        }
      },
      {
        Sid    = "ReadBronze"
        Effect = "Allow"
        Action = ["s3:GetObject"]
        # Scoped to the bronze/idealista/ prefix only — no write access here.
        Resource = "${var.s3_bucket_arn}/bronze/idealista/*"
      },
      {
        Sid    = "ReadSilver"
        Effect = "Allow"
        Action = ["s3:GetObject"]
        # HeadObject on existing silver keys requires GetObject; used by
        # _parquet_key_exists to skip re-processing already-written snapshots.
        Resource = "${var.s3_bucket_arn}/silver/*"
      },
      {
        Sid    = "WriteSilver"
        Effect = "Allow"
        Action = ["s3:PutObject", "s3:PutObjectAcl"]
        # Write only within the silver/ prefix — cannot touch bronze or other prefixes.
        Resource = "${var.s3_bucket_arn}/silver/*"
      },
    ]
  })
}

# SNS publish access — error notifications
resource "aws_iam_role_policy" "silver_lambda_sns" {
  name = "${var.environment}-silver-cleaner-sns"
  role = aws_iam_role.silver_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["sns:Publish"]
        Resource = var.sns_topic_arn
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# Lambda function
# ---------------------------------------------------------------------------
resource "aws_lambda_function" "silver_cleaner" {
  filename         = data.archive_file.silver_lambda_zip.output_path
  function_name    = "${var.environment}-silver-cleaner"
  role             = aws_iam_role.silver_lambda_role.arn
  handler          = "silver_cleaning_lambda.lambda_handler"
  source_code_hash = data.archive_file.silver_lambda_zip.output_base64sha256
  runtime          = "python3.12"
  timeout          = 300 # 5 minutes — well within Lambda max; data volume is small
  memory_size      = 512 # Needed for pandas/pyarrow cold start via managed layer

  # pandas + pyarrow via AWS-managed layer (AWSSDKPandas-Python312).
  # The ARN is region-specific and passed in as a variable so this module
  # remains region-agnostic and deployable without modification.
  layers = [var.pandas_layer_arn]

  environment {
    variables = {
      S3_BUCKET     = var.s3_bucket_name
      BRONZE_PREFIX = "bronze/idealista"
      SILVER_PREFIX = "silver/idealista"
      SNS_TOPIC_ARN = var.sns_topic_arn
    }
  }

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name        = "${var.environment}-silver-cleaner"
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = "valencia-real-estate"
  }
}

# ---------------------------------------------------------------------------
# CloudWatch Log Group (30-day retention, consistent with collector)
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "silver_lambda_logs" {
  name              = "/aws/lambda/${aws_lambda_function.silver_cleaner.function_name}"
  retention_in_days = 30

  tags = {
    Name        = "${var.environment}-silver-cleaner-logs"
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = "valencia-real-estate"
  }
}

# ---------------------------------------------------------------------------
# CloudWatch Alarm — trigger SNS on Lambda errors
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "silver_lambda_errors" {
  alarm_name          = "${var.environment}-silver-cleaner-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 3600 # 1 hour — alarm fires if any error in the hour after the schedule
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Silver cleaning Lambda raised at least one error"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.silver_cleaner.function_name
  }

  alarm_actions = [var.sns_topic_arn]

  tags = {
    Name        = "${var.environment}-silver-cleaner-errors"
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = "valencia-real-estate"
  }
}

# ---------------------------------------------------------------------------
# EventBridge — scheduled trigger: every Sunday at 12:30 UTC
# (30 min after the collector's cron(0 12 ? * SUN *) to ensure bronze is ready)
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_event_rule" "silver_weekly_trigger" {
  name                = "${var.environment}-silver-cleaner-weekly"
  description         = "Trigger silver cleaning Lambda weekly, 30 min after the bronze collector"
  schedule_expression = "cron(30 12 ? * SUN *)"

  tags = {
    Name        = "${var.environment}-silver-cleaner-weekly"
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = "valencia-real-estate"
  }
}

resource "aws_cloudwatch_event_target" "silver_lambda_target" {
  rule      = aws_cloudwatch_event_rule.silver_weekly_trigger.name
  target_id = "SilverCleanerLambda"
  arn       = aws_lambda_function.silver_cleaner.arn
}

resource "aws_lambda_permission" "allow_eventbridge_silver" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.silver_cleaner.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.silver_weekly_trigger.arn
}
