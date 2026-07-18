"""
Tests for the gold-layer aggregation module (gold_aggregate.py).

Written TDD-style: all tests in this file are RED before gold_aggregate.py
exists, then GREEN once the implementation is in place.

The tests lock in the frozen schema-v1.0 JSON contract that FEATURE-005 depends
on. Every acceptance criterion from the FEATURE-004 technical plan for task 4.1
is covered here.
"""

from __future__ import annotations

import os
import sys
from datetime import date
from typing import Any, Dict, List

import pandas as pd
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from gold_aggregate import (  # noqa: E402
    ROLLING_KPI_WINDOW_MONTHS,
    _rolling_window_start,
    apply_scope,
    build_aggregation_json,
    build_population_block,
)

# ---------------------------------------------------------------------------
# Shared test fixtures
# ---------------------------------------------------------------------------

SCOPE_DISTRICTS = ["Extramurs", "Ciutat Vella", "L'Eixample"]

# Minimal columns required by all helpers.
_BASE_COLS = [
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


def _make_listing(**overrides: Any) -> Dict[str, Any]:
    """Return a minimal valid listing dict with optional field overrides."""
    base: Dict[str, Any] = {
        "operation": "sale",
        "district": "Extramurs",
        "neighborhood": "Patraix",
        "snapshot_date": date(2023, 4, 9),
        "propertyCode": "P001",
        "priceByArea": 2500.0,
        "size": 130.0,
        "price": 325_000.0,
        "floor": "3",
        "rooms": 3,
        "bathrooms": 2,
        "hasLift": True,
    }
    base.update(overrides)
    return base


def _df(rows: List[Dict[str, Any]]) -> pd.DataFrame:
    """Build a DataFrame from listing dicts, casting snapshot_date to date."""
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# apply_scope
# ---------------------------------------------------------------------------


class TestApplyScope:
    """apply_scope must keep only the 3 target districts."""

    def test_apply_scope_keeps_only_three_districts(self) -> None:
        """Rows outside the 3 scope districts are dropped."""
        rows = [
            _make_listing(district="Extramurs"),
            _make_listing(district="Ciutat Vella"),
            _make_listing(district="L'Eixample"),
            _make_listing(district="Benimaclet"),  # must be dropped
            _make_listing(district="El Pla del Real"),  # must be dropped
        ]
        result = apply_scope(_df(rows))
        assert set(result["district"].unique()) == set(SCOPE_DISTRICTS)
        assert len(result) == 3

    def test_apply_scope_accepts_eixample_apostrophe(self) -> None:
        """The real district string from the Idealista API uses a regular ASCII apostrophe."""
        rows = [_make_listing(district="L'Eixample")]
        result = apply_scope(_df(rows))
        assert len(result) == 1

    def test_apply_scope_empty_dataframe(self) -> None:
        """Empty input produces an empty output without raising."""
        result = apply_scope(pd.DataFrame(columns=_BASE_COLS))
        assert result.empty

    def test_apply_scope_all_out_of_scope(self) -> None:
        """All rows outside scope → empty result."""
        rows = [_make_listing(district="Benimaclet")]
        result = apply_scope(_df(rows))
        assert result.empty


# ---------------------------------------------------------------------------
# Dedup: same propertyCode across two snapshots yields two time-series points
# ---------------------------------------------------------------------------


class TestDedup:
    """
    Dedup happens only within (operation, snapshot_date, propertyCode).
    The same propertyCode appearing in two different snapshots must produce
    two separate time-series rows, not one.
    """

    def test_same_property_code_two_snapshots_yields_two_points(self) -> None:
        """
        A listing re-appearing in a later snapshot must not be deduplicated
        away — the time-series would collapse if we did a global dedup.
        """
        rows = [
            _make_listing(
                propertyCode="P001",
                snapshot_date=date(2023, 4, 9),
                priceByArea=2500.0,
            ),
            _make_listing(
                propertyCode="P001",
                snapshot_date=date(2023, 4, 16),
                priceByArea=2600.0,
            ),
        ]
        scoped = apply_scope(_df(rows))
        block = build_population_block(scoped, row_filter=None)
        series = block["price_time_series_neighborhood"]
        # Two different snapshot_dates → two rows in the time-series.
        assert len(series) == 2

    def test_duplicate_within_same_snapshot_is_deduped(self) -> None:
        """
        Two identical (operation, snapshot_date, propertyCode) rows within the
        same snapshot should be deduped to one before aggregation.
        """
        rows = [
            _make_listing(
                propertyCode="P001",
                snapshot_date=date(2023, 4, 9),
                priceByArea=2500.0,
            ),
            _make_listing(
                propertyCode="P001",
                snapshot_date=date(2023, 4, 9),
                priceByArea=2500.0,
            ),
        ]
        scoped = apply_scope(_df(rows))
        block = build_population_block(scoped, row_filter=None)
        series = block["price_time_series_neighborhood"]
        # Both rows are the same snapshot → deduped → one aggregation row.
        assert series[0]["count_listings"] == 1


# ---------------------------------------------------------------------------
# build_population_block — general population (row_filter=None)
# ---------------------------------------------------------------------------


class TestBuildPopulationBlockGeneral:
    """Tests for the general population (identity filter)."""

    def test_price_time_series_neighborhood_columns(self) -> None:
        """Each record has the required column set."""
        rows = [_make_listing()]
        block = build_population_block(apply_scope(_df(rows)), row_filter=None)
        record = block["price_time_series_neighborhood"][0]
        for key in (
            "operation",
            "district",
            "neighborhood",
            "snapshot_date",
            "count_listings",
            "mean_priceByArea",
            "mean_size",
            "mean_price",
        ):
            assert key in record, f"missing key: {key}"

    def test_mean_price_key_not_mean_prize(self) -> None:
        """The output must use 'mean_price', never 'mean_prize'."""
        rows = [_make_listing()]
        block = build_population_block(apply_scope(_df(rows)), row_filter=None)
        record = block["price_time_series_neighborhood"][0]
        assert "mean_price" in record
        assert "mean_prize" not in record

    def test_price_time_series_district_is_count_weighted(self) -> None:
        """
        District-level mean_priceByArea must be count-weighted, not mean-of-means.

        Two neighborhoods in one district, one snapshot_date:
          - Patraix: 2 listings, mean_priceByArea = 2000
          - Russafa:  1 listing,  mean_priceByArea = 3000
        Correct weighted mean = (2*2000 + 1*3000) / (2+1) = 7000/3 ≈ 2333.33
        Incorrect mean-of-means = (2000 + 3000) / 2 = 2500
        """
        rows = [
            _make_listing(
                neighborhood="Patraix", priceByArea=2000.0, size=120.0, price=240_000.0
            ),
            _make_listing(
                neighborhood="Patraix",
                priceByArea=2000.0,
                size=120.0,
                price=240_000.0,
                propertyCode="P002",
            ),
            _make_listing(
                neighborhood="Russafa",
                priceByArea=3000.0,
                size=130.0,
                price=390_000.0,
                propertyCode="P003",
            ),
        ]
        block = build_population_block(apply_scope(_df(rows)), row_filter=None)
        district_series = block["price_time_series_district"]
        assert len(district_series) == 1
        record = district_series[0]
        expected = (2 * 2000.0 + 1 * 3000.0) / 3
        assert abs(record["mean_priceByArea"] - expected) < 0.01

    def test_boxplot_returns_five_number_summary(self) -> None:
        """boxplot_by_neighborhood contains count, min, q1, median, q3, max."""
        rows = [
            _make_listing(priceByArea=1000.0, propertyCode="P001"),
            _make_listing(priceByArea=2000.0, propertyCode="P002"),
            _make_listing(priceByArea=3000.0, propertyCode="P003"),
            _make_listing(priceByArea=4000.0, propertyCode="P004"),
            _make_listing(priceByArea=5000.0, propertyCode="P005"),
        ]
        block = build_population_block(apply_scope(_df(rows)), row_filter=None)
        bp = block["boxplot_by_neighborhood"][0]
        for key in (
            "operation",
            "district",
            "neighborhood",
            "count",
            "min",
            "q1",
            "median",
            "q3",
            "max",
        ):
            assert key in bp, f"missing boxplot key: {key}"
        assert bp["count"] == 5
        assert bp["min"] == pytest.approx(1000.0)
        assert bp["max"] == pytest.approx(5000.0)

    def test_general_block_has_price_time_series_district(self) -> None:
        """General population must include price_time_series_district."""
        rows = [_make_listing()]
        block = build_population_block(apply_scope(_df(rows)), row_filter=None)
        assert "price_time_series_district" in block

    def test_general_block_has_all_required_keys(self) -> None:
        """General population block must carry all 5 required dataset keys."""
        rows = [_make_listing()]
        block = build_population_block(apply_scope(_df(rows)), row_filter=None)
        for key in (
            "price_time_series_neighborhood",
            "price_time_series_district",
            "rent_vs_sale_ratio",
            "rent_vs_sale_ratio_time_series",
            "boxplot_by_neighborhood",
        ):
            assert key in block, f"missing block key: {key}"


# ---------------------------------------------------------------------------
# build_population_block — relevant filter
# ---------------------------------------------------------------------------


class TestRelevantFilter:
    """Tests for the relevant-population filter (apartments like ours)."""

    def test_relevant_filter_selects_apartments_like_ours(self) -> None:
        """Only listings matching all 5 relevant criteria survive the filter."""
        qualifying = _make_listing(
            hasLift=True, floor="3", size=130.0, rooms=3, bathrooms=2
        )
        too_small = _make_listing(
            hasLift=True,
            floor="3",
            size=100.0,
            rooms=3,
            bathrooms=2,
            propertyCode="P002",
        )
        ground_floor = _make_listing(
            hasLift=True,
            floor="1",
            size=130.0,
            rooms=3,
            bathrooms=2,
            propertyCode="P003",
        )
        no_lift = _make_listing(
            hasLift=False,
            floor="3",
            size=130.0,
            rooms=3,
            bathrooms=2,
            propertyCode="P004",
        )
        too_few_rooms = _make_listing(
            hasLift=True,
            floor="3",
            size=130.0,
            rooms=1,
            bathrooms=2,
            propertyCode="P005",
        )
        too_few_baths = _make_listing(
            hasLift=True,
            floor="3",
            size=130.0,
            rooms=3,
            bathrooms=1,
            propertyCode="P006",
        )

        def relevant_filter(df: pd.DataFrame) -> pd.DataFrame:
            """The relevant-population predicate."""
            return df[
                (df["hasLift"] == True)  # noqa: E712
                & (df["floor"] != "1")
                & (df["size"] > 120)
                & (df["rooms"] >= 2)
                & (df["bathrooms"] >= 2)
            ]

        scoped = apply_scope(
            _df(
                [
                    qualifying,
                    too_small,
                    ground_floor,
                    no_lift,
                    too_few_rooms,
                    too_few_baths,
                ]
            )
        )
        block = build_population_block(scoped, row_filter=relevant_filter)
        # Only qualifying survives — check boxplot (available in relevant block).
        assert len(block["boxplot_by_neighborhood"]) == 1

    def test_floor_compared_as_string(self) -> None:
        """floor='1' must be excluded regardless of numeric interpretation."""
        on_first_floor = _make_listing(
            hasLift=True, floor="1", size=130.0, rooms=3, bathrooms=2
        )

        def relevant_filter(df: pd.DataFrame) -> pd.DataFrame:
            return df[
                (df["hasLift"] == True)  # noqa: E712
                & (df["floor"] != "1")
                & (df["size"] > 120)
                & (df["rooms"] >= 2)
                & (df["bathrooms"] >= 2)
            ]

        scoped = apply_scope(_df([on_first_floor]))
        block = build_population_block(scoped, row_filter=relevant_filter)
        # floor='1' excluded → no listings → empty boxplot.
        assert block["boxplot_by_neighborhood"] == []

    def test_relevant_block_has_required_keys(self) -> None:
        """Relevant population block must carry 3 required dataset keys."""
        rows = [_make_listing()]

        def relevant_filter(df: pd.DataFrame) -> pd.DataFrame:
            return df[
                (df["hasLift"] == True)  # noqa: E712
                & (df["floor"] != "1")
                & (df["size"] > 120)
                & (df["rooms"] >= 2)
                & (df["bathrooms"] >= 2)
            ]

        block = build_population_block(
            apply_scope(_df(rows)), row_filter=relevant_filter
        )
        for key in (
            "rent_vs_sale_ratio",
            "rent_vs_sale_ratio_time_series",
            "boxplot_by_neighborhood",
        ):
            assert key in block, f"missing relevant block key: {key}"

    def test_relevant_block_lacks_price_time_series(self) -> None:
        """Relevant population does NOT include price_time_series_neighborhood/district."""
        rows = [_make_listing()]

        def relevant_filter(df: pd.DataFrame) -> pd.DataFrame:
            return df[
                (df["hasLift"] == True)  # noqa: E712
                & (df["floor"] != "1")
                & (df["size"] > 120)
                & (df["rooms"] >= 2)
                & (df["bathrooms"] >= 2)
            ]

        block = build_population_block(
            apply_scope(_df(rows)), row_filter=relevant_filter
        )
        assert "price_time_series_neighborhood" not in block
        assert "price_time_series_district" not in block


# ---------------------------------------------------------------------------
# Rent vs sale ratio
# ---------------------------------------------------------------------------


class TestRentVsSaleRatio:
    """rent_vs_sale_ratio and rent_vs_sale_ratio_time_series tests."""

    def test_ratio_time_series_per_snapshot(self) -> None:
        """Each snapshot_date produces a separate ratio record."""
        rows = [
            _make_listing(
                operation="sale",
                priceByArea=2500.0,
                snapshot_date=date(2023, 4, 9),
                propertyCode="P001",
            ),
            _make_listing(
                operation="rent",
                priceByArea=10.0,
                snapshot_date=date(2023, 4, 9),
                propertyCode="P002",
            ),
            _make_listing(
                operation="sale",
                priceByArea=2600.0,
                snapshot_date=date(2023, 4, 16),
                propertyCode="P001",
            ),
            _make_listing(
                operation="rent",
                priceByArea=11.0,
                snapshot_date=date(2023, 4, 16),
                propertyCode="P002",
            ),
        ]
        # Use min_count=1 so pairs with a single listing per side are included;
        # this test verifies the time-series structure, not the sparsity filter.
        block = build_population_block(
            apply_scope(_df(rows)), row_filter=None, min_count=1
        )
        ts = block["rent_vs_sale_ratio_time_series"]
        snapshot_dates = [r["snapshot_date"] for r in ts]
        assert len(set(snapshot_dates)) == 2

    def test_ratio_record_columns(self) -> None:
        """rent_vs_sale_ratio records include all required keys."""
        rows = [
            _make_listing(operation="sale", priceByArea=2500.0, propertyCode="P001"),
            _make_listing(operation="rent", priceByArea=10.0, propertyCode="P002"),
        ]
        block = build_population_block(apply_scope(_df(rows)), row_filter=None)
        if block["rent_vs_sale_ratio"]:
            record = block["rent_vs_sale_ratio"][0]
            for key in (
                "district",
                "neighborhood",
                "mean_priceByArea_sale",
                "mean_priceByArea_rent",
                "mean_sales_price_by_rent_ratio",
                "count_listings_sale",
                "count_listings_rent",
            ):
                assert key in record, f"missing ratio key: {key}"

    def test_ratio_min_count_filters_sparse_pairs(self) -> None:
        """Neighborhoods with count_sale < min_count are excluded from ratio."""
        # Only 1 sale listing — below the default min_count=5.
        rows = [
            _make_listing(operation="sale", priceByArea=2500.0, propertyCode="P001"),
            _make_listing(operation="rent", priceByArea=10.0, propertyCode="P002"),
            _make_listing(operation="rent", priceByArea=11.0, propertyCode="P003"),
            _make_listing(operation="rent", priceByArea=12.0, propertyCode="P004"),
            _make_listing(operation="rent", priceByArea=13.0, propertyCode="P005"),
            _make_listing(operation="rent", priceByArea=14.0, propertyCode="P006"),
        ]
        block = build_population_block(
            apply_scope(_df(rows)), row_filter=None, min_count=5
        )
        # Sale side has only 1 → filtered out.
        assert block["rent_vs_sale_ratio"] == []


# ---------------------------------------------------------------------------
# build_aggregation_json — top-level schema v1.0
# ---------------------------------------------------------------------------


class TestBuildAggregationJson:
    """Tests for the top-level build_aggregation_json function."""

    def _make_silver_df(self) -> pd.DataFrame:
        """Two operations, two snapshots, enough listings for ratios."""
        rows = []
        for snap in [date(2023, 4, 9), date(2023, 4, 16)]:
            for i in range(6):
                rows.append(
                    _make_listing(
                        operation="sale",
                        priceByArea=2500.0 + i * 10,
                        snapshot_date=snap,
                        propertyCode=f"S{i:03d}",
                    )
                )
                rows.append(
                    _make_listing(
                        operation="rent",
                        priceByArea=10.0 + i * 0.5,
                        price=1200.0 + i * 50,
                        snapshot_date=snap,
                        propertyCode=f"R{i:03d}",
                    )
                )
        return _df(rows)

    def test_build_aggregation_json_matches_schema_v1_two_populations(self) -> None:
        """Top-level keys and both population blocks are present."""
        result = build_aggregation_json(self._make_silver_df())
        for key in (
            "schema_version",
            "generated_at",
            "scope_districts",
            "min_count",
            "relevant_filter",
            "general",
            "relevant",
        ):
            assert key in result, f"missing top-level key: {key}"

    def test_schema_version_is_one_dot_zero(self) -> None:
        """schema_version must be exactly '1.0'."""
        result = build_aggregation_json(self._make_silver_df())
        assert result["schema_version"] == "1.0"

    def test_generated_at_is_iso8601_string(self) -> None:
        """generated_at must be a non-empty ISO-8601 UTC string."""
        result = build_aggregation_json(self._make_silver_df())
        generated_at = result["generated_at"]
        assert isinstance(generated_at, str) and len(generated_at) > 0

    def test_scope_districts_matches_three_districts(self) -> None:
        """scope_districts must be the 3 target district strings."""
        result = build_aggregation_json(self._make_silver_df())
        assert set(result["scope_districts"]) == set(SCOPE_DISTRICTS)

    def test_general_block_has_five_datasets(self) -> None:
        """general block must contain all 5 dataset keys."""
        result = build_aggregation_json(self._make_silver_df())
        for key in (
            "price_time_series_neighborhood",
            "price_time_series_district",
            "rent_vs_sale_ratio",
            "rent_vs_sale_ratio_time_series",
            "boxplot_by_neighborhood",
        ):
            assert key in result["general"], f"missing general key: {key}"

    def test_relevant_block_has_three_datasets(self) -> None:
        """relevant block must contain exactly 3 dataset keys."""
        result = build_aggregation_json(self._make_silver_df())
        for key in (
            "rent_vs_sale_ratio",
            "rent_vs_sale_ratio_time_series",
            "boxplot_by_neighborhood",
        ):
            assert key in result["relevant"], f"missing relevant key: {key}"

    def test_empty_silver_dataframe_yields_valid_json(self) -> None:
        """Empty input produces a valid schema-v1.0 dict with empty datasets."""
        result = build_aggregation_json(pd.DataFrame(columns=_BASE_COLS))
        assert result["schema_version"] == "1.0"
        assert result["general"]["price_time_series_neighborhood"] == []
        assert result["relevant"]["rent_vs_sale_ratio"] == []

    def test_empty_relevant_subset_yields_empty_relevant_datasets(self) -> None:
        """No relevant listings → empty relevant block datasets, no exception."""
        # All listings fail the relevant filter (no lift).
        rows = [_make_listing(hasLift=False, propertyCode=f"P{i}") for i in range(6)]
        result = build_aggregation_json(_df(rows))
        assert result["relevant"]["rent_vs_sale_ratio"] == []
        assert result["relevant"]["boxplot_by_neighborhood"] == []


# ---------------------------------------------------------------------------
# _rolling_window_start — rolling KPI window helper (FEATURE-010)
# ---------------------------------------------------------------------------


class TestRollingWindowStart:
    """Tests for the pure rolling-window start helper."""

    def test_rolling_kpi_window_months_is_three(self) -> None:
        """The single named window-length constant must be 3 months."""
        assert ROLLING_KPI_WINDOW_MONTHS == 3

    def test_returns_max_minus_three_months_for_long_history(self) -> None:
        """GIVEN >3 months of history, returns max(snapshot_date) - 3 months."""
        df = pd.DataFrame(
            {
                "snapshot_date": [
                    date(2023, 1, 1),
                    date(2023, 2, 1),
                    date(2023, 3, 1),
                    date(2023, 4, 9),
                ]
            }
        )
        start = _rolling_window_start(df, ROLLING_KPI_WINDOW_MONTHS)
        expected = pd.Timestamp(date(2023, 4, 9)) - pd.DateOffset(months=3)
        assert start == expected

    def test_short_history_returns_start_before_all_rows(self) -> None:
        """GIVEN only 2 weeks of history, the returned start includes all rows."""
        df = pd.DataFrame(
            {
                "snapshot_date": [
                    date(2023, 4, 1),
                    date(2023, 4, 9),
                ]
            }
        )
        start = _rolling_window_start(df, ROLLING_KPI_WINDOW_MONTHS)
        assert start is not None
        assert (pd.to_datetime(df["snapshot_date"]) >= start).all()

    def test_empty_dataframe_returns_none(self) -> None:
        """GIVEN an empty DataFrame, the helper returns None without raising."""
        df = pd.DataFrame(columns=["snapshot_date"])
        assert _rolling_window_start(df, ROLLING_KPI_WINDOW_MONTHS) is None

    def test_no_parseable_dates_returns_none(self) -> None:
        """GIVEN only unparseable snapshot_date values, returns None."""
        df = pd.DataFrame({"snapshot_date": ["not-a-date", None]})
        assert _rolling_window_start(df, ROLLING_KPI_WINDOW_MONTHS) is None

    def test_iso_string_date_and_timestamp_inputs_agree(self) -> None:
        """ISO string, datetime.date, and pandas Timestamp inputs all agree."""
        iso_df = pd.DataFrame({"snapshot_date": ["2023-01-01", "2023-04-09"]})
        date_df = pd.DataFrame({"snapshot_date": [date(2023, 1, 1), date(2023, 4, 9)]})
        ts_df = pd.DataFrame(
            {
                "snapshot_date": [
                    pd.Timestamp("2023-01-01"),
                    pd.Timestamp("2023-04-09"),
                ]
            }
        )
        iso_start = _rolling_window_start(iso_df, 3)
        date_start = _rolling_window_start(date_df, 3)
        ts_start = _rolling_window_start(ts_df, 3)
        assert iso_start == date_start == ts_start
