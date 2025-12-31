"""
Tests for Idealista listings collector Lambda function.

Run with: pytest tests/
"""

import json
import os
import sys
from unittest.mock import Mock, patch

import pytest
from botocore.exceptions import ClientError

# Import the Lambda function
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from idealista_listings_collector import (  # noqa: E402
    IdealistaAPIError,
    SearchConfig,
    get_oauth_token,
    get_secret,
    lambda_handler,
    process_operation,
    query_api,
)


@pytest.fixture
def mock_env_vars():
    """Set up environment variables for testing."""
    with patch.dict(
        os.environ,
        {
            "S3_BUCKET": "test-bucket",
            "S3_PREFIX": "bronze/idealista/",
            "SECRET_NAME_LVW": "test-secret-lvw",
            "SECRET_NAME_PMV": "test-secret-pmv",
        },
    ):
        yield


@pytest.fixture
def mock_aws_clients():
    """Mock AWS service clients."""
    with patch("idealista_listings_collector.s3_client") as mock_s3, patch(
        "idealista_listings_collector.secrets_client"
    ) as mock_secrets:
        yield mock_s3, mock_secrets


class TestSearchConfig:
    """Tests for SearchConfig class."""

    def test_search_config_initialization(self):
        """Test SearchConfig initializes with correct default values."""
        config = SearchConfig()
        assert config.max_items == "50"
        assert config.order == "distance"
        assert config.center == "39.4693441,-0.379561"
        assert config.distance == "1500"

    def test_build_url_sale(self):
        """Test URL building for sale operation."""
        config = SearchConfig()
        url = config.build_url("sale")
        assert "operation=sale" in url
        assert "maxItems=50" in url
        assert "center=39.4693441,-0.379561" in url
        assert "numPage=%s" in url

    def test_build_url_rent(self):
        """Test URL building for rent operation."""
        config = SearchConfig()
        url = config.build_url("rent")
        assert "operation=rent" in url


class TestGetSecret:
    """Tests for get_secret function."""

    def test_get_secret_success(self, mock_aws_clients):
        """Test successful secret retrieval."""
        _, mock_secrets = mock_aws_clients

        secret_data = {"api_key": "test-key", "api_secret": "test-secret"}
        mock_secrets.get_secret_value.return_value = {
            "SecretString": json.dumps(secret_data)
        }

        result = get_secret("test-secret-name")
        assert result == secret_data
        mock_secrets.get_secret_value.assert_called_once_with(
            SecretId="test-secret-name"
        )

    def test_get_secret_failure(self, mock_aws_clients):
        """Test secret retrieval failure."""
        _, mock_secrets = mock_aws_clients

        mock_secrets.get_secret_value.side_effect = ClientError(
            {"Error": {"Code": "ResourceNotFoundException"}}, "GetSecretValue"
        )

        with pytest.raises(IdealistaAPIError):
            get_secret("nonexistent-secret")


class TestGetOAuthToken:
    """Tests for get_oauth_token function."""

    @patch("idealista_listings_collector.requests.post")
    def test_get_oauth_token_success(self, mock_post):
        """Test successful OAuth token retrieval."""
        mock_response = Mock()
        mock_response.json.return_value = {"access_token": "test-token-123"}
        mock_response.raise_for_status = Mock()
        mock_post.return_value = mock_response

        token = get_oauth_token("test-key", "test-secret")
        assert token == "test-token-123"
        assert mock_post.called

    @patch("idealista_listings_collector.requests.post")
    def test_get_oauth_token_failure(self, mock_post):
        """Test OAuth token retrieval failure."""
        from requests.exceptions import RequestException

        mock_post.side_effect = RequestException("Network error")

        with pytest.raises(IdealistaAPIError):
            get_oauth_token("test-key", "test-secret")


class TestQueryAPI:
    """Tests for query_api function."""

    @patch("idealista_listings_collector.get_oauth_token")
    @patch("idealista_listings_collector.requests.post")
    def test_query_api_success(self, mock_post, mock_get_token):
        """Test successful API query."""
        mock_get_token.return_value = "test-token"

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = '{"elementList": [{"propertyCode": "123"}]}'
        mock_response.raise_for_status = Mock(return_value=None)
        mock_post.return_value = mock_response

        result = query_api("test-key", "test-secret", "https://test-url.com")
        assert '"elementList"' in result
        assert '"propertyCode"' in result

    @patch("idealista_listings_collector.get_oauth_token")
    @patch("idealista_listings_collector.requests.get")
    def test_query_api_failure(self, mock_get, mock_get_token):
        """Test API query failure."""
        mock_get_token.return_value = "test-token"
        mock_get.side_effect = Exception("API error")

        with pytest.raises(IdealistaAPIError):
            query_api("test-key", "test-secret", "https://test-url.com")


class TestProcessOperation:
    """Tests for process_operation function."""

    @patch("idealista_listings_collector.query_api")
    def test_process_operation_test_mode(
        self, mock_query, mock_env_vars, mock_aws_clients
    ):
        """Test process_operation in test mode (max_pages=1)."""
        mock_s3, _ = mock_aws_clients

        # Mock API response with total pages > 1
        api_response = {
            "total": 100,
            "totalPages": 5,
            "elementList": [{"propertyCode": "123"}],
        }
        mock_query.return_value = json.dumps(api_response)

        result = process_operation(
            operation="sale",
            api_key="test-key",
            api_secret="test-secret",
            bucket="test-bucket",
            timestamp="20250101_120000",
            max_pages=1,
        )

        # Should only process 1 page
        assert mock_query.call_count == 1
        assert result == 1
        assert mock_s3.put_object.call_count == 1

    @patch("idealista_listings_collector.query_api")
    def test_process_operation_multiple_pages(
        self, mock_query, mock_env_vars, mock_aws_clients
    ):
        """Test process_operation with multiple pages."""
        mock_s3, _ = mock_aws_clients

        # Mock API response
        api_response = {
            "total": 150,
            "totalPages": 3,
            "elementList": [{"propertyCode": "123"}],
        }
        mock_query.return_value = json.dumps(api_response)

        result = process_operation(
            operation="sale",
            api_key="test-key",
            api_secret="test-secret",
            bucket="test-bucket",
            timestamp="20250101_120000",
        )

        # Should process all 3 pages
        assert mock_query.call_count == 3
        assert result == 3
        assert mock_s3.put_object.call_count == 3


class TestLambdaHandler:
    """Tests for lambda_handler function."""

    @patch("idealista_listings_collector.process_operation")
    @patch("idealista_listings_collector.get_secret")
    def test_lambda_handler_test_mode(
        self, mock_get_secret, mock_process, mock_env_vars
    ):
        """Test lambda_handler in test mode."""
        with patch.dict(
            os.environ,
            {
                "S3_BUCKET": "test-bucket",
                "SECRET_NAME_LVW": "test-secret-lvw",
                "SECRET_NAME_PMV": "test-secret-pmv",
            },
        ), patch("idealista_listings_collector.S3_BUCKET", "test-bucket"), patch(
            "idealista_listings_collector.SECRET_NAME_LVW", "test-secret-lvw"
        ), patch(
            "idealista_listings_collector.SECRET_NAME_PMV", "test-secret-pmv"
        ):
            mock_get_secret.return_value = {"api_key": "key", "api_secret": "secret"}
            mock_process.return_value = 1

            event = {"test_mode": True}
            context = {}

            response = lambda_handler(event, context)

            assert response["statusCode"] == 200
            body = json.loads(response["body"])
            assert "message" in body
            assert "sale_pages" in body
            assert "rent_pages" in body

    @patch("idealista_listings_collector.process_operation")
    @patch("idealista_listings_collector.get_secret")
    def test_lambda_handler_normal_mode(
        self, mock_get_secret, mock_process, mock_env_vars
    ):
        """Test lambda_handler in normal mode."""
        with patch.dict(
            os.environ,
            {
                "S3_BUCKET": "test-bucket",
                "SECRET_NAME_LVW": "test-secret-lvw",
                "SECRET_NAME_PMV": "test-secret-pmv",
            },
        ), patch("idealista_listings_collector.S3_BUCKET", "test-bucket"), patch(
            "idealista_listings_collector.SECRET_NAME_LVW", "test-secret-lvw"
        ), patch(
            "idealista_listings_collector.SECRET_NAME_PMV", "test-secret-pmv"
        ):
            mock_get_secret.return_value = {"api_key": "key", "api_secret": "secret"}
            mock_process.return_value = 5

            event = {}
            context = {}

            response = lambda_handler(event, context)

            assert response["statusCode"] == 200
            body = json.loads(response["body"])
            assert "message" in body
            assert body["sale_pages"] == 5
            assert body["rent_pages"] == 5

    def test_lambda_handler_error(self, mock_env_vars):
        """Test lambda_handler error handling."""
        with patch.dict(
            os.environ,
            {
                "S3_BUCKET": "test-bucket",
                "SECRET_NAME_LVW": "test-secret-lvw",
                "SECRET_NAME_PMV": "test-secret-pmv",
            },
        ):
            with patch("idealista_listings_collector.get_secret") as mock_get_secret:
                mock_get_secret.side_effect = Exception("Test error")

                event = {}
                context = {}

                response = lambda_handler(event, context)

                assert response["statusCode"] == 500
                body = json.loads(response["body"])
                assert "error" in body
