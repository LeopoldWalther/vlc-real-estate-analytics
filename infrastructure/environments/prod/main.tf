module "listings_bucket" {
  source = "../../modules/s3"

  environment = var.environment
}

module "idealista_secrets" {
  source = "../../modules/secrets"

  environment                = var.environment
  idealista_api_key_lvw      = var.idealista_api_key_lvw
  idealista_api_secret_lvw   = var.idealista_api_secret_lvw
  idealista_api_key_pmv      = var.idealista_api_key_pmv
  idealista_api_secret_pmv   = var.idealista_api_secret_pmv
}

module "idealista_collector" {
  source = "../../modules/lambda"

  environment      = var.environment
  aws_region       = var.aws_region
  s3_bucket_name   = module.listings_bucket.listings_bucket_name
  s3_bucket_arn    = module.listings_bucket.listings_bucket_arn
  secret_name_lvw  = module.idealista_secrets.secret_name_lvw
  secret_arn_lvw   = module.idealista_secrets.secret_arn_lvw
  secret_name_pmv  = module.idealista_secrets.secret_name_pmv
  secret_arn_pmv   = module.idealista_secrets.secret_arn_pmv
}
