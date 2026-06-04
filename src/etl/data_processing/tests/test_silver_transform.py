"""
Tests for the silver-layer transform module.

Run with: pytest src/etl/data_processing/tests/

These tests are intentionally written before the implementation (TDD RED phase)
and lock in two contracts:

1. ``parse_key_metadata`` derives ``(operation, snapshot_date, page)`` from a
   bronze S3 object key, because the real bronze JSON payloads do NOT contain a
   ``dateDownload`` field -- the date only lives in the file name.
2. The curated real bronze fixtures expose the fields the silver transform
   depends on (``priceByArea``, ``neighborhood``, ``operation``), so the schema
   assumptions are validated against real data from day one.
"""

import json
import os
import sys
from datetime import date
from pathlib import Path

import pytest

# Import the module under test using the same convention as data_collection.
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from silver_transform import (  # noqa: E402
    SCHEMA_VERSION,
    build_aggregation_json,
    clean,
    parse_key_metadata,
)

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "bronze"
FIXTURE_FILES = [
    "sample_rent_1.json",
    "sample_rent_2.json",
    "sample_sale_1.json",
    "sample_sale_2.json",
]


class TestParseKeyMetadata:
    """Tests for ``parse_key_metadata`` key parsing."""

    def test_parse_key_metadata_extracts_operation_date_page(self) -> None:
        """A full bronze key resolves to (operation, snapshot_date, page)."""
        key = "bronze/idealista/rent_20230409_120044_1.json"

        operation, snapshot_date, page = parse_key_metadata(key)

        assert operation == "rent"
        assert snapshot_date == date(2023, 4, 9)
        assert page == 1

    def test_parse_key_metadata_handles_sale_and_higher_page(self) -> None:
        """A sale key with a multi-digit page parses correctly."""
        key = "bronze/idealista/sale_20230416_120045_17.json"

        operation, snapshot_date, page = parse_key_metadata(key)

        assert operation == "sale"
        assert snapshot_date == date(2023, 4, 16)
        assert page == 17

    def test_parse_key_metadata_accepts_bare_filename(self) -> None:
        """Parsing works when the key has no prefix path component."""
        operation, snapshot_date, page = parse_key_metadata(
            "rent_20230507_120044_3.json"
        )

        assert operation == "rent"
        assert snapshot_date == date(2023, 5, 7)
        assert page == 3

    @pytest.mark.parametrize(
        "bad_key",
        [
            "bronze/idealista/rent_20230409_120044.json",  # missing page
            "bronze/idealista/lease_20230409_120044_1.json",  # bad operation
            "bronze/idealista/rent_2023049_120044_1.json",  # too few date digits
            "bronze/idealista/rent_20231345_120044_1.json",  # invalid calendar date
            "bronze/idealista/rent_20230409_120044_1.txt",  # wrong extension
            "",  # empty key
        ],
    )
    def test_parse_key_metadata_rejects_malformed_keys(self, bad_key: str) -> None:
        """Malformed keys raise ``ValueError`` instead of silently passing."""
        with pytest.raises(ValueError):
            parse_key_metadata(bad_key)


class TestRealBronzeSchemaContract:
    """Schema contract validated against curated real bronze fixtures."""

    def test_all_fixtures_exist(self) -> None:
        """The four curated fixtures are present on disk."""
        for name in FIXTURE_FILES:
            assert (FIXTURE_DIR / name).is_file(), f"missing fixture: {name}"

    def test_real_fixture_has_pricebyarea_neighborhood_operation(self) -> None:
        """Every fixture element exposes the fields the transform relies on."""
        for name in FIXTURE_FILES:
            payload = json.loads((FIXTURE_DIR / name).read_text(encoding="utf-8"))

            element_list = payload.get("elementList")
            assert isinstance(element_list, list)
            assert len(element_list) > 0, f"empty elementList in {name}"

            for element in element_list:
                assert "priceByArea" in element, f"priceByArea missing in {name}"
                assert "neighborhood" in element, f"neighborhood missing in {name}"
                assert "operation" in element, f"operation missing in {name}"
                assert element["operation"] in {"rent", "sale"}


class TestClean:
    """Tests for the pure ``clean`` aggregation."""

    def test_clean_injects_snapshot_date_and_aggregates_price_by_area(self) -> None:
        """clean groups by neighborhood and aggregates priceByArea mean/count."""
        elements = [
            {"neighborhood": "El Pilar", "priceByArea": 16.0},
            {"neighborhood": "El Pilar", "priceByArea": 20.0},
            {"neighborhood": "Sant Francesc", "priceByArea": 10.0},
        ]

        rows = clean(elements, date(2023, 4, 9), "rent")

        # One row per neighborhood, sorted deterministically by neighborhood.
        assert [r["neighborhood"] for r in rows] == ["El Pilar", "Sant Francesc"]

        el_pilar = rows[0]
        assert el_pilar["snapshot_date"] == date(2023, 4, 9)
        assert el_pilar["operation"] == "rent"
        assert el_pilar["price_by_area_mean"] == 18.0  # (16 + 20) / 2
        assert el_pilar["listing_count"] == 2

        sant_francesc = rows[1]
        assert sant_francesc["price_by_area_mean"] == 10.0
        assert sant_francesc["listing_count"] == 1

    def test_clean_drops_null_pricebyarea_and_missing_neighborhood(self) -> None:
        """Rows with null priceByArea or missing/empty neighborhood are dropped."""
        elements = [
            {"neighborhood": "El Pilar", "priceByArea": None},  # null price
            {"neighborhood": "", "priceByArea": 12.0},  # empty neighborhood
            {"priceByArea": 14.0},  # missing neighborhood
            {"neighborhood": "El Pilar", "priceByArea": 16.0},  # valid
        ]

        rows = clean(elements, date(2023, 4, 9), "rent")

        assert len(rows) == 1
        assert rows[0]["neighborhood"] == "El Pilar"
        assert rows[0]["price_by_area_mean"] == 16.0
        assert rows[0]["listing_count"] == 1

    def test_clean_empty_elements_returns_empty(self) -> None:
        """An empty element list yields no rows without raising."""
        assert clean([], date(2023, 4, 9), "rent") == []

    def test_clean_collapses_multiple_pages_to_one_row(self) -> None:
        """Combined pages of one snapshot collapse to one row per neighborhood."""
        # Simulate two paginated responses already concatenated into one list.
        page_1 = [{"neighborhood": "El Pilar", "priceByArea": 10.0}]
        page_2 = [
            {"neighborhood": "El Pilar", "priceByArea": 20.0},
            {"neighborhood": "El Pilar", "priceByArea": 30.0},
        ]

        rows = clean(page_1 + page_2, date(2023, 4, 9), "rent")

        assert len(rows) == 1
        assert rows[0]["listing_count"] == 3
        assert rows[0]["price_by_area_mean"] == 20.0  # (10 + 20 + 30) / 3


class TestBuildAggregationJson:
    """Tests for the dashboard JSON builder."""

    def test_build_aggregation_json_has_schema_version_and_timeseries(self) -> None:
        """The dashboard dict carries schema_version and a per-neighborhood series."""
        history = [
            {
                "operation": "rent",
                "neighborhood": "El Pilar",
                "snapshot_date": date(2023, 4, 16),
                "price_by_area_mean": 18.0,
                "listing_count": 2,
            },
            {
                "operation": "rent",
                "neighborhood": "El Pilar",
                "snapshot_date": date(2023, 4, 9),
                "price_by_area_mean": 16.0,
                "listing_count": 1,
            },
            {
                "operation": "sale",
                "neighborhood": "Sant Francesc",
                "snapshot_date": date(2023, 4, 9),
                "price_by_area_mean": 2800.0,
                "listing_count": 3,
            },
        ]

        result = build_aggregation_json(history)

        assert result["schema_version"] == SCHEMA_VERSION

        rent_series = result["operations"]["rent"]["El Pilar"]
        # Time-series sorted ascending by snapshot_date (ISO strings).
        assert [point["snapshot_date"] for point in rent_series] == [
            "2023-04-09",
            "2023-04-16",
        ]
        assert rent_series[0]["price_by_area_mean"] == 16.0
        assert rent_series[1]["listing_count"] == 2

        sale_series = result["operations"]["sale"]["Sant Francesc"]
        assert len(sale_series) == 1
        assert sale_series[0]["price_by_area_mean"] == 2800.0

    def test_build_aggregation_json_empty_history(self) -> None:
        """An empty history yields an empty operations map with schema_version."""
        result = build_aggregation_json([])

        assert result["schema_version"] == SCHEMA_VERSION
        assert result["operations"] == {}
