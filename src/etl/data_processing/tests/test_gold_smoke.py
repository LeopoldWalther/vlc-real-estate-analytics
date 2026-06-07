"""
Gated smoke test for the gold aggregation Lambda.

This test is **skipped by default** and only runs when the environment variable
``RUN_S3_IT=1`` is set.  It requires:

- Valid AWS credentials with read access to the dev S3 bucket
- The gold Lambda already deployed to dev (``dev-gold-aggregator``)
- Silver Parquet history present in ``dev-vlc-real-estate-analytics-listings``

Usage::

    RUN_S3_IT=1 pytest tests/test_gold_smoke.py -v

The test invokes the gold Lambda synchronously via boto3, then reads
``gold/aggregations/latest.json`` from S3 and validates it against the
frozen schema v1.0 contract.

This test is intentionally **not part of the standard CI suite** — it runs
against real AWS resources and should only be executed manually after
deploying to dev.
"""

from __future__ import annotations

import json
import os

import boto3
import pytest

# ---------------------------------------------------------------------------
# Gating: skip unless RUN_S3_IT=1 is set
# ---------------------------------------------------------------------------

_RUN_IT = os.environ.get("RUN_S3_IT", "").strip() == "1"

pytestmark = pytest.mark.skipif(
    not _RUN_IT,
    reason="Skipped by default. Set RUN_S3_IT=1 to run against the real dev bucket.",
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

FUNCTION_NAME = "dev-gold-aggregator"
BUCKET = "dev-vlc-real-estate-analytics-listings"
GOLD_KEY = "gold/aggregations/latest.json"
AWS_REGION = "eu-central-1"

# All top-level keys required by the frozen schema v1.0.
_SCHEMA_V1_KEYS = {
    "schema_version",
    "generated_at",
    "scope_districts",
    "min_count",
    "relevant_filter",
    "general",
    "relevant",
}

# Required keys in each population block.
_GENERAL_BLOCK_KEYS = {
    "price_time_series_neighborhood",
    "price_time_series_district",
    "rent_vs_sale_ratio",
    "rent_vs_sale_ratio_time_series",
    "boxplot_by_neighborhood",
}

_RELEVANT_BLOCK_KEYS = {
    "rent_vs_sale_ratio",
    "rent_vs_sale_ratio_time_series",
    "boxplot_by_neighborhood",
}


# ---------------------------------------------------------------------------
# Smoke test
# ---------------------------------------------------------------------------


class TestGoldLambdaSmoke:
    """End-to-end smoke test: invoke gold Lambda, validate latest.json on S3."""

    def test_gold_lambda_invocation_succeeds(self) -> None:
        """
        Invoke the gold Lambda synchronously and assert it returns statusCode 200.

        Validates that the Lambda is deployed, has correct IAM permissions, and
        can read the silver history and write gold/aggregations/latest.json.
        """
        lambda_client = boto3.client("lambda", region_name=AWS_REGION)

        response = lambda_client.invoke(
            FunctionName=FUNCTION_NAME,
            InvocationType="RequestResponse",
            Payload=b"{}",
        )

        # The Lambda must not have errored at the invocation level.
        assert (
            response["StatusCode"] == 200
        ), f"Lambda invocation failed with status {response['StatusCode']}"

        # Parse the function result payload.
        result_payload = json.loads(response["Payload"].read().decode("utf-8"))

        # Check for Lambda-level errors (unhandled exceptions).
        assert "FunctionError" not in response, (
            f"Lambda raised an unhandled error: {response.get('FunctionError')}. "
            f"Payload: {result_payload}"
        )

        assert (
            result_payload.get("statusCode") == 200
        ), f"Lambda handler returned unexpected statusCode: {result_payload}"
        assert (
            result_payload.get("key") == GOLD_KEY
        ), f"Lambda wrote to unexpected key: {result_payload.get('key')!r}"

    def test_gold_latest_json_exists_on_s3(self) -> None:
        """
        After invocation, gold/aggregations/latest.json must exist in the dev S3 bucket.
        """
        s3_client = boto3.client("s3", region_name=AWS_REGION)

        response = s3_client.get_object(Bucket=BUCKET, Key=GOLD_KEY)
        assert response["ContentLength"] > 0, "latest.json is empty"

    def test_gold_latest_json_validates_schema_v1(self) -> None:
        """
        The written latest.json must contain all top-level keys required by
        schema v1.0 and the correct schema_version value.

        FEATURE-005 depends on this exact shape — this smoke test guards against
        silent contract regressions after deployments.
        """
        s3_client = boto3.client("s3", region_name=AWS_REGION)
        obj = s3_client.get_object(Bucket=BUCKET, Key=GOLD_KEY)
        payload = json.loads(obj["Body"].read().decode("utf-8"))

        # Top-level schema v1.0 keys must all be present.
        missing_top = _SCHEMA_V1_KEYS - payload.keys()
        assert not missing_top, f"Missing top-level keys: {missing_top}"

        assert (
            payload["schema_version"] == "1.0"
        ), f"Unexpected schema_version: {payload['schema_version']!r}"

        # Population blocks must have the expected dataset keys.
        missing_general = _GENERAL_BLOCK_KEYS - payload["general"].keys()
        assert not missing_general, f"Missing keys in general block: {missing_general}"

        missing_relevant = _RELEVANT_BLOCK_KEYS - payload["relevant"].keys()
        assert (
            not missing_relevant
        ), f"Missing keys in relevant block: {missing_relevant}"

        # With real silver history, the general block must have at least some data.
        assert len(payload["general"]["price_time_series_neighborhood"]) > 0, (
            "general.price_time_series_neighborhood is empty — "
            "silver history may not have been loaded correctly"
        )
