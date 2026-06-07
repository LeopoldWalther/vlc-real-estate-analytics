"""
Silver cleaning Lambda handler.

Triggered by a scheduled AWS EventBridge rule (``cron(30 12 ? * SUN *)``),
shortly after the bronze collector runs. It reads all paginated JSON files for
the latest weekly snapshot from the bronze S3 layer, calls the pure
:func:`silver_transform.clean` function, and writes the resulting
cleaned individual listings as Parquet, partitioned by
``operation`` and ``snapshot_date``, to the silver S3 layer.

Design decisions:
- **Scheduled, not per-object:** one snapshot = many paginated files; a
  per-object trigger would produce partial aggregations. Scheduling decouples
  the trigger from individual file arrivals.
- **Idempotent:** the Parquet output key is fully determined by
  ``(operation, snapshot_date)``, so re-running the same schedule date
  overwrites rather than appends.
- **AWS-managed pandas layer:** pandas/pyarrow are NOT bundled in the
  deployment package; they arrive via the ``AWSSDKPandas-Python312`` layer.
- **No aggregation, no latest.json:** silver = cleaned individual listings
  only. Aggregation and the pre-computed dashboard JSON belong to the Gold
  layer (TASK-004).
"""

from __future__ import annotations

import io
import json
import logging
import os
from datetime import date
from typing import Any, Dict, List, Tuple

import boto3
import pandas as pd

# silver_transform lives in the same directory (Lambda deployment package).
from silver_transform import clean, parse_key_metadata

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def _get_env(name: str) -> str:
    """
    Read a required environment variable, raising clearly if absent.

    Args:
        name: Environment variable name.

    Returns:
        The variable's string value.

    Raises:
        ValueError: If the variable is not set or empty.
    """
    value = os.environ.get(name, "").strip()
    if not value:
        raise ValueError(f"Required environment variable '{name}' is not set.")
    return value


def _list_snapshot_keys(
    s3_client: Any,
    bucket: str,
    bronze_prefix: str,
    target_date: date | None = None,
) -> Dict[Tuple[str, date], List[str]]:
    """
    List all bronze object keys and group them by ``(operation, snapshot_date)``.

    The collector names files ``{operation}_{YYYYMMDD}_{HHMMSS}_{page}.json``
    under ``{bronze_prefix}/``. When *target_date* is given, this function
    returns **all keys for that specific date** across every operation that has
    data on that date. When *target_date* is ``None`` (the default), it returns
    only the **latest** snapshot for each operation.

    Args:
        s3_client: Boto3 S3 client.
        bucket: S3 bucket name.
        bronze_prefix: S3 prefix for bronze objects (e.g. ``"bronze/idealista"``).
        target_date: When set, return keys for this exact snapshot date instead
            of filtering to the latest per operation.

    Returns:
        Mapping of ``(operation, snapshot_date)`` → list of S3 object keys
        for the selected snapshot(s).
    """
    paginator = s3_client.get_paginator("list_objects_v2")
    all_keys: List[str] = []
    for page in paginator.paginate(Bucket=bucket, Prefix=bronze_prefix + "/"):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if key.endswith(".json"):
                all_keys.append(key)

    # Parse every key and group by (operation, snapshot_date).
    groups: Dict[Tuple[str, date], List[str]] = {}
    for key in all_keys:
        try:
            operation, snapshot_date, _ = parse_key_metadata(key)
        except ValueError:
            logger.warning("Skipping unrecognised bronze key: %s", key)
            continue
        groups.setdefault((operation, snapshot_date), []).append(key)

    if target_date is not None:
        # Return all keys whose snapshot_date matches the requested date.
        return {
            (op, snap_date): keys
            for (op, snap_date), keys in groups.items()
            if snap_date == target_date
        }

    # Default: keep only the latest snapshot_date per operation.
    latest: Dict[str, date] = {}
    for operation, snap_date in groups:
        if operation not in latest or snap_date > latest[operation]:
            latest[operation] = snap_date

    return {
        (op, snap_date): keys
        for (op, snap_date), keys in groups.items()
        if latest.get(op) == snap_date
    }


def _read_elements(s3_client: Any, bucket: str, key: str) -> List[Dict[str, Any]]:
    """
    Download one bronze JSON object and return its ``elementList``.

    Args:
        bucket: S3 bucket name.
        key: S3 object key.

    Returns:
        List of raw listing dicts, or empty list if the key has no elementList.
    """
    obj = s3_client.get_object(Bucket=bucket, Key=key)
    payload: Dict[str, Any] = json.loads(obj["Body"].read())
    return payload.get("elementList", [])


def _parquet_key_exists(s3_client: Any, bucket: str, key: str) -> bool:
    """
    Return ``True`` when *key* already exists in *bucket*, ``False`` otherwise.

    Uses ``HeadObject`` so no data is downloaded.  A ``ClientError`` with code
    ``"404"`` means the key is absent; any other error is re-raised.

    Args:
        s3_client: Boto3 S3 client.
        bucket: S3 bucket name.
        key: S3 object key to check.

    Returns:
        ``True`` if the key exists, ``False`` if it does not.
    """
    import botocore.exceptions

    try:
        s3_client.head_object(Bucket=bucket, Key=key)
        return True
    except botocore.exceptions.ClientError as exc:
        if exc.response["Error"]["Code"] in ("404", "NoSuchKey"):
            return False
        raise


def _write_parquet(
    s3_client: Any,
    bucket: str,
    silver_prefix: str,
    operation: str,
    snapshot_date: date,
    rows: List[Dict[str, Any]],
) -> str:
    """
    Serialise cleaned listing rows to Parquet and write to the silver S3 layer.

    The output key is fully deterministic:
    ``{silver_prefix}/operation={op}/snapshot_date=YYYY-MM-DD/part.parquet``
    so re-running the handler overwrites the previous output (idempotent).

    Args:
        bucket: S3 bucket name.
        silver_prefix: S3 prefix for silver objects (e.g. ``"silver/idealista"``).
        operation: ``"rent"`` or ``"sale"``.
        snapshot_date: Date of the snapshot (used in the partition path).
        rows: Cleaned listing dicts as returned by :func:`silver_transform.clean`.

    Returns:
        The S3 key the Parquet was written to.
    """
    df = pd.DataFrame(rows)

    # Serialise snapshot_date as a plain string so Parquet roundtrips cleanly
    # without timezone/precision surprises. Downstream readers (Gold Lambda,
    # notebooks) can parse the ISO string as needed.
    if "snapshot_date" in df.columns:
        df["snapshot_date"] = df["snapshot_date"].astype(str)

    buffer = io.BytesIO()
    df.to_parquet(buffer, index=False, engine="pyarrow")
    buffer.seek(0)

    iso_date = snapshot_date.isoformat()
    key = (
        f"{silver_prefix}/operation={operation}"
        f"/snapshot_date={iso_date}/part.parquet"
    )
    s3_client.put_object(Bucket=bucket, Key=key, Body=buffer.read())
    logger.info("Wrote %d rows to s3://%s/%s", len(rows), bucket, key)
    return key


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda entry point for the silver cleaning step.

    Reads environment variables, lists bronze snapshot keys for the target
    date (or the latest snapshot when no date is specified), combines all
    pages per ``(operation, snapshot_date)``, calls
    :func:`silver_transform.clean`, and writes cleaned Parquet to silver.

    **Incremental guard:** before writing, the handler checks whether the
    output Parquet key already exists in S3 (via ``HeadObject``). If it does,
    the write is skipped and the result is logged. This prevents redundant
    re-processing on weekly re-runs and makes the handler safe to call
    multiple times for the same snapshot.

    Args:
        event: Lambda event payload. Supports an optional key:

            - ``snapshot_date`` (``str``, ISO format ``"YYYY-MM-DD"``):
              when present, process only this specific snapshot date instead
              of falling back to the latest-snapshot behaviour.

        context: Lambda runtime context (unused).

    Returns:
        A dict with ``statusCode`` 200 and a ``body`` summary on success.

    Raises:
        ValueError: If required environment variables are missing.
        Exception: Propagated on unexpected S3 or transform errors (Lambda
            will retry and CloudWatch/SNS alarm will fire).
    """
    bucket = _get_env("S3_BUCKET")
    bronze_prefix = _get_env("BRONZE_PREFIX")
    silver_prefix = _get_env("SILVER_PREFIX")

    # Create the S3 client here (inside the handler call) so that moto's
    # mock_aws() context is already active when the client is instantiated.
    s3 = boto3.client("s3")

    logger.info("Silver cleaning Lambda started. Bucket: %s", bucket)

    # Resolve the optional snapshot_date override from the event payload.
    target_date: date | None = None
    raw_override = event.get("snapshot_date") if isinstance(event, dict) else None
    if raw_override:
        from datetime import datetime

        target_date = datetime.strptime(raw_override, "%Y-%m-%d").date()
        logger.info("snapshot_date override: processing %s only", target_date)

    snapshot_groups = _list_snapshot_keys(s3, bucket, bronze_prefix, target_date)
    if not snapshot_groups:
        logger.warning("No bronze snapshot keys found under %s/", bronze_prefix)
        return {"statusCode": 200, "body": "No bronze snapshots found."}

    written: List[str] = []
    for (operation, snapshot_date), keys in sorted(snapshot_groups.items()):
        logger.info(
            "Processing operation=%s snapshot_date=%s (%d pages)",
            operation,
            snapshot_date,
            len(keys),
        )

        # Combine all paginated files for this snapshot into one element list.
        all_elements: List[Dict[str, Any]] = []
        for key in sorted(keys):
            all_elements.extend(_read_elements(s3, bucket, key))

        cleaned = clean(all_elements, snapshot_date, operation)
        logger.info(
            "operation=%s snapshot_date=%s: %d raw → %d cleaned",
            operation,
            snapshot_date,
            len(all_elements),
            len(cleaned),
        )

        if not cleaned:
            logger.warning(
                "All listings dropped for operation=%s snapshot_date=%s — skipping Parquet write.",
                operation,
                snapshot_date,
            )
            continue

        # Incremental guard: skip if the output Parquet already exists.
        iso_date = snapshot_date.isoformat()
        out_key = (
            f"{silver_prefix}/operation={operation}"
            f"/snapshot_date={iso_date}/part.parquet"
        )
        if _parquet_key_exists(s3, bucket, out_key):
            logger.info(
                "Parquet already exists for operation=%s snapshot_date=%s — skipping.",
                operation,
                snapshot_date,
            )
            continue

        written_key = _write_parquet(
            s3, bucket, silver_prefix, operation, snapshot_date, cleaned
        )
        written.append(written_key)

    return {
        "statusCode": 200,
        "body": f"Wrote {len(written)} Parquet file(s): {written}",
    }
