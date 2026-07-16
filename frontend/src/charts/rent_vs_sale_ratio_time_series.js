/**
 * RatioTimeSeriesRenderer — sale/rent price ratio over time per neighbourhood.
 *
 * Design pattern: Strategy + Open/Closed.
 *
 * Consumes: populationBlock.rent_vs_sale_ratio_time_series (schema v1.0).
 */

import { formatRatioTimeSeries } from '../transforms.js';
import { buildLayout } from '../chart_theme.js';

/** @type {{ id: string, title: string, render: function }} */
export const ratioTimeSeriesRenderer = {
  id: 'rent-vs-sale-ratio-time-series',

  title: 'Sale/Rent price ratio over time by neighbourhood',

  /**
   * @param {object|null|undefined} populationBlock
   * @param {{viewport?: string, colorScheme?: string}} [context] - Responsive/theme
   *   context forwarded to chart_theme.buildLayout. Defaults preserve today's
   *   desktop/light behaviour for existing callers/tests.
   * @returns {{ data: Array, layout: object }}
   */
  render(populationBlock, context = { viewport: 'desktop', colorScheme: 'light' }) {
    const records = populationBlock?.rent_vs_sale_ratio_time_series ?? [];
    const traces = formatRatioTimeSeries(records);

    const layout = buildLayout({
      viewport: context.viewport,
      colorScheme: context.colorScheme,
      overrides: {
        xaxis: { title: { text: 'Date' } },
        yaxis: { title: { text: 'Sale/Rent ratio' } },
      },
    });

    return {
      data: traces,
      layout: { ...layout, title: { text: this.title } },
    };
  },
};
