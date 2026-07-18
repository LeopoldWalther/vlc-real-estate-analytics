# ---------------------------------------------------------------------------
# Private S3 bucket — frontend static assets
#
# Block Public Access is fully on. CloudFront reaches the bucket exclusively
# via Origin Access Control (OAC). No public URLs, no legacy OAI.
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "assets" {
  bucket        = "${var.environment}-vlc-frontend-assets"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket = aws_s3_bucket.assets.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.bucket
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# ---------------------------------------------------------------------------
# Origin Access Control (OAC) — replaces the legacy OAI approach.
#
# One OAC for the asset bucket; the listings bucket uses the same OAC via
# a separate CloudFront origin (see below).
# ---------------------------------------------------------------------------
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.environment}-vlc-frontend-oac"
  description                       = "OAC for VLC frontend assets and gold data (${var.environment})"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ---------------------------------------------------------------------------
# CloudFront cache policies
#
# Long TTL for static assets (HTML/JS/CSS/vendor) — these change only on
# deploy; a CloudFront invalidation clears them.
# Short TTL for gold/aggregations/* — the Lambda runs weekly; 1 h is short
# enough that a re-run is visible within the hour.
# ---------------------------------------------------------------------------
resource "aws_cloudfront_cache_policy" "assets_long_ttl" {
  name        = "${var.environment}-vlc-frontend-assets-cache"
  default_ttl = 86400
  max_ttl     = 604800
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

resource "aws_cloudfront_cache_policy" "data_short_ttl" {
  name        = "${var.environment}-vlc-frontend-data-cache"
  default_ttl = var.data_cache_ttl_seconds
  max_ttl     = var.data_cache_ttl_seconds
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

# ---------------------------------------------------------------------------
# CloudFront distribution
#
# Two origins:
#   1. Asset bucket (default) — serves index.html, app.js, vendor/plotly.min.js
#   2. Listings bucket (data) — serves gold/aggregations/*.json same-origin
#      so the browser never needs a CORS pre-flight.
#
# Custom error responses map 403/404 to /index.html so a stray path does not
# surface a raw S3 XML error page (review L1).
# ---------------------------------------------------------------------------
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100" # EU + North America only — cheapest tier
  aliases             = var.aliases

  # Origin 1 — private S3 asset bucket (default behaviour)
  origin {
    domain_name              = aws_s3_bucket.assets.bucket_regional_domain_name
    origin_id                = "asset-bucket"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # Origin 2 — listings bucket, scoped to gold/aggregations/*
  # CRITICAL: same-origin data avoids CORS entirely. The frontend fetches
  # /gold/aggregations/latest.json via the same CloudFront domain.
  origin {
    domain_name              = var.listings_bucket_regional_domain
    origin_id                = "data-bucket"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # Default behaviour — static assets, long TTL
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "asset-bucket"
    viewer_protocol_policy = "redirect-to-https"
    cache_policy_id        = aws_cloudfront_cache_policy.assets_long_ttl.id
  }

  # Data behaviour — gold aggregations, short TTL
  ordered_cache_behavior {
    path_pattern           = "/${var.gold_prefix}/*"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "data-bucket"
    viewer_protocol_policy = "redirect-to-https"
    cache_policy_id        = aws_cloudfront_cache_policy.data_short_ttl.id
  }

  # Data behaviour — pipeline health observer JSON, same short TTL policy as
  # gold aggregations (review H2: this prefix was previously not routed to
  # the data bucket at all, so the tab could never load its data).
  ordered_cache_behavior {
    path_pattern           = "/${var.pipeline_health_prefix}/*"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "data-bucket"
    viewer_protocol_policy = "redirect-to-https"
    cache_policy_id        = aws_cloudfront_cache_policy.data_short_ttl.id
  }

  # Map S3/OAC 403 and 404 to index.html so a stale/direct URL renders the
  # app rather than a raw S3 XML error (review L1).
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  viewer_certificate {
    acm_certificate_arn      = var.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}

# ---------------------------------------------------------------------------
# Bucket policies — grant CloudFront OAC read access to each bucket.
#
# CRITICAL: the policy must reference the distribution ARN, not a generic
# CloudFront service principal, so only THIS distribution can read the bucket.
# ---------------------------------------------------------------------------
resource "aws_s3_bucket_policy" "assets_oac" {
  bucket = aws_s3_bucket.assets.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontOAC"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.assets.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
          }
        }
      }
    ]
  })
}

resource "aws_s3_bucket_policy" "listings_oac" {
  bucket = var.listings_bucket_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontOACGold"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${var.listings_bucket_arn}/${var.gold_prefix}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
          }
        }
      },
      {
        # Review H2: grants CloudFront read access to the pipeline health
        # observer's output, alongside (not instead of) the existing gold
        # aggregations statement above.
        Sid    = "AllowCloudFrontOACPipelineHealth"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${var.listings_bucket_arn}/${var.pipeline_health_prefix}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
          }
        }
      }
    ]
  })
}
