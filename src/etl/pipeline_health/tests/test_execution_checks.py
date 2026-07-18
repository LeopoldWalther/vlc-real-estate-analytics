"""
Tests for the Lambda execution health checks (FEATURE-012, task 12.5).

RED first: these assertions fail until ``ExecutionSuccessCheck``,
``ExecutionDurationCheck`` and the bounded-polling Logs Insights adapter
exist in ``pipeline_health.health_checks``. Real AWS is never touched —
CloudWatch Logs Insights has limited/absent moto support, so a
``botocore.stub.Stubber`` wraps a real (but never-network) boto3 client
per review M2.
"""

from __future__ import annotations

import os
import sys
from typing import Any, Dict, List

import boto3
import pytest
from botocore.stub import ANY, Stubber

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from pipeline_health.health_checks import (  # noqa: E402
    GREEN,
    RED,
    YELLOW,
    ExecutionDurationCheck,
    ExecutionSuccessCheck,
)

FUNCTION_NAMES = ["bronze-collector", "silver-cleaner", "gold-aggregator"]


def _report_row(duration_ms: float, failed: bool = False) -> List[Dict[str, str]]:
    """Build one Logs Insights result row matching our query's field shape."""
    return [
        {"field": "@timestamp", "value": "2026-01-01 00:00:00.000"},
        {"field": "duration_ms", "value": str(duration_ms)},
        {"field": "error_marker", "value": "ERROR" if failed else ""},
    ]


def _stub_query(
    stubber: Stubber, rows: List[List[Dict[str, str]]], status: str = "Complete"
) -> None:
    """Queue one start_query + one get_query_results response pair."""
    stubber.add_response(
        "start_query",
        {"queryId": "q-1"},
        {
            "logGroupName": ANY,
            "startTime": ANY,
            "endTime": ANY,
            "queryString": ANY,
            "limit": ANY,
        },
    )
    stubber.add_response(
        "get_query_results",
        {"results": rows, "status": status},
        {"queryId": "q-1"},
    )


@pytest.fixture()
def logs_client() -> Any:
    return boto3.client("logs", region_name="eu-central-1")


class TestExecutionSuccessCheck:
    """Ampel rule 1: red beats yellow beats green, worst function wins."""

    def test_latest_failed_invocation_is_red(self, logs_client: Any) -> None:
        stubber = Stubber(logs_client)
        rows = [_report_row(1000, failed=True)] + [_report_row(1000) for _ in range(4)]
        for _ in FUNCTION_NAMES:
            _stub_query(stubber, rows)
        stubber.activate()

        check = ExecutionSuccessCheck(logs_client, FUNCTION_NAMES, window=5)
        result = check.evaluate()

        assert result.status == RED
        stubber.assert_no_pending_responses()

    def test_latest_success_with_earlier_failure_is_yellow(
        self, logs_client: Any
    ) -> None:
        stubber = Stubber(logs_client)
        rows = (
            [_report_row(1000)]
            + [_report_row(1000, failed=True)]
            + [_report_row(1000) for _ in range(3)]
        )
        for _ in FUNCTION_NAMES:
            _stub_query(stubber, rows)
        stubber.activate()

        check = ExecutionSuccessCheck(logs_client, FUNCTION_NAMES, window=5)
        result = check.evaluate()

        assert result.status == YELLOW

    def test_all_five_successful_is_green(self, logs_client: Any) -> None:
        stubber = Stubber(logs_client)
        rows = [_report_row(1000) for _ in range(5)]
        for _ in FUNCTION_NAMES:
            _stub_query(stubber, rows)
        stubber.activate()

        check = ExecutionSuccessCheck(logs_client, FUNCTION_NAMES, window=5)
        result = check.evaluate()

        assert result.status == GREEN
        for detail in result.details["functions"].values():
            assert detail.get("insufficient_history") is not True

    def test_fewer_than_window_successful_invocations_is_green_with_flag(
        self, logs_client: Any
    ) -> None:
        stubber = Stubber(logs_client)
        rows = [_report_row(1000)]  # only 1 invocation exists
        for _ in FUNCTION_NAMES:
            _stub_query(stubber, rows)
        stubber.activate()

        check = ExecutionSuccessCheck(logs_client, FUNCTION_NAMES, window=5)
        result = check.evaluate()

        assert result.status == GREEN
        for detail in result.details["functions"].values():
            assert detail["insufficient_history"] is True
            assert detail["invocations_checked"] == 1

    def test_zero_invocations_is_yellow_with_insufficient_history(
        self, logs_client: Any
    ) -> None:
        stubber = Stubber(logs_client)
        for _ in FUNCTION_NAMES:
            _stub_query(stubber, [])
        stubber.activate()

        check = ExecutionSuccessCheck(logs_client, FUNCTION_NAMES, window=5)
        result = check.evaluate()

        assert result.status == YELLOW
        for detail in result.details["functions"].values():
            assert detail["insufficient_history"] is True

    def test_worst_of_three_functions_wins(self, logs_client: Any) -> None:
        stubber = Stubber(logs_client)
        good_rows = [_report_row(1000) for _ in range(5)]
        bad_rows = [_report_row(1000, failed=True)] + [
            _report_row(1000) for _ in range(4)
        ]
        _stub_query(stubber, good_rows)
        _stub_query(stubber, bad_rows)
        _stub_query(stubber, good_rows)
        stubber.activate()

        check = ExecutionSuccessCheck(logs_client, FUNCTION_NAMES, window=5)
        result = check.evaluate()

        assert result.status == RED

    def test_query_timeout_is_non_crashing_yellow(self, logs_client: Any) -> None:
        stubber = Stubber(logs_client)
        for _ in FUNCTION_NAMES:
            stubber.add_response(
                "start_query",
                {"queryId": "q-timeout"},
                {
                    "logGroupName": ANY,
                    "startTime": ANY,
                    "endTime": ANY,
                    "queryString": ANY,
                    "limit": ANY,
                },
            )
            for _ in range(3):
                stubber.add_response(
                    "get_query_results",
                    {"results": [], "status": "Running"},
                    {"queryId": "q-timeout"},
                )
        stubber.activate()

        check = ExecutionSuccessCheck(logs_client, FUNCTION_NAMES, window=5)
        check._history._max_poll_attempts = 3
        check._history._sleep = lambda _seconds: None

        result = check.evaluate()

        assert result.status in (YELLOW, RED)
        for detail in result.details["functions"].values():
            assert "query_error" in detail
            assert "timed out" in detail["query_error"]


class TestExecutionDurationCheck:
    """Ampel rule 2: duration thresholds at 5 and 10 minutes."""

    def test_all_under_five_minutes_is_green(self, logs_client: Any) -> None:
        stubber = Stubber(logs_client)
        rows = [_report_row(60_000) for _ in range(5)]  # 1 minute each
        for _ in FUNCTION_NAMES:
            _stub_query(stubber, rows)
        stubber.activate()

        check = ExecutionDurationCheck(logs_client, FUNCTION_NAMES, window=5)
        result = check.evaluate()

        assert result.status == GREEN

    def test_duration_between_five_and_ten_minutes_is_yellow(
        self, logs_client: Any
    ) -> None:
        stubber = Stubber(logs_client)
        rows = [_report_row(60_000)] * 4 + [_report_row(6 * 60_000)]  # 6 minutes
        for _ in FUNCTION_NAMES:
            _stub_query(stubber, rows)
        stubber.activate()

        check = ExecutionDurationCheck(logs_client, FUNCTION_NAMES, window=5)
        result = check.evaluate()

        assert result.status == YELLOW

    def test_duration_over_ten_minutes_is_red(self, logs_client: Any) -> None:
        stubber = Stubber(logs_client)
        rows = [_report_row(60_000)] * 4 + [_report_row(11 * 60_000)]  # 11 minutes
        for _ in FUNCTION_NAMES:
            _stub_query(stubber, rows)
        stubber.activate()

        check = ExecutionDurationCheck(logs_client, FUNCTION_NAMES, window=5)
        result = check.evaluate()

        assert result.status == RED

    def test_query_timeout_is_non_crashing(self, logs_client: Any) -> None:
        stubber = Stubber(logs_client)
        for _ in FUNCTION_NAMES:
            stubber.add_response(
                "start_query",
                {"queryId": "q-timeout"},
                {
                    "logGroupName": ANY,
                    "startTime": ANY,
                    "endTime": ANY,
                    "queryString": ANY,
                    "limit": ANY,
                },
            )
            for _ in range(2):
                stubber.add_response(
                    "get_query_results",
                    {"results": [], "status": "Running"},
                    {"queryId": "q-timeout"},
                )
        stubber.activate()

        check = ExecutionDurationCheck(logs_client, FUNCTION_NAMES, window=5)
        check._history._max_poll_attempts = 2
        check._history._sleep = lambda _seconds: None

        result = check.evaluate()

        assert result.status in (YELLOW, RED)
        for detail in result.details["functions"].values():
            assert "query_error" in detail
