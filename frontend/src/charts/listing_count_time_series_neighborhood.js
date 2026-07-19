/**
 * listingCountTimeSeriesNeighborhoodRenderer — number of listings observed
 * per snapshot, over time, grouped by neighbourhood (FEATURE-014, task 14.5).
 *
 * Design pattern: Strategy + Factory (mirrors price_time_series_district.js).
 *
 * Consumes: populationBlock.price_time_series_neighborhood (schema v1.0) —
 * the same gold block the price-over-time neighbourhood chart already
 * reads; only the plotted y value differs (count_listings instead of
 * mean_priceByArea), via formatNeighborhoodCountSeries.
 */

import { formatNeighborhoodCountSeries } from '../transforms.js';
import { buildLayout } from '../chart_theme.js';

export const listingCountTimeSeriesNeighborhoodRenderer = {
  id: 'listing-count-time-series-neighborhood',
  title: 'Listing count over time by neighbourhood',

  /**
   * @param {object|null|undefined} populationBlock
   * @param {{viewport?: string, colorScheme?: string}} [context] - Responsive/theme
   *   context forwarded to chart_theme.buildLayout. Defaults preserve today's
   *   desktop/light behaviour for existing callers/tests.
   * @returns {{data: Array<object>, layout: object}}
   */
  render(populationBlock, context = { viewport: 'desktop', colorScheme: 'light' }) {
    const records = populationBlock?.price_time_series_neighborhood ?? [];
    const traces = formatNeighborhoodCountSeries(records);
    const layout = buildLayout({
      viewport: context.viewport,
      colorScheme: context.colorScheme,
      overrides: {
        xaxis: { title: { text: 'Date' } },
        yaxis: { title: { text: 'Listing count' } },
      },
    });
    return {
      data: traces,
      layout: { ...layout, title: { text: this.title } },
    };
  },
};
