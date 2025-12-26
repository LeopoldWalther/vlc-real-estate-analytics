variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-central-1"
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