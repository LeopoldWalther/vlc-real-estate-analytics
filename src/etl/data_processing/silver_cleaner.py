"""
SilverCleaner — encapsulated bronze → silver cleaning (FEATURE-008).

The class owns the snapshot-selection and persistence rules (Encapsulation)
and depends only on the narrow :class:`~common.object_store.ObjectStore`
protocol (Dependency Inversion), so tests run against
``InMemoryObjectStore`` without AWS. The genuinely pure row-level rules stay
in :mod:`silver_transform` and are called unchanged.
"""

from __future__ import annotations

import io
import json
import logging
from dataclasses import dataclass
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from common.object_store import ObjectStore

# silver_transform lives in the same directory (Lambda deployment package).
from silver_transform import clean, parse_key_metadata

logger = logging.getLogger()


@dataclass(frozen=True)
class CleaningResult:
    """
    Immutable summary of one silver cleaning run.

    Attributes:
        written_keys: Silver Parquet keys written during this run.
        rows_written: Total cleaned rows across all written Parquet files.
        snapshots_found: Whether any bronze snapshot was found at all.
    """

    written_keys: Tuple[str, ...]
    rows_written: int
    snapshots_found: bool

    @property
    def message(self) -> str:
        """Human-readable body matching the pre-refactor handler output."""
        if not self.snapshots_found:
            return "No bronze snapshots found."
        return (
            f"Wrote {len(self.written_keys)} Parquet file(s): "
            f"{list(self.written_keys)}"
        )


class SilverCleaner:
    """
    Read bronze snapshot JSON, clean it, and persist silver Parquet.

    Single Responsibility: this class orchestrates list → read → clean →
    write for the silver layer; row-level cleaning rules live in
    :mod:`silver_transform`, storage details behind :class:`ObjectStore`.
    """

    def __init__(
        self,
        *,
        object_store: ObjectStore,
        bronze_prefix: str,
        silver_prefix: str,
    ) -> None:
        """
        Args:
            object_store: Storage abstraction for bronze reads/silver writes.
            bronze_prefix: Prefix of bronze objects (e.g. ``"bronze/idealista"``).
            silver_prefix: Prefix of silver objects (e.g. ``"silver/idealista"``).
        """
        self._store = object_store
        self._bronze_prefix = bronze_prefix.rstrip("/")
        self._silver_prefix = silver_prefix.rstrip("/")

    def clean_snapshots(self, target_date: Optional[date] = None) -> CleaningResult:
        """
        Clean the latest (or a specific) bronze snapshot into silver Parquet.

        Incremental guard: existing Parquet keys are never rewritten, so the
        run is safe to repeat for the same snapshot (idempotent).

        Args:
            target_date: When set, process only this snapshot date; otherwise
                the latest snapshot per operation is processed.

        Returns:
            Summary of written keys and row counts.
        """
        snapshot_groups = self._list_snapshot_keys(target_date)
        if not snapshot_groups:
            logger.warning(
                "No bronze snapshot keys found under %s/", self._bronze_prefix
            )
            return CleaningResult(
                written_keys=(), rows_written=0, snapshots_found=False
            )

        written: List[str] = []
        rows_written = 0
        for (operation, snapshot_date), keys in sorted(snapshot_groups.items()):
            logger.info(
                "Processing operation=%s snapshot_date=%s (%d pages)",
                operation,
                snapshot_date,
                len(keys),
            )

            # Combine all paginated files for this snapshot into one list.
            all_elements: List[Dict[str, Any]] = []
            for key in sorted(keys):
                all_elements.extend(self._read_elements(key))

            cleaned = clean(all_elements, snapshot_date, operation)
            logger.info(
                "operation=%s snapshot_date=%s: %d raw → %d cleaned",
                operation,
                snapshot_date,
                len(all_elements),
                len(cleaned),
            )

            if not cleaned:
                logger.warning(
                    "All listings dropped for operation=%s snapshot_date=%s "
                    "— skipping Parquet write.",
                    operation,
                    snapshot_date,
                )
                continue

            # Incremental guard: skip if the output Parquet already exists.
            out_key = self._parquet_key(operation, snapshot_date)
            if self._store.exists(out_key):
                logger.info(
                    "Parquet already exists for operation=%s snapshot_date=%s "
                    "— skipping.",
                    operation,
                    snapshot_date,
                )
                continue

            self._write_parquet(out_key, cleaned)
            written.append(out_key)
            rows_written += len(cleaned)

        return CleaningResult(
            written_keys=tuple(written),
            rows_written=rows_written,
            snapshots_found=True,
        )

    # ------------------------------------------------------------------
    # Private helpers — callers interact through clean_snapshots() only.
    # ------------------------------------------------------------------

    def _list_snapshot_keys(
        self, target_date: Optional[date]
    ) -> Dict[Tuple[str, date], List[str]]:
        """
        Group bronze keys by ``(operation, snapshot_date)``.

        With *target_date* set, all keys for that exact date are returned;
        otherwise only the latest snapshot per operation is kept.
        """
        all_keys = [
            key
            for key in self._store.list_keys(self._bronze_prefix + "/")
            if key.endswith(".json")
        ]

        groups: Dict[Tuple[str, date], List[str]] = {}
        for key in all_keys:
            try:
                operation, snapshot_date, _ = parse_key_metadata(key)
            except ValueError:
                logger.warning("Skipping unrecognised bronze key: %s", key)
                continue
            groups.setdefault((operation, snapshot_date), []).append(key)

        if target_date is not None:
            return {
                (op, snap_date): keys
                for (op, snap_date), keys in groups.items()
                if snap_date == target_date
            }

        # Default: keep only the latest snapshot_date per operation.
        latest: Dict[str, date] = {}
        for operation, snap_date in groups:
            if operation not in latest or snap_date > latest[operation]:
                latest[operation] = snap_date

        return {
            (op, snap_date): keys
            for (op, snap_date), keys in groups.items()
            if latest.get(op) == snap_date
        }

    def _read_elements(self, key: str) -> List[Dict[str, Any]]:
        """Download one bronze JSON object and return its ``elementList``."""
        payload: Dict[str, Any] = json.loads(self._store.get_bytes(key))
        return payload.get("elementList", [])

    def _parquet_key(self, operation: str, snapshot_date: date) -> str:
        """Deterministic silver partition key for ``(operation, date)``."""
        return (
            f"{self._silver_prefix}/operation={operation}"
            f"/snapshot_date={snapshot_date.isoformat()}/part.parquet"
        )

    def _write_parquet(self, key: str, rows: List[Dict[str, Any]]) -> None:
        """Serialise cleaned rows to Parquet and persist them."""
        df = pd.DataFrame(rows)

        # Serialise snapshot_date as a plain string so Parquet roundtrips
        # cleanly without timezone/precision surprises.
        if "snapshot_date" in df.columns:
            df["snapshot_date"] = df["snapshot_date"].astype(str)

        buffer = io.BytesIO()
        df.to_parquet(buffer, index=False, engine="pyarrow")

        self._store.put_bytes(
            key, buffer.getvalue(), content_type="application/octet-stream"
        )
        logger.info("Wrote %d rows to %s", len(rows), key)
