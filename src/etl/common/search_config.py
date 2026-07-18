"""
Single source of truth for the Idealista search parameters (FEATURE-011).

Both the bronze-layer collector (:class:`bronze_collector.SearchConfig`,
which builds the actual Idealista API request URL) and the gold-layer
``data_basis.search_config`` dataset (a public, read-only summary shown on
the dashboard) must describe *the same* search — one Valencia
sale/rent search centered on a fixed point, with a fixed radius, size
range, property type, elevator and preservation filters.

Keeping the values here — and nowhere else — means the collector's request
payload and the dashboard's "how we search" panel can never silently drift
apart (review M2).

This module has zero AWS/network/pandas dependencies so it can be imported
from both the collector package and the data_processing package without
pulling in unrelated collaborators.
"""

from __future__ import annotations

from typing import Any, Dict

#: Canonical Idealista search parameters. Keys are named for public/API
#: stability, not for 1:1 match with Idealista's own query-string names —
#: :class:`bronze_collector.SearchConfig` maps them onto the actual request
#: parameters, and the gold ``search_config`` dataset serializes them
#: (mostly) as-is for the dashboard.
IDEALISTA_SEARCH_PARAMS: Dict[str, Any] = {
    # Search center (Valencia city center) and radius.
    "center_lat": 39.4693441,
    "center_lon": -0.379561,
    "distance_m": 1500,
    # Listing filters.
    "property_type": "homes",
    "min_size_m2": 100,
    "max_size_m2": 160,
    "elevator": True,
    "preservation": "good",
    # Intended search filter (matches the hardcoded 'true' already carried by
    # SearchConfig.air_conditioning). NOTE: this is NOT currently sent as an
    # Idealista API query parameter — the querystring line is deliberately
    # commented out in bronze_collector.SearchConfig.build_url (operator
    # decision 2026-07-18: leave the live collection behaviour unchanged for
    # now). Shown here/on the dashboard as the documented intended filter.
    "air_conditioning": True,
    # Result paging/ordering (collector-only, but kept here to avoid a
    # second source of truth for the request shape).
    "max_items": 50,
    "order": "distance",
    "sort": "asc",
    "language": "en",
    "country": "es",
    "base_url": "https://api.idealista.com/3.5/",
    # Credential-set labels: which Secrets Manager credential set is used
    # for each operation. Public-safe (no secret values).
    "sale_credential_label": "LVW",
    "rent_credential_label": "PMV",
}

__all__ = ["IDEALISTA_SEARCH_PARAMS"]
