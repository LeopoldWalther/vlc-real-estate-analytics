/**
 * PriceTimeSeriesDistrictRenderer — count-weighted mean price/m² per district
 * over time (aggregated from neighbourhood-level data by the gold layer).
 *
 * Design pattern: Strategy + Factory + Open/Closed.
 *   makeDistrictRenderer parameterises per operation so rent (€/m²/month) and
 *   sale (€/m²) are shown on separate charts with correct Y-axis labels.
 *
 * Consumes: populationBlock.price_time_series_district (schema v1.0).
 * Only present in the 'general' population block.
 */

import { formatDistrictSeries } from '../transforms.js';
import { buildLayout } from '../chart_theme.js';

/**
 * Factory that creates a district ChartRenderer filtered to one operation.
 *
 * @param {string} id - DOM container id.
 * @param {string} title - Chart title.
 * @param {string|null} operation - 'rent', 'sale', or null (both).
 * @param {string} yAxisLabel - Y-axis label text.
 * @returns {{ id: string, title: string, render: function }} ChartRenderer.
 */
function makeDistrictRenderer(id, title, operation, yAxisLabel) {
  return {
    id,
    title,
    /**
     * @param {object|null|undefined} populationBlock
     * @param {{viewport?: string, colorScheme?: string}} [context] - Responsive/theme
     *   context forwarded to chart_theme.buildLayout. Defaults preserve today's
     *   desktop/light behaviour for existing callers/tests.
     */
    render(populationBlock, context = { viewport: 'desktop', colorScheme: 'light' }) {
      const records = populationBlock?.price_time_series_district ?? [];
      const traces = formatDistrictSeries(records, operation);
      const layout = buildLayout({
        viewport: context.viewport,
        colorScheme: context.colorScheme,
        overrides: {
          xaxis: { title: { text: 'Date' } },
          yaxis: { title: { text: yAxisLabel } },
        },
      });
      return {
        data: traces,
        layout: { ...layout, title: { text: title } },
      };
    },
  };
}

/** Rent-only district chart (price per m² per month). */
export const priceTimeSeriesDistrictRentRenderer = makeDistrictRenderer(
  'price-time-series-district-rent',
  'Rent price per m² per month over time by district',
  'rent',
  'Price per m² per month (€)',
);

/** Sale-only district chart (price per m²). */
export const priceTimeSeriesDistrictSaleRenderer = makeDistrictRenderer(
  'price-time-series-district-sale',
  'Sale price per m² over time by district',
  'sale',
  'Sale price per m² (€)',
);

/**
 * Combined renderer (both operations on one axis).
 * Kept for backward compatibility with existing tests.
 */
export const priceTimeSeriesDistrictRenderer = makeDistrictRenderer(
  'price-time-series-district',
  'Price per m² over time by district (count-weighted)',
  null,
  'Price per m² (€)',
);
