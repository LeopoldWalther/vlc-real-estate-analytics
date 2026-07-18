"""
Tests for the AWS cost threshold health check (FEATURE-012, task 12.7).

RED first: these assertions fail until ``AwsCostCheck`` exists in
``pipeline_health.health_checks``. Uses ``botocore.stub.Stubber`` around
a real (never-network) boto3 ``ce`` client with an injected fixed clock.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime
from typing import Any, Dict

import boto3
from botocore.stub import ANY, Stubber

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from pipeline_health.health_checks import (  # noqa: E402
    GREEN,
    RED,
    YELLOW,
    AwsCostCheck,
)

FIXED_NOW = datetime(2026, 6, 15, 12, 0, 0)


def _cost_response(service_costs: Dict[str, float]) -> Dict[str, Any]:
    """Build a GetCostAndUsage response with one group per service."""
    return {
        "ResultsByTime": [
            {
                "Groups": [
                    {
                        "Keys": [service],
                        "Metrics": {
                            "UnblendedCost": {"Amount": str(amount), "Unit": "USD"}
                        },
                    }
                    for service, amount in service_costs.items()
                ]
            }
        ]
    }


def _monthly_history_response(months: list) -> Dict[str, Any]:
    """
    Build a GetCostAndUsage response with one ResultsByTime entry per month.

    Args:
        months: List of (month_str, {service: amount}) tuples, oldest first.
    """
    return {
        "ResultsByTime": [
            {
                "TimePeriod": {"Start": f"{month}-01", "End": f"{month}-01"},
                "Groups": [
                    {
                        "Keys": [service],
                        "Metrics": {
                            "UnblendedCost": {"Amount": str(amount), "Unit": "USD"}
                        },
                    }
                    for service, amount in service_costs.items()
                ],
            }
            for month, service_costs in months
        ]
    }


def _empty_history_response(num_months: int = 5) -> Dict[str, Any]:
    """A monthly-history response with `num_months` empty (no groups) months."""
    return {"ResultsByTime": [{"Groups": []} for _ in range(num_months)]}


def _add_history_stub(stubber: Stubber, response: Dict[str, Any] = None) -> None:
    """Queue the monthly-history get_cost_and_usage response (task 13.3)."""
    stubber.add_response(
        "get_cost_and_usage",
        response if response is not None else _empty_history_response(),
        {
            "TimePeriod": ANY,
            "Granularity": "MONTHLY",
            "Metrics": ["UnblendedCost"],
            "GroupBy": ANY,
        },
    )


class TestAwsCostCheck:
    def test_total_under_2_usd_is_green(self) -> None:
        client = boto3.client("ce", region_name="us-east-1")
        stubber = Stubber(client)
        stubber.add_response(
            "get_cost_and_usage",
            _cost_response({"AWS Lambda": 0.50, "Amazon S3": 0.75}),
            {
                "TimePeriod": ANY,
                "Granularity": "MONTHLY",
                "Metrics": ["UnblendedCost"],
                "GroupBy": ANY,
            },
        )
        _add_history_stub(stubber)
        stubber.activate()

        check = AwsCostCheck(client, now_fn=lambda: FIXED_NOW)
        result = check.evaluate()

        assert result.status == GREEN
        stubber.assert_no_pending_responses()

    def test_total_between_2_and_5_usd_is_yellow(self) -> None:
        client = boto3.client("ce", region_name="us-east-1")
        stubber = Stubber(client)
        stubber.add_response(
            "get_cost_and_usage",
            _cost_response({"AWS Lambda": 2.5, "Amazon S3": 0.75}),
            {
                "TimePeriod": ANY,
                "Granularity": "MONTHLY",
                "Metrics": ["UnblendedCost"],
                "GroupBy": ANY,
            },
        )
        _add_history_stub(stubber)
        stubber.activate()

        check = AwsCostCheck(client, now_fn=lambda: FIXED_NOW)
        result = check.evaluate()

        assert result.status == YELLOW

    def test_total_5_usd_or_above_is_red(self) -> None:
        client = boto3.client("ce", region_name="us-east-1")
        stubber = Stubber(client)
        stubber.add_response(
            "get_cost_and_usage",
            _cost_response({"AWS Lambda": 4.0, "Amazon S3": 1.5}),
            {
                "TimePeriod": ANY,
                "Granularity": "MONTHLY",
                "Metrics": ["UnblendedCost"],
                "GroupBy": ANY,
            },
        )
        _add_history_stub(stubber)
        stubber.activate()

        check = AwsCostCheck(client, now_fn=lambda: FIXED_NOW)
        result = check.evaluate()

        assert result.status == RED

    def test_excluded_registrar_services_do_not_contribute_to_total(self) -> None:
        client = boto3.client("ce", region_name="us-east-1")
        stubber = Stubber(client)
        stubber.add_response(
            "get_cost_and_usage",
            _cost_response(
                {
                    "AWS Lambda": 0.50,
                    "Amazon Registrar": 12.0,
                    "Amazon Route 53 Domains": 14.0,
                }
            ),
            {
                "TimePeriod": ANY,
                "Granularity": "MONTHLY",
                "Metrics": ["UnblendedCost"],
                "GroupBy": ANY,
            },
        )
        _add_history_stub(stubber)
        stubber.activate()

        check = AwsCostCheck(client, now_fn=lambda: FIXED_NOW)
        result = check.evaluate()

        # Registrar/domain costs (26 USD) would push this red if counted;
        # excluding them keeps it green.
        assert result.status == GREEN
        assert result.details["included_total_usd"] == 0.5
        assert result.details["excluded_total_usd"] == 26.0

    def test_details_include_included_excluded_and_service_names(self) -> None:
        client = boto3.client("ce", region_name="us-east-1")
        stubber = Stubber(client)
        stubber.add_response(
            "get_cost_and_usage",
            _cost_response({"AWS Lambda": 1.0, "Amazon Registrar": 5.0}),
            {
                "TimePeriod": ANY,
                "Granularity": "MONTHLY",
                "Metrics": ["UnblendedCost"],
                "GroupBy": ANY,
            },
        )
        _add_history_stub(stubber)
        stubber.activate()

        check = AwsCostCheck(client, now_fn=lambda: FIXED_NOW)
        result = check.evaluate()

        assert result.details["included_total_usd"] == 1.0
        assert result.details["excluded_total_usd"] == 5.0
        assert result.details["excluded_services"] == ["Amazon Registrar"]


class TestAwsCostMonthlyHistory:
    """FEATURE-013 task 13.3: last 5 fully-completed months, oldest-first."""

    def test_history_covers_last_five_months_oldest_first(self) -> None:
        client = boto3.client("ce", region_name="us-east-1")
        stubber = Stubber(client)
        stubber.add_response(
            "get_cost_and_usage",
            _cost_response({"AWS Lambda": 0.50}),
            {
                "TimePeriod": ANY,
                "Granularity": "MONTHLY",
                "Metrics": ["UnblendedCost"],
                "GroupBy": ANY,
            },
        )
        months = [
            ("2026-01", {"AWS Lambda": 1.0, "Amazon S3": 0.2}),
            ("2026-02", {"AWS Lambda": 1.1, "Amazon S3": 0.25}),
            ("2026-03", {"AWS Lambda": 1.2, "Amazon S3": 0.3}),
            ("2026-04", {"AWS Lambda": 1.3, "Amazon S3": 0.35}),
            ("2026-05", {"AWS Lambda": 1.4, "Amazon S3": 0.4}),
        ]
        _add_history_stub(stubber, _monthly_history_response(months))
        stubber.activate()

        check = AwsCostCheck(client, now_fn=lambda: FIXED_NOW)
        result = check.evaluate()

        history = result.details["monthly_cost_by_service"]
        assert len(history) == 5
        assert [entry["month"] for entry in history] == [
            "2026-01",
            "2026-02",
            "2026-03",
            "2026-04",
            "2026-05",
        ]
        assert history[0]["services"] == {"AWS Lambda": 1.0, "Amazon S3": 0.2}
        assert history[-1]["services"] == {"AWS Lambda": 1.4, "Amazon S3": 0.4}
        stubber.assert_no_pending_responses()

    def test_history_excludes_registrar_services(self) -> None:
        client = boto3.client("ce", region_name="us-east-1")
        stubber = Stubber(client)
        stubber.add_response(
            "get_cost_and_usage",
            _cost_response({"AWS Lambda": 0.50}),
            {
                "TimePeriod": ANY,
                "Granularity": "MONTHLY",
                "Metrics": ["UnblendedCost"],
                "GroupBy": ANY,
            },
        )
        months = [
            ("2026-05", {"AWS Lambda": 1.4, "Amazon Registrar": 12.0}),
        ]
        _add_history_stub(stubber, _monthly_history_response(months))
        stubber.activate()

        check = AwsCostCheck(client, now_fn=lambda: FIXED_NOW)
        result = check.evaluate()

        entry = result.details["monthly_cost_by_service"][0]
        assert "Amazon Registrar" not in entry["services"]
        assert entry["services"] == {"AWS Lambda": 1.4}

    def test_history_handles_empty_months(self) -> None:
        client = boto3.client("ce", region_name="us-east-1")
        stubber = Stubber(client)
        stubber.add_response(
            "get_cost_and_usage",
            _cost_response({"AWS Lambda": 0.50}),
            {
                "TimePeriod": ANY,
                "Granularity": "MONTHLY",
                "Metrics": ["UnblendedCost"],
                "GroupBy": ANY,
            },
        )
        _add_history_stub(stubber, _empty_history_response())
        stubber.activate()

        check = AwsCostCheck(client, now_fn=lambda: FIXED_NOW)
        result = check.evaluate()

        history = result.details["monthly_cost_by_service"]
        assert len(history) == 5
        for entry in history:
            assert entry["services"] == {}

    def test_history_does_not_change_month_to_date_status(self) -> None:
        client = boto3.client("ce", region_name="us-east-1")
        stubber = Stubber(client)
        stubber.add_response(
            "get_cost_and_usage",
            _cost_response({"AWS Lambda": 4.0, "Amazon S3": 1.5}),
            {
                "TimePeriod": ANY,
                "Granularity": "MONTHLY",
                "Metrics": ["UnblendedCost"],
                "GroupBy": ANY,
            },
        )
        _add_history_stub(stubber)
        stubber.activate()

        check = AwsCostCheck(client, now_fn=lambda: FIXED_NOW)
        result = check.evaluate()

        assert result.status == RED
        assert result.details["included_total_usd"] == 5.5
