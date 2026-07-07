"""
Silver cleaning Lambda handler (thin, FEATURE-008).

Triggered weekly after the bronze collector. All cleaning orchestration
lives in :class:`silver_cleaner.SilverCleaner`; this module only

1. wires up the production ``S3ObjectStore`` (**Factory** —
   :func:`build_cleaner`), and
2. maps the :class:`~silver_cleaner.CleaningResult` onto the Lambda
   response, preserving the FEATURE-007 contract fields
   ``parquet_files_written`` and ``rows_written``.

Design decisions (unchanged from the original handler):
- **Scheduled, not per-object:** one snapshot = many paginated files.
- **Idempotent:** deterministic Parquet keys + incremental exists-guard.
- **AWS-managed pandas layer:** pandas/pyarrow come from
  ``AWSSDKPandas-Python312``, not the deployment package.
"""

from __future__ import annotations

import logging
import os
from datetime import date, datetime
from typing import Any, Dict

from common.object_store import S3ObjectStore
from silver_cleaner import SilverCleaner

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


def build_cleaner(env: Dict[str, str]) -> SilverCleaner:
    """
    Factory: construct a fully wired production SilverCleaner.

    The S3 client is created here — at handler-call time — so that moto's
    ``mock_aws()`` context is already active in tests.

    Args:
        env: Environment mapping (normally ``os.environ``) providing
            S3_BUCKET, BRONZE_PREFIX and SILVER_PREFIX.

    Returns:
        A ready-to-run cleaner.

    Raises:
        ValueError: If a required environment variable is missing.
    """
    bucket = _get_env("S3_BUCKET")
    bronze_prefix = _get_env("BRONZE_PREFIX")
    silver_prefix = _get_env("SILVER_PREFIX")

    return SilverCleaner(
        object_store=S3ObjectStore(bucket=bucket),
        bronze_prefix=bronze_prefix,
        silver_prefix=silver_prefix,
    )


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda entry point for the silver cleaning step.

    Args:
        event: Lambda event payload. Supports an optional key:

            - ``snapshot_date`` (``str``, ISO format ``"YYYY-MM-DD"``):
              when present, process only this specific snapshot date instead
              of falling back to the latest-snapshot behaviour.

        context: Lambda runtime context (unused).

    Returns:
        A dict with ``statusCode`` 200, a ``body`` summary and the
        FEATURE-007 fields ``parquet_files_written`` / ``rows_written``.

    Raises:
        ValueError: If required environment variables are missing.
        Exception: Propagated on unexpected S3 or transform errors (Lambda
            will retry and CloudWatch/SNS alarm will fire).
    """
    logger.info("Silver cleaning Lambda started.")

    # Resolve the optional snapshot_date override from the event payload.
    target_date: date | None = None
    raw_override = event.get("snapshot_date") if isinstance(event, dict) else None
    if raw_override:
        target_date = datetime.strptime(raw_override, "%Y-%m-%d").date()
        logger.info("snapshot_date override: processing %s only", target_date)

    cleaner = build_cleaner(dict(os.environ))
    result = cleaner.clean_snapshots(target_date)

    return {
        "statusCode": 200,
        "parquet_files_written": len(result.written_keys),
        "rows_written": result.rows_written,
        "body": result.message,
    }
