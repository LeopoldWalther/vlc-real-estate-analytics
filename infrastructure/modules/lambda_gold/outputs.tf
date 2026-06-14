output "function_name" {
  description = "Name of the gold aggregation Lambda function"
  value       = aws_lambda_function.gold_aggregator.function_name
}

output "function_arn" {
  description = "ARN of the gold aggregation Lambda function"
  value       = aws_lambda_function.gold_aggregator.arn
}

output "function_role_arn" {
  description = "ARN of the Lambda execution role"
  value       = aws_iam_role.gold_lambda_role.arn
}

output "log_group_name" {
  description = "Name of the CloudWatch Log Group for the gold Lambda"
  value       = aws_cloudwatch_log_group.gold_lambda_logs.name
}

output "event_rule_name" {
  description = "Name of the EventBridge schedule rule (empty string when create_schedule = false)."
  value       = var.create_schedule ? aws_cloudwatch_event_rule.gold_weekly_trigger[0].name : ""
}
