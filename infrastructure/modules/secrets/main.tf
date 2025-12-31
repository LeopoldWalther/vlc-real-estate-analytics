terraform {
  required_version = ">= 1.2, < 2.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0, < 6.0"
    }
  }
}

resource "aws_secretsmanager_secret" "idealista_credentials_lvw" {
  name        = "${var.environment}/idealista/lvw-api-credentials"
  description = "Idealista API credentials for leopold.walther@gmail.com in ${var.environment} environment"

  recovery_window_in_days = 7

  tags = {
    Name        = "${var.environment}-idealista-lvw-credentials"
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = "valencia-real-estate"
  }
}

resource "aws_secretsmanager_secret_version" "idealista_credentials_lvw" {
  secret_id = aws_secretsmanager_secret.idealista_credentials_lvw.id
  secret_string = jsonencode({
    api_key    = var.idealista_api_key_lvw
    api_secret = var.idealista_api_secret_lvw
    account    = "leopold.walther@gmail.com"
  })
}

resource "aws_secretsmanager_secret" "idealista_credentials_pmv" {
  name        = "${var.environment}/idealista/pmv-api-credentials"
  description = "Idealista API credentials for paulamarinvillar@gmail.com in ${var.environment} environment"

  recovery_window_in_days = 7

  tags = {
    Name        = "${var.environment}-idealista-pmv-credentials"
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = "valencia-real-estate"
  }
}

resource "aws_secretsmanager_secret_version" "idealista_credentials_pmv" {
  secret_id = aws_secretsmanager_secret.idealista_credentials_pmv.id
  secret_string = jsonencode({
    api_key    = var.idealista_api_key_pmv
    api_secret = var.idealista_api_secret_pmv
    account    = "paulamarinvillar@gmail.com"
  })
}
