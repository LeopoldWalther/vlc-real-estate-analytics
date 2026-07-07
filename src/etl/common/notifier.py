"""
Notification edge interface + adapters for the ETL pipeline.

Defines the :class:`Notifier` Protocol (Abstraction / Dependency
Inversion), the boto3-backed :class:`SnsNotifier` production adapter
(Adapter pattern) and the :class:`InMemoryNotifier` test fake
(Polymorphism — interchangeable behind the same Protocol).

Note on granularity (Interface Segregation): the plan sketched
``notify_failure``, but the bronze collector's real edge need is
publishing a *success* summary email. One neutral ``publish`` method
covers both without widening the interface.
"""

from __future__ import annotations

import logging
from typing import List, Protocol, Tuple, runtime_checkable

logger = logging.getLogger(__name__)


@runtime_checkable
class Notifier(Protocol):
    """
    Narrow notification interface: a single fire-and-forget publish.

    Consumers never manage topics or subscriptions, so the Protocol
    offers exactly one operation (Interface Segregation).
    """

    def publish(self, subject: str, message: str) -> None:
        """Send *message* with *subject* to the configured channel."""
        ...


class SnsNotifier:
    """
    boto3-backed :class:`Notifier` adapter for a single SNS topic.

    Adapter pattern: wraps the vendor SDK behind the project-owned
    Protocol. Encapsulation: topic ARN and client are private.

    Failures are logged but swallowed by design: a notification problem
    must never fail the pipeline run itself (matches the pre-refactor
    bronze behaviour).
    """

    def __init__(self, topic_arn: str, sns_client: object | None = None) -> None:
        """
        Args:
            topic_arn: ARN of the SNS topic to publish to.
            sns_client: Optional pre-built boto3 SNS client (injected in
                tests via moto). Created lazily from boto3 when omitted.
        """
        # boto3 stays inside the adapter (Dependency Inversion).
        import boto3

        self._topic_arn = topic_arn
        self._client = sns_client if sns_client is not None else boto3.client("sns")

    def publish(self, subject: str, message: str) -> None:
        """
        Publish to the topic; log-and-continue on any error.

        Args:
            subject: Email subject line.
            message: Plain-text message body.
        """
        try:
            self._client.publish(  # type: ignore[attr-defined]
                TopicArn=self._topic_arn, Subject=subject, Message=message
            )
            logger.info("Published notification to %s", self._topic_arn)
        except Exception as exc:  # noqa: BLE001 — deliberate: never fail the run
            logger.error("Error sending notification: %s", exc)


class InMemoryNotifier:
    """
    List-backed :class:`Notifier` fake for unit tests.

    Polymorphism: interchangeable with :class:`SnsNotifier` behind the
    shared Protocol. Tests assert on :attr:`messages`.
    """

    def __init__(self) -> None:
        #: Chronological (subject, message) tuples observed by the fake.
        self.messages: List[Tuple[str, str]] = []

    def publish(self, subject: str, message: str) -> None:
        """Record the notification for later assertions."""
        self.messages.append((subject, message))
