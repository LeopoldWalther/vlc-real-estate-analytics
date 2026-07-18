"""
Contract tests for the MetricsPublisher Protocol and its implementations
(FEATURE-012, task 12.2).

RED first: these assertions fail until ``metrics_publisher.py`` exists.
CloudWatch calls are verified with botocore's ``Stubber`` (exact
``put_metric_data`` call shape) — no moto, no live AWS.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from typing import Generator

import boto3
import pytest
from botocore.stub import Stubber

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from common.metrics_publisher import (  # noqa: E402
    CloudWatchMetricsPublisher,
    InMemoryMetricsPublisher,
    MetricsPublisher,
)


@pytest.fixture()
def cloudwatch_stub() -> Generator[Stubber, None, None]:
    """Yield a Stubber wrapping a real (never-called-over-network) client."""
    client = boto3.client(
        "cloudwatch",
        region_name="eu-central-1",
        aws_access_key_id="test",
        aws_secret_access_key="test",
    )
    stubber = Stubber(client)
    with stubber:
        yield stubber, client  # type: ignore[misc]


class TestProtocolConformance:
    """Both implementations must satisfy the runtime-checkable Protocol."""

    def test_in_memory_publisher_satisfies_protocol(self) -> None:
        assert isinstance(InMemoryMetricsPublisher(), MetricsPublisher)

    def test_cloudwatch_publisher_satisfies_protocol(self) -> None:
        client = boto3.client(
            "cloudwatch",
            region_name="eu-central-1",
            aws_access_key_id="test",
            aws_secret_access_key="test",
        )
        assert isinstance(
            CloudWatchMetricsPublisher(cloudwatch_client=client), MetricsPublisher
        )


class TestInMemoryMetricsPublisher:
    """Behavioural contract of the list-backed fake."""

    def test_publish_records_datapoint_for_assertions(self) -> None:
        publisher = InMemoryMetricsPublisher()

        publisher.publish(
            namespace="VlcRealEstate/Idealista",
            metric_name="ApiRequests",
            value=1.0,
            unit="Count",
            dimensions={"CredentialSet": "LVW", "Operation": "sale"},
        )

        assert len(publisher.datapoints) == 1
        datapoint = publisher.datapoints[0]
        assert datapoint.namespace == "VlcRealEstate/Idealista"
        assert datapoint.metric_name == "ApiRequests"
        assert datapoint.value == 1.0
        assert datapoint.unit == "Count"
        assert datapoint.dimensions == {"CredentialSet": "LVW", "Operation": "sale"}

    def test_publish_records_multiple_datapoints_in_order(self) -> None:
        publisher = InMemoryMetricsPublisher()

        publisher.publish("ns", "m1", 1.0, "Count", {})
        publisher.publish("ns", "m2", 2.0, "Count", {})

        assert [d.metric_name for d in publisher.datapoints] == ["m1", "m2"]

    def test_publish_defaults_timestamp_when_omitted(self) -> None:
        publisher = InMemoryMetricsPublisher()

        publisher.publish("ns", "m1", 1.0, "Count", {})

        assert publisher.datapoints[0].timestamp is None

    def test_publish_records_explicit_timestamp(self) -> None:
        publisher = InMemoryMetricsPublisher()
        ts = datetime(2026, 1, 1, tzinfo=timezone.utc)

        publisher.publish("ns", "m1", 1.0, "Count", {}, timestamp=ts)

        assert publisher.datapoints[0].timestamp == ts


class TestCloudWatchMetricsPublisher:
    """Behavioural contract of the boto3 adapter, verified via Stubber."""

    def test_publish_maps_inputs_to_put_metric_data(
        self, cloudwatch_stub: "tuple[Stubber, object]"
    ) -> None:
        stubber, client = cloudwatch_stub
        stubber.add_response(
            "put_metric_data",
            {},
            {
                "Namespace": "VlcRealEstate/Idealista",
                "MetricData": [
                    {
                        "MetricName": "ApiRequests",
                        "Value": 1.0,
                        "Unit": "Count",
                        "Dimensions": [
                            {"Name": "CredentialSet", "Value": "LVW"},
                            {"Name": "Operation", "Value": "sale"},
                        ],
                    }
                ],
            },
        )
        publisher = CloudWatchMetricsPublisher(cloudwatch_client=client)

        publisher.publish(
            namespace="VlcRealEstate/Idealista",
            metric_name="ApiRequests",
            value=1.0,
            unit="Count",
            dimensions={"CredentialSet": "LVW", "Operation": "sale"},
        )

        stubber.assert_no_pending_responses()

    def test_publish_includes_timestamp_when_provided(
        self, cloudwatch_stub: "tuple[Stubber, object]"
    ) -> None:
        stubber, client = cloudwatch_stub
        ts = datetime(2026, 1, 1, tzinfo=timezone.utc)
        stubber.add_response(
            "put_metric_data",
            {},
            {
                "Namespace": "ns",
                "MetricData": [
                    {
                        "MetricName": "m1",
                        "Value": 1.0,
                        "Unit": "Count",
                        "Dimensions": [],
                        "Timestamp": ts,
                    }
                ],
            },
        )
        publisher = CloudWatchMetricsPublisher(cloudwatch_client=client)

        publisher.publish("ns", "m1", 1.0, "Count", {}, timestamp=ts)

        stubber.assert_no_pending_responses()
