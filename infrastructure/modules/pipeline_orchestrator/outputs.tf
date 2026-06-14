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
