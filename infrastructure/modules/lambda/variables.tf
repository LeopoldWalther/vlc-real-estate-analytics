variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "s3_bucket_name" {
  description = "Name of the S3 bucket for listings storage"
  type        = string
}

variable "s3_bucket_arn" {
  description = "ARN of the S3 bucket for listings storage"
  type        = string
}

variable "secret_name_lvw" {
  description = "Name of the Secrets Manager secret for lvw credentials"
  type        = string
}

variable "secret_arn_lvw" {
  description = "ARN of the Secrets Manager secret for lvw credentials"
  type        = string
}

variable "secret_name_pmv" {
  description = "Name of the Secrets Manager secret for pmv credentials"
  type        = string
}

variable "secret_arn_pmv" {
  description = "ARN of the Secrets Manager secret for pmv credentials"
  type        = string
}
