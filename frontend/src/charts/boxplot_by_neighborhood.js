/**
 * BoxplotRenderer — price/m² distribution per neighbourhood as box-and-whisker
 * charts built from the pre-computed 5-number summary in the gold JSON.
 *
 * Design pattern: Strategy + Open/Closed.
 *
 * Consumes: populationBlock.boxplot_by_neighborhood (schema v1.0).
 */

import { formatBoxplot } from '../transforms.js';

/** @type {{ id: string, title: string, render: function }} */
export const boxplotRenderer = {
  id: 'boxplot-by-neighborhood',

  title: 'Price per m² distribution by neighbourhood',

  /**
   * @param {object|null|undefined} populationBlock
   * @returns {{ data: Array, layout: object }}
   */
  render(populationBlock) {
    const records = populationBlock?.boxplot_by_neighborhood ?? [];
    const traces = formatBoxplot(records);

    return {
      data: traces,
      layout: {
        title: { text: this.title },
        yaxis: { title: { text: 'Price per m² (€)' } },
        boxmode: 'group',
      },
    };
  },
};
