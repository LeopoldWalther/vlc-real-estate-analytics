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
from silver_transform import clean, parse_key_metadata  # noqa: E402

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


# ---------------------------------------------------------------------------
# Task 3.2 — clean() individual listings  (TDD RED phase)
# ---------------------------------------------------------------------------

# Columns that Silver keeps, matching Notebook §3 Issue 1 (minus dateDownload,
# plus snapshot_date injected from the object key).
SILVER_COLUMNS = {
    "operation",
    "province",
    "municipality",
    "district",
    "neighborhood",
    "latitude",
    "longitude",
    "distance",
    "address",
    "propertyCode",
    "propertyType",
    "price",
    "priceByArea",
    "size",
    "floor",
    "exterior",
    "rooms",
    "bathrooms",
    "status",
    "newDevelopment",
    "hasLift",
    "parkingSpace",
    "snapshot_date",
}

# A minimal but complete "valid rent" element (all required fields populated).
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
}


class TestClean:
    """Tests for ``clean`` returning one row per listing (no aggregation)."""

    def test_clean_injects_snapshot_date_and_keeps_individual_listings(self) -> None:
        """Each element becomes one output row with snapshot_date injected."""
        elements = [
            {**_VALID_RENT, "propertyCode": "A"},
            {**_VALID_RENT, "propertyCode": "B"},
        ]

        rows = clean(elements, date(2023, 4, 9), "rent")

        # Two listings in → two cleaned rows out (no aggregation).
        assert len(rows) == 2
        # snapshot_date injected from key, not from element payload.
        assert all(row["snapshot_date"] == date(2023, 4, 9) for row in rows)
        # property codes preserved — it is NOT collapsed.
        codes = {row["propertyCode"] for row in rows}
        assert codes == {"A", "B"}

    def test_clean_drops_zero_bathrooms_and_invalid_sale_price(self) -> None:
        """Issue 2: bathrooms<=0 dropped. Issue 4: sale outside 1k–10k dropped."""
        elements = [
            {**_VALID_SALE, "propertyCode": "keep_sale", "priceByArea": 3000.0},
            {**_VALID_SALE, "propertyCode": "drop_bath", "bathrooms": 0},
            {**_VALID_SALE, "propertyCode": "drop_cheap", "priceByArea": 500.0},
            {**_VALID_SALE, "propertyCode": "drop_expensive", "priceByArea": 15000.0},
            # Rent listings are NOT subject to the priceByArea range filter.
            {**_VALID_RENT, "propertyCode": "keep_rent_low", "priceByArea": 5.0},
        ]

        rows = clean(elements, date(2023, 4, 9), "sale")

        kept_codes = {row["propertyCode"] for row in rows}
        assert "keep_sale" in kept_codes
        assert "keep_rent_low" in kept_codes
        assert "drop_bath" not in kept_codes
        assert "drop_cheap" not in kept_codes
        assert "drop_expensive" not in kept_codes

    def test_clean_drops_null_pricebyarea_and_missing_neighborhood(self) -> None:
        """Rows with null priceByArea or empty/missing neighborhood are dropped."""
        elements = [
            {**_VALID_RENT, "propertyCode": "null_price", "priceByArea": None},
            {**_VALID_RENT, "propertyCode": "empty_nb", "neighborhood": ""},
            {**_VALID_RENT, "propertyCode": "no_nb"},  # missing key
            {**_VALID_RENT, "propertyCode": "valid"},
        ]
        # remove neighborhood key for the "missing" case
        elements[2].pop("neighborhood", None)

        rows = clean(elements, date(2023, 4, 9), "rent")

        kept_codes = {row["propertyCode"] for row in rows}
        assert kept_codes == {"valid"}

    def test_clean_empty_elements_returns_empty(self) -> None:
        """An empty element list yields no rows without raising."""
        assert clean([], date(2023, 4, 9), "rent") == []

    def test_clean_rent_skips_price_by_area_filter(self) -> None:
        """Rent listings with any priceByArea (incl. < 1000 or > 10000) are kept."""
        elements = [
            {**_VALID_RENT, "propertyCode": "cheap_rent", "priceByArea": 2.0},
            {**_VALID_RENT, "propertyCode": "expensive_rent", "priceByArea": 50.0},
        ]

        rows = clean(elements, date(2023, 4, 9), "rent")

        assert len(rows) == 2

    def test_clean_keeps_only_relevant_columns(self) -> None:
        """Output rows contain exactly the Silver column set (no extras, no missing)."""
        extra_element = {
            **_VALID_RENT,
            "detailedType": {"typology": "flat"},
            "showAddress": True,
        }

        rows = clean([extra_element], date(2023, 4, 9), "rent")

        assert len(rows) == 1
        assert set(rows[0].keys()) == SILVER_COLUMNS

    def test_clean_multiple_pages_yields_all_listings_no_aggregation(self) -> None:
        """Concatenated pages produce one row per listing — no collapsing."""
        page_1 = [{**_VALID_RENT, "propertyCode": "p1"}]
        page_2 = [
            {**_VALID_RENT, "propertyCode": "p2"},
            {**_VALID_RENT, "propertyCode": "p3"},
        ]

        rows = clean(page_1 + page_2, date(2023, 4, 9), "rent")

        assert len(rows) == 3
        assert {row["propertyCode"] for row in rows} == {"p1", "p2", "p3"}

    def test_clean_missing_optional_columns_become_none(self) -> None:
        """Optional fields absent from an element are set to None (stable Parquet schema)."""
        sparse = {
            "operation": "rent",
            "neighborhood": "Arrancapins",
            "priceByArea": 9.0,
            "bathrooms": 1,
            "propertyCode": "sparse",
        }

        rows = clean([sparse], date(2023, 4, 9), "rent")

        assert len(rows) == 1
        row = rows[0]
        # Optional columns not in the source element should default to None.
        assert row["floor"] is None
        assert row["parkingSpace"] is None
        assert row["hasLift"] is None
