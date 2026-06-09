/**
 * BoxplotRentRenderer / BoxplotSaleRenderer — price/m² distribution per
 * neighbourhood as box-and-whisker charts, split by operation.
 *
 * Rent (€/m²/month ~10–25) and sale (€/m² ~2000–6000) differ by ~200×, so
 * mixing them on one Y-axis makes rent appear flat at zero. Each operation
 * gets its own renderer with a dedicated Y-axis label.
 *
 * Design pattern: Strategy + Open/Closed (factory keeps DRY).
 *
 * Consumes: populationBlock.boxplot_by_neighborhood (schema v1.0).
 */

import { formatBoxplot } from '../transforms.js';

/**
 * Factory for a boxplot renderer restricted to one operation.
 *
 * @param {string} id - DOM container id.
 * @param {string} title - Chart title shown above the plot.
 * @param {'rent'|'sale'} operation - Operation to include ('rent' or 'sale').
 * @param {string} yAxisLabel - Y-axis label text.
 * @returns {{ id: string, title: string, render: function }}
 */
function makeBoxplotRenderer(id, title, operation, yAxisLabel) {
  return {
    id,
    title,
    /** @param {object|null|undefined} populationBlock */
    render(populationBlock) {
      const all = populationBlock?.boxplot_by_neighborhood ?? [];
      const records = all.filter((r) => r.operation === operation);
      const traces = formatBoxplot(records);
      return {
        data: traces,
        layout: {
          title: { text: this.title },
          yaxis: { title: { text: yAxisLabel }, automargin: true },
          xaxis: { automargin: true },
          boxmode: 'group',
          margin: { l: 80, r: 40, t: 60, b: 60 },
        },
      };
    },
  };
}

export const boxplotRentRenderer = makeBoxplotRenderer(
  'boxplot-by-neighborhood-rent',
  'Rent price per m² distribution by neighbourhood',
  'rent',
  'Rent price per m² per month (€)',
);

export const boxplotSaleRenderer = makeBoxplotRenderer(
  'boxplot-by-neighborhood-sale',
  'Sale price per m² distribution by neighbourhood',
  'sale',
  'Sale price per m² (€)',
);

/** @deprecated kept for test backwards-compat */
export const boxplotRenderer = {
  id: 'boxplot-by-neighborhood',
  title: 'Price per m² distribution by neighbourhood',
  render(populationBlock) {
    const records = populationBlock?.boxplot_by_neighborhood ?? [];
    const traces = formatBoxplot(records);
    return {
      data: traces,
      layout: {
        title: { text: this.title },
        yaxis: { title: { text: 'Price per m² (€)' }, automargin: true },
        xaxis: { automargin: true },
        boxmode: 'group',
        margin: { l: 80, r: 40, t: 60, b: 60 },
      },
    };
  },
};
