/**
 * pipelineExecutionDurationChartRenderer — grouped bar chart of recent
 * invocation durations per monitored Lambda function, with horizontal
 * reference lines at the 60-second (yellow) and 120-second (red) Ampel
 * thresholds (FEATURE-013, task 13.8; tightened in FEATURE-014, task 14.2).
 *
 * Design pattern: Strategy + Factory (mirrors pipeline_execution_success_chart.js).
 *
 * Consumes: pipeline_health.buildExecutionDurationSeries(document), which
 * already reduces execution_duration.details.functions[*].recent_invocations
 * (schema v1.1) to a null-safe, oldest-first shape.
 */

import { buildLayout } from '../chart_theme.js';
import { buildExecutionDurationSeries } from '../pipeline_health.js';

//: Mirrors health_checks.DURATION_YELLOW_THRESHOLD_SECONDS / DURATION_RED_THRESHOLD_SECONDS.
export const DURATION_YELLOW_THRESHOLD_SECONDS = 60;
export const DURATION_RED_THRESHOLD_SECONDS = 120;

/**
 * @param {Array<{functionName: string, points: Array<{timestamp: string, durationSeconds: number}>}>} series
 * @returns {Array<object>} One Plotly bar trace per function.
 */
function toTraces(series) {
  return series
    .filter((entry) => entry.points.length > 0)
    .map((entry) => ({
      name: entry.functionName,
      x: entry.points.map((p) => p.timestamp),
      y: entry.points.map((p) => p.durationSeconds),
      type: 'bar',
      meta: { functionName: entry.functionName },
    }));
}

/**
 * @param {string} color
 * @param {number} y
 * @returns {object} A full-width horizontal reference line Plotly shape.
 */
function thresholdLine(color, y) {
  return {
    type: 'line',
    xref: 'paper',
    x0: 0,
    x1: 1,
    yref: 'y',
    y0: y,
    y1: y,
    line: { color, width: 1.5, dash: 'dash' },
  };
}

export const pipelineExecutionDurationChartRenderer = {
  id: 'pipeline-execution-duration-chart',
  title: 'Execution duration history',

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
        barmode: 'group',
        yaxis: { title: { text: 'Duration (s)' } },
        shapes: [
          thresholdLine('#eab308', DURATION_YELLOW_THRESHOLD_SECONDS),
          thresholdLine('#dc2626', DURATION_RED_THRESHOLD_SECONDS),
        ],
      },
    });

    const series = buildExecutionDurationSeries(document);
    if (series.length === 0) {
      return { data: [], layout: { ...layout, title: { text: this.title } } };
    }

    return {
      data: toTraces(series),
      layout: { ...layout, title: { text: this.title } },
    };
  },
};
