"""
Golden-master regression test for the gold aggregation output (review M1).

Locks the frozen schema-v1.0 contract byte-for-byte BEFORE the FEATURE-008
OOP refactor touches the gold layer. The committed fixtures are:

- ``fixtures/silver_fixture.json``     : deterministic silver listing rows
  (snapshot_date stored as ISO string, mirroring what the silver Parquet
  actually contains at gold-read time).
- ``fixtures/gold_latest_golden.json`` : the exact bytes the gold Lambda
  would write to ``gold/aggregations/latest.json`` for that input, with
  ``generated_at`` frozen to a fixed instant.

Serialisation mirrors ``gold_aggregation_lambda.lambda_handler`` exactly:
``json.dumps(aggregation, default=str).encode("utf-8")``.

Regenerating the fixtures (ONLY when the schema contract legitimately
changes, never to paper over refactor drift)::

    python tests/test_gold_golden_master.py --regenerate
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List
from unittest import mock

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from gold_aggregate import build_aggregation_json  # noqa: E402

# ---------------------------------------------------------------------------
# Fixture locations + determinism constants
# ---------------------------------------------------------------------------

FIXTURES_DIR = Path(__file__).parent / "fixtures"
SILVER_FIXTURE_PATH = FIXTURES_DIR / "silver_fixture.json"
GOLDEN_MASTER_PATH = FIXTURES_DIR / "gold_latest_golden.json"

# Frozen "now" so generated_at is deterministic and byte-comparable.
_FROZEN_NOW = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)

# Matches the terraform default ratio_min_count = 5 used in dev + prod.
_MIN_COUNT = 5


# ---------------------------------------------------------------------------
# Helpers shared by the test and the --regenerate entry point
# ---------------------------------------------------------------------------


def load_silver_fixture() -> pd.DataFrame:
    """
    Load the committed silver fixture rows into a DataFrame.

    ``snapshot_date`` stays a plain ISO string — exactly how the silver
    Lambda serialises it into Parquet and how the gold Lambda receives it.

    Returns:
        DataFrame of deterministic silver listing rows.
    """
    rows = json.loads(SILVER_FIXTURE_PATH.read_text())
    return pd.DataFrame(rows)


def build_golden_bytes(silver_df: pd.DataFrame) -> bytes:
    """
    Produce the exact bytes the gold Lambda would upload for *silver_df*.

    Freezes ``gold_aggregate.datetime.now`` so ``generated_at`` is stable,
    then serialises identically to ``gold_aggregation_lambda``
    (``json.dumps(..., default=str)``).

    Args:
        silver_df: Combined silver history DataFrame.

    Returns:
        UTF-8 encoded JSON payload.
    """
    with mock.patch("gold_aggregate.datetime") as frozen_dt:
        frozen_dt.now.return_value = _FROZEN_NOW
        aggregation = build_aggregation_json(silver_df, min_count=_MIN_COUNT)
    return json.dumps(aggregation, default=str).encode("utf-8")


# ---------------------------------------------------------------------------
# The golden-master gate
# ---------------------------------------------------------------------------


class TestGoldGoldenMaster:
    """Byte-for-byte regression gate for the schema-v1.0 gold output."""

    def test_fixtures_exist(self) -> None:
        """Both committed fixture files must be present in the repo."""
        assert SILVER_FIXTURE_PATH.is_file(), (
            f"Missing {SILVER_FIXTURE_PATH}. Run "
            "'python tests/test_gold_golden_master.py --regenerate'."
        )
        assert GOLDEN_MASTER_PATH.is_file(), (
            f"Missing {GOLDEN_MASTER_PATH}. Run "
            "'python tests/test_gold_golden_master.py --regenerate'."
        )

    def test_output_matches_golden_master_byte_for_byte(self) -> None:
        """
        The aggregation of the fixed silver fixture must equal the committed
        golden master exactly — any byte of drift fails the refactor gate.

        The committed file is a POSIX text file (trailing newline, enforced
        by the end-of-file-fixer pre-commit hook); the payload compared here
        is everything before that single terminator byte.
        """
        actual = build_golden_bytes(load_silver_fixture())
        expected = GOLDEN_MASTER_PATH.read_bytes()

        assert expected.endswith(b"\n"), (
            "Golden master must be newline-terminated (pre-commit "
            "end-of-file-fixer contract)."
        )
        assert actual == expected[:-1], (
            "Gold output drifted from the committed golden master. "
            "If (and only if) the schema contract intentionally changed, "
            "regenerate via 'python tests/test_gold_golden_master.py "
            "--regenerate' and bump the schema version."
        )

    def test_golden_master_is_schema_v1(self) -> None:
        """Sanity: the golden master itself honours the v1.0 contract."""
        payload = json.loads(GOLDEN_MASTER_PATH.read_bytes())

        assert payload["schema_version"] == "1.0"
        assert payload["min_count"] == _MIN_COUNT
        assert set(payload["general"].keys()) == {
            "price_time_series_neighborhood",
            "price_time_series_district",
            "rent_vs_sale_ratio",
            "rent_vs_sale_ratio_time_series",
            "boxplot_by_neighborhood",
            "boxplot_by_neighborhood_last_3m",
        }
        assert set(payload["relevant"].keys()) == {
            "rent_vs_sale_ratio",
            "rent_vs_sale_ratio_time_series",
            "boxplot_by_neighborhood",
            "boxplot_by_neighborhood_last_3m",
        }
        # Non-trivial content: the fixture must exercise every dataset.
        assert payload["general"]["price_time_series_neighborhood"]
        assert payload["general"]["rent_vs_sale_ratio"]
        assert payload["relevant"]["rent_vs_sale_ratio"]
        assert payload["general"]["boxplot_by_neighborhood_last_3m"]
        assert payload["relevant"]["boxplot_by_neighborhood_last_3m"]


# ---------------------------------------------------------------------------
# Deterministic fixture generation (--regenerate)
# ---------------------------------------------------------------------------

_SNAPSHOTS = ["2023-04-09", "2023-04-16"]
_OPERATIONS = ["sale", "rent"]

# (district, neighborhood) — three in-scope locations (note the typographic
# apostrophe U+2019 in L’Eixample, asserted by the schema tests) plus one
# out-of-scope district to exercise apply_scope.
_LOCATIONS = [
    ("Extramurs", "La Petxina"),
    ("Ciutat Vella", "El Carme"),
    ("L\u2019Eixample", "Russafa"),
    ("Campanar", "Nou Moles"),
]

# 10 listings per (snapshot, operation, location); every second one matches
# the relevant-population predicate → 5 relevant per side == _MIN_COUNT, so
# the relevant ratio datasets are populated (not filtered away).
_LISTINGS_PER_GROUP = 10


def _generate_silver_fixture_rows() -> List[Dict[str, Any]]:
    """
    Build the deterministic silver fixture rows (no randomness, no clock).

    Returns:
        List of silver listing dicts covering both operations, two
        snapshots, all scope districts, one out-of-scope district, both
        populations (relevant + non-relevant) and one duplicated
        propertyCode to exercise dedup.
    """
    rows: List[Dict[str, Any]] = []
    for snap_idx, snapshot in enumerate(_SNAPSHOTS):
        for op_idx, operation in enumerate(_OPERATIONS):
            base_price = 300_000.0 if operation == "sale" else 1_200.0
            step = 10_000.0 if operation == "sale" else 40.0
            for loc_idx, (district, neighborhood) in enumerate(_LOCATIONS):
                for i in range(_LISTINGS_PER_GROUP):
                    relevant = i % 2 == 0
                    size = (130.0 if relevant else 105.0) + 2.0 * i
                    price = round(
                        base_price * (1 + 0.02 * snap_idx)
                        + 1_000.0 * loc_idx
                        + step * i,
                        2,
                    )
                    rows.append(
                        {
                            "operation": operation,
                            "district": district,
                            "neighborhood": neighborhood,
                            "snapshot_date": snapshot,
                            "propertyCode": f"P{snap_idx}{op_idx}{loc_idx}{i}",
                            "priceByArea": round(price / size, 2),
                            "size": size,
                            "price": price,
                            "floor": "3" if relevant else "1",
                            "rooms": 3 if relevant else 1,
                            "bathrooms": 2 if relevant else 1,
                            "hasLift": relevant,
                        }
                    )

    # One exact duplicate within the same (operation, snapshot_date,
    # propertyCode) so the dedup path contributes to the golden master.
    rows.append(dict(rows[0]))
    return rows


def main() -> None:
    """Regenerate both fixtures deterministically and report their sizes."""
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)

    rows = _generate_silver_fixture_rows()
    SILVER_FIXTURE_PATH.write_text(json.dumps(rows, indent=2) + "\n")
    print(f"Wrote {len(rows)} rows to {SILVER_FIXTURE_PATH}")

    golden = build_golden_bytes(load_silver_fixture())
    # Trailing newline: keep the committed file POSIX-text so the
    # end-of-file-fixer pre-commit hook never rewrites it.
    GOLDEN_MASTER_PATH.write_bytes(golden + b"\n")
    print(f"Wrote {len(golden)} payload bytes to {GOLDEN_MASTER_PATH}")


if __name__ == "__main__":
    if "--regenerate" not in sys.argv:
        sys.exit("Refusing to regenerate without the explicit --regenerate flag.")
    main()
