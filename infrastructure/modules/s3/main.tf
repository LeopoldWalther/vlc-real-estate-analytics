resource "aws_s3_bucket" "listings" {
  bucket = "${var.environment}-vlc-real-estate-analytics-listings"
}

# resource "aws_s3_bucket_versioning" "listings_versioning" {
#   bucket = aws_s3_bucket.listings.id
#   versioning_configuration {
#     status = "Enabled"
#   }
# }

resource "aws_s3_bucket_server_side_encryption_configuration" "listings_encryption" {
  bucket = aws_s3_bucket.listings.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "listings_public_block" {
  bucket = aws_s3_bucket.listings.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
