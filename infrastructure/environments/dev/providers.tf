terraform {

  # Require Terraform >=1.2 and <2.0 to avoid accidental incompatible major upgrades.
  required_version = ">= 1.2, < 2.0"
  required_providers {
    aws = {
      source = "hashicorp/aws"
      # Allow any 5.x provider but prevent automatic upgrade to 6.x
      version = ">= 5.0, < 6.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}