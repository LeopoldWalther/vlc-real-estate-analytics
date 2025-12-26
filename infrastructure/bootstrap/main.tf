resource "aws_s3_bucket" "terraform_state" {
  bucket        = "vlc-real-estate-analytics-tf-state"
  force_destroy = true
}

resource "aws_s3_bucket_versioning" "terraform_bucket_versioning" {
  bucket = aws_s3_bucket.terraform_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state_crypto_conf" {
  bucket = aws_s3_bucket.terraform_state.bucket
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state_public_block" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "aws_caller_identity" "current" {}

# locals {
#   state_bucket_principals = length(var.state_bucket_allowed_principals) > 0 ? var.state_bucket_allowed_principals : ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]

#   state_bucket_policy = jsonencode({
#     Version = "2012-10-17"
#     Statement = [
#       {
#         Sid    = "AllowLimitedAccessToStateBucket"
#         Effect = "Allow"
#         Principal = {
#           AWS = local.state_bucket_principals
#         }
#         Action = [
#           "s3:GetObject",
#           "s3:ListBucket",
#           "s3:PutObject",
#           "s3:DeleteObject",
#           "s3:GetBucketVersioning",
#           "s3:PutObjectAcl",
#           "s3:GetObjectAcl"
#         ]
#         Resource = [
#           aws_s3_bucket.terraform_state.arn,
#           "${aws_s3_bucket.terraform_state.arn}/*"
#         ]
#       }
#     ]
#   })
# }

# resource "aws_s3_bucket_policy" "terraform_state_policy" {
#   bucket = aws_s3_bucket.terraform_state.id
#   policy = local.state_bucket_policy
# }