module "listings_bucket" {
  source = "../../modules/s3"

  environment = var.environment
}

module "idealista_secrets" {
  source = "../../modules/secrets"

  environment              = var.environment
  idealista_api_key_lvw    = var.idealista_api_key_lvw
  idealista_api_secret_lvw = var.idealista_api_secret_lvw
  idealista_api_key_pmv    = var.idealista_api_key_pmv
  idealista_api_secret_pmv = var.idealista_api_secret_pmv
}

module "idealista_notifications" {
  source = "../../modules/sns"

  environment        = var.environment
  notification_email = var.notification_email
}

module "idealista_collector" {
  source = "../../modules/lambda_bronze"

  environment     = var.environment
  aws_region      = var.aws_region
  s3_bucket_name  = module.listings_bucket.listings_bucket_name
  s3_bucket_arn   = module.listings_bucket.listings_bucket_arn
  secret_name_lvw = module.idealista_secrets.secret_name_lvw
  secret_arn_lvw  = module.idealista_secrets.secret_arn_lvw
  secret_name_pmv = module.idealista_secrets.secret_name_pmv
  secret_arn_pmv  = module.idealista_secrets.secret_arn_pmv
  sns_topic_arn   = module.idealista_notifications.topic_arn
}

module "silver_cleaner" {
  source = "../../modules/lambda_silver"

  environment      = var.environment
  aws_region       = var.aws_region
  s3_bucket_name   = module.listings_bucket.listings_bucket_name
  s3_bucket_arn    = module.listings_bucket.listings_bucket_arn
  sns_topic_arn    = module.idealista_notifications.topic_arn
  pandas_layer_arn = var.pandas_layer_arn
}

module "gold_aggregator" {
  source = "../../modules/lambda_gold"

  environment      = var.environment
  aws_region       = var.aws_region
  s3_bucket_name   = module.listings_bucket.listings_bucket_name
  s3_bucket_arn    = module.listings_bucket.listings_bucket_arn
  sns_topic_arn    = module.idealista_notifications.topic_arn
  pandas_layer_arn = var.pandas_layer_arn
  ratio_min_count  = 5
}

# ---------------------------------------------------------------------------
# Prod frontend domain. vlc-report.leopoldwalther.com is free since dev moved
# to vlc-report-dev in FEATURE-005. The wildcard ACM cert (*.leopoldwalther.com)
# covers this name (one subdomain level).
# ---------------------------------------------------------------------------
locals {
  frontend_domain = "vlc-report.leopoldwalther.com"
}

# ---------------------------------------------------------------------------
# Shared DNS remote state — reads zone_id + certificate_arn from the
# infrastructure/shared/dns stack. That stack must be applied ONCE before
# this environment is planned or applied.
# ---------------------------------------------------------------------------
data "terraform_remote_state" "dns" {
  backend = "s3"
  config = {
    bucket       = "vlc-real-estate-analytics-tf-state"
    key          = "vlc-state/shared/dns/terraform.tfstate"
    region       = "eu-central-1"
    encrypt      = true
    use_lockfile = true
  }
}

# ---------------------------------------------------------------------------
# Frontend module — private S3 asset bucket + CloudFront distribution.
# Certificate and zone come from the shared/dns remote state.
# ---------------------------------------------------------------------------
module "frontend" {
  source = "../../modules/frontend"

  environment                     = var.environment
  listings_bucket_name            = module.listings_bucket.listings_bucket_name
  listings_bucket_arn             = module.listings_bucket.listings_bucket_arn
  listings_bucket_regional_domain = module.listings_bucket.listings_bucket_regional_domain
  certificate_arn                 = data.terraform_remote_state.dns.outputs.certificate_arn
  aliases                         = [local.frontend_domain]
}

# ---------------------------------------------------------------------------
# Route 53 alias records — A + AAAA for the prod frontend domain
# pointing at the CloudFront distribution in the existing hosted zone.
# ---------------------------------------------------------------------------
resource "aws_route53_record" "frontend_a" {
  zone_id = data.terraform_remote_state.dns.outputs.zone_id
  name    = local.frontend_domain
  type    = "A"

  alias {
    name                   = module.frontend.distribution_domain_name
    zone_id                = "Z2FDTNDATAQYW2" # CloudFront hosted zone ID (global constant)
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "frontend_aaaa" {
  zone_id = data.terraform_remote_state.dns.outputs.zone_id
  name    = local.frontend_domain
  type    = "AAAA"

  alias {
    name                   = module.frontend.distribution_domain_name
    zone_id                = "Z2FDTNDATAQYW2" # CloudFront hosted zone ID (global constant)
    evaluate_target_health = false
  }
}
