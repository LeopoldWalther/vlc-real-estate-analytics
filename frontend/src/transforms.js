/**
 * Pure data transforms for the gold aggregations JSON (schema v1.0).
 *
 * All functions are side-effect-free: no DOM, no fetch, no global state.
 * Each function is unit-tested in isolation with Vitest.
 */

/**
 * Choose the Plotly trace `mode` for a time-series line: plain 'lines' for
 * two-or-more points (a clean trend line, no per-point marker clutter), but
 * 'lines+markers' for a lone data point — a single point rendered with
 * mode:'lines' alone is otherwise completely invisible (no line segment
 * exists to draw), silently hiding a brand-new/sparse neighbourhood's only
 * snapshot instead of at least showing a dot for it.
 *
 * @param {number} pointCount
 * @returns {'lines'|'lines+markers'}
 */
function lineMode(pointCount) {
  return pointCount <= 1 ? 'lines+markers' : 'lines';
}

/**
 * Convert a price_time_series_neighborhood records array into one Plotly
 * scatter trace per (operation, neighbourhood) pair.
 *
 * Called by the PriceTimeSeriesRenderer with the
 * general.price_time_series_neighborhood array from the gold JSON.
 *
 * @param {Array<{
 *   operation: string,
 *   district: string,
 *   neighborhood: string,
 *   snapshot_date: string,
 *   count_listings: number,
 *   mean_priceByArea: number,
 *   mean_size: number,
 *   mean_price: number
 * }>|null|undefined} block
 *   Records from general.price_time_series_neighborhood (schema v1.0).
 *   Returns [] for empty or missing input — callers never need to guard.
 *
 * @returns {Array<object>} Plotly trace objects, one per
 *   (operation, neighbourhood) pair. Each trace has:
 *   { name, x: snapshot_dates[], y: mean_priceByArea[], type, mode, meta }.
 */
export function formatSeries(block, operation = null) {
  if (!block || block.length === 0) {
    return [];
  }

  // Optionally restrict to a single operation (rent or sale) for separate charts.
  const records = operation !== null ? block.filter((r) => r.operation === operation) : block;
  if (records.length === 0) {
    return [];
  }

  // Group records by (operation, neighbourhood).
  // Performance: O(1) Map lookup instead of O(n) array scan per record.
  const groups = new Map();
  for (const record of records) {
    const key = `${record.operation}|${record.neighborhood}`;
    if (!groups.has(key)) {
      groups.set(key, {
        operation: record.operation,
        neighborhood: record.neighborhood,
        district: record.district,
        x: [],
        y: [],
      });
    }
    const group = groups.get(key);
    group.x.push(record.snapshot_date);
    group.y.push(record.mean_priceByArea);
  }

  return Array.from(groups.values()).map((g) => ({
    name: `${g.operation} \u2013 ${g.neighborhood}`,
    x: g.x,
    y: g.y,
    type: 'scatter',
    // Plain lines (no per-point markers): with weekly snapshots over many
    // months, markers on every point made the trend look like a string of
    // thick dots rather than a clean trend line (see mobile-legend/marker
    // cleanup task). formatRentVsSaleRatio's scatter chart intentionally
    // keeps markers — that one *is* a point-per-neighbourhood plot. A
    // single-point series still gets a marker (see lineMode()) so it isn't
    // silently invisible.
    mode: lineMode(g.x.length),
    meta: {
      operation: g.operation,
      neighborhood: g.neighborhood,
      district: g.district,
    },
  }));
}

/**
 * Convert price_time_series_district records into one Plotly scatter trace
 * per (operation, district) pair.
 *
 * Uses the count-weighted district mean already computed by the gold layer.
 *
 * @param {Array<{
 *   operation: string,
 *   district: string,
 *   snapshot_date: string,
 *   count_listings: number,
 *   mean_priceByArea: number
 * }>|null|undefined} block
 * @returns {Array<object>} Plotly scatter traces.
 */
export function formatDistrictSeries(block, operation = null) {
  if (!block || block.length === 0) {
    return [];
  }

  // Optionally restrict to a single operation (rent or sale) for separate charts.
  const records = operation !== null ? block.filter((r) => r.operation === operation) : block;
  if (records.length === 0) {
    return [];
  }

  const groups = new Map();
  for (const record of records) {
    const key = `${record.operation}|${record.district}`;
    if (!groups.has(key)) {
      groups.set(key, { operation: record.operation, district: record.district, x: [], y: [] });
    }
    const g = groups.get(key);
    g.x.push(record.snapshot_date);
    g.y.push(record.mean_priceByArea);
  }

  return Array.from(groups.values()).map((g) => ({
    name: `${g.operation} \u2013 ${g.district}`,
    x: g.x,
    y: g.y,
    type: 'scatter',
    mode: lineMode(g.x.length),
    meta: { operation: g.operation, district: g.district },
  }));
}


/**
 * Convert rent_vs_sale_ratio records into one Plotly scatter trace per
 * district, plotting mean_priceByArea_sale vs mean_priceByArea_rent per
 * neighbourhood.
 *
 * @param {Array<{
 *   district: string,
 *   neighborhood: string,
 *   mean_priceByArea_sale: number,
 *   mean_priceByArea_rent: number,
 *   mean_sales_price_by_rent_ratio: number,
 *   count_listings_sale: number,
 *   count_listings_rent: number
 * }>|null|undefined} block
 * @returns {Array<object>} One Plotly scatter trace (all neighbourhoods as
 *   a single series with custom text labels).
 */
export function formatRentVsSaleRatio(block) {
  if (!block || block.length === 0) {
    return [];
  }

  return [
    {
      x: block.map((r) => r.mean_priceByArea_rent),
      y: block.map((r) => r.mean_priceByArea_sale),
      text: block.map((r) => `${r.neighborhood} (${r.district})`),
      mode: 'markers+text',
      type: 'scatter',
      textposition: 'top center',
      marker: { size: 10 },
      name: 'Neighbourhoods',
    },
  ];
}

/**
 * Convert rent_vs_sale_ratio_time_series records into one Plotly scatter
 * trace per neighbourhood (ratio over time).
 *
 * @param {Array<{
 *   district: string,
 *   neighborhood: string,
 *   snapshot_date: string,
 *   mean_sales_price_by_rent_ratio: number
 * }>|null|undefined} block
 * @returns {Array<object>} Plotly scatter traces, one per neighbourhood.
 */
export function formatRatioTimeSeries(block) {
  if (!block || block.length === 0) {
    return [];
  }

  const groups = new Map();
  for (const record of block) {
    const key = record.neighborhood;
    if (!groups.has(key)) {
      groups.set(key, { neighborhood: record.neighborhood, district: record.district, x: [], y: [] });
    }
    const g = groups.get(key);
    g.x.push(record.snapshot_date);
    g.y.push(record.mean_sales_price_by_rent_ratio);
  }

  return Array.from(groups.values()).map((g) => ({
    name: `${g.neighborhood} (${g.district})`,
    x: g.x,
    y: g.y,
    type: 'scatter',
    mode: lineMode(g.x.length),
    meta: { neighborhood: g.neighborhood, district: g.district },
  }));
}

/**
 * Convert boxplot_by_neighborhood records into Plotly box traces.
 *
 * Plotly supports pre-computed quartiles via the lowerfence/q1/median/q3/
 * upperfence fields — no raw data needed.
 *
 * @param {Array<{
 *   operation: string,
 *   district: string,
 *   neighborhood: string,
 *   count: number,
 *   min: number,
 *   q1: number,
 *   median: number,
 *   q3: number,
 *   max: number
 * }>|null|undefined} block
 * @returns {Array<object>} One Plotly box trace per (operation, neighbourhood).
 */
export function formatBoxplot(block) {
  if (!block || block.length === 0) {
    return [];
  }

  return block.map((r) => ({
    name: `${r.operation} \u2013 ${r.neighborhood}`,
    type: 'box',
    // Pre-computed 5-number summary — no raw rows needed.
    lowerfence: [r.min],
    q1: [r.q1],
    median: [r.median],
    q3: [r.q3],
    upperfence: [r.max],
    meta: { operation: r.operation, neighborhood: r.neighborhood, district: r.district },
  }));
}
