output "github_actions_deploy_role_arn" {
  description = "ARN of the IAM role assumed by GitHub Actions deploy workflows via OIDC. Set as the AWS_DEPLOY_ROLE_ARN variable (or secret) in GitHub repository settings."
  value       = aws_iam_role.github_actions_deploy.arn
}
