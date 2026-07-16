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
import { buildLayout } from '../chart_theme.js';

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
    /**
     * @param {object|null|undefined} populationBlock
     * @param {{viewport?: string, colorScheme?: string}} [context] - Responsive/theme
     *   context forwarded to chart_theme.buildLayout. Defaults preserve today's
     *   desktop/light behaviour for existing callers/tests.
     */
    render(populationBlock, context = { viewport: 'desktop', colorScheme: 'light' }) {
      const all = populationBlock?.boxplot_by_neighborhood ?? [];
      const records = all.filter((r) => r.operation === operation);
      const traces = formatBoxplot(records);
      const layout = buildLayout({
        viewport: context.viewport,
        colorScheme: context.colorScheme,
        overrides: {
          yaxis: { title: { text: yAxisLabel } },
          boxmode: 'group',
        },
      });
      return {
        data: traces,
        layout: { ...layout, title: { text: this.title } },
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
  render(populationBlock, context = { viewport: 'desktop', colorScheme: 'light' }) {
    const records = populationBlock?.boxplot_by_neighborhood ?? [];
    const traces = formatBoxplot(records);
    const layout = buildLayout({
      viewport: context.viewport,
      colorScheme: context.colorScheme,
      overrides: {
        yaxis: { title: { text: 'Price per m² (€)' } },
        boxmode: 'group',
      },
    });
    return {
      data: traces,
      layout: { ...layout, title: { text: this.title } },
    };
  },
};
