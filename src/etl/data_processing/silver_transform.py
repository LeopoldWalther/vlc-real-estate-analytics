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
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

# Operations supported by the Idealista collector. Used to validate keys so a
# malformed or unexpected operation fails loudly instead of corrupting the
# silver partitioning scheme (operation=.../snapshot_date=...).
VALID_OPERATIONS = ("rent", "sale")

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


# ---------------------------------------------------------------------------
# Silver column contract — mirrors Notebook §3 Issue 1 (column reduction).
# ``dateDownload`` is absent from bronze payloads and is replaced by the
# key-derived ``snapshot_date`` column below.
# ---------------------------------------------------------------------------
_SILVER_COLUMNS: tuple[str, ...] = (
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
)

# Validity bounds for sale priceByArea (Notebook §3 Issue 4).
_SALE_PRICE_BY_AREA_MIN: float = 1000.0
_SALE_PRICE_BY_AREA_MAX: float = 10000.0


def clean(
    elements: List[Dict[str, Any]],
    snapshot_date: date,
    operation: str,
) -> List[Dict[str, Any]]:
    """
    Clean raw bronze listing elements into Silver individual-listing rows.

    Replicates the data-validity steps from Notebook §3 (Issues 1, 2, 4) and
    the null-handling identified during real-data exploration:

    * **Issue 1 — Column reduction:** output rows contain only the Silver
      column set; extra fields are discarded; optional missing fields default
      to ``None`` so the downstream Parquet schema stays stable.
    * **Issue 2 — Zero bathrooms:** listings with ``bathrooms <= 0`` are
      dropped (notebook finding: not plausible for an apartment of interest).
    * **Issue 4 — Sale price range:** for ``operation == "sale"`` only, rows
      outside ``1000 < priceByArea < 10000`` are dropped.
    * **Null handling:** rows with ``priceByArea is None`` or a missing/empty
      ``neighborhood`` are dropped before any further processing.

    **NOT in Silver:** the district scope filter
    (``["Extramurs", "Ciutat Vella", "L'Eixample"]``) and all aggregation stay
    in the Gold layer (TASK-004). Silver is a broad, reusable cleaned-listings
    layer.

    Args:
        elements: Raw bronze listing dicts, typically the concatenation of every
            paginated ``elementList`` for a single ``(operation, snapshot_date)``
            snapshot.
        snapshot_date: Date of the snapshot, recovered from the object key by
            :func:`parse_key_metadata`. Injected as ``snapshot_date`` column so
            the silver layer carries no dependency on the non-existent
            ``dateDownload`` field.
        operation: ``"rent"`` or ``"sale"`` for this snapshot. Used to apply the
            sale-specific price-range filter (Issue 4).

    Returns:
        A list of cleaned listing dicts — one dict per listing that passes all
        validity filters. Each dict contains exactly the Silver column set
        (``_SILVER_COLUMNS``). An empty input yields an empty list.
    """
    rows: List[Dict[str, Any]] = []

    for element in elements:
        # --- Null / missing guards (must check before any cast) ---------------
        price_by_area: Optional[float] = element.get("priceByArea")
        if price_by_area is None:
            continue

        neighborhood: Optional[str] = element.get("neighborhood")
        if not neighborhood:  # catches None, "", and whitespace-only strings
            continue

        # --- Issue 2: drop listings with bathrooms <= 0 ----------------------
        bathrooms = element.get("bathrooms")
        if bathrooms is not None and bathrooms <= 0:
            continue

        # --- Issue 4: sale listings must be within the priceByArea window ----
        # Use the element's own operation field for the per-row filter so that
        # the logic mirrors notebook §3 Issue 4 (per-row ``df.operation``),
        # falling back to the key-derived batch operation when not present.
        element_operation: str = element.get("operation") or operation
        if element_operation == "sale":
            if not (_SALE_PRICE_BY_AREA_MIN < price_by_area < _SALE_PRICE_BY_AREA_MAX):
                continue

        # --- Issue 1: reduce to Silver columns; missing optionals → None -----
        row: Dict[str, Any] = {col: element.get(col) for col in _SILVER_COLUMNS}
        # snapshot_date is NOT in the element payload — inject from the key.
        row["snapshot_date"] = snapshot_date

        rows.append(row)

    return rows
