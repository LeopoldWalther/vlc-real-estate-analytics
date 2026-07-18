"""
Tests for the PipelineHealthAggregator (FEATURE-012, task 12.8).

RED first: these assertions fail until ``PipelineHealthAggregator``
exists in ``pipeline_health.pipeline_health_aggregator``. Uses moto for
the S3 write via ``ObjectStore``, and simple test doubles implementing
the ``HealthCheck`` Protocol for the 4 injected checks.
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any, Dict

import boto3
from moto import mock_aws

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from common.object_store import InMemoryObjectStore, S3ObjectStore  # noqa: E402
from health_checks import GREEN, RED, YELLOW, HealthCheckResult  # noqa: E402
from pipeline_health_aggregator import (  # noqa: E402
    OUTPUT_KEY,
    PipelineHealthAggregator,
)

BUCKET = "test-health-bucket"


class _FakeCheck:
    """Simple HealthCheck test double returning a fixed result."""

    def __init__(
        self, status: str, summary: str = "fake", details: Dict[str, Any] | None = None
    ) -> None:
        self._status = status
        self._summary = summary
        self._details = details or {}

    def evaluate(self) -> HealthCheckResult:
        return HealthCheckResult(
            status=self._status, summary=self._summary, details=self._details
        )


class _RaisingCheck:
    """HealthCheck test double that always raises — must not break others."""

    def evaluate(self) -> HealthCheckResult:
        raise RuntimeError("boom")


def _build_aggregator(store, statuses: Dict[str, str]) -> PipelineHealthAggregator:
    return PipelineHealthAggregator(
        object_store=store,
        execution_success_check=_FakeCheck(statuses["execution_success"]),
        execution_duration_check=_FakeCheck(statuses["execution_duration"]),
        api_quota_check=_FakeCheck(statuses["api_quota"]),
        aws_cost_check=_FakeCheck(statuses["aws_cost"]),
    )


class TestPipelineHealthAggregator:
    def test_writes_json_with_content_type_application_json(self) -> None:
        store = InMemoryObjectStore()
        aggregator = _build_aggregator(
            store,
            {
                "execution_success": GREEN,
                "execution_duration": GREEN,
                "api_quota": GREEN,
                "aws_cost": GREEN,
            },
        )

        result = aggregator.aggregate()

        assert result.key == OUTPUT_KEY
        assert store.exists(OUTPUT_KEY)
        assert store.content_type_of(OUTPUT_KEY) == "application/json"

    def test_document_includes_schema_version_generated_at_and_four_checks(
        self,
    ) -> None:
        store = InMemoryObjectStore()
        aggregator = _build_aggregator(
            store,
            {
                "execution_success": GREEN,
                "execution_duration": YELLOW,
                "api_quota": GREEN,
                "aws_cost": GREEN,
            },
        )

        aggregator.aggregate()
        document = json.loads(store.get_bytes(OUTPUT_KEY))

        assert document["schema_version"] == "1.0"
        assert "generated_at" in document
        assert document["overall_status"] == YELLOW
        for key in ("execution_success", "execution_duration", "api_quota", "aws_cost"):
            assert key in document
            assert document[key]["status"] in (GREEN, YELLOW, RED)
            assert "summary" in document[key]
            assert "details" in document[key]

    def test_overall_status_is_worst_of_the_four_checks(self) -> None:
        store = InMemoryObjectStore()
        aggregator = _build_aggregator(
            store,
            {
                "execution_success": GREEN,
                "execution_duration": GREEN,
                "api_quota": RED,
                "aws_cost": YELLOW,
            },
        )

        aggregator.aggregate()
        document = json.loads(store.get_bytes(OUTPUT_KEY))

        assert document["overall_status"] == RED

    def test_one_failing_check_does_not_prevent_others_from_running(self) -> None:
        store = InMemoryObjectStore()
        aggregator = PipelineHealthAggregator(
            object_store=store,
            execution_success_check=_RaisingCheck(),
            execution_duration_check=_FakeCheck(GREEN),
            api_quota_check=_FakeCheck(GREEN),
            aws_cost_check=_FakeCheck(GREEN),
        )

        result = aggregator.aggregate()
        document = json.loads(store.get_bytes(OUTPUT_KEY))

        # The raising check degrades to a red result (conservative), while
        # the other three still ran successfully and are present.
        assert result.overall_status == RED
        assert document["execution_success"]["status"] == RED
        assert "error" in document["execution_success"]["details"]
        assert document["execution_duration"]["status"] == GREEN
        assert document["api_quota"]["status"] == GREEN
        assert document["aws_cost"]["status"] == GREEN

    def test_writes_to_real_s3_via_object_store(self) -> None:
        with mock_aws():
            s3_client = boto3.client("s3", region_name="eu-central-1")
            s3_client.create_bucket(
                Bucket=BUCKET,
                CreateBucketConfiguration={"LocationConstraint": "eu-central-1"},
            )
            store = S3ObjectStore(bucket=BUCKET, s3_client=s3_client)
            aggregator = _build_aggregator(
                store,
                {
                    "execution_success": GREEN,
                    "execution_duration": GREEN,
                    "api_quota": GREEN,
                    "aws_cost": GREEN,
                },
            )

            result = aggregator.aggregate()

            response = s3_client.get_object(Bucket=BUCKET, Key=OUTPUT_KEY)
            body = json.loads(response["Body"].read())
            assert body["overall_status"] == GREEN
            assert result.size_bytes > 0
