"""
Tests for the Idealista API quota health check (FEATURE-012, task 12.6).

RED first: these assertions fail until ``ApiQuotaCheck`` exists in
``pipeline_health.health_checks``. Uses ``botocore.stub.Stubber`` around a
real (never-network) boto3 ``cloudwatch`` client with an injected fixed
clock so month-boundary logic is deterministic.
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
    ApiQuotaCheck,
)

#: Fixed "now" — mid-June 2026 — so June 2026 is the excluded in-progress
#: month and Jan-May 2026 are the 5 fully-completed evaluated months.
FIXED_NOW = datetime(2026, 6, 15, 12, 0, 0)
EVALUATED_MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"]


def _metric_data_response(monthly_values: Dict[str, float]) -> Dict[str, Any]:
    """Build a GetMetricData response with one datapoint per evaluated month."""
    timestamps = [datetime.strptime(m, "%Y-%m") for m in monthly_values]
    values = list(monthly_values.values())
    return {
        "MetricDataResults": [
            {
                "Id": "usage",
                "Timestamps": timestamps,
                "Values": values,
            }
        ]
    }


def _all_months(value: float) -> Dict[str, float]:
    return {m: value for m in EVALUATED_MONTHS}


class TestApiQuotaCheck:
    def test_all_months_under_80_is_green(self) -> None:
        client = boto3.client("cloudwatch", region_name="eu-central-1")
        stubber = Stubber(client)
        for _ in range(2):  # LVW then PMV
            stubber.add_response(
                "get_metric_data",
                _metric_data_response(_all_months(50.0)),
                {
                    "MetricDataQueries": ANY,
                    "StartTime": ANY,
                    "EndTime": ANY,
                },
            )
        stubber.activate()

        check = ApiQuotaCheck(client, now_fn=lambda: FIXED_NOW)
        result = check.evaluate()

        assert result.status == GREEN
        stubber.assert_no_pending_responses()

    def test_month_at_80_or_above_is_yellow(self) -> None:
        client = boto3.client("cloudwatch", region_name="eu-central-1")
        stubber = Stubber(client)
        usage = _all_months(50.0)
        usage["2026-03"] = 82.0
        stubber.add_response(
            "get_metric_data",
            _metric_data_response(usage),
            {"MetricDataQueries": ANY, "StartTime": ANY, "EndTime": ANY},
        )
        stubber.add_response(
            "get_metric_data",
            _metric_data_response(_all_months(10.0)),
            {"MetricDataQueries": ANY, "StartTime": ANY, "EndTime": ANY},
        )
        stubber.activate()

        check = ApiQuotaCheck(client, now_fn=lambda: FIXED_NOW)
        result = check.evaluate()

        assert result.status == YELLOW

    def test_month_at_95_or_above_is_red(self) -> None:
        client = boto3.client("cloudwatch", region_name="eu-central-1")
        stubber = Stubber(client)
        usage = _all_months(50.0)
        usage["2026-04"] = 96.0
        stubber.add_response(
            "get_metric_data",
            _metric_data_response(usage),
            {"MetricDataQueries": ANY, "StartTime": ANY, "EndTime": ANY},
        )
        stubber.add_response(
            "get_metric_data",
            _metric_data_response(_all_months(10.0)),
            {"MetricDataQueries": ANY, "StartTime": ANY, "EndTime": ANY},
        )
        stubber.activate()

        check = ApiQuotaCheck(client, now_fn=lambda: FIXED_NOW)
        result = check.evaluate()

        assert result.status == RED

    def test_red_wins_over_yellow_across_credential_sets(self) -> None:
        client = boto3.client("cloudwatch", region_name="eu-central-1")
        stubber = Stubber(client)
        red_usage = _all_months(10.0)
        red_usage["2026-05"] = 99.0
        yellow_usage = _all_months(10.0)
        yellow_usage["2026-02"] = 85.0
        stubber.add_response(
            "get_metric_data",
            _metric_data_response(red_usage),
            {"MetricDataQueries": ANY, "StartTime": ANY, "EndTime": ANY},
        )
        stubber.add_response(
            "get_metric_data",
            _metric_data_response(yellow_usage),
            {"MetricDataQueries": ANY, "StartTime": ANY, "EndTime": ANY},
        )
        stubber.activate()

        check = ApiQuotaCheck(client, now_fn=lambda: FIXED_NOW)
        result = check.evaluate()

        assert result.status == RED

    def test_current_in_progress_month_is_excluded(self) -> None:
        """A metric datapoint in June 2026 (current month) must never be counted."""
        client = boto3.client("cloudwatch", region_name="eu-central-1")
        stubber = Stubber(client)
        usage = _all_months(10.0)
        # Even though get_metric_data is called with a StartTime/EndTime window
        # that ApiQuotaCheck itself controls, simulate a defensive extra
        # datapoint for the current month to prove it's dropped if present.
        response = _metric_data_response(usage)
        response["MetricDataResults"][0]["Timestamps"].append(datetime(2026, 6, 1))
        response["MetricDataResults"][0]["Values"].append(999.0)
        for _ in range(2):
            stubber.add_response(
                "get_metric_data",
                response,
                {"MetricDataQueries": ANY, "StartTime": ANY, "EndTime": ANY},
            )
        stubber.activate()

        check = ApiQuotaCheck(client, now_fn=lambda: FIXED_NOW)
        result = check.evaluate()

        assert result.status == GREEN
        for detail in result.details["credential_sets"].values():
            assert "2026-06" not in detail["monthly_requests"]

    def test_details_label_lvw_as_sale_and_pmv_as_rent(self) -> None:
        client = boto3.client("cloudwatch", region_name="eu-central-1")
        stubber = Stubber(client)
        for _ in range(2):
            stubber.add_response(
                "get_metric_data",
                _metric_data_response(_all_months(10.0)),
                {"MetricDataQueries": ANY, "StartTime": ANY, "EndTime": ANY},
            )
        stubber.activate()

        check = ApiQuotaCheck(client, now_fn=lambda: FIXED_NOW)
        result = check.evaluate()

        credential_sets = result.details["credential_sets"]
        assert credential_sets["LVW"]["label"] == "sale"
        assert credential_sets["PMV"]["label"] == "rent"
        # No raw secret name beyond the approved LVW/PMV labels leaks out.
        as_str = str(result.details)
        assert "secret" not in as_str.lower()
