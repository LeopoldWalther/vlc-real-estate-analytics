/**
 * PriceTimeSeriesRenderer — shows mean price/m² over time per neighbourhood.
 *
 * Design pattern: Strategy + Factory + Open/Closed.
 *   makeTimeSeriesRenderer is the factory that parameterises the ChartRenderer
 *   contract (id, title, render). Rent and sale are separated into independent
 *   charts to avoid a 300× Y-axis mismatch (€/m²/month vs €/m²).
 *
 * Consumes: populationBlock.price_time_series_neighborhood (schema v1.0).
 */

import { formatSeries } from '../transforms.js';

/**
 * Factory that creates a ChartRenderer for neighbourhood price over time,
 * filtered to a single operation.
 *
 * @param {string} id - DOM container id.
 * @param {string} title - Chart title displayed to the user.
 * @param {string|null} operation - 'rent', 'sale', or null (both operations).
 * @param {string} yAxisLabel - Y-axis label text.
 * @returns {{ id: string, title: string, render: function }} ChartRenderer.
 */
function makeTimeSeriesRenderer(id, title, operation, yAxisLabel) {
  return {
    id,
    title,
    render(populationBlock) {
      const records = populationBlock?.price_time_series_neighborhood ?? [];
      const traces = formatSeries(records, operation);
      return {
        data: traces,
        layout: {
          title: { text: title },
          xaxis: { title: { text: 'Date' } },
          yaxis: { title: { text: yAxisLabel } },
          legend: { orientation: 'v' },
        },
      };
    },
  };
}

/** Rent-only chart (price per m² per month). */
export const priceTimeSeriesRentRenderer = makeTimeSeriesRenderer(
  'price-time-series-rent',
  'Rent price per m² per month over time by neighbourhood',
  'rent',
  'Price per m² per month (€)',
);

/** Sale-only chart (price per m²). */
export const priceTimeSeriesSaleRenderer = makeTimeSeriesRenderer(
  'price-time-series-sale',
  'Sale price per m² over time by neighbourhood',
  'sale',
  'Sale price per m² (€)',
);

/**
 * Combined renderer (both operations on one axis).
 * Kept for backward compatibility with existing tests.
 */
export const priceTimeSeriesRenderer = makeTimeSeriesRenderer(
  'price-time-series',
  'Price per m² over time by neighbourhood',
  null,
  'Price per m² (€)',
);
