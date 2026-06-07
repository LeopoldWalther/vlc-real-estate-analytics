output "listings_bucket_name" {
  description = "Name of the S3 bucket for Idealista API data"
  value       = aws_s3_bucket.listings.id
}

output "listings_bucket_arn" {
  description = "ARN of the S3 bucket for Idealista API data"
  value       = aws_s3_bucket.listings.arn
}

output "listings_bucket_regional_domain" {
  description = "Regional domain name of the S3 bucket (e.g. <bucket>.s3.<region>.amazonaws.com). Used as a CloudFront origin domain."
  value       = aws_s3_bucket.listings.bucket_regional_domain_name
}
