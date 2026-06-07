variable "root_domain" {
  type        = string
  description = "Root domain registered in Route 53. The hosted zone must already exist."
  default     = "leopoldwalther.com"
}
