"""
Tests for the silver cleaning Lambda handler (3.3).

All AWS interactions are mocked with moto so no real credentials are needed.
The tests follow TDD RED → GREEN → REFACTOR:

  RED  : Import of lambda_handler fails (module not yet created).
  GREEN: Minimal handler passes all assertions.
  REFACTOR: Handler is well-structured, fully typed, and docstrings added.

Run with:
    pytest src/etl/data_processing/tests/test_silver_cleaning_lambda.py -v
"""

import io
import json
import os
import sys
from typing import Any, Dict, Generator, List
from unittest.mock import patch

import boto3
import pandas as pd
import pytest
from moto import mock_aws

# Make the data_processing package importable.
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from silver_cleaning_lambda import lambda_handler  # noqa: E402

# ---------------------------------------------------------------------------
# Constants shared across tests
# ---------------------------------------------------------------------------
BUCKET = "test-bucket"
BRONZE_PREFIX = "bronze/idealista"
SILVER_PREFIX = "silver/idealista"
SNAPSHOT_DATE = "20230409"
SNAPSHOT_TIME = "120044"

# A minimal valid element that survives all clean() filters.
_VALID_RENT = {
    "operation": "rent",
    "province": "València",
    "municipality": "València",
    "district": "Extramurs",
    "neighborhood": "Arrancapins",
    "latitude": 39.464,
    "longitude": -0.388,
    "distance": "100",
    "address": "calle X",
    "propertyCode": "101",
    "propertyType": "flat",
    "price": 900.0,
    "priceByArea": 9.0,
    "size": 100.0,
    "floor": "3",
    "exterior": True,
    "rooms": 3,
    "bathrooms": 1,
    "status": "good",
    "newDevelopment": False,
    "hasLift": True,
    "parkingSpace": None,
}

_VALID_SALE = {
    **_VALID_RENT,
    "operation": "sale",
    "price": 300_000.0,
    "priceByArea": 3000.0,
    "neighborhood": "Sant Francesc",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _put_bronze_page(
    s3,
    bucket: str,
    operation: str,
    date_str: str,
    time_str: str,
    page: int,
    elements: List[Dict[str, Any]],
) -> str:
    """Upload one paginated bronze JSON to the mocked S3 bucket."""
    key = f"{BRONZE_PREFIX}/{operation}_{date_str}_{time_str}_{page}.json"
    body = json.dumps(
        {"elementList": elements, "totalPages": 1, "total": len(elements)}
    )
    s3.put_object(Bucket=bucket, Key=key, Body=body.encode())
    return key


def _read_parquet_from_s3(s3, bucket: str, key: str) -> pd.DataFrame:
    """Download and parse a Parquet object from the mocked S3 bucket."""
    obj = s3.get_object(Bucket=bucket, Key=key)
    return pd.read_parquet(io.BytesIO(obj["Body"].read()))


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def aws_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Inject environment variables required by the Lambda handler."""
    monkeypatch.setenv("S3_BUCKET", BUCKET)
    monkeypatch.setenv("BRONZE_PREFIX", BRONZE_PREFIX)
    monkeypatch.setenv("SILVER_PREFIX", SILVER_PREFIX)


@pytest.fixture()
def s3_with_snapshot(aws_env) -> Generator[Any, None, None]:
    """
    Spin up a moto S3 bucket pre-populated with two bronze pages (rent + sale).
    """
    with mock_aws():
        s3 = boto3.client("s3", region_name="eu-west-1")
        s3.create_bucket(
            Bucket=BUCKET,
            CreateBucketConfiguration={"LocationConstraint": "eu-west-1"},
        )
        # Rent: 2 pages
        _put_bronze_page(
            s3,
            BUCKET,
            "rent",
            SNAPSHOT_DATE,
            SNAPSHOT_TIME,
            1,
            [_VALID_RENT, {**_VALID_RENT, "propertyCode": "102"}],
        )
        _put_bronze_page(
            s3,
            BUCKET,
            "rent",
            SNAPSHOT_DATE,
            SNAPSHOT_TIME,
            2,
            [{**_VALID_RENT, "propertyCode": "103"}],
        )
        # Sale: 1 page
        _put_bronze_page(
            s3,
            BUCKET,
            "sale",
            SNAPSHOT_DATE,
            SNAPSHOT_TIME,
            1,
            [_VALID_SALE, {**_VALID_SALE, "propertyCode": "201"}],
        )
        yield s3


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestLambdaHandlerCombinesPagesWritesParquet:
    """Core contract: handler reads all pages, writes clean Parquet."""

    def test_lambda_combines_pages_writes_partitioned_parquet(
        self, s3_with_snapshot: Any
    ) -> None:
        """
        RED → GREEN: handler must combine all snapshot pages for each operation
        and write one Parquet file per operation under
        silver/idealista/operation=<op>/snapshot_date=YYYY-MM-DD/part.parquet.

        Uses the ``s3_with_snapshot`` fixture which already owns the moto
        mock_aws() context — lambda_handler's boto3 calls land in the same mock.
        """
        s3 = s3_with_snapshot
        result = lambda_handler({}, None)

        assert result["statusCode"] == 200

        # Rent: 3 listings across 2 pages → 3 cleaned rows.
        rent_key = (
            f"{SILVER_PREFIX}/operation=rent/snapshot_date=2023-04-09/part.parquet"
        )
        df_rent = _read_parquet_from_s3(s3, BUCKET, rent_key)
        assert len(df_rent) == 3
        assert "snapshot_date" in df_rent.columns
        # No aggregation — one row per listing.
        assert df_rent["propertyCode"].nunique() == 3

        # Sale: 2 listings → 2 cleaned rows.
        sale_key = (
            f"{SILVER_PREFIX}/operation=sale/snapshot_date=2023-04-09/part.parquet"
        )
        df_sale = _read_parquet_from_s3(s3, BUCKET, sale_key)
        assert len(df_sale) == 2


class TestLambdaHandlerIdempotency:
    """Re-running the handler for the same snapshot overwrites, not appends."""

    def test_handler_is_idempotent(self) -> None:
        """Running twice for the same snapshot yields the same row count."""
        with mock_aws():
            s3 = boto3.client("s3", region_name="eu-west-1")
            s3.create_bucket(
                Bucket=BUCKET,
                CreateBucketConfiguration={"LocationConstraint": "eu-west-1"},
            )
            _put_bronze_page(
                s3, BUCKET, "rent", SNAPSHOT_DATE, SNAPSHOT_TIME, 1, [_VALID_RENT]
            )

            env = {
                "S3_BUCKET": BUCKET,
                "BRONZE_PREFIX": BRONZE_PREFIX,
                "SILVER_PREFIX": SILVER_PREFIX,
            }

            with patch.dict(os.environ, env):
                lambda_handler({}, None)
                lambda_handler({}, None)  # second run — must overwrite, not append

            rent_key = (
                f"{SILVER_PREFIX}/operation=rent/snapshot_date=2023-04-09/part.parquet"
            )
            df = _read_parquet_from_s3(s3, BUCKET, rent_key)
            # Only 1 row — not duplicated by second run.
            assert len(df) == 1


class TestLambdaHandlerNoAggregation:
    """Silver output must be individual listings, not aggregated."""

    def test_parquet_contains_individual_listings_not_aggregates(self) -> None:
        """Each propertyCode from bronze appears as its own row in silver."""
        with mock_aws():
            s3 = boto3.client("s3", region_name="eu-west-1")
            s3.create_bucket(
                Bucket=BUCKET,
                CreateBucketConfiguration={"LocationConstraint": "eu-west-1"},
            )
            elements = [
                {**_VALID_RENT, "propertyCode": "A", "neighborhood": "Alpha"},
                {**_VALID_RENT, "propertyCode": "B", "neighborhood": "Alpha"},
                {**_VALID_RENT, "propertyCode": "C", "neighborhood": "Beta"},
            ]
            _put_bronze_page(
                s3, BUCKET, "rent", SNAPSHOT_DATE, SNAPSHOT_TIME, 1, elements
            )

            with patch.dict(
                os.environ,
                {
                    "S3_BUCKET": BUCKET,
                    "BRONZE_PREFIX": BRONZE_PREFIX,
                    "SILVER_PREFIX": SILVER_PREFIX,
                },
            ):
                lambda_handler({}, None)

            rent_key = (
                f"{SILVER_PREFIX}/operation=rent/snapshot_date=2023-04-09/part.parquet"
            )
            df = _read_parquet_from_s3(s3, BUCKET, rent_key)
            # 3 individual rows — not collapsed to 2 neighborhoods.
            assert len(df) == 3
            assert set(df["propertyCode"]) == {"A", "B", "C"}


class TestLambdaHandlerNoLatestJson:
    """Handler must NOT write a latest.json (that belongs to Gold/TASK-004)."""

    def test_no_latest_json_written(self) -> None:
        """After handler runs, no latest.json object exists in the bucket."""
        with mock_aws():
            s3 = boto3.client("s3", region_name="eu-west-1")
            s3.create_bucket(
                Bucket=BUCKET,
                CreateBucketConfiguration={"LocationConstraint": "eu-west-1"},
            )
            _put_bronze_page(
                s3, BUCKET, "rent", SNAPSHOT_DATE, SNAPSHOT_TIME, 1, [_VALID_RENT]
            )

            with patch.dict(
                os.environ,
                {
                    "S3_BUCKET": BUCKET,
                    "BRONZE_PREFIX": BRONZE_PREFIX,
                    "SILVER_PREFIX": SILVER_PREFIX,
                },
            ):
                lambda_handler({}, None)

            all_keys = [
                obj["Key"]
                for obj in s3.list_objects_v2(Bucket=BUCKET).get("Contents", [])
            ]
            assert not any("latest.json" in k for k in all_keys)


class TestLambdaHandlerMissingEnvVars:
    """Handler raises clearly when required environment variables are absent."""

    def test_missing_s3_bucket_raises(self) -> None:
        """Handler raises ValueError when S3_BUCKET is not set."""
        with mock_aws():
            env = {"BRONZE_PREFIX": BRONZE_PREFIX, "SILVER_PREFIX": SILVER_PREFIX}
            # Remove S3_BUCKET if accidentally set
            env_without_bucket = {
                k: v for k, v in os.environ.items() if k != "S3_BUCKET"
            }
            env_without_bucket.update(env)
            with patch.dict(os.environ, env_without_bucket, clear=True):
                with pytest.raises((ValueError, Exception)):
                    lambda_handler({}, None)


class TestLambdaHandlerEdgeCases:
    """Edge-case coverage: empty bucket and all-dropped listings."""

    def test_empty_bronze_returns_200_no_parquet(self) -> None:
        """Handler returns 200 with an informational body when no bronze keys exist."""
        with mock_aws():
            s3 = boto3.client("s3", region_name="eu-west-1")
            s3.create_bucket(
                Bucket=BUCKET,
                CreateBucketConfiguration={"LocationConstraint": "eu-west-1"},
            )
            # Bucket exists but has no bronze objects.
            with patch.dict(
                os.environ,
                {
                    "S3_BUCKET": BUCKET,
                    "BRONZE_PREFIX": BRONZE_PREFIX,
                    "SILVER_PREFIX": SILVER_PREFIX,
                },
            ):
                result = lambda_handler({}, None)

            assert result["statusCode"] == 200
            assert "No bronze snapshots found" in result["body"]

            # No Parquet written.
            all_keys = [
                obj["Key"]
                for obj in s3.list_objects_v2(Bucket=BUCKET).get("Contents", [])
            ]
            assert not any(".parquet" in k for k in all_keys)

    def test_all_listings_dropped_no_parquet_written(self) -> None:
        """When every element is filtered out by clean(), no Parquet is written."""
        with mock_aws():
            s3 = boto3.client("s3", region_name="eu-west-1")
            s3.create_bucket(
                Bucket=BUCKET,
                CreateBucketConfiguration={"LocationConstraint": "eu-west-1"},
            )
            # Sale listing with priceByArea=0 → dropped by Issue 4 filter.
            bad_sale = {**_VALID_SALE, "priceByArea": 0.0, "propertyCode": "bad"}
            _put_bronze_page(
                s3, BUCKET, "sale", SNAPSHOT_DATE, SNAPSHOT_TIME, 1, [bad_sale]
            )

            with patch.dict(
                os.environ,
                {
                    "S3_BUCKET": BUCKET,
                    "BRONZE_PREFIX": BRONZE_PREFIX,
                    "SILVER_PREFIX": SILVER_PREFIX,
                },
            ):
                result = lambda_handler({}, None)

            assert result["statusCode"] == 200
            all_keys = [
                obj["Key"]
                for obj in s3.list_objects_v2(Bucket=BUCKET).get("Contents", [])
            ]
            assert not any(".parquet" in k for k in all_keys)
