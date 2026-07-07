"""
Unit tests for SilverCleaner (FEATURE-008) — no AWS, no moto.

The cleaner is exercised end-to-end against ``InMemoryObjectStore``,
proving the class depends only on the ObjectStore protocol (DI) while the
pure row rules in ``silver_transform`` stay untouched.
"""

from __future__ import annotations

import io
import json
import os
import sys
from datetime import date
from typing import Any, Dict, List

import pandas as pd

# src/etl on sys.path for `common`, data_processing for flat imports.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from common.object_store import InMemoryObjectStore  # noqa: E402

from silver_cleaner import CleaningResult, SilverCleaner  # noqa: E402

BRONZE_PREFIX = "bronze/idealista"
SILVER_PREFIX = "silver/idealista"

# Minimal valid elements that survive all clean() filters (mirrors the
# handler integration tests).
_VALID_RENT: Dict[str, Any] = {
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

_VALID_SALE: Dict[str, Any] = {
    **_VALID_RENT,
    "operation": "sale",
    "price": 300_000.0,
    "priceByArea": 3000.0,
    "neighborhood": "Sant Francesc",
}


def _put_bronze_page(
    store: InMemoryObjectStore,
    operation: str,
    date_str: str,
    page: int,
    elements: List[Dict[str, Any]],
) -> str:
    """Store one paginated bronze JSON page in the fake object store."""
    key = f"{BRONZE_PREFIX}/{operation}_{date_str}_120044_{page}.json"
    body = json.dumps({"elementList": elements, "totalPages": 1})
    store.put_bytes(key, body.encode(), content_type="application/json")
    return key


def make_cleaner(store: InMemoryObjectStore) -> SilverCleaner:
    """Build a SilverCleaner wired against the in-memory fake."""
    return SilverCleaner(
        object_store=store,
        bronze_prefix=BRONZE_PREFIX,
        silver_prefix=SILVER_PREFIX,
    )


class TestCleanSnapshots:
    """clean_snapshots(): read bronze → clean → write silver Parquet."""

    def test_writes_one_parquet_per_operation(self) -> None:
        store = InMemoryObjectStore()
        _put_bronze_page(store, "rent", "20230409", 1, [_VALID_RENT])
        _put_bronze_page(store, "sale", "20230409", 1, [_VALID_SALE])

        result = make_cleaner(store).clean_snapshots()

        assert result.rows_written == 2
        assert result.written_keys == (
            f"{SILVER_PREFIX}/operation=rent/snapshot_date=2023-04-09/part.parquet",
            f"{SILVER_PREFIX}/operation=sale/snapshot_date=2023-04-09/part.parquet",
        )

    def test_combines_paginated_files_into_one_parquet(self) -> None:
        store = InMemoryObjectStore()
        _put_bronze_page(store, "rent", "20230409", 1, [_VALID_RENT])
        second = {**_VALID_RENT, "propertyCode": "102"}
        _put_bronze_page(store, "rent", "20230409", 2, [second])

        result = make_cleaner(store).clean_snapshots()

        assert result.rows_written == 2
        df = pd.read_parquet(io.BytesIO(store.get_bytes(result.written_keys[0])))
        assert len(df) == 2

    def test_default_run_processes_only_latest_snapshot(self) -> None:
        store = InMemoryObjectStore()
        _put_bronze_page(store, "rent", "20230409", 1, [_VALID_RENT])
        _put_bronze_page(store, "rent", "20230416", 1, [_VALID_RENT])

        result = make_cleaner(store).clean_snapshots()

        assert [k for k in result.written_keys] == [
            f"{SILVER_PREFIX}/operation=rent/snapshot_date=2023-04-16/part.parquet"
        ]

    def test_target_date_processes_exactly_that_snapshot(self) -> None:
        store = InMemoryObjectStore()
        _put_bronze_page(store, "rent", "20230409", 1, [_VALID_RENT])
        _put_bronze_page(store, "rent", "20230416", 1, [_VALID_RENT])

        result = make_cleaner(store).clean_snapshots(target_date=date(2023, 4, 9))

        assert result.written_keys == (
            f"{SILVER_PREFIX}/operation=rent/snapshot_date=2023-04-09/part.parquet",
        )

    def test_incremental_guard_skips_existing_parquet(self) -> None:
        store = InMemoryObjectStore()
        _put_bronze_page(store, "rent", "20230409", 1, [_VALID_RENT])
        cleaner = make_cleaner(store)

        first = cleaner.clean_snapshots()
        second = cleaner.clean_snapshots()

        assert len(first.written_keys) == 1
        assert second.written_keys == ()  # no duplicate write
        assert second.rows_written == 0
        assert second.snapshots_found is True

    def test_empty_bronze_reports_no_snapshots(self) -> None:
        result = make_cleaner(InMemoryObjectStore()).clean_snapshots()

        assert result == CleaningResult(
            written_keys=(), rows_written=0, snapshots_found=False
        )
        assert result.message == "No bronze snapshots found."

    def test_all_rows_dropped_writes_nothing(self) -> None:
        store = InMemoryObjectStore()
        # Rows with priceByArea=None are dropped by clean().
        invalid = {**_VALID_RENT, "priceByArea": None}
        _put_bronze_page(store, "rent", "20230409", 1, [invalid])

        result = make_cleaner(store).clean_snapshots()

        assert result.written_keys == ()
        assert result.snapshots_found is True

    def test_unrecognised_keys_are_skipped(self) -> None:
        store = InMemoryObjectStore()
        store.put_bytes(
            f"{BRONZE_PREFIX}/debug_page1.json",
            b"{}",
            content_type="application/json",
        )
        _put_bronze_page(store, "rent", "20230409", 1, [_VALID_RENT])

        result = make_cleaner(store).clean_snapshots()

        assert len(result.written_keys) == 1


class TestCleaningResultMessage:
    """The message property reproduces the pre-refactor handler body."""

    def test_written_message_lists_keys(self) -> None:
        result = CleaningResult(
            written_keys=("a/part.parquet",), rows_written=5, snapshots_found=True
        )
        assert result.message == "Wrote 1 Parquet file(s): ['a/part.parquet']"
