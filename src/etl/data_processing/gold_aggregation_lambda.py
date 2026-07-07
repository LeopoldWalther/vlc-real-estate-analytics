"""
Gold aggregation Lambda handler (thin, FEATURE-008).

Triggered weekly after the silver cleaning Lambda. All aggregation
orchestration lives in :class:`gold_aggregator.GoldAggregator` (composing
the Aggregation strategies); this module only

1. wires up the production ``S3ObjectStore`` (**Factory** —
   :func:`build_aggregator`), and
2. maps the :class:`~gold_aggregator.GoldResult` onto the Lambda response
   (``statusCode`` / ``key`` / ``bytes``).

Design decisions (unchanged from the original handler):
- **Scheduled, not per-object:** the aggregation must see the entire history.
- **Idempotent overwrite:** deterministic output key ``latest.json``.
- **Physical columns required:** silver Parquets must carry ``operation``
  and ``snapshot_date`` as real columns; otherwise ValueError is raised.
- **AWS-managed pandas layer:** pandas/pyarrow come from
  ``AWSSDKPandas-Python312``, not the deployment package.

Environment variables
---------------------
- ``S3_BUCKET``         : S3 bucket name (required).
- ``SILVER_PREFIX``     : S3 prefix for silver Parquet (default: ``silver/idealista``).
- ``GOLD_PREFIX``       : S3 prefix for gold output (default: ``gold/aggregations``).
- ``RATIO_MIN_COUNT``   : Minimum listings per side for ratio datasets (default: ``5``).
- ``SNS_TOPIC_ARN``     : SNS topic for error notifications (optional; used by the
                          EventBridge alarm, not called from within this handler).
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict

from common.object_store import S3ObjectStore
from gold_aggregator import GoldAggregator

logger = logging.getLogger()
logger.setLevel(logging.INFO)


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


def build_aggregator(env: Dict[str, str]) -> GoldAggregator:
    """
    Factory: construct a fully wired production GoldAggregator.

    The S3 client is created here — at handler-call time — so that moto's
    ``mock_aws()`` context is already active in tests.

    Args:
        env: Environment mapping (normally ``os.environ``); see module
            docstring for the supported variables.

    Returns:
        A ready-to-run aggregator with the frozen schema-v1.0 strategies.

    Raises:
        ValueError: If ``S3_BUCKET`` is not set.
    """
    bucket = _require_env("S3_BUCKET")
    silver_prefix = _get_env("SILVER_PREFIX", "silver/idealista")
    gold_prefix = _get_env("GOLD_PREFIX", "gold/aggregations")
    ratio_min_count = int(_get_env("RATIO_MIN_COUNT", "5"))

    return GoldAggregator(
        object_store=S3ObjectStore(bucket=bucket),
        silver_prefix=silver_prefix,
        gold_prefix=gold_prefix,
        min_count=ratio_min_count,
    )


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda entry point for the gold aggregation step.

    Args:
        event: Lambda event payload. Not used by this handler.
        context: Lambda context object. Not used by this handler.

    Returns:
        A dict with:
        - ``statusCode`` (int): always 200 on success.
        - ``key`` (str): the S3 key the output was written to.
        - ``bytes`` (int): size of the written JSON payload.

    Raises:
        ValueError: If ``S3_BUCKET`` is not set, or if any silver Parquet
            file is missing the required physical columns.
    """
    aggregator = build_aggregator(dict(os.environ))
    result = aggregator.aggregate()

    return {
        "statusCode": 200,
        "key": result.key,
        "bytes": result.size_bytes,
    }
