"""
Unit tests for the Aggregation strategies + GoldAggregator (FEATURE-008).

Includes the acceptance-critical gate: GoldAggregator, run against the 8.1
silver fixture through an ``InMemoryObjectStore``, must reproduce the
committed golden master **byte-for-byte**.
"""

from __future__ import annotations

import io
import json
import os
import sys
from typing import Any, Dict, List
from unittest import mock

import pandas as pd
import pytest

# src/etl on sys.path for `common`, data_processing for flat imports.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from common.object_store import InMemoryObjectStore  # noqa: E402

from gold_aggregator import (  # noqa: E402
    DistrictPriceTimeSeries,
    GoldAggregator,
    GoldResult,
    NeighborhoodBoxplot,
    NeighborhoodPriceTimeSeries,
    RentVsSaleRatio,
    RentVsSaleRatioTimeSeries,
    default_populations,
)
from tests.test_gold_golden_master import (  # noqa: E402
    _FROZEN_NOW,
    _MIN_COUNT,
    GOLDEN_MASTER_PATH,
    load_silver_fixture,
)

SILVER_PREFIX = "silver/idealista"
GOLD_PREFIX = "gold/aggregations"


def _store_with_silver(df: pd.DataFrame) -> InMemoryObjectStore:
    """Write *df* as one silver Parquet into a fresh in-memory store."""
    store = InMemoryObjectStore()
    buffer = io.BytesIO()
    df.to_parquet(buffer, index=False, engine="pyarrow")
    store.put_bytes(
        f"{SILVER_PREFIX}/operation=rent/snapshot_date=2023-04-09/part.parquet",
        buffer.getvalue(),
        content_type="application/octet-stream",
    )
    return store


def make_aggregator(store: InMemoryObjectStore, **kwargs: Any) -> GoldAggregator:
    """Build a GoldAggregator wired against the in-memory fake."""
    return GoldAggregator(
        object_store=store,
        silver_prefix=SILVER_PREFIX,
        gold_prefix=GOLD_PREFIX,
        min_count=_MIN_COUNT,
        **kwargs,
    )


class TestGoldenMasterViaAggregator:
    """The 8.1 golden master gates the strategy-based implementation."""

    def test_aggregate_matches_golden_master_byte_for_byte(self) -> None:
        store = _store_with_silver(load_silver_fixture())

        with mock.patch("gold_aggregate.datetime") as frozen_dt:
            frozen_dt.now.return_value = _FROZEN_NOW
            result = make_aggregator(store).aggregate()

        actual = store.get_bytes(result.key)
        expected = GOLDEN_MASTER_PATH.read_bytes()

        assert actual == expected[:-1], (
            "GoldAggregator output drifted from the committed golden master "
            "— the strategy refactor must be byte-neutral."
        )
        assert result == GoldResult(
            key=f"{GOLD_PREFIX}/latest.json", size_bytes=len(actual)
        )


class TestStrategyInterface:
    """Strategies are interchangeable behind the common interface."""

    def test_default_populations_reproduce_schema_v1_keys_in_order(self) -> None:
        general, relevant = default_populations(_MIN_COUNT)

        assert [agg.key for agg in general] == [
            "price_time_series_neighborhood",
            "price_time_series_district",
            "rent_vs_sale_ratio",
            "rent_vs_sale_ratio_time_series",
            "boxplot_by_neighborhood",
        ]
        assert [agg.key for agg in relevant] == [
            "rent_vs_sale_ratio",
            "rent_vs_sale_ratio_time_series",
            "boxplot_by_neighborhood",
        ]

    @pytest.mark.parametrize(
        "strategy",
        [
            NeighborhoodPriceTimeSeries(),
            DistrictPriceTimeSeries(),
            RentVsSaleRatio(_MIN_COUNT),
            RentVsSaleRatioTimeSeries(_MIN_COUNT),
            NeighborhoodBoxplot(),
        ],
        ids=lambda s: s.key,
    )
    def test_every_strategy_handles_empty_input(self, strategy: Any) -> None:
        """Liskov: all variants accept the same input and return a list."""
        empty = pd.DataFrame(
            columns=[
                "operation",
                "district",
                "neighborhood",
                "snapshot_date",
                "propertyCode",
                "priceByArea",
                "size",
                "price",
            ]
        )
        assert strategy.compute(empty) == []

    def test_new_strategy_plugs_in_without_editing_the_aggregator(self) -> None:
        """Open/Closed: adding a dataset = adding a class, not a switch."""

        class ListingCount:
            key: str = "listing_count"

            def compute(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
                return [{"count": int(len(df))}]

        store = _store_with_silver(load_silver_fixture())
        aggregator = make_aggregator(
            store,
            general_aggregations=(ListingCount(),),
            relevant_aggregations=(),
        )

        result = aggregator.aggregate()
        document = json.loads(store.get_bytes(result.key))

        assert list(document["general"].keys()) == ["listing_count"]
        assert document["general"]["listing_count"][0]["count"] > 0
        assert document["relevant"] == {}


class TestSilverHistoryReading:
    """ObjectStore-backed silver reads with the physical-column contract."""

    def test_empty_store_produces_empty_datasets(self) -> None:
        store = InMemoryObjectStore()

        result = make_aggregator(store).aggregate()
        document = json.loads(store.get_bytes(result.key))

        assert document["schema_version"] == "1.0"
        assert document["general"]["price_time_series_neighborhood"] == []
        assert document["relevant"]["boxplot_by_neighborhood"] == []

    def test_missing_physical_column_raises_value_error(self) -> None:
        store = InMemoryObjectStore()
        df = load_silver_fixture().drop(columns=["snapshot_date"])
        buffer = io.BytesIO()
        df.to_parquet(buffer, index=False, engine="pyarrow")
        store.put_bytes(
            f"{SILVER_PREFIX}/broken/part.parquet",
            buffer.getvalue(),
            content_type="application/octet-stream",
        )

        with pytest.raises(ValueError, match="snapshot_date"):
            make_aggregator(store).aggregate()

    def test_non_parquet_keys_are_ignored(self) -> None:
        store = _store_with_silver(load_silver_fixture())
        store.put_bytes(f"{SILVER_PREFIX}/_SUCCESS", b"", content_type="text/plain")

        result = make_aggregator(store).aggregate()

        assert result.size_bytes > 0
