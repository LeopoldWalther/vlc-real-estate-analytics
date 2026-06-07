output "asset_bucket_name" {
  description = "Name of the private S3 bucket holding frontend static assets. Used by the deploy workflow for aws s3 sync."
  value       = aws_s3_bucket.assets.id
}

output "distribution_id" {
  description = "CloudFront distribution ID. Used by the deploy workflow for aws cloudfront create-invalidation."
  value       = aws_cloudfront_distribution.frontend.id
}

output "distribution_domain_name" {
  description = "Default CloudFront domain name (*.cloudfront.net). Available before the custom domain alias is active."
  value       = aws_cloudfront_distribution.frontend.domain_name
}
