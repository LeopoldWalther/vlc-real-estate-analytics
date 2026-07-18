/**
 * pipelineAwsCostChartRenderer — stacked monthly bar chart of AWS cost per
 * service (FEATURE-013, task 13.10).
 *
 * Design pattern: Strategy + Factory (mirrors the other pipeline_*_chart.js
 * renderers).
 *
 * Consumes: pipeline_health.buildAwsCostSeries(document), which reduces
 * aws_cost.details.monthly_cost_by_service (schema v1.1) to a null-safe
 * {months, services, valuesByService} shape with 0-filled gaps.
 */

import { buildLayout } from '../chart_theme.js';
import { buildAwsCostSeries } from '../pipeline_health.js';

/**
 * @param {{months: string[], services: string[], valuesByService: Record<string, number[]>}} series
 * @returns {Array<object>} One stacked Plotly bar trace per service.
 */
function toTraces(series) {
  return series.services.map((service) => ({
    name: service,
    x: series.months,
    y: series.valuesByService[service],
    type: 'bar',
    meta: { service },
  }));
}

export const pipelineAwsCostChartRenderer = {
  id: 'pipeline-aws-cost-chart',
  title: 'AWS cost history',

  /**
   * @param {object|null|undefined} document - Full pipeline-health JSON document.
   * @param {{viewport?: string, colorScheme?: string}} [context]
   * @returns {{data: Array<object>, layout: object}}
   */
  render(document, context = { viewport: 'desktop', colorScheme: 'light' }) {
    const layout = buildLayout({
      viewport: context.viewport,
      colorScheme: context.colorScheme,
      overrides: {
        barmode: 'stack',
        yaxis: { title: { text: 'Cost (USD)' } },
      },
    });

    const series = buildAwsCostSeries(document);
    if (series.months.length === 0 || series.services.length === 0) {
      return { data: [], layout: { ...layout, title: { text: this.title } } };
    }

    return {
      data: toTraces(series),
      layout: { ...layout, title: { text: this.title } },
    };
  },
};
