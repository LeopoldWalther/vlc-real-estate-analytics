"""
Contract tests for the Notifier Protocol and its implementations.
"""

from __future__ import annotations

import os
import sys
from typing import Generator, Tuple

import boto3
import pytest
from moto import mock_aws

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from common.notifier import InMemoryNotifier, Notifier, SnsNotifier  # noqa: E402


@pytest.fixture()
def sns_setup() -> Generator[Tuple[SnsNotifier, str], None, None]:
    """Yield an SnsNotifier wired to a moto-mocked topic + the topic ARN."""
    with mock_aws():
        client = boto3.client("sns", region_name="eu-central-1")
        topic_arn = client.create_topic(Name="test-alerts")["TopicArn"]
        yield SnsNotifier(topic_arn=topic_arn, sns_client=client), topic_arn


class TestProtocolConformance:
    """Both implementations must satisfy the runtime-checkable Protocol."""

    def test_in_memory_notifier_satisfies_protocol(self) -> None:
        assert isinstance(InMemoryNotifier(), Notifier)

    def test_sns_notifier_satisfies_protocol(
        self, sns_setup: Tuple[SnsNotifier, str]
    ) -> None:
        notifier, _ = sns_setup
        assert isinstance(notifier, Notifier)


class TestInMemoryNotifier:
    """Behavioural contract of the list-backed fake."""

    def test_publish_records_subject_and_message_in_order(self) -> None:
        notifier = InMemoryNotifier()

        notifier.publish("first", "body-1")
        notifier.publish("second", "body-2")

        assert notifier.messages == [("first", "body-1"), ("second", "body-2")]


class TestSnsNotifier:
    """Behavioural contract of the boto3 adapter under moto."""

    def test_publish_succeeds_against_mocked_topic(
        self, sns_setup: Tuple[SnsNotifier, str]
    ) -> None:
        notifier, _ = sns_setup

        # moto raises on invalid publish; no exception == success.
        notifier.publish("✅ done", "pipeline summary")

    def test_publish_swallows_errors(self) -> None:
        """A broken channel must never fail the pipeline run (by design)."""
        with mock_aws():
            client = boto3.client("sns", region_name="eu-central-1")
            notifier = SnsNotifier(
                topic_arn="arn:aws:sns:eu-central-1:123456789012:missing",
                sns_client=client,
            )

            # Topic does not exist — publish logs the error and returns.
            notifier.publish("subject", "message")
