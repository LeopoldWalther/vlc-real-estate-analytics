# ---------------------------------------------------------------------------
# Reference the existing hosted zone — it was created automatically when
# leopoldwalther.com was registered via Route 53. We NEVER manage the zone
# resource here; this is a read-only data source so a terraform destroy of
# this stack cannot touch the zone.
# ---------------------------------------------------------------------------
data "aws_route53_zone" "root" {
  name         = var.root_domain
  private_zone = false
}

# ---------------------------------------------------------------------------
# Wildcard ACM certificate — issued in us-east-1 (CloudFront requirement).
#
# *.leopoldwalther.com covers every subdomain (vlc-report, future projects).
# The apex (leopoldwalther.com) is listed as a Subject Alternative Name so
# a single cert covers both the root and all subdomains.
#
# lifecycle create_before_destroy ensures a cert rotation never leaves the
# CloudFront distribution without a valid cert.
# ---------------------------------------------------------------------------
resource "aws_acm_certificate" "wildcard" {
  provider = aws.us_east_1

  domain_name               = "*.${var.root_domain}"
  validation_method         = "DNS"
  subject_alternative_names = [var.root_domain]

  lifecycle {
    create_before_destroy = true
  }
}

# ---------------------------------------------------------------------------
# DNS validation records — written into the existing hosted zone.
#
# for_each over domain_validation_options ensures one record per unique
# CNAME needed by ACM (wildcard + apex often share the same CNAME).
# ---------------------------------------------------------------------------
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.wildcard.domain_validation_options :
    dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  zone_id = data.aws_route53_zone.root.zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.record]
  ttl     = 60

  allow_overwrite = true
}

# ---------------------------------------------------------------------------
# Certificate validation — waits until ACM confirms DNS propagation.
#
# Pinned to aws.us_east_1 so the waiter talks to the same region the cert
# was issued in.
# ---------------------------------------------------------------------------
resource "aws_acm_certificate_validation" "wildcard" {
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.wildcard.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}
