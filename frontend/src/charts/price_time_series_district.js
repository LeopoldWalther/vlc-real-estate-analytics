/**
 * PriceTimeSeriesDistrictRenderer — count-weighted mean price/m² per district
 * over time (aggregated from neighbourhood-level data by the gold layer).
 *
 * Design pattern: Strategy + Open/Closed.
 *
 * Consumes: populationBlock.price_time_series_district (schema v1.0).
 * Only present in the 'general' population block.
 */

import { formatDistrictSeries } from '../transforms.js';

/** @type {{ id: string, title: string, render: function }} */
export const priceTimeSeriesDistrictRenderer = {
  id: 'price-time-series-district',

  title: 'Price per m² over time by district (count-weighted)',

  /**
   * @param {object|null|undefined} populationBlock
   * @returns {{ data: Array, layout: object }}
   */
  render(populationBlock) {
    const records = populationBlock?.price_time_series_district ?? [];
    const traces = formatDistrictSeries(records);

    return {
      data: traces,
      layout: {
        title: { text: this.title },
        xaxis: { title: { text: 'Date' } },
        yaxis: { title: { text: 'Price per m² (€)' } },
        legend: { orientation: 'v' },
      },
    };
  },
};
