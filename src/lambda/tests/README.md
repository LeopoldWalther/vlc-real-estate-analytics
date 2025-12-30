# Tests for Idealista Listings Collector

This directory contains unit and integration tests for the Lambda function.

## Running Tests

### Install Dependencies

```bash
pip install -r requirements-dev.txt
```

### Run All Tests

```bash
pytest tests/
```

### Run with Coverage

```bash
pytest tests/ --cov=. --cov-report=html
```

### Run Specific Test

```bash
pytest tests/test_idealista_collector.py::TestSearchConfig::test_build_url_sale
```

## Test Structure

- `test_idealista_collector.py` - Main test suite covering:
  - SearchConfig class
  - Secret retrieval from Secrets Manager
  - OAuth token generation
  - API querying
  - Operation processing (pagination)
  - Lambda handler (test mode and normal mode)

## Mocking

Tests use `moto` to mock AWS services (S3, Secrets Manager) and `unittest.mock` for requests library.

## CI/CD Integration

Tests are automatically run in GitHub Actions on:
- Pull requests
- Pushes to main branch
