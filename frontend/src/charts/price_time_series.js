/**
 * PriceTimeSeriesRenderer — shows mean price/m² over time per neighbourhood.
 *
 * Design pattern: Strategy + Open/Closed.
 *   The ChartRenderer contract (id, title, render) is the stable strategy
 *   interface. Adding a chart = adding a new renderer module; the Dashboard
 *   and DataSource never change.
 *
 * Consumes: populationBlock.price_time_series_neighborhood (schema v1.0).
 */

import { formatSeries } from '../transforms.js';

/**
 * ChartRenderer for the price/m² time series chart.
 *
 * @type {{ id: string, title: string, render: function(object|null): {data: Array, layout: object} }}
 */
export const priceTimeSeriesRenderer = {
  id: 'price-time-series',

  title: 'Price per m² over time by neighbourhood',

  /**
   * Build a Plotly figure from a population block.
   *
   * Returns a figure with empty data on a missing or empty block so the
   * Dashboard never crashes on absent data.
   *
   * @param {object|null|undefined} populationBlock - A 'general' or 'relevant'
   *   population block from the schema v1.0 gold JSON.
   * @returns {{ data: Array, layout: object }} A Plotly figure descriptor.
   */
  render(populationBlock) {
    const records = populationBlock?.price_time_series_neighborhood ?? [];
    const traces = formatSeries(records);

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
