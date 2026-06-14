output "function_name" {
  description = "Name of the Lambda function"
  value       = aws_lambda_function.idealista_collector.function_name
}

output "function_arn" {
  description = "ARN of the Lambda function"
  value       = aws_lambda_function.idealista_collector.arn
}

output "function_role_arn" {
  description = "ARN of the Lambda execution role"
  value       = aws_iam_role.lambda_role.arn
}

output "log_group_name" {
  description = "Name of the CloudWatch Log Group"
  value       = aws_cloudwatch_log_group.lambda_logs.name
}

output "event_rule_name" {
  description = "Name of the EventBridge rule (empty string when create_schedule = false)."
  value       = var.create_schedule ? aws_cloudwatch_event_rule.weekly_trigger[0].name : ""
}
