"""
Contract tests for the pipeline-health domain model (FEATURE-012, task 12.1).

RED first: these assertions fail until ``HealthStatus``, ``HealthCheckResult``,
``HealthCheck`` and ``worst_status`` exist in ``pipeline_health.health_checks``.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from pipeline_health.health_checks import (  # noqa: E402
    GREEN,
    RED,
    YELLOW,
    HealthCheck,
    HealthCheckResult,
    worst_status,
)


class TestWorstStatus:
    """Pure precedence helper: red > yellow > green."""

    def test_red_beats_everything(self) -> None:
        assert worst_status([GREEN, YELLOW, RED]) == RED
        assert worst_status([RED, GREEN]) == RED

    def test_yellow_beats_green(self) -> None:
        assert worst_status([GREEN, YELLOW]) == YELLOW
        assert worst_status([YELLOW, GREEN]) == YELLOW

    def test_all_green_stays_green(self) -> None:
        assert worst_status([GREEN, GREEN, GREEN]) == GREEN

    def test_single_status_returned_unchanged(self) -> None:
        assert worst_status([RED]) == RED

    def test_is_deterministic_regardless_of_order(self) -> None:
        assert worst_status([RED, YELLOW, GREEN]) == worst_status([GREEN, RED, YELLOW])


class TestHealthCheckResult:
    """Immutable, JSON-safe summary of a single health check evaluation."""

    def test_to_dict_serializes_only_json_safe_fields(self) -> None:
        evaluated_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
        result = HealthCheckResult(
            status=GREEN,
            summary="all good",
            details={"invocations_checked": 5},
            evaluated_at=evaluated_at,
        )

        assert result.to_dict() == {
            "status": "green",
            "summary": "all good",
            "details": {"invocations_checked": 5},
            "evaluated_at": evaluated_at.isoformat(),
        }

    def test_insufficient_history_is_represented_in_details_without_raising(
        self,
    ) -> None:
        """Short execution history is data, not an exceptional condition."""
        result = HealthCheckResult(
            status=YELLOW,
            summary="insufficient history",
            details={"insufficient_history": True, "invocations_checked": 1},
            evaluated_at=datetime.now(timezone.utc),
        )

        as_dict = result.to_dict()
        assert as_dict["details"]["insufficient_history"] is True
        assert as_dict["status"] == "yellow"


class TestHealthCheckProtocol:
    """HealthCheck is a narrow, runtime-checkable Protocol."""

    def test_a_class_implementing_evaluate_satisfies_the_protocol(self) -> None:
        class AlwaysGreen:
            def evaluate(self) -> HealthCheckResult:
                return HealthCheckResult(
                    status=GREEN,
                    summary="ok",
                    details={},
                    evaluated_at=datetime.now(timezone.utc),
                )

        assert isinstance(AlwaysGreen(), HealthCheck)

    def test_a_class_missing_evaluate_does_not_satisfy_the_protocol(self) -> None:
        class NotAHealthCheck:
            pass

        assert not isinstance(NotAHealthCheck(), HealthCheck)
