"""
Silver-layer transform for Idealista bronze listings.

This module turns raw bronze JSON snapshots (as written by the data-collection
Lambda under the ``bronze/idealista/`` S3 prefix) into a cleaned, queryable
silver layer. It is intentionally split into small, pure helpers so the logic
can be unit-tested without any AWS dependencies.

The bronze payloads do **not** carry a ``dateDownload`` field; the snapshot date
and pagination index live only in the object key, which follows the pattern::

    bronze/idealista/{operation}_{YYYYMMDD}_{HHMMSS}_{page}.json

``parse_key_metadata`` is the single source of truth for decoding that key.
"""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import date, datetime
from typing import Any, Dict, List, Tuple

# Operations supported by the Idealista collector. Used to validate keys so a
# malformed or unexpected operation fails loudly instead of corrupting the
# silver partitioning scheme (operation=.../snapshot_date=...).
VALID_OPERATIONS = ("rent", "sale")

# Version of the dashboard aggregation contract emitted by
# ``build_aggregation_json``. Bump when the JSON shape changes so downstream
# consumers (the web app) can detect and adapt to schema changes.
SCHEMA_VERSION = "1.0"

# Matches "{operation}_{YYYYMMDD}_{HHMMSS}_{page}.json" on the file-name portion
# of a bronze key. The date/time groups are validated further below; the regex
# only guarantees the coarse shape and digit counts.
_KEY_PATTERN = re.compile(
    r"^(?P<operation>rent|sale)_"
    r"(?P<date>\d{8})_"
    r"(?P<time>\d{6})_"
    r"(?P<page>\d+)\.json$"
)


def parse_key_metadata(key: str) -> Tuple[str, date, int]:
    """
    Decode a bronze S3 object key into its silver-partitioning metadata.

    The collector writes one JSON file per paginated API response using the
    naming convention ``{operation}_{YYYYMMDD}_{HHMMSS}_{page}.json`` under the
    ``bronze/idealista/`` prefix. Because the payload itself has no download
    timestamp, this function is the authoritative way to recover the snapshot
    date and pagination index for downstream partitioning.

    Args:
        key: Full S3 object key or bare file name, e.g.
            ``"bronze/idealista/rent_20230409_120044_1.json"`` or
            ``"rent_20230409_120044_1.json"``.

    Returns:
        A tuple ``(operation, snapshot_date, page)`` where ``operation`` is one
        of ``"rent"``/``"sale"``, ``snapshot_date`` is a ``datetime.date`` parsed
        from the ``YYYYMMDD`` component, and ``page`` is the 1-based page index.

    Raises:
        ValueError: If the key (its file-name component) does not match the
            expected pattern, uses an unsupported operation, or carries an
            invalid calendar date.
    """
    if not key:
        raise ValueError("key must be a non-empty string")

    # Only the final path component encodes the metadata; ignore any prefix.
    filename = key.rsplit("/", 1)[-1]

    match = _KEY_PATTERN.match(filename)
    if match is None:
        raise ValueError(f"key does not match bronze naming convention: {key!r}")

    operation = match.group("operation")
    if operation not in VALID_OPERATIONS:
        # Defensive: the regex already restricts this, but keep the contract
        # explicit so future regex edits cannot silently widen the operations.
        raise ValueError(f"unsupported operation in key: {operation!r}")

    # strptime validates the calendar date (e.g. rejects month 13 / day 32).
    try:
        snapshot_date = datetime.strptime(match.group("date"), "%Y%m%d").date()
    except ValueError as exc:
        raise ValueError(f"invalid date in key {key!r}: {exc}") from exc

    page = int(match.group("page"))

    return operation, snapshot_date, page


def clean(
    elements: List[Dict[str, Any]],
    snapshot_date: date,
    operation: str,
) -> List[Dict[str, Any]]:
    """
    Clean and aggregate one snapshot's listing elements into silver rows.

    Elements are expected to be the concatenation of every paginated response
    for a single ``(operation, snapshot_date)`` snapshot. Listings without a
    usable ``priceByArea`` or ``neighborhood`` are dropped, and the remainder
    are grouped by neighborhood and reduced to the mean ``priceByArea`` and a
    listing count. This keeps the silver layer one row per
    ``(neighborhood, snapshot_date)``.

    Args:
        elements: Raw bronze listing dicts (the ``elementList`` payload).
        snapshot_date: Date of the snapshot, recovered from the object key.
        operation: ``"rent"`` or ``"sale"`` for this snapshot.

    Returns:
        A list of silver rows sorted by neighborhood. Each row has the keys
        ``operation``, ``neighborhood``, ``snapshot_date`` (a ``date``),
        ``price_by_area_mean`` (float), and ``listing_count`` (int). An empty
        input yields an empty list.
    """
    # Accumulate running sum and count per neighborhood for a single pass.
    sums: Dict[str, float] = defaultdict(float)
    counts: Dict[str, int] = defaultdict(int)

    for element in elements:
        neighborhood = element.get("neighborhood")
        price_by_area = element.get("priceByArea")

        # Skip listings that cannot anchor a neighborhood time-series or that
        # carry no price signal; both are required by the dashboard contract.
        if not neighborhood or price_by_area is None:
            continue

        sums[neighborhood] += float(price_by_area)
        counts[neighborhood] += 1

    rows: List[Dict[str, Any]] = []
    for neighborhood in sorted(counts):
        count = counts[neighborhood]
        # round(2) keeps the JSON stable and avoids float noise in aggregates.
        mean = round(sums[neighborhood] / count, 2)
        rows.append(
            {
                "operation": operation,
                "neighborhood": neighborhood,
                "snapshot_date": snapshot_date,
                "price_by_area_mean": mean,
                "listing_count": count,
            }
        )

    return rows


def build_aggregation_json(
    history: List[Dict[str, Any]],
    schema_version: str = SCHEMA_VERSION,
) -> Dict[str, Any]:
    """
    Build the dashboard JSON document from the full silver history.

    The web app consumes a single pre-aggregated document rather than scanning
    Parquet. This function turns the entire silver history (every cleaned row
    across all snapshots) into a nested, time-series-oriented structure keyed by
    operation and neighborhood.

    Args:
        history: All silver rows as produced by :func:`clean`, across every
            snapshot. Each row must carry ``operation``, ``neighborhood``,
            ``snapshot_date``, ``price_by_area_mean``, and ``listing_count``.
        schema_version: Contract version stamped into the output document.

    Returns:
        A dict of the form::

            {
                "schema_version": "1.0",
                "operations": {
                    "rent": {
                        "<neighborhood>": [
                            {
                                "snapshot_date": "YYYY-MM-DD",
                                "price_by_area_mean": float,
                                "listing_count": int,
                            },
                            ...
                        ]
                    },
                    "sale": { ... }
                }
            }

        Each neighborhood's series is sorted ascending by ``snapshot_date``.
    """
    # operations[operation][neighborhood] -> list of time-series points.
    operations: Dict[str, Dict[str, List[Dict[str, Any]]]] = defaultdict(
        lambda: defaultdict(list)
    )

    for row in history:
        snapshot_date = row["snapshot_date"]
        # Normalise date objects to ISO strings for JSON serialisation.
        iso_date = (
            snapshot_date.isoformat()
            if isinstance(snapshot_date, date)
            else str(snapshot_date)
        )
        operations[row["operation"]][row["neighborhood"]].append(
            {
                "snapshot_date": iso_date,
                "price_by_area_mean": row["price_by_area_mean"],
                "listing_count": row["listing_count"],
            }
        )

    # Sort each neighborhood series chronologically and emit plain dicts so the
    # result is JSON-serialisable and deterministic.
    result_operations: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}
    for operation in sorted(operations):
        result_operations[operation] = {}
        for neighborhood in sorted(operations[operation]):
            series = sorted(
                operations[operation][neighborhood],
                key=lambda point: point["snapshot_date"],
            )
            result_operations[operation][neighborhood] = series

    return {
        "schema_version": schema_version,
        "operations": result_operations,
    }
