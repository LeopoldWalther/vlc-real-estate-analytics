"""
Gold aggregation strategies + GoldAggregator (FEATURE-008).

Each dashboard dataset is modelled as an :class:`Aggregation` **Strategy**
behind one common interface (Open/Closed, Polymorphism): a new dataset
plugs in by adding a class and appending it to a population's strategy
list — no switch statements, no ``isinstance`` ladders.

:class:`GoldAggregator` composes the strategies, depends only on the
:class:`~common.object_store.ObjectStore` protocol (DI), and produces the
frozen schema-v1.0 contract. The numeric work stays in the pure helpers of
:mod:`gold_aggregate`, which the strategies delegate to — the golden-master
test guards byte-for-byte equality of the final document.
"""

from __future__ import annotations

import io
import json
import logging
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Protocol, Sequence, Tuple

import pandas as pd

from common.object_store import ObjectStore
from gold_aggregate import (
    RELEVANT_FILTER_SPEC,
    SCOPE_DISTRICTS,
    _boxplot_by_neighborhood,
    _dedup,
    _price_time_series_district,
    _price_time_series_neighborhood,
    _relevant_rows,
    _rent_vs_sale_ratio,
    _rent_vs_sale_ratio_time_series,
    apply_scope,
    utc_now_iso,
)

logger = logging.getLogger()

# Minimal physical columns expected in every silver Parquet file. Used to
# initialise an empty DataFrame when no silver data exists so the
# aggregations can iterate columns without KeyError.
SILVER_REQUIRED_COLS: List[str] = [
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


class Aggregation(Protocol):
    """
    Strategy interface for one gold dataset.

    Every dataset exposes its JSON ``key`` plus a ``compute`` that maps a
    deduped, scoped DataFrame to record dicts. Variants are interchangeable
    through this interface (Liskov Substitution).
    """

    @property
    def key(self) -> str:
        """Dataset key inside the population block of the JSON contract."""
        ...

    def compute(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        """Return the dataset records for the given listings DataFrame."""
        ...


class NeighborhoodPriceTimeSeries:
    """Strategy: price time-series at neighborhood grain."""

    key: str = "price_time_series_neighborhood"

    def compute(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        """Delegate to the pure helper in :mod:`gold_aggregate`."""
        return _price_time_series_neighborhood(df)


class DistrictPriceTimeSeries:
    """Strategy: count-weighted price time-series at district grain."""

    key: str = "price_time_series_district"

    def compute(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        """Delegate to the pure helper in :mod:`gold_aggregate`."""
        return _price_time_series_district(df)


class RentVsSaleRatio:
    """Strategy: full-history rent-vs-sale ratio per neighborhood."""

    key: str = "rent_vs_sale_ratio"

    def __init__(self, min_count: int) -> None:
        """
        Args:
            min_count: Minimum listings per side before a pair is included.
        """
        self._min_count = min_count

    def compute(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        """Delegate to the pure helper in :mod:`gold_aggregate`."""
        return _rent_vs_sale_ratio(df, min_count=self._min_count)


class RentVsSaleRatioTimeSeries:
    """Strategy: per-snapshot rent-vs-sale ratio time-series."""

    key: str = "rent_vs_sale_ratio_time_series"

    def __init__(self, min_count: int) -> None:
        """
        Args:
            min_count: Minimum listings per side per snapshot.
        """
        self._min_count = min_count

    def compute(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        """Delegate to the pure helper in :mod:`gold_aggregate`."""
        return _rent_vs_sale_ratio_time_series(df, min_count=self._min_count)


class NeighborhoodBoxplot:
    """Strategy: 5-number priceByArea summary per neighborhood."""

    key: str = "boxplot_by_neighborhood"

    def compute(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        """Delegate to the pure helper in :mod:`gold_aggregate`."""
        return _boxplot_by_neighborhood(df)


def default_populations(
    min_count: int,
) -> Tuple[Sequence[Aggregation], Sequence[Aggregation]]:
    """
    Build the schema-v1.0 strategy lists for the two population blocks.

    Order matters: json.dumps preserves insertion order and the
    golden-master test asserts byte-for-byte equality, so the sequences
    reproduce the pre-refactor block layout exactly.

    Args:
        min_count: Ratio inclusion threshold forwarded to ratio strategies.

    Returns:
        ``(general_aggregations, relevant_aggregations)`` tuple.
    """
    ratio = RentVsSaleRatio(min_count)
    ratio_ts = RentVsSaleRatioTimeSeries(min_count)
    boxplot = NeighborhoodBoxplot()

    general: Sequence[Aggregation] = (
        NeighborhoodPriceTimeSeries(),
        DistrictPriceTimeSeries(),
        ratio,
        ratio_ts,
        boxplot,
    )
    relevant: Sequence[Aggregation] = (ratio, ratio_ts, boxplot)
    return general, relevant


@dataclass(frozen=True)
class GoldResult:
    """
    Immutable summary of one gold aggregation run.

    Attributes:
        key: S3 key the aggregation JSON was written to.
        size_bytes: Size of the written JSON payload.
    """

    key: str
    size_bytes: int


class GoldAggregator:
    """
    Read the silver Parquet history, run the strategies, write latest.json.

    Single Responsibility: orchestration only — dataset math lives in the
    strategies, storage behind :class:`ObjectStore`. Open/Closed: new
    datasets are added by injecting an extra strategy, not by editing this
    class.
    """

    def __init__(
        self,
        *,
        object_store: ObjectStore,
        silver_prefix: str,
        gold_prefix: str,
        min_count: int,
        general_aggregations: Optional[Sequence[Aggregation]] = None,
        relevant_aggregations: Optional[Sequence[Aggregation]] = None,
    ) -> None:
        """
        Args:
            object_store: Storage abstraction for silver reads/gold writes.
            silver_prefix: Prefix of silver Parquet (e.g. ``"silver/idealista"``).
            gold_prefix: Prefix of gold output (e.g. ``"gold/aggregations"``).
            min_count: Ratio inclusion threshold (schema field ``min_count``).
            general_aggregations: Strategy list for the general population;
                defaults to the frozen schema-v1.0 set.
            relevant_aggregations: Strategy list for the relevant population;
                defaults to the frozen schema-v1.0 set.
        """
        default_general, default_relevant = default_populations(min_count)
        self._store = object_store
        self._silver_prefix = silver_prefix.rstrip("/")
        self._gold_prefix = gold_prefix.rstrip("/")
        self._min_count = min_count
        self._general = (
            general_aggregations
            if general_aggregations is not None
            else default_general
        )
        self._relevant = (
            relevant_aggregations
            if relevant_aggregations is not None
            else default_relevant
        )

    def aggregate(self) -> GoldResult:
        """
        Run the full silver → gold aggregation and persist latest.json.

        Returns:
            Summary with the written key and payload size.
        """
        silver_df = self._read_silver_history()
        document = self.build_document(silver_df)

        # Serialise with str() fallback for date objects — identical to the
        # pre-refactor handler so the golden master stays byte-for-byte.
        body = json.dumps(document, default=str).encode("utf-8")

        output_key = f"{self._gold_prefix}/latest.json"
        self._store.put_bytes(output_key, body, content_type="application/json")
        logger.info("Wrote aggregations (%d bytes) to %s", len(body), output_key)

        return GoldResult(key=output_key, size_bytes=len(body))

    def build_document(self, silver_df: pd.DataFrame) -> Dict[str, Any]:
        """
        Assemble the frozen schema-v1.0 document from a silver DataFrame.

        Args:
            silver_df: Combined silver history (all operations/snapshots).

        Returns:
            Dict matching schema v1.0 exactly (key order included).
        """
        scoped = apply_scope(silver_df)

        return {
            "schema_version": "1.0",
            "generated_at": utc_now_iso(),
            "scope_districts": SCOPE_DISTRICTS,
            "min_count": self._min_count,
            "relevant_filter": RELEVANT_FILTER_SPEC,
            "general": self._run_population(scoped, None, self._general),
            "relevant": self._run_population(scoped, _relevant_rows, self._relevant),
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _run_population(
        scoped: pd.DataFrame,
        row_filter: Optional[Callable[[pd.DataFrame], pd.DataFrame]],
        aggregations: Sequence[Aggregation],
    ) -> Dict[str, Any]:
        """Filter, dedup, then run every strategy of one population block."""
        filtered = row_filter(scoped) if row_filter is not None else scoped
        deduped = _dedup(filtered)
        return {agg.key: agg.compute(deduped) for agg in aggregations}

    def _read_silver_history(self) -> pd.DataFrame:
        """Read and combine every silver Parquet under the prefix."""
        keys = [
            key
            for key in self._store.list_keys(self._silver_prefix + "/")
            if key.endswith(".parquet")
        ]
        logger.info(
            "Found %d silver Parquet file(s) under %s/",
            len(keys),
            self._silver_prefix,
        )

        if not keys:
            logger.info("No silver Parquet files found; returning empty DataFrame.")
            return pd.DataFrame(columns=SILVER_REQUIRED_COLS)

        frames: List[pd.DataFrame] = []
        for key in keys:  # list_keys() is sorted → deterministic concat.
            frames.append(self._read_parquet(key))

        combined = pd.concat(frames, ignore_index=True)
        logger.info(
            "Combined silver history: %d rows from %d file(s).",
            len(combined),
            len(keys),
        )
        return combined

    def _read_parquet(self, key: str) -> pd.DataFrame:
        """
        Download and parse one silver Parquet file.

        Raises:
            ValueError: If ``operation`` or ``snapshot_date`` is not a
                physical column — Hive-path-only inference would silently
                corrupt the time-series output.
        """
        df = pd.read_parquet(io.BytesIO(self._store.get_bytes(key)))

        for required_col in ("operation", "snapshot_date"):
            if required_col not in df.columns:
                raise ValueError(
                    f"Silver Parquet {key!r} is missing the physical column "
                    f"'{required_col}'. The silver Lambda must write this as "
                    "a DataFrame column, not only as a Hive partition path "
                    "segment."
                )

        logger.info("Read %d rows from %s", len(df), key)
        return df
