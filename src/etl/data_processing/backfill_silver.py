"""
Backfill script for the silver cleaning Lambda.

Discovers all distinct ``snapshot_date`` values in the bronze S3 layer and
invokes the silver cleaning Lambda once per date asynchronously
(``InvocationType="Event"``), passing ``{"snapshot_date": "YYYY-MM-DD"}`` as
the payload.

The Lambda's own incremental guard (Task 3.6) silently skips dates whose
silver Parquet already exists, so this script is safe to re-run.

Usage::

    python backfill_silver.py \\
        --bucket <s3-bucket-name> \\
        --bronze-prefix bronze/idealista \\
        --function-name dev-silver-cleaning-lambda \\
        [--delay-ms 100]

The Lambda function name can also be provided via the
``SILVER_LAMBDA_FUNCTION_NAME`` environment variable instead of
``--function-name``.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import time
from datetime import date, datetime
from typing import Any, List, Optional

import boto3

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


def _list_snapshot_dates(
    s3_client: Any,
    bucket: str,
    bronze_prefix: str,
) -> List[date]:
    """
    List all distinct snapshot dates present in the bronze S3 prefix.

    Scans every ``.json`` key under *bronze_prefix* and parses the date
    segment from the filename pattern
    ``{operation}_{YYYYMMDD}_{HHMMSS}_{page}.json``.  Dates are returned in
    ascending (chronological) order.

    Args:
        s3_client: Boto3 S3 client.
        bucket: S3 bucket name.
        bronze_prefix: S3 prefix for bronze objects (e.g. ``"bronze/idealista"``).

    Returns:
        Sorted list of unique snapshot dates found in the prefix.
    """
    paginator = s3_client.get_paginator("list_objects_v2")
    dates: set[date] = set()

    for page in paginator.paginate(Bucket=bucket, Prefix=bronze_prefix + "/"):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if not key.endswith(".json"):
                continue
            # Key format: {prefix}/{operation}_{YYYYMMDD}_{HHMMSS}_{page}.json
            filename = key.split("/")[-1]  # e.g. "rent_20230409_120044_1.json"
            parts = filename.replace(".json", "").split("_")
            if len(parts) < 4:
                logger.debug("Skipping unrecognised key: %s", key)
                continue
            try:
                snapshot_date = datetime.strptime(parts[1], "%Y%m%d").date()
                dates.add(snapshot_date)
            except ValueError:
                logger.debug("Cannot parse date from key: %s", key)

    return sorted(dates)


def run_backfill(
    s3_client: Any,
    lambda_client: Any,
    bucket: str,
    bronze_prefix: str,
    function_name: str,
    delay_ms: int = 100,
) -> None:
    """
    Fan out one async Lambda invocation per distinct snapshot date in bronze.

    Each invocation uses ``InvocationType="Event"`` (fire-and-forget) and
    passes ``{"snapshot_date": "YYYY-MM-DD"}`` as the payload so the Lambda's
    ``event["snapshot_date"]`` override (Task 3.6) routes the run to the
    correct historical snapshot.

    The Lambda's incremental guard skips dates whose silver Parquet already
    exists, making this function safe to call multiple times.

    Args:
        s3_client: Boto3 S3 client (used for listing bronze keys).
        lambda_client: Boto3 Lambda client (used for async invocations).
        bucket: S3 bucket name.
        bronze_prefix: S3 prefix for bronze objects.
        function_name: Name or ARN of the silver cleaning Lambda function.
        delay_ms: Milliseconds to sleep between invocations (default 100).
            Set to 0 in tests to skip sleeping.
    """
    snapshot_dates = _list_snapshot_dates(s3_client, bucket, bronze_prefix)

    if not snapshot_dates:
        logger.info("No snapshot dates found under %s/%s/", bucket, bronze_prefix)
        return

    logger.info(
        "Found %d distinct snapshot date(s) to backfill: %s … %s",
        len(snapshot_dates),
        snapshot_dates[0].isoformat(),
        snapshot_dates[-1].isoformat(),
    )

    for i, snapshot_date in enumerate(snapshot_dates):
        iso_date = snapshot_date.isoformat()
        payload = json.dumps({"snapshot_date": iso_date}).encode()

        logger.info(
            "[%d/%d] Invoking %s for snapshot_date=%s",
            i + 1,
            len(snapshot_dates),
            function_name,
            iso_date,
        )

        lambda_client.invoke(
            FunctionName=function_name,
            InvocationType="Event",
            Payload=payload,
        )

        # Throttle between invocations to avoid hitting reserved-concurrency
        # limits when there are many historical snapshots (~100+).
        if delay_ms > 0:
            time.sleep(delay_ms / 1000.0)

    logger.info("Backfill dispatched %d async invocation(s).", len(snapshot_dates))


def main(argv: Optional[List[str]] = None) -> None:
    """
    CLI entry point for the backfill script.

    Parses arguments, resolves the Lambda function name (``--function-name``
    flag or ``SILVER_LAMBDA_FUNCTION_NAME`` env variable), and calls
    :func:`run_backfill`.

    Args:
        argv: Argument list for testing; defaults to ``sys.argv[1:]``.

    Raises:
        SystemExit: If ``--function-name`` is not provided and
            ``SILVER_LAMBDA_FUNCTION_NAME`` is not set, or if required
            arguments are missing.
    """
    parser = argparse.ArgumentParser(
        description="Backfill the silver cleaning Lambda for all historical bronze snapshots."
    )
    parser.add_argument(
        "--bucket",
        required=True,
        help="S3 bucket name containing the bronze layer.",
    )
    parser.add_argument(
        "--bronze-prefix",
        default="bronze/idealista",
        help="S3 prefix for bronze objects (default: bronze/idealista).",
    )
    parser.add_argument(
        "--function-name",
        default=None,
        help=(
            "Silver cleaning Lambda function name or ARN. "
            "Falls back to SILVER_LAMBDA_FUNCTION_NAME env variable."
        ),
    )
    parser.add_argument(
        "--delay-ms",
        type=int,
        default=100,
        help="Milliseconds to sleep between Lambda invocations (default: 100).",
    )

    args = parser.parse_args(argv)

    # Resolve Lambda function name: CLI arg takes precedence over env variable.
    function_name: Optional[str] = args.function_name or os.environ.get(
        "SILVER_LAMBDA_FUNCTION_NAME"
    )
    if not function_name:
        parser.error(
            "Lambda function name is required. "
            "Provide --function-name or set SILVER_LAMBDA_FUNCTION_NAME."
        )

    s3_client = boto3.client("s3")
    lambda_client = boto3.client("lambda")

    run_backfill(
        s3_client=s3_client,
        lambda_client=lambda_client,
        bucket=args.bucket,
        bronze_prefix=args.bronze_prefix,
        function_name=function_name,
        delay_ms=args.delay_ms,
    )


if __name__ == "__main__":
    main()
