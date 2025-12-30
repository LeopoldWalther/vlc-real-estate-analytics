"""
Lambda function to collect Valencia real estate listings from Idealista API.

This function queries the Idealista API for both sale and rent listings,
stores the results in S3, and uses AWS Secrets Manager for API credentials.
"""

import base64
import json
import logging
import os
from datetime import datetime
from typing import Dict, Optional

import boto3
import requests
from botocore.exceptions import ClientError

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
s3_client = boto3.client("s3")
secrets_client = boto3.client("secretsmanager")

# Environment variables (validated in lambda_handler)
S3_BUCKET = os.environ.get("S3_BUCKET")
SECRET_NAME_LVW = os.environ.get("SECRET_NAME_LVW")
SECRET_NAME_PMV = os.environ.get("SECRET_NAME_PMV")
# AWS_REGION is automatically provided by Lambda runtime


class IdealistaAPIError(Exception):
    """Custom exception for Idealista API errors."""

    pass


class SearchConfig:
    """Configuration for Idealista API search parameters."""

    BASE_URL = "https://api.idealista.com/3.5/"
    COUNTRY = "es"

    def __init__(self):
        self.max_items = "50"
        self.order = "distance"
        self.center = "39.4693441,-0.379561"  # Valencia city center
        self.distance = "1500"  # meters
        self.property_type = "homes"
        self.sort = "asc"
        self.min_size = "100"
        self.max_size = "160"
        self.elevator = "true"
        self.air_conditioning = "true"
        self.preservation = "good"
        self.language = "en"

    def build_url(self, operation: str) -> str:
        """
        Build the search URL for the given operation.

        Args:
            operation: Either 'sale' or 'rent'

        Returns:
            Formatted URL string with placeholder for page number
        """
        return (
            f"{self.BASE_URL}{self.COUNTRY}/search"
            f"?operation={operation}"
            f"&maxItems={self.max_items}"
            f"&order={self.order}"
            f"&center={self.center}"
            f"&distance={self.distance}"
            f"&propertyType={self.property_type}"
            f"&sort={self.sort}"
            f"&minSize={self.min_size}"
            f"&maxSize={self.max_size}"
            f"&numPage=%s"
            f"&elevator={self.elevator}"
            # f"&airConditioning={self.air_conditioning}"
            f"&preservation={self.preservation}"
            f"&language={self.language}"
        )


def get_secret(secret_name: str) -> Dict[str, str]:
    """
    Retrieve secret from AWS Secrets Manager.

    Args:
        secret_name: Name of the secret to retrieve

    Returns:
        Dictionary containing the secret values

    Raises:
        IdealistaAPIError: If secret cannot be retrieved
    """
    try:
        response = secrets_client.get_secret_value(SecretId=secret_name)
        return json.loads(response["SecretString"])
    except ClientError as e:
        logger.error(f"Error retrieving secret {secret_name}: {e}")
        raise IdealistaAPIError(f"Failed to retrieve credentials: {e}")


def get_oauth_token(api_key: str, api_secret: str) -> str:
    """
    Obtain OAuth token from Idealista API.

    Args:
        api_key: Idealista API key
        api_secret: Idealista API secret

    Returns:
        OAuth access token

    Raises:
        IdealistaAPIError: If token cannot be obtained
    """
    try:
        message = f"{api_key}:{api_secret}"
        auth_header = "Basic " + base64.b64encode(message.encode("ascii")).decode(
            "ascii"
        )

        headers = {
            "Authorization": auth_header,
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        }
        params = {"grant_type": "client_credentials", "scope": "read"}

        response = requests.post(
            "https://api.idealista.com/oauth/token",
            headers=headers,
            params=params,
            timeout=30,
        )
        response.raise_for_status()

        return response.json()["access_token"]
    except (requests.RequestException, KeyError) as e:
        logger.error(f"Error obtaining OAuth token: {e}")
        raise IdealistaAPIError(f"Failed to obtain OAuth token: {e}")


def query_api(api_key: str, api_secret: str, url: str) -> str:
    """
    Query the Idealista API with the given URL.

    Args:
        api_key: Idealista API key
        api_secret: Idealista API secret
        url: Complete URL to query

    Returns:
        JSON response as string

    Raises:
        IdealistaAPIError: If API query fails
    """
    try:
        token = get_oauth_token(api_key, api_secret)
        headers = {
            "Content-Type": "Content-Type: multipart/form-data;",
            "Authorization": f"Bearer {token}",
        }

        response = requests.post(url, headers=headers, timeout=30)
        response.raise_for_status()

        if not response.text:
            raise IdealistaAPIError(
                "Empty response from API - may have exceeded rate limit"
            )

        return response.text
    except requests.RequestException as e:
        logger.error(f"Error querying API: {e}")
        raise IdealistaAPIError(f"Failed to query API: {e}")


def upload_to_s3(bucket: str, key: str, data: str) -> None:
    """
    Upload data to S3 bucket.

    Args:
        bucket: S3 bucket name
        key: S3 object key
        data: Data to upload as string

    Raises:
        IdealistaAPIError: If upload fails
    """
    try:
        s3_client.put_object(
            Bucket=bucket, Key=key, Body=data, ContentType="application/json"
        )
        logger.info(f"Successfully uploaded {key} to {bucket}")
    except ClientError as e:
        logger.error(f"Error uploading to S3: {e}")
        raise IdealistaAPIError(f"Failed to upload to S3: {e}")


def process_operation(
    operation: str,
    api_key: str,
    api_secret: str,
    bucket: str,
    timestamp: str,
    max_pages: Optional[int] = None,
) -> int:
    """
    Process a single operation (sale or rent) by querying all pages and uploading to S3.

    Args:
        operation: Either 'sale' or 'rent'
        api_key: Idealista API key
        api_secret: Idealista API secret
        bucket: S3 bucket name
        timestamp: Timestamp string for filenames
        max_pages: Maximum number of pages to process (for testing). None = all pages

    Returns:
        Number of pages processed

    Raises:
        IdealistaAPIError: If processing fails
    """
    config = SearchConfig()
    url_template = config.build_url(operation)

    page = 1
    total_pages = 1  # Will be updated from first API response

    while page <= total_pages:
        # Stop if we've reached the test limit
        if max_pages is not None and page > max_pages:
            logger.info(f"Reached max_pages limit ({max_pages}), stopping")
            break

        url = url_template % page
        logger.info(f"Processing {operation} page {page}/{total_pages}")

        try:
            response_json = query_api(api_key, api_secret, url)
            response_data = json.loads(response_json)

            # Update total pages from API response
            total_pages = response_data.get("totalPages", total_pages)

            # Upload to S3
            filename = f"{operation}_{timestamp}_{page}.json"
            upload_to_s3(bucket, filename, response_json)

            page += 1
        except json.JSONDecodeError as e:
            logger.error(
                f"Error parsing JSON response for {operation} page {page}: {e}"
            )
            raise IdealistaAPIError(f"Invalid JSON response: {e}")

    logger.info(f"Completed {operation} operation: {total_pages} pages written to S3")
    return total_pages


def lambda_handler(event, context) -> Dict:
    """
    AWS Lambda handler function.

    Args:
        event: Lambda event object (supports 'test_mode': true to limit to 1 page)
        context: Lambda context object

    Returns:
        Response dictionary with status code and message
    """
    try:
        # Check for test mode
        test_mode = event.get("test_mode", False) if isinstance(event, dict) else False
        max_pages = 1 if test_mode else None

        if test_mode:
            logger.info("Running in TEST MODE - will only process 1 page per operation")

        # Validate environment variables
        if not all([S3_BUCKET, SECRET_NAME_LVW, SECRET_NAME_PMV]):
            raise IdealistaAPIError(
                "Missing required environment variables: S3_BUCKET, SECRET_NAME_LVW, SECRET_NAME_PMV"
            )

        # Type assertions for mypy
        assert S3_BUCKET is not None
        assert SECRET_NAME_LVW is not None
        assert SECRET_NAME_PMV is not None

        # Generate timestamp for filenames
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        # Retrieve credentials from Secrets Manager
        logger.info("Retrieving credentials from Secrets Manager")
        credentials_lvw = get_secret(SECRET_NAME_LVW)
        credentials_pmv = get_secret(SECRET_NAME_PMV)

        # Process sale listings (using lvw credentials)
        logger.info("Processing sale listings")
        sale_pages = process_operation(
            operation="sale",
            api_key=credentials_lvw["api_key"],
            api_secret=credentials_lvw["api_secret"],
            bucket=S3_BUCKET,
            timestamp=timestamp,
            max_pages=max_pages,
        )

        # Process rent listings (using pmv credentials)
        logger.info("Processing rent listings")
        rent_pages = process_operation(
            operation="rent",
            api_key=credentials_pmv["api_key"],
            api_secret=credentials_pmv["api_secret"],
            bucket=S3_BUCKET,
            timestamp=timestamp,
            max_pages=max_pages,
        )

        message = (
            f"Successfully collected listings: "
            f"{sale_pages} sale pages, {rent_pages} rent pages"
        )
        logger.info(message)

        return {
            "statusCode": 200,
            "body": json.dumps(
                {
                    "message": message,
                    "timestamp": timestamp,
                    "sale_pages": sale_pages,
                    "rent_pages": rent_pages,
                }
            ),
        }

    except IdealistaAPIError as e:
        logger.error(f"Idealista API error: {e}")
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": f"Unexpected error: {str(e)}"}),
        }
