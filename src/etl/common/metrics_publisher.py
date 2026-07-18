"""
Metrics-publishing edge interface + adapters for the ETL pipeline
(FEATURE-012, task 12.2).

Defines the :class:`MetricsPublisher` Protocol (Abstraction / Dependency
Inversion), the boto3-backed :class:`CloudWatchMetricsPublisher`
production adapter (Adapter pattern, same shape as the existing
``ObjectStore``/``SecretsProvider``/``Notifier`` Protocols) and the
:class:`InMemoryMetricsPublisher` test fake (Polymorphism —
interchangeable behind the same Protocol).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Protocol, runtime_checkable

logger = logging.getLogger(__name__)


@runtime_checkable
class MetricsPublisher(Protocol):
    """
    Narrow metrics-publishing interface (Interface Segregation).

    A single ``publish`` operation — consumers never list, delete or
    read metrics back, so the Protocol offers exactly the write path
    the pipeline needs.
    """

    def publish(
        self,
        namespace: str,
        metric_name: str,
        value: float,
        unit: str,
        dimensions: Dict[str, str],
        timestamp: Optional[datetime] = None,
    ) -> None:
        """Publish one metric datapoint."""
        ...


class CloudWatchMetricsPublisher:
    """
    boto3-backed :class:`MetricsPublisher` adapter for CloudWatch metrics.

    Adapter pattern: wraps the vendor SDK behind the project-owned
    Protocol so core logic never speaks the boto3 dialect. Encapsulation:
    the client is private; callers interact only through :meth:`publish`.
    """

    def __init__(self, cloudwatch_client: object | None = None) -> None:
        """
        Args:
            cloudwatch_client: Optional pre-built boto3 CloudWatch client
                (injected in tests via a Stubber). Created lazily from
                boto3 when omitted, keeping boto3 construction at the
                composition edge (Dependency Inversion).
        """
        import boto3

        self._client = (
            cloudwatch_client
            if cloudwatch_client is not None
            else boto3.client("cloudwatch")
        )

    def publish(
        self,
        namespace: str,
        metric_name: str,
        value: float,
        unit: str,
        dimensions: Dict[str, str],
        timestamp: Optional[datetime] = None,
    ) -> None:
        """
        Map project-owned inputs to a single ``put_metric_data`` call.

        Args:
            namespace: CloudWatch namespace (e.g. ``VlcRealEstate/Idealista``).
            metric_name: CloudWatch metric name (e.g. ``ApiRequests``).
            value: Datapoint value.
            unit: CloudWatch unit string (e.g. ``Count``).
            dimensions: Dimension name/value pairs for this datapoint.
            timestamp: Optional explicit datapoint timestamp; CloudWatch
                defaults to "now" server-side when omitted.
        """
        metric_datum: Dict[str, object] = {
            "MetricName": metric_name,
            "Value": value,
            "Unit": unit,
            "Dimensions": [
                {"Name": name, "Value": dim_value}
                for name, dim_value in dimensions.items()
            ],
        }
        if timestamp is not None:
            metric_datum["Timestamp"] = timestamp

        self._client.put_metric_data(  # type: ignore[attr-defined]
            Namespace=namespace, MetricData=[metric_datum]
        )
        logger.info(
            "Published metric %s/%s=%s (%s)", namespace, metric_name, value, dimensions
        )


@dataclass(frozen=True)
class MetricDatapoint:
    """Immutable record of one :class:`InMemoryMetricsPublisher` call."""

    namespace: str
    metric_name: str
    value: float
    unit: str
    dimensions: Dict[str, str] = field(default_factory=dict)
    timestamp: Optional[datetime] = None


class InMemoryMetricsPublisher:
    """
    List-backed :class:`MetricsPublisher` fake for unit tests.

    Polymorphism: interchangeable with :class:`CloudWatchMetricsPublisher`
    behind the shared Protocol. Tests assert on :attr:`datapoints`.
    """

    def __init__(self) -> None:
        #: Chronological datapoints observed by the fake.
        self.datapoints: List[MetricDatapoint] = []

    def publish(
        self,
        namespace: str,
        metric_name: str,
        value: float,
        unit: str,
        dimensions: Dict[str, str],
        timestamp: Optional[datetime] = None,
    ) -> None:
        """Record the datapoint for later assertions."""
        self.datapoints.append(
            MetricDatapoint(
                namespace=namespace,
                metric_name=metric_name,
                value=value,
                unit=unit,
                dimensions=dict(dimensions),
                timestamp=timestamp,
            )
        )


__all__: List[str] = [
    "CloudWatchMetricsPublisher",
    "InMemoryMetricsPublisher",
    "MetricDatapoint",
    "MetricsPublisher",
]
