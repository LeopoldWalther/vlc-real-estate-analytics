terraform {

  # Match repo-wide constraint: >=1.2,<2.0 / >=5.0,<6.0
  required_version = ">= 1.2, < 2.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0, < 6.0"
    }
  }

}

# Default provider — account home region.
provider "aws" {
  region = "eu-central-1"
}
