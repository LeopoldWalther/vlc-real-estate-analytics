/**
 * pipelineApiQuotaChartRenderer — grouped monthly bar chart of Idealista API
 * requests per credential set (LVW=sale, PMV=rent), with reference lines at
 * the 80/95-request Ampel thresholds (FEATURE-013, task 13.9).
 *
 * Design pattern: Strategy + Factory (mirrors the other pipeline_*_chart.js
 * renderers).
 *
 * Consumes: pipeline_health.buildApiQuotaSeries(document), which reduces
 * api_quota.details.credential_sets (schema v1.0/v1.1 — unchanged shape) to
 * a null-safe, month-sorted shape.
 */

import { buildLayout } from '../chart_theme.js';
import { buildApiQuotaSeries } from '../pipeline_health.js';

//: Mirrors health_checks.API_QUOTA_YELLOW_THRESHOLD_REQUESTS / API_QUOTA_RED_THRESHOLD_REQUESTS.
export const API_QUOTA_YELLOW_THRESHOLD_REQUESTS = 80;
export const API_QUOTA_RED_THRESHOLD_REQUESTS = 95;

/**
 * @param {Array<{credentialSet: string, label: string, months: string[], values: number[]}>} series
 * @returns {Array<object>} One Plotly bar trace per credential set.
 */
function toTraces(series) {
  return series
    .filter((entry) => entry.months.length > 0)
    .map((entry) => ({
      name: entry.label ?? entry.credentialSet,
      x: entry.months,
      y: entry.values,
      type: 'bar',
      meta: { credentialSet: entry.credentialSet },
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

export const pipelineApiQuotaChartRenderer = {
  id: 'pipeline-api-quota-chart',
  title: 'API quota history',

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
        yaxis: { title: { text: 'Requests / month' } },
        shapes: [
          thresholdLine('#eab308', API_QUOTA_YELLOW_THRESHOLD_REQUESTS),
          thresholdLine('#dc2626', API_QUOTA_RED_THRESHOLD_REQUESTS),
        ],
      },
    });

    const series = buildApiQuotaSeries(document);
    if (series.length === 0) {
      return { data: [], layout: { ...layout, title: { text: this.title } } };
    }

    return {
      data: toTraces(series),
      layout: { ...layout, title: { text: this.title } },
    };
  },
};
