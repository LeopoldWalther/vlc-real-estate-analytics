output "secret_arn_lvw" {
  description = "ARN of the LVW Idealista credentials secret"
  value       = aws_secretsmanager_secret.idealista_credentials_lvw.arn
}

output "secret_name_lvw" {
  description = "Name of the LVW Idealista credentials secret"
  value       = aws_secretsmanager_secret.idealista_credentials_lvw.name
}

output "secret_arn_pmv" {
  description = "ARN of the PMV Idealista credentials secret"
  value       = aws_secretsmanager_secret.idealista_credentials_pmv.arn
}

output "secret_name_pmv" {
  description = "Name of the PMV Idealista credentials secret"
  value       = aws_secretsmanager_secret.idealista_credentials_pmv.name
}
