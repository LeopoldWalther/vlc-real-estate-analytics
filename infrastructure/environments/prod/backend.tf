terraform {

  backend "s3" {
    bucket       = "vlc-real-estate-analytics-tf-state"
    key          = "vlc-state/prod/terraform.tfstate"
    region       = "eu-central-1"
    encrypt      = true
    use_lockfile = true
  }

}
