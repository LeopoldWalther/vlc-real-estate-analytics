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

# CRITICAL: ACM certificates used with CloudFront MUST be provisioned in
# us-east-1. A certificate created in any other region is silently rejected
# by CloudFront. The alias is used for every ACM + validation resource here.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
