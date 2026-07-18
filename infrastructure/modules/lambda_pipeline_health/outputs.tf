output "function_name" {
  description = "Name of the pipeline health Lambda function"
  value       = aws_lambda_function.pipeline_health.function_name
}

output "function_arn" {
  description = "ARN of the pipeline health Lambda function"
  value       = aws_lambda_function.pipeline_health.arn
}

output "function_role_arn" {
  description = "ARN of the Lambda execution role"
  value       = aws_iam_role.pipeline_health_lambda_role.arn
}

output "log_group_name" {
  description = "Name of the CloudWatch Log Group for the pipeline health Lambda"
  value       = aws_cloudwatch_log_group.pipeline_health_lambda_logs.name
}

output "event_rule_name" {
  description = "Name of the EventBridge schedule rule (empty string when create_schedule = false)."
  value       = var.create_schedule ? aws_cloudwatch_event_rule.pipeline_health_weekly_trigger[0].name : ""
}
