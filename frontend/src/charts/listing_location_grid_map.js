/**
 * listingLocationGridMapRenderer — privacy-safe geo distribution of
 * recently-collected listings, coloured by district, with the Idealista
 * search radius drawn as a native Plotly shape overlay.
 *
 * ZERO external network calls: this renders a plain Plotly `scatter` trace
 * using `latitude`/`longitude` as ordinary `y`/`x` numeric coordinates — no
 * basemap, no tile layer, no Mapbox access token, no CDN reference of any
 * kind. Only the vendored `frontend/vendor/plotly.min.js` (same pattern as
 * every other chart renderer, see boxplot_by_neighborhood.js) is used. This
 * is an aggregated *coordinate distribution*, not a street map — copy
 * describing it to users lives in search_config.js/i18n.js (task 11.9), not
 * here.
 *
 * The 1500 m search radius is drawn via `layout.shapes` as a circle centred
 * on `data_basis.search_config[0]` (`center_lat`/`center_lon`), corrected
 * for the fact that 1° longitude != 1° latitude in metres at Valencia's
 * latitude.
 *
 * Design pattern: Strategy (single renderer; no factory needed — there is
 * only one geo map, unlike the rent/sale-split renderers elsewhere).
 * Consumes: data_basis.listing_location_grid_last_3m + data_basis.search_config
 * (schema v1.0, FEATURE-011).
 */

import { buildLayout } from '../chart_theme.js';

const METERS_PER_DEGREE_LATITUDE = 111_320;

/**
 * Group listing_location_grid_last_3m rows by district into Plotly scatter
 * traces, using marker size to encode count_listings (with a floor so a
 * count of 1 is still visible) and hover text spelling out the count.
 *
 * @param {Array<{operation: string, district: string, neighborhood: string, latitude: number, longitude: number, count_listings: number}>} rows
 * @returns {Array<object>}
 */
function toTraces(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.district)) {
      groups.set(row.district, []);
    }
    groups.get(row.district).push(row);
  }

  return Array.from(groups.entries()).map(([district, records]) => ({
    name: district,
    x: records.map((r) => r.longitude),
    y: records.map((r) => r.latitude),
    text: records.map(
      (r) => `${r.neighborhood} (${r.operation}): ${r.count_listings} listing(s)`,
    ),
    type: 'scatter',
    mode: 'markers',
    marker: {
      // Minimum size of 6px keeps a lone-listing cell visible; scaling
      // factor of 4px/listing keeps a busy cell readable without dominating
      // the plot.
      size: records.map((r) => 6 + r.count_listings * 4),
    },
    meta: { district },
  }));
}

/**
 * Build a `layout.shapes` circle (as an SVG-path-free ellipse `type: 'circle'`
 * shape, in data coordinates) centred on the search-config centre point,
 * aspect-corrected for latitude.
 *
 * @param {{center_lat: number, center_lon: number, distance_m: number}} searchConfig
 * @returns {object} A single Plotly shape descriptor.
 */
function buildRadiusShape(searchConfig) {
  const { center_lat: centerLat, center_lon: centerLon, distance_m: distanceM } = searchConfig;
  const radiusLatDeg = distanceM / METERS_PER_DEGREE_LATITUDE;
  const metersPerDegreeLongitude = METERS_PER_DEGREE_LATITUDE * Math.cos((centerLat * Math.PI) / 180);
  const radiusLonDeg = distanceM / metersPerDegreeLongitude;

  return {
    type: 'circle',
    xref: 'x',
    yref: 'y',
    x0: centerLon - radiusLonDeg,
    x1: centerLon + radiusLonDeg,
    y0: centerLat - radiusLatDeg,
    y1: centerLat + radiusLatDeg,
    line: { dash: 'dot' },
    fillcolor: 'rgba(37, 99, 235, 0.08)',
  };
}

export const listingLocationGridMapRenderer = {
  id: 'listing-location-grid-map',
  title: 'Collected listing locations (aggregated, privacy-safe)',

  /**
   * @param {object|null|undefined} dataBasis - The `data_basis` top-level block.
   * @param {{viewport?: string, colorScheme?: string}} [context]
   * @returns {{data: Array<object>, layout: object}}
   */
  render(dataBasis, context = { viewport: 'desktop', colorScheme: 'light' }) {
    const rows = dataBasis?.listing_location_grid_last_3m ?? [];
    const searchConfig = dataBasis?.search_config?.[0];

    const layoutOverrides = {
      xaxis: { title: { text: 'Longitude' } },
      yaxis: {
        title: { text: 'Latitude' },
        // Preserve true aspect ratio: at this latitude 1 deg longitude spans
        // fewer metres than 1 deg latitude, so without this the radius
        // circle would render as an ellipse.
        scaleanchor: 'x',
        scaleratio: 1,
      },
      shapes: searchConfig ? [buildRadiusShape(searchConfig)] : [],
    };

    const layout = buildLayout({
      viewport: context.viewport,
      colorScheme: context.colorScheme,
      overrides: layoutOverrides,
    });

    if (rows.length === 0) {
      return { data: [], layout: { ...layout, title: { text: this.title } } };
    }

    return {
      data: toTraces(rows),
      layout: { ...layout, title: { text: this.title } },
    };
  },
};
