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

/** @type {{ id: string, title: string, render: function }} */
export const rentVsSaleRatioRenderer = {
  id: 'rent-vs-sale-ratio',

  title: 'Rent vs Sale price per m² by neighbourhood',

  /**
   * @param {object|null|undefined} populationBlock
   * @returns {{ data: Array, layout: object }}
   */
  render(populationBlock) {
    const records = populationBlock?.rent_vs_sale_ratio ?? [];
    const traces = formatRentVsSaleRatio(records);

    return {
      data: traces,
      layout: {
        title: { text: this.title },
        xaxis: { title: { text: 'Rent price per m² per month (€)' }, automargin: true },
        yaxis: { title: { text: 'Sale price per m² (€)' }, automargin: true },
        hovermode: 'closest',
        margin: { l: 80, r: 40, t: 60, b: 80 },
      },
    };
  },
};
