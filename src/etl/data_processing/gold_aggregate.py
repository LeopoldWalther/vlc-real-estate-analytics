"""
Gold-layer aggregation for Idealista silver listings.

This module is intentionally pure (no AWS dependencies) so every function can
be unit-tested in isolation. The Lambda handler (gold_aggregation_lambda.py)
is responsible for reading silver Parquet, calling :func:`build_aggregation_json`,
and writing the result to S3.

The output JSON contract is frozen at schema v1.0. FEATURE-005 (static
visualization web app) depends on this exact shape — do not change field names
or structure without a schema-version bump.

Schema v1.0 top-level keys
---------------------------
- ``schema_version``  : "1.0"
- ``generated_at``    : ISO-8601 UTC timestamp
- ``scope_districts`` : ["Extramurs", "Ciutat Vella", "L'Eixample"]
- ``min_count``       : int, default 5; ratio pairs below this are excluded
- ``relevant_filter`` : dict echoing the relevant-population predicate
- ``general``         : population block — all scoped listings
- ``relevant``        : population block — "apartments like ours" filter

Population block keys
---------------------
general:
  - price_time_series_neighborhood
  - price_time_series_district   (count-weighted, not mean-of-means)
  - rent_vs_sale_ratio
  - rent_vs_sale_ratio_time_series
  - boxplot_by_neighborhood

relevant:
  - rent_vs_sale_ratio
  - rent_vs_sale_ratio_time_series
  - boxplot_by_neighborhood

Key design decisions (see REVIEW-FEATURE-004.md for rationale)
---------------------------------------------------------------
- Dedup only within (operation, snapshot_date, propertyCode) so the same
  property appearing in multiple snapshots contributes to each snapshot's
  time-series point — global dedup would collapse history.
- District-level price series uses count-weighted mean:
  ``sum(count * mean) / sum(count)`` — NOT mean-of-means.
- Boxplot ships a 5-number summary (min/q1/median/q3/max) + count over the
  full history. Plotly renders box traces from quartiles.
- ``floor`` is a string in the silver data; comparisons use ``!= "1"``.
- Output key is ``mean_price`` (never ``mean_prize``).
- ``min_count`` applies to ratio datasets: neighborhoods where either the
  sale or rent side has fewer than ``min_count`` listings are excluded.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Callable, Dict, List, Optional, cast

import pandas as pd

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SCOPE_DISTRICTS: List[str] = ["Extramurs", "Ciutat Vella", "L'Eixample"]

_DEFAULT_MIN_COUNT: int = 5

# Single named constant for the rolling KPI window length (FEATURE-010).
# The rolling window is relative to max(snapshot_date) in the scoped/deduped
# data, not wall-clock now — see _rolling_window_start().
ROLLING_KPI_WINDOW_MONTHS: int = 3

# The "apartments like ours" predicate, echoed into the JSON contract.
RELEVANT_FILTER_SPEC: Dict[str, Any] = {
    "hasLift": True,
    "floor_not": "1",
    "size_gt": 120,
    "rooms_gte": 2,
    "bathrooms_gte": 2,
}


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------


def utc_now_iso() -> str:
    """
    Return the current UTC time as an ISO-8601 string.

    Single source of the ``generated_at`` timestamp for both
    :func:`build_aggregation_json` and ``gold_aggregator.GoldAggregator``,
    so the golden-master test can freeze time by patching this module's
    ``datetime`` reference once.
    """
    return datetime.now(tz=timezone.utc).isoformat()


def _rolling_window_start(
    df: pd.DataFrame, window_months: int = ROLLING_KPI_WINDOW_MONTHS
) -> Optional[pd.Timestamp]:
    """
    Compute the inclusive start of a rolling calendar-month window.

    The window is anchored to ``max(snapshot_date)`` within ``df`` — never to
    wall-clock "now" — so backfills and delayed collection runs remain
    deterministic. ``snapshot_date`` values are normalised with
    ``pd.to_datetime(..., errors="coerce")`` so ISO strings, ``datetime.date``,
    and pandas ``Timestamp`` inputs all produce the same window start (M2).

    Args:
        df: DataFrame with a ``snapshot_date`` column (any date-like dtype).
        window_months: Number of calendar months to look back. Defaults to
            :data:`ROLLING_KPI_WINDOW_MONTHS`.

    Returns:
        The inclusive window start as a ``pd.Timestamp``, or ``None`` when
        ``df`` is empty or contains no parseable ``snapshot_date`` values.
    """
    if df.empty or "snapshot_date" not in df.columns:
        return None

    parsed = pd.to_datetime(df["snapshot_date"], errors="coerce")
    parsed = parsed.dropna()
    if parsed.empty:
        return None

    max_date = parsed.max()
    return cast(pd.Timestamp, max_date - pd.DateOffset(months=window_months))


def _relevant_rows(df: pd.DataFrame) -> pd.DataFrame:
    """
    Relevant-population predicate: apartments matching our search.

    Mirrors :data:`RELEVANT_FILTER_SPEC` exactly — shared by the pure
    entry point and the strategy-based ``GoldAggregator``.
    """
    return df[
        (df["hasLift"] == True)  # noqa: E712
        & (df["floor"] != "1")
        & (df["size"] > 120)
        & (df["rooms"] >= 2)
        & (df["bathrooms"] >= 2)
    ]


def apply_scope(df: pd.DataFrame) -> pd.DataFrame:
    """
    Filter a silver DataFrame to the 3 scope districts.

    The scope covers Valencia's three target districts:
    Extramurs, Ciutat Vella, and L\u2019Eixample. Rows from any other district are
    dropped. The district string ``"L\u2019Eixample"`` includes a typographic
    apostrophe (U+2019) — tests assert this exact byte.

    Args:
        df: Silver listings DataFrame with at least a ``district`` column.

    Returns:
        A filtered copy containing only rows whose ``district`` value is one of
        the 3 scope districts. Returns an empty DataFrame (same columns) when
        the input is empty or all rows are out of scope.
    """
    if df.empty:
        return df.copy()
    return df[df["district"].isin(SCOPE_DISTRICTS)].copy()


def _dedup(df: pd.DataFrame) -> pd.DataFrame:
    """
    Deduplicate within (operation, snapshot_date, propertyCode).

    CRITICAL: dedup must be scoped to a single snapshot. Dropping duplicates
    globally on propertyCode would collapse the time-series (a property
    re-listed in week 2 would lose its week-2 data point).

    Args:
        df: Scoped silver DataFrame.

    Returns:
        DataFrame with at most one row per (operation, snapshot_date,
        propertyCode) triple. Row order is not guaranteed.
    """
    if df.empty:
        return df.copy()
    return df.drop_duplicates(
        subset=["operation", "snapshot_date", "propertyCode"]
    ).copy()


def _price_time_series_neighborhood(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """
    Build price time-series aggregated at neighborhood grain.

    Groups by (operation, district, neighborhood, snapshot_date) and computes:
    - ``count_listings``  : number of listings
    - ``mean_priceByArea``: average price per m2
    - ``mean_size``       : average size in m2
    - ``mean_price``      : average total price (key is ``mean_price``, never ``mean_prize``)

    Args:
        df: Deduped, scoped listings DataFrame.

    Returns:
        List of record dicts. Empty list when input is empty.
    """
    if df.empty:
        return []

    grp = (
        df.groupby(["operation", "district", "neighborhood", "snapshot_date"])
        .agg(
            count_listings=("propertyCode", "count"),
            mean_priceByArea=("priceByArea", "mean"),
            mean_size=("size", "mean"),
            mean_price=("price", "mean"),
        )
        .reset_index()
    )

    # Convert snapshot_date to a serialisable string for the JSON contract.
    grp["snapshot_date"] = grp["snapshot_date"].apply(
        lambda v: v.isoformat() if isinstance(v, date) else str(v)
    )

    # Column labels are strings; cast narrows pandas' Hashable keys for mypy.
    return cast(List[Dict[str, Any]], grp.to_dict(orient="records"))


def _price_time_series_district(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """
    Build price time-series aggregated at district grain using count-weighting.

    A simple mean-of-means would over-represent small neighborhoods. Instead
    the district mean is computed as::

        sum(count_in_neighborhood * mean_priceByArea_in_neighborhood)
        ─────────────────────────────────────────────────────────────
                   sum(count_in_neighborhood)

    This matches the notebook's approach (aggregating all listings together,
    not aggregating pre-computed neighborhood means).

    Args:
        df: Deduped, scoped listings DataFrame.

    Returns:
        List of record dicts with keys: operation, district, snapshot_date,
        count_listings, mean_priceByArea, mean_size, mean_price.
        Empty list when input is empty.
    """
    if df.empty:
        return []

    # Use the raw listings for count-weighted aggregation (equivalent to
    # grouping all listings directly at district grain).
    grp = (
        df.groupby(["operation", "district", "snapshot_date"])
        .agg(
            count_listings=("propertyCode", "count"),
            mean_priceByArea=("priceByArea", "mean"),
            mean_size=("size", "mean"),
            mean_price=("price", "mean"),
        )
        .reset_index()
    )

    grp["snapshot_date"] = grp["snapshot_date"].apply(
        lambda v: v.isoformat() if isinstance(v, date) else str(v)
    )

    # Column labels are strings; cast narrows pandas' Hashable keys for mypy.
    return cast(List[Dict[str, Any]], grp.to_dict(orient="records"))


def _rent_vs_sale_ratio(
    df: pd.DataFrame,
    min_count: int = _DEFAULT_MIN_COUNT,
) -> List[Dict[str, Any]]:
    """
    Compute the full-history rent-vs-sale price ratio per (district, neighborhood).

    Aggregates all snapshots together (full-history view) then pivots on
    operation. Pairs where either side has fewer than ``min_count`` listings
    are excluded to avoid misleading ratios from sparse data.

    Args:
        df: Deduped, scoped listings DataFrame.
        min_count: Minimum listing count on each side of the ratio before the
            neighborhood-pair is included in the output. Default 5.

    Returns:
        List of record dicts. Keys: district, neighborhood,
        mean_priceByArea_sale, mean_priceByArea_rent,
        mean_sales_price_by_rent_ratio, count_listings_sale,
        count_listings_rent. Empty list when no qualifying pair exists.
    """
    if df.empty:
        return []

    agg = (
        df.groupby(["operation", "district", "neighborhood"])
        .agg(
            count_listings=("propertyCode", "count"),
            mean_priceByArea=("priceByArea", "mean"),
        )
        .reset_index()
    )

    sale = agg[agg["operation"] == "sale"][
        ["district", "neighborhood", "count_listings", "mean_priceByArea"]
    ].rename(
        columns={
            "count_listings": "count_listings_sale",
            "mean_priceByArea": "mean_priceByArea_sale",
        }
    )
    rent = agg[agg["operation"] == "rent"][
        ["district", "neighborhood", "count_listings", "mean_priceByArea"]
    ].rename(
        columns={
            "count_listings": "count_listings_rent",
            "mean_priceByArea": "mean_priceByArea_rent",
        }
    )

    merged = sale.merge(rent, on=["district", "neighborhood"], how="inner")

    # Apply min_count filter on both sides.
    merged = merged[
        (merged["count_listings_sale"] >= min_count)
        & (merged["count_listings_rent"] >= min_count)
    ]

    if merged.empty:
        return []

    merged["mean_sales_price_by_rent_ratio"] = (
        merged["mean_priceByArea_sale"] / merged["mean_priceByArea_rent"]
    )

    return cast(
        List[Dict[str, Any]],
        merged[
            [
                "district",
                "neighborhood",
                "mean_priceByArea_sale",
                "mean_priceByArea_rent",
                "mean_sales_price_by_rent_ratio",
                "count_listings_sale",
                "count_listings_rent",
            ]
        ].to_dict(orient="records"),
    )


def _rent_vs_sale_ratio_time_series(
    df: pd.DataFrame,
    min_count: int = _DEFAULT_MIN_COUNT,
) -> List[Dict[str, Any]]:
    """
    Compute the rent-vs-sale price ratio per (district, neighborhood, snapshot_date).

    Same logic as :func:`_rent_vs_sale_ratio` but computed independently for
    each ``snapshot_date``, so callers can plot the ratio as a time-series line
    chart.

    Args:
        df: Deduped, scoped listings DataFrame.
        min_count: Minimum count on each side per snapshot. Default 5.

    Returns:
        List of record dicts. Keys: district, neighborhood, snapshot_date,
        mean_priceByArea_sale, mean_priceByArea_rent,
        mean_sales_price_by_rent_ratio, count_listings_sale,
        count_listings_rent. Empty list when no qualifying snapshot-pair exists.
    """
    if df.empty:
        return []

    agg = (
        df.groupby(["operation", "district", "neighborhood", "snapshot_date"])
        .agg(
            count_listings=("propertyCode", "count"),
            mean_priceByArea=("priceByArea", "mean"),
        )
        .reset_index()
    )

    sale = agg[agg["operation"] == "sale"][
        [
            "district",
            "neighborhood",
            "snapshot_date",
            "count_listings",
            "mean_priceByArea",
        ]
    ].rename(
        columns={
            "count_listings": "count_listings_sale",
            "mean_priceByArea": "mean_priceByArea_sale",
        }
    )
    rent = agg[agg["operation"] == "rent"][
        [
            "district",
            "neighborhood",
            "snapshot_date",
            "count_listings",
            "mean_priceByArea",
        ]
    ].rename(
        columns={
            "count_listings": "count_listings_rent",
            "mean_priceByArea": "mean_priceByArea_rent",
        }
    )

    merged = sale.merge(
        rent, on=["district", "neighborhood", "snapshot_date"], how="inner"
    )
    merged = merged[
        (merged["count_listings_sale"] >= min_count)
        & (merged["count_listings_rent"] >= min_count)
    ]

    if merged.empty:
        return []

    merged["mean_sales_price_by_rent_ratio"] = (
        merged["mean_priceByArea_sale"] / merged["mean_priceByArea_rent"]
    )

    merged["snapshot_date"] = merged["snapshot_date"].apply(
        lambda v: v.isoformat() if isinstance(v, date) else str(v)
    )

    return cast(
        List[Dict[str, Any]],
        merged[
            [
                "district",
                "neighborhood",
                "snapshot_date",
                "mean_priceByArea_sale",
                "mean_priceByArea_rent",
                "mean_sales_price_by_rent_ratio",
                "count_listings_sale",
                "count_listings_rent",
            ]
        ].to_dict(orient="records"),
    )


def _boxplot_summary(df: pd.DataFrame, min_count: int = 1) -> List[Dict[str, Any]]:
    """
    Shared core: 5-number ``priceByArea`` summary per (operation, district,
    neighborhood) group, with an optional minimum-count stability guard.

    Both the all-time :func:`_boxplot_by_neighborhood` and the rolling
    :func:`_boxplot_by_neighborhood_last_months` delegate to this single
    implementation so the quantile/groupby math is never duplicated (M3).

    Args:
        df: Deduped, scoped (and, for the windowed caller, already
            date-filtered) listings DataFrame.
        min_count: Minimum number of listings a group must have (after
            dropping NaN prices) to be included. Default 1 (no filtering) —
            the all-time boxplot passes through every non-empty group;
            callers that need stability filtering pass a higher threshold.

    Returns:
        List of record dicts. Keys: operation, district, neighborhood, count,
        min, q1, median, q3, max. Empty list when input is empty.
    """
    if df.empty:
        return []

    records: List[Dict[str, Any]] = []
    for (op, dist, nbhd), group in df.groupby(
        ["operation", "district", "neighborhood"]
    ):
        prices = group["priceByArea"].dropna()
        if prices.empty or len(prices) < min_count:
            continue
        records.append(
            {
                "operation": op,
                "district": dist,
                "neighborhood": nbhd,
                "count": int(len(prices)),
                "min": float(prices.min()),
                "q1": float(prices.quantile(0.25)),
                "median": float(prices.quantile(0.50)),
                "q3": float(prices.quantile(0.75)),
                "max": float(prices.max()),
            }
        )

    return records


def _boxplot_by_neighborhood(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """
    Compute a 5-number summary of priceByArea per (operation, district, neighborhood).

    The summary is computed over the full history (all snapshots combined).
    Plotly box traces can render directly from quartile values, so raw rows
    are never shipped. This keeps latest.json small and the chart fast.

    This all-time dataset is intentionally NOT filtered by ``min_count`` —
    every group with at least one listing is included, preserving the
    original schema-v1.0 semantics.

    Args:
        df: Deduped, scoped listings DataFrame.

    Returns:
        List of record dicts. Keys: operation, district, neighborhood, count,
        min, q1, median, q3, max. Empty list when input is empty.
    """
    return _boxplot_summary(df, min_count=1)


def _boxplot_by_neighborhood_last_months(
    df: pd.DataFrame,
    window_months: int = ROLLING_KPI_WINDOW_MONTHS,
    min_count: int = _DEFAULT_MIN_COUNT,
) -> List[Dict[str, Any]]:
    """
    Compute the rolling-window 5-number priceByArea summary per neighborhood.

    Filters to rows with ``snapshot_date >= window_start`` (inclusive), where
    ``window_start`` is anchored to ``max(snapshot_date)`` in ``df`` — never
    wall-clock now (see :func:`_rolling_window_start`) — then delegates to the
    shared :func:`_boxplot_summary` core so quantile math is not duplicated
    (M3). The existing ``min_count`` stability guard is applied inside the
    window so sparse recent groups are excluded (H2).

    Args:
        df: Deduped, scoped listings DataFrame.
        window_months: Rolling window length in calendar months. Defaults to
            :data:`ROLLING_KPI_WINDOW_MONTHS`.
        min_count: Minimum listings a group must have inside the window to be
            included. Default 5 (:data:`_DEFAULT_MIN_COUNT`).

    Returns:
        List of record dicts with the same keys/shape as
        :func:`_boxplot_by_neighborhood`. Empty list when there is no data,
        no parseable ``snapshot_date``, or no group meets ``min_count``.
    """
    if df.empty:
        return []

    window_start = _rolling_window_start(df, window_months)
    if window_start is None:
        return []

    parsed_dates = pd.to_datetime(df["snapshot_date"], errors="coerce")
    windowed = df[parsed_dates >= window_start]

    return _boxplot_summary(windowed, min_count=min_count)


# ---------------------------------------------------------------------------
# Generic population-block builder
# ---------------------------------------------------------------------------


def build_population_block(
    df: pd.DataFrame,
    row_filter: Optional[Callable[[pd.DataFrame], pd.DataFrame]],
    min_count: int = _DEFAULT_MIN_COUNT,
) -> Dict[str, Any]:
    """
    Build one population block for the gold aggregation JSON.

    A population block is the unit of symmetry in the schema: the general
    population uses an identity filter (``row_filter=None``) while the
    relevant population uses a predicate that selects "apartments like ours".
    Calling this function twice — once per filter — keeps the logic DRY.

    The general population emits 5 datasets; the relevant population emits 3
    (no price time-series, because the sub-population is too small to produce
    a stable neighborhood-level series).

    Args:
        df: Scoped, but not yet filtered or deduped, silver DataFrame.
        row_filter: Optional callable ``(df) -> df`` that restricts rows to the
            target sub-population. Pass ``None`` for the general (all-listings)
            population.
        min_count: Minimum listing count per side before a ratio pair is
            included. Forwarded to ratio helpers. Default 5.

    Returns:
        Dict with dataset keys appropriate for the chosen population.
        All dataset values are lists of record dicts (empty list when no data).
    """
    # Apply optional sub-population filter, then dedup within each snapshot.
    filtered = row_filter(df) if row_filter is not None else df
    deduped = _dedup(filtered)

    is_general = row_filter is None

    block: Dict[str, Any] = {}

    if is_general:
        block["price_time_series_neighborhood"] = _price_time_series_neighborhood(
            deduped
        )
        block["price_time_series_district"] = _price_time_series_district(deduped)

    block["rent_vs_sale_ratio"] = _rent_vs_sale_ratio(deduped, min_count=min_count)
    block["rent_vs_sale_ratio_time_series"] = _rent_vs_sale_ratio_time_series(
        deduped, min_count=min_count
    )
    block["boxplot_by_neighborhood"] = _boxplot_by_neighborhood(deduped)

    return block


# ---------------------------------------------------------------------------
# Top-level entry point
# ---------------------------------------------------------------------------


def build_aggregation_json(
    silver_df: pd.DataFrame,
    min_count: int = _DEFAULT_MIN_COUNT,
) -> Dict[str, Any]:
    """
    Build the frozen schema-v1.0 aggregation JSON from a full silver DataFrame.

    This is the pure entry point called by the Lambda handler. It scopes the
    data, builds two symmetric population blocks (general and relevant), and
    assembles the top-level contract.

    Args:
        silver_df: Combined silver DataFrame of cleaned individual listings
            across the full history (all operations, all snapshot_dates).
        min_count: Minimum listing count per side for ratio datasets. Defaults
            to 5; the Lambda handler reads this from the ``RATIO_MIN_COUNT``
            environment variable.

    Returns:
        A dict matching the frozen schema v1.0. All dataset fields are lists of
        record dicts. ``generated_at`` is the current UTC time in ISO-8601.
    """
    scoped = apply_scope(silver_df)

    general_block = build_population_block(scoped, row_filter=None, min_count=min_count)
    relevant_block = build_population_block(
        scoped, row_filter=_relevant_rows, min_count=min_count
    )

    return {
        "schema_version": "1.0",
        "generated_at": utc_now_iso(),
        "scope_districts": SCOPE_DISTRICTS,
        "min_count": min_count,
        "relevant_filter": RELEVANT_FILTER_SPEC,
        "general": general_block,
        "relevant": relevant_block,
    }
