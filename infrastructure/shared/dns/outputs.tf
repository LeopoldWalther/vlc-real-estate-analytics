output "zone_id" {
  description = "Route 53 hosted zone ID for leopoldwalther.com. Consumed by downstream stacks via terraform_remote_state to create subdomain alias records."
  value       = data.aws_route53_zone.root.zone_id
}

output "certificate_arn" {
  description = "ARN of the validated *.leopoldwalther.com ACM certificate (us-east-1). Passed to CloudFront distributions as the viewer certificate."
  value       = aws_acm_certificate_validation.wildcard.certificate_arn
}
