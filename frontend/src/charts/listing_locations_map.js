/**
 * listingLocationsMapRenderer — real street-map view of individually
 * collected listings, colored by neighborhood, with the Idealista search
 * radius drawn on top of free OpenStreetMap raster tiles.
 *
 * Uses Plotly's `scattermap` trace type (MapLibre-based, no Mapbox access
 * token required when `layout.map.style` is set to the built-in
 * `'open-street-map'` raster style). This DOES perform external network
 * requests to OpenStreetMap's public tile servers to fetch the basemap
 * imagery — an explicit, operator-approved exception (2026-07-18) to the
 * "zero external network calls" principle used by every other chart in
 * this dashboard, made specifically so this map looks like a real street
 * map (see FEATURE-011 follow-up) rather than a bare coordinate scatter.
 *
 * Consumes: data_basis.listing_locations_last_3m + data_basis.search_config
 * (schema v1.0, FEATURE-011 follow-up). Coordinates here are raw/unrounded
 * per-listing points — see documentation/DATA_GOLD_LAYER.md "Per-Listing
 * Locations" for the (operator-approved) privacy trade-off.
 *
 * Design pattern: Strategy (single renderer; consistent with the sibling
 * privacy-safe grid renderer, listing_location_grid_map.js, which remains
 * available/unused as a fallback pattern).
 */

import { buildLayout } from '../chart_theme.js';

/**
 * Build a circle polygon (as lon/lat point arrays) approximating the search
 * radius, for rendering as a filled `scattermap` trace with `fill: 'toself'`
 * since map subplots do not support `layout.shapes`.
 *
 * @param {{center_lat: number, center_lon: number, distance_m: number}} searchConfig
 * @param {number} [numPoints=72] - Number of points used to approximate the circle.
 * @returns {{lon: number[], lat: number[]}}
 */
function buildRadiusRing(searchConfig, numPoints = 72) {
  const { center_lat: centerLat, center_lon: centerLon, distance_m: distanceM } = searchConfig;
  const metersPerDegreeLatitude = 111_320;
  const metersPerDegreeLongitude = metersPerDegreeLatitude * Math.cos((centerLat * Math.PI) / 180);
  const radiusLatDeg = distanceM / metersPerDegreeLatitude;
  const radiusLonDeg = distanceM / metersPerDegreeLongitude;

  const lon = [];
  const lat = [];
  for (let i = 0; i <= numPoints; i += 1) {
    const angle = (i / numPoints) * 2 * Math.PI;
    lon.push(centerLon + radiusLonDeg * Math.cos(angle));
    lat.push(centerLat + radiusLatDeg * Math.sin(angle));
  }
  return { lon, lat };
}

/**
 * Group listing_locations_last_3m rows by neighborhood into `scattermap`
 * traces, one marker per listing.
 *
 * @param {Array<{operation: string, district: string, neighborhood: string, latitude: number, longitude: number}>} rows
 * @returns {Array<object>}
 */
function toTraces(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.neighborhood)) {
      groups.set(row.neighborhood, []);
    }
    groups.get(row.neighborhood).push(row);
  }

  return Array.from(groups.entries()).map(([neighborhood, records]) => ({
    name: neighborhood,
    type: 'scattermap',
    mode: 'markers',
    lon: records.map((r) => r.longitude),
    lat: records.map((r) => r.latitude),
    text: records.map((r) => `${r.neighborhood} (${r.operation})`),
    marker: { size: 5 },
  }));
}

export const listingLocationsMapRenderer = {
  id: 'listing-locations-map',
  title: 'Collected listing locations',

  /**
   * @param {object|null|undefined} dataBasis - The `data_basis` top-level block.
   * @param {{viewport?: string, colorScheme?: string}} [context]
   * @returns {{data: Array<object>, layout: object}}
   */
  render(dataBasis, context = { viewport: 'desktop', colorScheme: 'light' }) {
    const rows = dataBasis?.listing_locations_last_3m ?? [];
    const searchConfig = dataBasis?.search_config?.[0];

    const center = searchConfig
      ? { lon: searchConfig.center_lon, lat: searchConfig.center_lat }
      : { lon: -0.379561, lat: 39.4693441 };

    const layoutOverrides = {
      map: {
        style: 'open-street-map',
        center,
        // Slightly zoomed out from the 1500 m search radius so surrounding
        // districts/streets remain visible for context (matches reference
        // design — the radius circle should not fill the entire viewport).
        zoom: 12.3,
      },
    };

    const layout = buildLayout({
      viewport: context.viewport,
      colorScheme: context.colorScheme,
      overrides: layoutOverrides,
    });
    // Map subplots render their own basemap; a cartesian xaxis/yaxis grid
    // makes no sense here and can visually clash with the map canvas.
    delete layout.xaxis;
    delete layout.yaxis;

    if (rows.length === 0) {
      return { data: [], layout: { ...layout, title: { text: this.title } } };
    }

    const data = toTraces(rows);
    if (searchConfig) {
      const ring = buildRadiusRing(searchConfig);
      data.push({
        name: 'Search radius',
        type: 'scattermap',
        mode: 'lines',
        lon: ring.lon,
        lat: ring.lat,
        fill: 'toself',
        fillcolor: 'rgba(37, 99, 235, 0.08)',
        line: { color: 'rgba(37, 99, 235, 0.6)', width: 2 },
        hoverinfo: 'skip',
        showlegend: false,
      });
    }

    return {
      data,
      layout: { ...layout, title: { text: this.title } },
    };
  },
};
