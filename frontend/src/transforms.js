/**
 * Pure data transforms for the gold aggregations JSON (schema v1.0).
 *
 * All functions are side-effect-free: no DOM, no fetch, no global state.
 * Each function is unit-tested in isolation with Vitest.
 */

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
export function formatSeries(block) {
  if (!block || block.length === 0) {
    return [];
  }

  // Group records by (operation, neighbourhood).
  // Performance: O(1) Map lookup instead of O(n) array scan per record.
  const groups = new Map();
  for (const record of block) {
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
    mode: 'lines+markers',
    meta: {
      operation: g.operation,
      neighborhood: g.neighborhood,
      district: g.district,
    },
  }));
}
