/**
 * summary.js — KPI aggregation over a single gold-data population block
 * (e.g. `data.general` or `data.relevant`), plus a display-formatting helper.
 *
 * Every summaryStats() field is null-able: missing or empty source arrays
 * never throw, they simply produce a null value for that field so callers
 * (app.js) can render a placeholder instead of crashing the dashboard.
 */

/**
 * Compute a count-weighted median from an array of { median, count } groups.
 *
 * This is NOT a mean-of-medians: each group's median value is weighted by
 * its listing count, so a large neighbourhood's median dominates a small
 * neighbourhood's median proportionally to sample size.
 *
 * @param {Array<{median: number, count: number}>} groups
 * @returns {number|null}
 */
function countWeightedMedian(groups) {
  const usable = groups.filter(
    (g) => typeof g.median === 'number' && typeof g.count === 'number' && g.count > 0,
  );
  if (usable.length === 0) return null;

  const sorted = [...usable].sort((a, b) => a.median - b.median);
  const totalWeight = sorted.reduce((sum, g) => sum + g.count, 0);
  const halfWeight = totalWeight / 2;

  let cumulative = 0;
  for (const group of sorted) {
    cumulative += group.count;
    if (cumulative >= halfWeight) {
      return group.median;
    }
  }
  return sorted[sorted.length - 1].median;
}

/**
 * Derive the implied gross yield % from a set of rent_vs_sale_ratio groups.
 *
 * Formula: annual rent / sale price, expressed as a percentage.
 * Since mean_sales_price_by_rent_ratio = sale_price / monthly_rent,
 * annual rent / sale price = 12 / ratio, so yield% = (12 / ratio) * 100.
 * Groups are weighted by their combined listing count.
 *
 * @param {Array<object>} groups
 * @returns {number|null}
 */
function impliedGrossYieldPercent(groups) {
  const usable = groups.filter((g) => typeof g.mean_sales_price_by_rent_ratio === 'number' && g.mean_sales_price_by_rent_ratio > 0);
  if (usable.length === 0) return null;

  let totalWeight = 0;
  let weightedRatioSum = 0;
  for (const g of usable) {
    const weight = (g.count_listings_sale ?? 0) + (g.count_listings_rent ?? 0) || 1;
    totalWeight += weight;
    weightedRatioSum += g.mean_sales_price_by_rent_ratio * weight;
  }
  const avgRatio = weightedRatioSum / totalWeight;
  return (12 / avgRatio) * 100;
}

/**
 * Sum total listing counts (sale + rent) across rent_vs_sale_ratio groups.
 *
 * @param {Array<object>} groups
 * @returns {number|null}
 */
function totalListingCount(groups) {
  if (groups.length === 0) return null;
  return groups.reduce(
    (sum, g) => sum + (g.count_listings_sale ?? 0) + (g.count_listings_rent ?? 0),
    0,
  );
}

/**
 * Compute headline KPI statistics for a single population block.
 *
 * @param {object|null|undefined} data - A population block (e.g. data.general),
 *   expected to optionally carry boxplot_by_neighborhood_last_3m (preferred),
 *   boxplot_by_neighborhood (fallback), rent_vs_sale_ratio, and generated_at.
 * @returns {{
 *   medianRentEurPerM2Month: number|null,
 *   medianSaleEurPerM2: number|null,
 *   impliedGrossYieldPercent: number|null,
 *   totalListingCount: number|null,
 *   lastUpdated: string|null,
 * }}
 */
export function summaryStats(data) {
  // Prefer the rolling 3-month boxplot for the median KPI tiles, falling
  // back to the all-time field when the rolling field is absent or empty
  // (review finding H1) — e.g. during a rollout window where the frontend
  // has deployed before the gold JSON has been refreshed with the new
  // field. The all-time box-and-whisker chart keeps consuming
  // boxplot_by_neighborhood directly via its own renderer, decoupled from
  // this KPI input selection.
  const last3mBoxplot = data?.boxplot_by_neighborhood_last_3m;
  const boxplot =
    last3mBoxplot && last3mBoxplot.length > 0 ? last3mBoxplot : data?.boxplot_by_neighborhood ?? [];
  const ratioGroups = data?.rent_vs_sale_ratio ?? [];

  const rentGroups = boxplot.filter((g) => g.operation === 'rent');
  const saleGroups = boxplot.filter((g) => g.operation === 'sale');

  return {
    medianRentEurPerM2Month: countWeightedMedian(rentGroups),
    medianSaleEurPerM2: countWeightedMedian(saleGroups),
    impliedGrossYieldPercent: impliedGrossYieldPercent(ratioGroups),
    totalListingCount: totalListingCount(ratioGroups),
    lastUpdated: data?.generated_at ?? null,
  };
}

const KPI_PLACEHOLDER = '—';

/**
 * Format a KPI value for display, matching the given kind.
 *
 * @param {number|string|null|undefined} value
 * @param {'eur_per_m2_month'|'eur_per_m2'|'percent'|'count'|'date'} kind
 * @returns {string}
 */
export function formatKpi(value, kind) {
  if (value === null || value === undefined) return KPI_PLACEHOLDER;

  switch (kind) {
    case 'eur_per_m2_month':
      return `${Number(value).toFixed(2)} €/m²/mo`;
    case 'eur_per_m2':
      return `${Number(value).toLocaleString('en-US')} €/m²`;
    case 'percent':
      return `${Number(value).toFixed(2)}%`;
    case 'count':
      return Number(value).toLocaleString('en-US');
    case 'date':
      return String(value).slice(0, 10);
    default:
      return String(value);
  }
}
