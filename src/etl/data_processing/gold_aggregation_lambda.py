"""
Gold aggregation Lambda handler.

Triggered by a scheduled AWS EventBridge rule (``cron(45 12 ? * SUN *)``),
shortly after the silver cleaning Lambda runs. It reads the full silver
cleaned-listings Parquet history from S3, calls the pure
:func:`gold_aggregate.build_aggregation_json` function, and writes the
result as ``gold/aggregations/latest.json`` — a compact, dashboard-ready
JSON consumed by FEATURE-005 (static visualization web app).

Design decisions
----------------
- **Scheduled, not per-object:** the aggregation must see the entire history,
  so it runs after silver finishes on the same weekly schedule.
- **Idempotent overwrite:** the output key ``latest.json`` is deterministic;
  re-running always overwrites to the same location.
- **Physical columns required:** silver Parquets must contain ``operation``
  and ``snapshot_date`` as physical DataFrame columns (not only encoded in
  the Hive partition path). If they are missing the handler raises
  :class:`ValueError` immediately so the error is visible in CloudWatch.
- **AWS-managed pandas layer:** pandas/pyarrow are NOT bundled in the
  deployment package; they arrive via the ``AWSSDKPandas-Python312`` layer.
- **No global dedup:** identity is preserved per
  ``(operation, snapshot_date, propertyCode)`` so the same property across
  multiple snapshots contributes to each snapshot's time-series point. The
  :mod:`gold_aggregate` module handles dedup internally.

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

import io
import json
import logging
import os
from typing import Any, Dict, List

import boto3
import pandas as pd

# gold_aggregate lives in the same directory (Lambda deployment package).
from gold_aggregate import build_aggregation_json

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ---------------------------------------------------------------------------
# Column contract
# ---------------------------------------------------------------------------

# Minimal physical columns expected in every silver Parquet file.
# Used to initialise an empty DataFrame when no silver data exists so that
# build_aggregation_json receives a properly-structured (if empty) input and
# does not crash on missing columns.
_SILVER_REQUIRED_COLS: List[str] = [
    "operation",
    "district",
    "neighborhood",
    "snapshot_date",
    "propertyCode",
    "priceByArea",
    "size",
    "price",
    "floor",
    "rooms",
    "bathrooms",
    "hasLift",
]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


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


def _list_silver_parquet_keys(
    s3_client: Any,
    bucket: str,
    silver_prefix: str,
) -> List[str]:
    """
    List all Parquet object keys under the silver S3 prefix.

    Uses a paginator so it handles arbitrarily large histories without
    hitting the 1 000-object ``list_objects_v2`` limit.

    Args:
        s3_client: Boto3 S3 client.
        bucket: S3 bucket name.
        silver_prefix: S3 prefix for silver objects (e.g. ``"silver/idealista"``).

    Returns:
        Sorted list of S3 keys ending with ``.parquet``.
    """
    paginator = s3_client.get_paginator("list_objects_v2")
    keys: List[str] = []

    for page in paginator.paginate(Bucket=bucket, Prefix=silver_prefix + "/"):
        for obj in page.get("Contents", []):
            if obj["Key"].endswith(".parquet"):
                keys.append(obj["Key"])

    # Deterministic ordering so concat is reproducible.
    return sorted(keys)


def _read_parquet(s3_client: Any, bucket: str, key: str) -> pd.DataFrame:
    """
    Download and parse one silver Parquet file from S3.

    Validates that the DataFrame contains the physical ``operation`` and
    ``snapshot_date`` columns.  The silver Lambda writes them as real
    DataFrame columns, not merely as Hive partition path segments.  If
    they are absent the aggregation would silently produce wrong results,
    so this function raises immediately.

    Args:
        s3_client: Boto3 S3 client.
        bucket: S3 bucket name.
        key: S3 object key for the Parquet file.

    Returns:
        Parsed DataFrame with all physical columns.

    Raises:
        ValueError: If ``operation`` or ``snapshot_date`` is not a physical
            column in the Parquet file.
    """
    obj = s3_client.get_object(Bucket=bucket, Key=key)
    df = pd.read_parquet(io.BytesIO(obj["Body"].read()))

    # CRITICAL: physical columns are required; Hive-path-only inference would
    # silently drop the partition values and corrupt the time-series output.
    for required_col in ("operation", "snapshot_date"):
        if required_col not in df.columns:
            raise ValueError(
                f"Silver Parquet {key!r} is missing the physical column "
                f"'{required_col}'. The silver Lambda must write this as a "
                "DataFrame column, not only as a Hive partition path segment."
            )

    return df


def _read_silver_history(
    s3_client: Any,
    bucket: str,
    keys: List[str],
) -> pd.DataFrame:
    """
    Read all silver Parquet files and return the combined DataFrame.

    Args:
        s3_client: Boto3 S3 client.
        bucket: S3 bucket name.
        keys: List of S3 keys to read (each must be a Parquet file).

    Returns:
        Combined DataFrame of all silver listings. Returns an empty
        :class:`pandas.DataFrame` when *keys* is empty.
    """
    if not keys:
        logger.info("No silver Parquet files found; returning empty DataFrame.")
        # Return an empty DataFrame with the expected columns so that
        # build_aggregation_json can iterate columns without KeyError.
        return pd.DataFrame(columns=_SILVER_REQUIRED_COLS)

    frames: List[pd.DataFrame] = []
    for key in keys:
        df = _read_parquet(s3_client, bucket, key)
        logger.info("Read %d rows from s3://%s/%s", len(df), bucket, key)
        frames.append(df)

    combined = pd.concat(frames, ignore_index=True)
    logger.info(
        "Combined silver history: %d rows from %d file(s).", len(combined), len(keys)
    )
    return combined


# ---------------------------------------------------------------------------
# Lambda entry point
# ---------------------------------------------------------------------------


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda entry point for the gold aggregation step.

    Reads the full silver cleaned-listings history, computes the dashboard
    aggregations (two populations: general + relevant), and writes the result
    to ``{GOLD_PREFIX}/latest.json``.

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
    bucket = _require_env("S3_BUCKET")
    silver_prefix = _get_env("SILVER_PREFIX", "silver/idealista")
    gold_prefix = _get_env("GOLD_PREFIX", "gold/aggregations")
    ratio_min_count = int(_get_env("RATIO_MIN_COUNT", "5"))

    # CRITICAL: boto3 client created inside the handler so moto can capture it.
    s3_client = boto3.client("s3")

    keys = _list_silver_parquet_keys(s3_client, bucket, silver_prefix)
    logger.info(
        "Found %d silver Parquet file(s) under s3://%s/%s/",
        len(keys),
        bucket,
        silver_prefix,
    )

    silver_df = _read_silver_history(s3_client, bucket, keys)

    # Delegate all analytical work to the pure, AWS-free aggregation module.
    aggregation = build_aggregation_json(silver_df, min_count=ratio_min_count)

    # Serialise: use str() as fallback for date/datetime objects not handled
    # by the default JSON encoder (snapshot_date is stored as a string in
    # silver Parquet, so in practice this fallback is rarely triggered).
    body = json.dumps(aggregation, default=str).encode("utf-8")

    output_key = f"{gold_prefix}/latest.json"
    s3_client.put_object(
        Bucket=bucket,
        Key=output_key,
        Body=body,
        ContentType="application/json",
    )
    logger.info(
        "Wrote aggregations (%d bytes) to s3://%s/%s",
        len(body),
        bucket,
        output_key,
    )

    return {
        "statusCode": 200,
        "key": output_key,
        "bytes": len(body),
    }
