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


# variable "state_bucket_allowed_principals" {
#   description = <<-EOT
# List of IAM principal ARNs (users/roles) that should have access to the Terraform state bucket.
# If empty the account root will be used as a fallback.
# Example: ["arn:aws:iam::123456789012:role/terraform"]
#   EOT
#   type        = list(string)
#   default     = []
# }