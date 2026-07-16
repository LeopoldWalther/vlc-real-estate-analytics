/**
 * RentVsSaleRatioRenderer — scatter of sale price/m² vs rent price/m²
 * per neighbourhood, for one population block.
 *
 * Design pattern: Strategy + Open/Closed.
 *   New renderer module; dashboard.js and data_source.js are untouched.
 *
 * Consumes: populationBlock.rent_vs_sale_ratio (schema v1.0).
 */

import { formatRentVsSaleRatio } from '../transforms.js';
import { buildLayout } from '../chart_theme.js';

/** @type {{ id: string, title: string, render: function }} */
export const rentVsSaleRatioRenderer = {
  id: 'rent-vs-sale-ratio',

  title: 'Rent vs Sale price per m² by neighbourhood',

  /**
   * @param {object|null|undefined} populationBlock
   * @param {{viewport?: string, colorScheme?: string}} [context] - Responsive/theme
   *   context forwarded to chart_theme.buildLayout. Defaults preserve today's
   *   desktop/light behaviour for existing callers/tests.
   * @returns {{ data: Array, layout: object }}
   */
  render(populationBlock, context = { viewport: 'desktop', colorScheme: 'light' }) {
    const records = populationBlock?.rent_vs_sale_ratio ?? [];
    const traces = formatRentVsSaleRatio(records);

    const layout = buildLayout({
      viewport: context.viewport,
      colorScheme: context.colorScheme,
      overrides: {
        xaxis: { title: { text: 'Rent price per m² per month (€)' } },
        yaxis: { title: { text: 'Sale price per m² (€)' } },
        hovermode: 'closest',
      },
    });

    return {
      data: traces,
      layout: { ...layout, title: { text: this.title } },
    };
  },
};
