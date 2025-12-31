terraform {
  required_version = ">= 1.2, < 2.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0, < 6.0"
    }
  }
}

resource "aws_s3_bucket" "listings" {
  bucket = "${var.environment}-vlc-real-estate-analytics-listings"

  tags = {
    Name        = "${var.environment}-vlc-real-estate-analytics-listings"
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = "valencia-real-estate"
  }
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

# # Lifecycle rule to archive old bronze data to reduce costs
# resource "aws_s3_bucket_lifecycle_configuration" "listings_lifecycle" {
#   bucket = aws_s3_bucket.listings.id

#   rule {
#     id     = "archive-bronze-data"
#     status = "Enabled"

#     filter {
#       prefix = "bronze/"
#     }

#     transition {
#       days          = 90
#       storage_class = "GLACIER_IR" # Instant Retrieval for occasional access
#     }

#     transition {
#       days          = 180
#       storage_class = "DEEP_ARCHIVE" # Deep Archive for long-term storage
#     }
#   }

#   rule {
#     id     = "delete-old-temp-data"
#     status = "Enabled"

#     filter {
#       prefix = "temp/"
#     }

#     expiration {
#       days = 7
#     }
#   }
# }
