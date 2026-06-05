variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-central-1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "idealista_api_key_lvw" {
  description = "Idealista API key for leopold.walther@gmail.com"
  type        = string
  sensitive   = true
}

variable "idealista_api_secret_lvw" {
  description = "Idealista API secret for leopold.walther@gmail.com"
  type        = string
  sensitive   = true
}

variable "idealista_api_key_pmv" {
  description = "Idealista API key for paulamarinvillar@gmail.com"
  type        = string
  sensitive   = true
}

variable "idealista_api_secret_pmv" {
  description = "Idealista API secret for paulamarinvillar@gmail.com"
  type        = string
  sensitive   = true
}

variable "notification_email" {
  description = "Email address to receive Lambda execution notifications"
  type        = string
  default     = "leopold.walther@gmail.com"
}

variable "pandas_layer_arn" {
  description = <<-EOT
    ARN of the AWS-managed AWSSDKPandas-Python312 Lambda layer for this region.
    Default targets eu-central-1. Look up the latest version at:
    https://aws-sdk-pandas.readthedocs.io/en/stable/layers.html
  EOT
  type        = string
  default     = "arn:aws:lambda:eu-central-1:336392948345:layer:AWSSDKPandas-Python312:16"
}


# variable "state_bucket_allowed_principals" {
#   description = <<-EOT
# List of IAM principal ARNs (users/roles) that should have access to the Terraform state bucket.
# If empty the account root will be used as a fallback.
# Example: ["arn:aws:iam::123456789012:role/terraform"]
#   EOT
#   type        = list(string)
#   default     = []
# }
