output "listings_bucket_name" {
  description = "Name of the S3 bucket for Idealista API data"
  value       = module.listings_bucket.listings_bucket_name
}

output "listings_bucket_arn" {
  description = "ARN of the S3 bucket for Idealista API data"
  value       = module.listings_bucket.listings_bucket_arn
}

output "idealista_secret_name_lvw" {
  description = "Name of the AWS Secrets Manager secret for LVW's Idealista credentials"
  value       = module.idealista_secrets.secret_name_lvw
}

output "idealista_secret_name_pmv" {
  description = "Name of the AWS Secrets Manager secret for PMV's Idealista credentials"
  value       = module.idealista_secrets.secret_name_pmv
}

output "idealista_secret_arn_lvw" {
  description = "ARN of the AWS Secrets Manager secret for LVW's Idealista credentials"
  value       = module.idealista_secrets.secret_arn_lvw
  sensitive   = true
}

output "idealista_secret_arn_pmv" {
  description = "ARN of the AWS Secrets Manager secret for PMV's Idealista credentials"
  value       = module.idealista_secrets.secret_arn_pmv
  sensitive   = true
}

output "lambda_function_name" {
  description = "Name of the Idealista collector Lambda function"
  value       = module.idealista_collector.function_name
}

output "lambda_function_arn" {
  description = "ARN of the Idealista collector Lambda function"
  value       = module.idealista_collector.function_arn
}

output "lambda_log_group_name" {
  description = "Name of the Lambda CloudWatch Log Group"
  value       = module.idealista_collector.log_group_name
}

output "lambda_event_rule_name" {
  description = "Name of the EventBridge rule triggering the Lambda"
  value       = module.idealista_collector.event_rule_name
}
