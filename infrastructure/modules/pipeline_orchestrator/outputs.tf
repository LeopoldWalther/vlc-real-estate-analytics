output "state_machine_arn" {
  description = "ARN of the medallion pipeline Step Functions state machine."
  value       = aws_sfn_state_machine.medallion_pipeline.arn
}

output "state_machine_name" {
  description = "Name of the medallion pipeline Step Functions state machine."
  value       = aws_sfn_state_machine.medallion_pipeline.name
}

output "log_group_name" {
  description = "CloudWatch Log Group name for Step Functions execution history."
  value       = aws_cloudwatch_log_group.sfn_logs.name
}

output "scheduler_schedule_name" {
  description = "Name of the EventBridge Scheduler weekly trigger."
  value       = aws_scheduler_schedule.weekly_pipeline.name
}

output "sfn_execution_role_arn" {
  description = "ARN of the Step Functions execution IAM role."
  value       = aws_iam_role.sfn_execution.arn
}
