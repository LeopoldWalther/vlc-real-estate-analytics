"""
Pipeline health Lambda handler (thin, FEATURE-012, task 12.8).

Standalone observer Lambda: it monitors the 3 pipeline Lambdas
(bronze/silver/gold) and reports their health, but is **not** wired into
the Step Functions state machine or any existing orchestration (that
wiring, if any, belongs to a later infrastructure task — this module is
pure Python and does not participate in the pipeline itself).

All check logic lives in :mod:`health_checks`; all orchestration lives in
:class:`pipeline_health_aggregator.PipelineHealthAggregator`. This module
only

1. constructs the boto3 clients — CloudWatch Logs, CloudWatch (metrics),
   Cost Explorer, and S3 — **at the edge**, inside :func:`build_aggregator`
   (Dependency Inversion: never inside the check/aggregator classes), and
2. maps the resulting :class:`~pipeline_health_aggregator.PipelineHealthResult`
   onto the Lambda response.

Review M1: Cost Explorer is effectively a global API and is reached via
the ``us-east-1`` endpoint, while the rest of this stack runs in
``eu-central-1`` — the Cost Explorer client is therefore explicitly
constructed with ``region_name="us-east-1"``, independent of the other
clients' region.

Environment variables
----------------------
- ``S3_BUCKET``        : S3 bucket name (required).
- ``PIPELINE_FUNCTION_NAMES`` : Comma-separated Lambda function names to
  monitor for execution success/duration (required).
- ``AWS_REGION_DEFAULT``: Region for Logs/CloudWatch/S3 clients (optional;
  boto3's default resolution is used when omitted).

FEATURE-013 (task 13.4): schema v1.1 (per-invocation ``recent_invocations``
and monthly ``monthly_cost_by_service`` history) requires no additional
wiring here — ``ExecutionSuccessCheck``/``ExecutionDurationCheck`` and
``AwsCostCheck`` already default-construct their own history adapters from
the same injected clients, so the factory below is unchanged and still
produces the v1.1 document (``pipeline_health_aggregator.SCHEMA_VERSION``).
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List

from common.object_store import S3ObjectStore
from health_checks import (
    ApiQuotaCheck,
    AwsCostCheck,
    ExecutionDurationCheck,
    ExecutionSuccessCheck,
)
from pipeline_health_aggregator import PipelineHealthAggregator

logger = logging.getLogger()
logger.setLevel(logging.INFO)

#: Cost Explorer is effectively global; this is the AWS-documented
#: supported endpoint region (review M1).
COST_EXPLORER_REGION = "us-east-1"


def _require_env(name: str) -> str:
    """
    Read a required environment variable, raising clearly if absent.

    Args:
        name: Environment variable name.

    Returns:
        The variable's string value (stripped of whitespace).

    Raises:
        ValueError: If the variable is not set or empty.
    """
    value = os.environ.get(name, "").strip()
    if not value:
        raise ValueError(f"Required environment variable '{name}' is not set.")
    return value


def _get_env(name: str, default: str = "") -> str:
    """
    Read an optional environment variable with a fallback default.

    Args:
        name: Environment variable name.
        default: Value returned when the variable is absent or empty.

    Returns:
        The variable's string value (stripped), or *default*.
    """
    return os.environ.get(name, default).strip() or default


def _function_names(env: Dict[str, str]) -> List[str]:
    """Parse the comma-separated PIPELINE_FUNCTION_NAMES env var."""
    raw = env.get("PIPELINE_FUNCTION_NAMES", "").strip()
    if not raw:
        raise ValueError(
            "Required environment variable 'PIPELINE_FUNCTION_NAMES' is not set."
        )
    return [name.strip() for name in raw.split(",") if name.strip()]


def build_aggregator(env: Dict[str, str]) -> PipelineHealthAggregator:
    """
    Factory: construct a fully wired production PipelineHealthAggregator.

    All boto3 clients are created here — at handler-call time — so that
    moto's ``mock_aws()`` context (or a patched ``boto3.client``) is
    already active in tests, matching the ``gold_aggregation_lambda``
    convention.

    Args:
        env: Environment mapping (normally ``os.environ``); see module
            docstring for the supported variables.

    Returns:
        A ready-to-run aggregator wired to the 4 Ampel health checks.

    Raises:
        ValueError: If ``S3_BUCKET`` or ``PIPELINE_FUNCTION_NAMES`` is
            not set.
    """
    import boto3

    bucket = _require_env("S3_BUCKET")
    function_names = _function_names(env)

    logs_client = boto3.client("logs")
    cloudwatch_client = boto3.client("cloudwatch")
    # Cost Explorer requires the us-east-1 endpoint regardless of the
    # stack's primary region (review M1) — constructed at this edge only.
    cost_explorer_client = boto3.client("ce", region_name=COST_EXPLORER_REGION)

    return PipelineHealthAggregator(
        object_store=S3ObjectStore(bucket=bucket),
        execution_success_check=ExecutionSuccessCheck(logs_client, function_names),
        execution_duration_check=ExecutionDurationCheck(logs_client, function_names),
        api_quota_check=ApiQuotaCheck(cloudwatch_client),
        aws_cost_check=AwsCostCheck(cost_explorer_client),
    )


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda entry point for the pipeline-health observer step.

    Args:
        event: Lambda event payload. Not used by this handler.
        context: Lambda context object. Not used by this handler.

    Returns:
        A dict with:
        - ``statusCode`` (int): always 200 on success.
        - ``key`` (str): the S3 key the output was written to.
        - ``bytes`` (int): size of the written JSON payload.
        - ``overall_status`` (str): the composed traffic-light status.

    Raises:
        ValueError: If required environment variables are not set.
    """
    aggregator = build_aggregator(dict(os.environ))
    result = aggregator.aggregate()

    return {
        "statusCode": 200,
        "key": result.key,
        "bytes": result.size_bytes,
        "overall_status": result.overall_status,
    }
