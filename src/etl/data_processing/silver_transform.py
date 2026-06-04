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
from typing import Tuple

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
