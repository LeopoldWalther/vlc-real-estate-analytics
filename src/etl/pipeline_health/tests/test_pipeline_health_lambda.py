"""
Tests for the pipeline health Lambda handler (FEATURE-012, task 12.8).

RED first: these assertions fail until ``pipeline_health_lambda`` exists.
Asserts the Factory wiring — boto3 clients (Logs, CloudWatch, Cost
Explorer, S3) are constructed only at the edge (inside
``build_aggregator``/``lambda_handler``, never inside the aggregator or
check classes), with Cost Explorer explicitly pinned to ``us-east-1``.
"""

from __future__ import annotations

import os
import sys
from typing import Dict
from unittest.mock import patch

import boto3
import pytest
from moto import mock_aws

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from pipeline_health_lambda import (  # noqa: E402
    COST_EXPLORER_REGION,
    build_aggregator,
    lambda_handler,
)

BUCKET = "test-health-bucket"
ENV: Dict[str, str] = {
    "S3_BUCKET": BUCKET,
    "PIPELINE_FUNCTION_NAMES": "bronze-collector,silver-cleaner,gold-aggregator",
}


class TestBuildAggregatorFactory:
    def test_constructs_ce_client_with_us_east_1_region(self) -> None:
        with patch("boto3.client", wraps=boto3.client) as mock_client:
            with mock_aws(), patch.dict(os.environ, ENV, clear=False):
                build_aggregator(ENV)

                ce_calls = [
                    call
                    for call in mock_client.call_args_list
                    if call.args[:1] == ("ce",)
                ]
                assert ce_calls, "boto3.client('ce', ...) was never called"
                assert ce_calls[0].kwargs.get("region_name") == COST_EXPLORER_REGION
                assert COST_EXPLORER_REGION == "us-east-1"

    def test_constructs_logs_cloudwatch_and_s3_clients(self) -> None:
        with patch("boto3.client", wraps=boto3.client) as mock_client:
            with mock_aws(), patch.dict(os.environ, ENV, clear=False):
                build_aggregator(ENV)

                called_services = {call.args[0] for call in mock_client.call_args_list}
                assert {"logs", "cloudwatch", "ce", "s3"}.issubset(called_services)

    def test_missing_s3_bucket_raises_value_error(self) -> None:
        with pytest.raises(ValueError):
            build_aggregator({"PIPELINE_FUNCTION_NAMES": "a,b,c"})

    def test_missing_function_names_raises_value_error(self) -> None:
        with pytest.raises(ValueError):
            build_aggregator({"S3_BUCKET": BUCKET})


class TestLambdaHandler:
    def test_handler_returns_success_when_aggregation_succeeds(self) -> None:
        with mock_aws():
            s3_client = boto3.client("s3", region_name="eu-central-1")
            s3_client.create_bucket(
                Bucket=BUCKET,
                CreateBucketConfiguration={"LocationConstraint": "eu-central-1"},
            )

            with patch.dict(os.environ, ENV, clear=False):
                response = lambda_handler({}, None)

            assert response["statusCode"] == 200
            assert response["key"] == "gold/pipeline_health/latest.json"
            assert response["bytes"] > 0
            assert response["overall_status"] in ("green", "yellow", "red")

    def test_handler_writes_schema_v1_1_document_with_new_fields(self) -> None:
        """FEATURE-013 task 13.4: end-to-end schema v1.1 wiring."""
        import json

        with mock_aws():
            s3_client = boto3.client("s3", region_name="eu-central-1")
            s3_client.create_bucket(
                Bucket=BUCKET,
                CreateBucketConfiguration={"LocationConstraint": "eu-central-1"},
            )

            with patch.dict(os.environ, ENV, clear=False):
                lambda_handler({}, None)

            body = s3_client.get_object(
                Bucket=BUCKET, Key="gold/pipeline_health/latest.json"
            )["Body"].read()
            document = json.loads(body)

            assert document["schema_version"] == "1.1"
            # Under moto, execution/cost checks degrade to a synthetic error
            # result (Logs Insights / Cost Explorer aren't implemented by
            # moto) — this test only asserts the schema-version wiring, not
            # the check math itself (covered by the unit tests above).
            for key in (
                "execution_success",
                "execution_duration",
                "api_quota",
                "aws_cost",
            ):
                assert key in document
                assert "details" in document[key]
