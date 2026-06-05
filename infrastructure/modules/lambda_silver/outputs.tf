output "function_name" {
  description = "Name of the silver cleaning Lambda function"
  value       = aws_lambda_function.silver_cleaner.function_name
}

output "function_arn" {
  description = "ARN of the silver cleaning Lambda function"
  value       = aws_lambda_function.silver_cleaner.arn
}

output "function_role_arn" {
  description = "ARN of the Lambda execution role"
  value       = aws_iam_role.silver_lambda_role.arn
}

output "log_group_name" {
  description = "Name of the CloudWatch Log Group for the silver Lambda"
  value       = aws_cloudwatch_log_group.silver_lambda_logs.name
}

output "event_rule_name" {
  description = "Name of the EventBridge schedule rule"
  value       = aws_cloudwatch_event_rule.silver_weekly_trigger.name
}
