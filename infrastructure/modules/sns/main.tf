terraform {
  required_version = ">= 1.2, < 2.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0, < 6.0"
    }
  }
}

# SNS Topic for Lambda notifications
resource "aws_sns_topic" "lambda_notifications" {
  name         = "${var.environment}-idealista-notifications"
  display_name = "Idealista Listings Collector Notifications (${var.environment})"

  tags = {
    Name        = "${var.environment}-idealista-notifications"
    Environment = var.environment
    ManagedBy   = "Terraform"
    Project     = "vlc-real-estate-analytics"
  }
}

# Email subscription to SNS topic
resource "aws_sns_topic_subscription" "email_subscription" {
  topic_arn = aws_sns_topic.lambda_notifications.arn
  protocol  = "email"
  endpoint  = var.notification_email
}
