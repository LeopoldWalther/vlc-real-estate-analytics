"""
Tests for the silver backfill script (Task 3.7).

backfill_silver.py discovers all distinct snapshot_dates in the bronze layer
and invokes the silver Lambda once per date asynchronously
(InvocationType="Event") with payload {"snapshot_date": "YYYY-MM-DD"}.

All AWS interactions are mocked with moto; no real credentials are needed.

Run with:
    pytest src/etl/data_processing/tests/test_backfill_silver.py -v
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any, Generator
from unittest.mock import MagicMock, patch

import boto3
import pytest
from moto import mock_aws

# Make the data_processing package importable.
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
BUCKET = "test-bucket"
BRONZE_PREFIX = "bronze/idealista"
FUNCTION_NAME = "dev-silver-cleaning-lambda"

_VALID_RENT_KEY_TEMPLATE = "{prefix}/rent_{date}_120044_1.json"
_VALID_SALE_KEY_TEMPLATE = "{prefix}/sale_{date}_120044_1.json"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _put_bronze_key(s3: Any, bucket: str, key: str) -> None:
    """Upload a minimal placeholder object so the key exists in moto S3."""
    s3.put_object(Bucket=bucket, Key=key, Body=b'{"elementList":[]}')


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def s3_with_snapshots() -> Generator[Any, None, None]:
    """
    Spin up a moto S3 bucket with bronze keys spanning three snapshot dates
    for both rent and sale operations.
    """
    with mock_aws():
        s3 = boto3.client("s3", region_name="eu-central-1")
        s3.create_bucket(
            Bucket=BUCKET,
            CreateBucketConfiguration={"LocationConstraint": "eu-central-1"},
        )
        for date_str in ["20230409", "20230416", "20230423"]:
            for op in ["rent", "sale"]:
                key = f"{BRONZE_PREFIX}/{op}_{date_str}_120044_1.json"
                _put_bronze_key(s3, BUCKET, key)
        yield s3


# ---------------------------------------------------------------------------
# RED tests — these FAIL before backfill_silver.py is implemented
# ---------------------------------------------------------------------------


class TestBackfillDiscoversSnapshotsAndInvokesLambda:
    """
    Core contract: backfill_silver discovers all unique snapshot_dates from
    bronze and invokes the Lambda once per date asynchronously.
    """

    def test_backfill_discovers_all_snapshot_dates_and_invokes_lambda(
        self, s3_with_snapshots: Any
    ) -> None:
        """
        RED → GREEN: run_backfill must list all distinct snapshot_dates from
        bronze and call lambda_client.invoke exactly once per date with
        InvocationType='Event' and the correct JSON payload.

        Three dates × 1 invoke per date = 3 Lambda invocations total.
        """
        from backfill_silver import run_backfill

        mock_lambda = MagicMock()
        mock_lambda.invoke.return_value = {"StatusCode": 202}

        run_backfill(
            s3_client=s3_with_snapshots,
            lambda_client=mock_lambda,
            bucket=BUCKET,
            bronze_prefix=BRONZE_PREFIX,
            function_name=FUNCTION_NAME,
            delay_ms=0,
        )

        assert mock_lambda.invoke.call_count == 3

        # Each call must use async invocation with the correct payload.
        for call in mock_lambda.invoke.call_args_list:
            kwargs = call.kwargs if call.kwargs else call[1]
            assert kwargs.get("InvocationType") == "Event"
            assert kwargs.get("FunctionName") == FUNCTION_NAME
            payload = json.loads(kwargs.get("Payload", b"{}"))
            assert "snapshot_date" in payload
            # Payload date must be ISO format YYYY-MM-DD.
            assert len(payload["snapshot_date"]) == 10
            assert payload["snapshot_date"][4] == "-"

        # All three dates must have been invoked.
        invoked_dates = {
            json.loads(
                c.kwargs.get("Payload", b"{}")
                if c.kwargs
                else c[1].get("Payload", b"{}")
            )["snapshot_date"]
            for c in mock_lambda.invoke.call_args_list
        }
        assert invoked_dates == {"2023-04-09", "2023-04-16", "2023-04-23"}

    def test_backfill_invokes_each_date_exactly_once(
        self, s3_with_snapshots: Any
    ) -> None:
        """
        Even when multiple operations share the same date, Lambda is invoked
        only once per date (not once per operation-date combination).
        """
        from backfill_silver import run_backfill

        mock_lambda = MagicMock()
        mock_lambda.invoke.return_value = {"StatusCode": 202}

        run_backfill(
            s3_client=s3_with_snapshots,
            lambda_client=mock_lambda,
            bucket=BUCKET,
            bronze_prefix=BRONZE_PREFIX,
            function_name=FUNCTION_NAME,
            delay_ms=0,
        )

        invoked_dates = [
            json.loads(
                c.kwargs.get("Payload", b"{}")
                if c.kwargs
                else c[1].get("Payload", b"{}")
            )["snapshot_date"]
            for c in mock_lambda.invoke.call_args_list
        ]
        # No date appears twice.
        assert len(invoked_dates) == len(set(invoked_dates))


class TestBackfillFunctionNameResolution:
    """
    Lambda function name must come from --function-name arg or
    SILVER_LAMBDA_FUNCTION_NAME env variable; fail clearly if neither is set.
    """

    def test_missing_function_name_raises_system_exit(self) -> None:
        """
        main() raises SystemExit when neither --function-name nor
        SILVER_LAMBDA_FUNCTION_NAME is provided.
        """
        from backfill_silver import main

        env = {
            k: v for k, v in os.environ.items() if k != "SILVER_LAMBDA_FUNCTION_NAME"
        }
        with patch.dict(os.environ, env, clear=True):
            with pytest.raises(SystemExit):
                main(["--bucket", BUCKET, "--bronze-prefix", BRONZE_PREFIX])


class TestBackfillDelayMs:
    """--delay-ms controls the sleep between Lambda invocations."""

    def test_delay_ms_zero_skips_sleep(self, s3_with_snapshots: Any) -> None:
        """
        When delay_ms=0, time.sleep is never called.
        """
        from backfill_silver import run_backfill

        mock_lambda = MagicMock()
        mock_lambda.invoke.return_value = {"StatusCode": 202}

        with patch("backfill_silver.time.sleep") as mock_sleep:
            run_backfill(
                s3_client=s3_with_snapshots,
                lambda_client=mock_lambda,
                bucket=BUCKET,
                bronze_prefix=BRONZE_PREFIX,
                function_name=FUNCTION_NAME,
                delay_ms=0,
            )

        mock_sleep.assert_not_called()

    def test_delay_ms_nonzero_sleeps_between_invocations(
        self, s3_with_snapshots: Any
    ) -> None:
        """
        When delay_ms=200, time.sleep(0.2) is called between invocations
        (N-1 times for N dates, or N times — both are acceptable; we check
        that sleep was called at least once with the correct duration).
        """
        from backfill_silver import run_backfill

        mock_lambda = MagicMock()
        mock_lambda.invoke.return_value = {"StatusCode": 202}

        with patch("backfill_silver.time.sleep") as mock_sleep:
            run_backfill(
                s3_client=s3_with_snapshots,
                lambda_client=mock_lambda,
                bucket=BUCKET,
                bronze_prefix=BRONZE_PREFIX,
                function_name=FUNCTION_NAME,
                delay_ms=200,
            )

        mock_sleep.assert_called()
        # All sleep calls must use 0.2 seconds.
        for call in mock_sleep.call_args_list:
            args = call.args if call.args else call[0]
            assert args[0] == pytest.approx(0.2)


class TestBackfillEmptyBronze:
    """Empty bronze prefix produces zero Lambda invocations without error."""

    def test_empty_bronze_invokes_no_lambda(self) -> None:
        """run_backfill returns cleanly when no bronze keys exist."""
        from backfill_silver import run_backfill

        with mock_aws():
            s3 = boto3.client("s3", region_name="eu-central-1")
            s3.create_bucket(
                Bucket=BUCKET,
                CreateBucketConfiguration={"LocationConstraint": "eu-central-1"},
            )

            mock_lambda = MagicMock()

            run_backfill(
                s3_client=s3,
                lambda_client=mock_lambda,
                bucket=BUCKET,
                bronze_prefix=BRONZE_PREFIX,
                function_name=FUNCTION_NAME,
                delay_ms=0,
            )

        mock_lambda.invoke.assert_not_called()
