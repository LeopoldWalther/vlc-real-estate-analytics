/**
 * RatioTimeSeriesRenderer — sale/rent price ratio over time per neighbourhood.
 *
 * Design pattern: Strategy + Open/Closed.
 *
 * Consumes: populationBlock.rent_vs_sale_ratio_time_series (schema v1.0).
 */

import { formatRatioTimeSeries } from '../transforms.js';

/** @type {{ id: string, title: string, render: function }} */
export const ratioTimeSeriesRenderer = {
  id: 'rent-vs-sale-ratio-time-series',

  title: 'Sale/Rent price ratio over time by neighbourhood',

  /**
   * @param {object|null|undefined} populationBlock
   * @returns {{ data: Array, layout: object }}
   */
  render(populationBlock) {
    const records = populationBlock?.rent_vs_sale_ratio_time_series ?? [];
    const traces = formatRatioTimeSeries(records);

    return {
      data: traces,
      layout: {
        title: { text: this.title },
        xaxis: { title: { text: 'Date' } },
        yaxis: { title: { text: 'Sale/Rent ratio' } },
        legend: { orientation: 'v' },
      },
    };
  },
};
