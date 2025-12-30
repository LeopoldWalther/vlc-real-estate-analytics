output "listings_bucket_name" {
  description = "Name of the S3 bucket for Idealista API data"
  value       = aws_s3_bucket.listings.id
}

output "listings_bucket_arn" {
  description = "ARN of the S3 bucket for Idealista API data"
  value       = aws_s3_bucket.listings.arn
}
