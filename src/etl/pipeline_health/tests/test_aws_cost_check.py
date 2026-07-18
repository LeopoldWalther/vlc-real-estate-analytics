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
        stubber.activate()

        check = AwsCostCheck(client, now_fn=lambda: FIXED_NOW)
        result = check.evaluate()

        assert result.details["included_total_usd"] == 1.0
        assert result.details["excluded_total_usd"] == 5.0
        assert result.details["excluded_services"] == ["Amazon Registrar"]
