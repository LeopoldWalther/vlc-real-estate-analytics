/**
 * pipelineExecutionSuccessChartRenderer — one Plotly scatter/dot trace per
 * monitored Lambda function, showing recent invocation success/failure over
 * time (FEATURE-013, task 13.7).
 *
 * Design pattern: Strategy + Factory (mirrors weekly_listing_volume.js),
 * applied to the pipeline-health document's execution_success block instead
 * of a data_basis/general/relevant population block.
 *
 * Consumes: pipeline_health.buildExecutionSuccessSeries(document), which
 * already reduces execution_success.details.functions[*].recent_invocations
 * (schema v1.1) to a null-safe, oldest-first shape.
 */

import { buildLayout } from '../chart_theme.js';
import { buildExecutionSuccessSeries } from '../pipeline_health.js';

const SUCCESS_COLOR = '#16a34a';
const FAILURE_COLOR = '#dc2626';

/**
 * @param {Array<{functionName: string, points: Array<{timestamp: string, succeeded: boolean}>}>} series
 * @returns {Array<object>} One Plotly scatter trace per function.
 */
function toTraces(series) {
  return series
    .filter((entry) => entry.points.length > 0)
    .map((entry) => ({
      name: entry.functionName,
      x: entry.points.map((p) => p.timestamp),
      y: entry.points.map((p) => (p.succeeded ? 1 : 0)),
      type: 'scatter',
      mode: 'markers+lines',
      marker: {
        color: entry.points.map((p) => (p.succeeded ? SUCCESS_COLOR : FAILURE_COLOR)),
        size: 10,
      },
      line: { color: '#94a3b8', width: 1 },
      meta: { functionName: entry.functionName },
    }));
}

export const pipelineExecutionSuccessChartRenderer = {
  id: 'pipeline-execution-success-chart',
  title: 'Execution success history',

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
        yaxis: {
          tickvals: [0, 1],
          ticktext: ['Failed', 'Succeeded'],
          range: [-0.2, 1.2],
        },
      },
    });

    const series = buildExecutionSuccessSeries(document);
    if (series.length === 0) {
      return { data: [], layout: { ...layout, title: { text: this.title } } };
    }

    return {
      data: toTraces(series),
      layout: { ...layout, title: { text: this.title } },
    };
  },
};
