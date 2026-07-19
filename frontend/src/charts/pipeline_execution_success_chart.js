/**
 * pipelineExecutionSuccessChartRenderer — one Plotly scatter/dot trace per
 * monitored Lambda function, each pinned to its own horizontal lane on the
 * y-axis, showing recent invocation success (green dot) / failure (red dot)
 * over time (FEATURE-013, task 13.7).
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
 * Builds one Plotly trace per function, each pinned to its own horizontal
 * row (lane) on the y-axis. Success/failure is conveyed purely through
 * marker color (green/red) rather than vertical position, so every
 * function's invocation history reads as a single, unambiguous line.
 *
 * @param {Array<{functionName: string, points: Array<{timestamp: string, succeeded: boolean}>}>} series
 * @returns {Array<object>} One Plotly scatter trace per function.
 */
function toTraces(series) {
  const nonEmpty = series.filter((entry) => entry.points.length > 0);
  const rowCount = nonEmpty.length;

  return nonEmpty.map((entry, index) => {
    // First function in the series renders on the top-most row: reverse the
    // index so row numbers increase from top (highest) to bottom (0).
    const row = rowCount - 1 - index;
    return {
      name: entry.functionName,
      x: entry.points.map((p) => p.timestamp),
      y: entry.points.map(() => row),
      type: 'scatter',
      mode: 'markers+lines',
      marker: {
        color: entry.points.map((p) => (p.succeeded ? SUCCESS_COLOR : FAILURE_COLOR)),
        size: 12,
      },
      line: { color: '#94a3b8', width: 1 },
      showlegend: false,
      meta: { functionName: entry.functionName, row },
    };
  });
}

/**
 * @param {Array<{functionName: string, points: Array<{timestamp: string, succeeded: boolean}>}>} series
 * @returns {{tickvals: number[], ticktext: string[], range: number[]}} y-axis
 * config placing each non-empty function on its own labeled row.
 */
function buildRowAxis(series) {
  const nonEmpty = series.filter((entry) => entry.points.length > 0);
  const rowCount = nonEmpty.length;
  const tickvals = nonEmpty.map((_, index) => rowCount - 1 - index);
  const ticktext = nonEmpty.map((entry) => entry.functionName);
  return { tickvals, ticktext, range: [-0.5, rowCount - 0.5] };
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
    const series = buildExecutionSuccessSeries(document);

    if (series.length === 0) {
      const emptyLayout = buildLayout({ viewport: context.viewport, colorScheme: context.colorScheme });
      return { data: [], layout: { ...emptyLayout, title: { text: this.title } } };
    }

    const layout = buildLayout({
      viewport: context.viewport,
      colorScheme: context.colorScheme,
      overrides: {
        yaxis: buildRowAxis(series),
      },
    });

    return {
      data: toTraces(series),
      layout: { ...layout, title: { text: this.title } },
    };
  },
};
