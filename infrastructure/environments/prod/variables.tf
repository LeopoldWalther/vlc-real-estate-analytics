variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-central-1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"
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
