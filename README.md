# VLC Real Estate Analytics

A comprehensive real estate analytics platform built with Flask and AWS infrastructure managed through Terraform.

## Project Overview

This project provides real estate market insights, property analysis, and analytics dashboards for the Valencia (VLC) region.

### Key Features

- **Web Dashboard** - Interactive analytics and property data visualization
- **Real Estate Data** - Comprehensive property database and market analysis
- **REST API** - RESTful endpoints for data access
- **Scalable Infrastructure** - AWS-based cloud infrastructure with auto-scaling
- **Multi-Environment** - Dev, staging, and production environments

## Technology Stack

### Application
- **Framework**: Flask (Python)
- **Database**: PostgreSQL/MySQL (via RDS)
- **Frontend**: HTML, CSS, JavaScript (served via CloudFront)
- **Container**: Docker
- **Deployment**: AWS ECS Fargate

### Infrastructure
- **IaC Tool**: Terraform
- **Cloud Provider**: AWS
- **Compute**: ECS Fargate (serverless containers)
- **Networking**: VPC, ALB, NAT Gateway
- **Database**: RDS Multi-AZ
- **Storage**: S3, CloudFront
- **State Management**: S3

## Project Structure

```
vlc-real-estate-analytics/
├── app/                                # Flask application
│   ├── main.py                        # Application entry point
│   ├── requirements.txt               # Python dependencies
│   ├── Dockerfile                     # Container image definition
│   ├── config.py                      # Flask configuration
│   ├── models/                        # Database models
│   ├── routes/                        # API routes
│   ├── templates/                     # HTML templates
│   ├── static/                        # CSS, JS, images
│   └── tests/                         # Unit tests
│
├── infrastructure/                     # Terraform configuration
│   ├── bootstrap/                     # Remote state setup
│   ├── modules/                       # Reusable Terraform modules
│   ├── environments/                  # Environment-specific configs
│   │   ├── dev/
│   │   ├── staging/
│   │   └── prod/
│   └── README.md                      # Infrastructure documentation
│
├── .github/
│   └── workflows/                     # CI/CD pipelines
│       ├── terraform.yml              # Infrastructure deployment
│       └── deploy.yml                 # Application deployment
│
├── .gitignore                         # Git ignore rules
├── LICENSE                            # License file
└── README.md                          # This file
```

## Getting Started

### Prerequisites

1. **AWS Account** with appropriate permissions
2. **Python 3.9+** for local development
3. **Docker** for containerization
4. **Terraform 1.0+** for infrastructure
5. **Git** for version control

### Local Development Setup

```bash
# Clone the repository
git clone https://github.com/LeopoldWalther/vlc-real-estate-analytics.git
cd vlc-real-estate-analytics

# Create Python virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
cd app
pip install -r requirements.txt

# Set environment variables
cp .env.example .env
# Edit .env with your configuration

# Run Flask development server
python main.py
```

Visit http://localhost:5000 in your browser.

### Infrastructure Deployment

See [infrastructure/README.md](infrastructure/README.md) for detailed infrastructure setup and deployment instructions.

Quick start:
```bash
# Setup remote state (one-time)
cd infrastructure/bootstrap
terraform apply

# Deploy dev environment
cd ../environments/dev
terraform init
terraform apply
```

## Configuration

### Application Configuration

Environment variables (`.env` file):
```
FLASK_ENV=development
DATABASE_URL=postgresql://user:password@host/dbname
AWS_REGION=eu-central-1
S3_BUCKET=vlc-analytics-bucket
SECRET_KEY=your-secret-key
```

### Terraform Variables

Each environment has `terraform.tfvars`:
```hcl
aws_region      = "eu-central-1"
environment     = "dev"
app_name        = "vlc-real-estate-analytics"
container_port  = 5000
desired_count   = 2
```

## Deployment

### Development

```bash
# Using local Flask
cd app
python main.py

# Or using Docker
docker build -t vlc-analytics:latest .
docker run -p 5000:5000 vlc-analytics:latest
```

### Staging & Production

Deployment is automated via GitHub Actions CI/CD pipelines:

1. Push to repository
2. Tests run automatically
3. Docker image built and pushed to ECR
4. Terraform validates infrastructure changes
5. On approval, infrastructure and application deployed to AWS

## Architecture Diagram

See [infrastructure/README.md](infrastructure/README.md) for detailed architecture documentation.

## Testing

### Unit Tests
```bash
cd app
pytest tests/
```

### Infrastructure Testing
```bash
cd infrastructure/environments/dev
terraform validate
terraform plan
```

## CI/CD Pipeline

GitHub Actions workflows:
- **On PR**: Run tests, validate Terraform
- **On Merge to Main**: Deploy to dev environment
- **Manual Approval**: Deploy to staging/production

See `.github/workflows/` for details.

## Database Management

### Migrations
```bash
# Using Flask-Migrate (if configured)
flask db upgrade
flask db downgrade
```

### Backups
RDS automatic backups are configured in Terraform:
- Backup retention: 30 days
- Multi-AZ enabled for high availability
- Point-in-time recovery enabled

## Monitoring & Logging

CloudWatch monitoring includes:
- Container logs (ECS)
- Database performance (RDS Enhanced Monitoring)
- ALB request logs
- Application error tracking

Access logs in AWS CloudWatch:
```bash
aws logs tail /ecs/vlc-analytics --follow
```

## Security

- **SSL/TLS**: HTTPS enforced via ALB
- **Database**: Encrypted at rest and in transit
- **Secrets**: Managed via AWS Secrets Manager
- **IAM**: Least privilege access policies
- **VPC**: Private subnets for database and containers
- **Security Groups**: Restricted ingress/egress rules

## Cost Optimization

- **ECS Fargate**: Pay-per-use pricing
- **RDS**: Reserved instances in production
- **S3**: Lifecycle policies for log archival
- **CloudFront**: CDN for static assets

## Troubleshooting

### Application Issues
- Check ECS task logs: `aws logs tail /ecs/vlc-analytics --follow`
- Check ALB health: AWS Console → EC2 → Target Groups
- Database connection: Verify security groups and RDS endpoint

### Infrastructure Issues
- Terraform state lock: `terraform force-unlock <LOCK_ID>`
- Credentials: `aws sts get-caller-identity`
- Plan drift: `terraform refresh && terraform plan`

See [infrastructure/README.md](infrastructure/README.md) for more troubleshooting.

## Contributing

1. Create feature branch: `git checkout -b feature/my-feature`
2. Make changes and commit: `git commit -am 'Add feature'`
3. Push to branch: `git push origin feature/my-feature`
4. Create Pull Request
5. Wait for CI/CD checks to pass
6. Get approval and merge

## Performance Optimization

- Flask caching with Redis (optional add-on)
- Database query optimization and indexing
- CloudFront caching for static assets
- ECS container auto-scaling based on CPU/memory
- RDS read replicas for reporting queries

## License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details.

## Contact

For questions or support, please open an issue on GitHub or contact the development team.

---

**Last Updated**: December 26, 2025
