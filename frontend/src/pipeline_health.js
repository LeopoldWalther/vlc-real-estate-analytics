/**
 * pipeline_health.js — pure formatting helpers for the Pipeline Health tab
 * (FEATURE-012, task 12.11).
 *
 * Mirrors summary.js/search_config.js: no DOM, no fetch, no Plotly — this
 * module only turns the pipeline-health JSON document (see
 * pipeline_health_aggregator.PipelineHealthAggregator.build_document /
 * health_checks.HealthCheckResult.to_dict) into localized display strings.
 * app.js owns writing them into the DOM.
 */

import { t } from './i18n.js';

/**
 * The 4 named sub-light checks written by PipelineHealthAggregator, in the
 * order they should be displayed.
 */
export const CHECK_IDS = ['execution_success', 'execution_duration', 'api_quota', 'aws_cost'];

const CHECK_LABEL_KEYS = {
  execution_success: 'pipelineHealth.check.executionSuccess',
  execution_duration: 'pipelineHealth.check.executionDuration',
  api_quota: 'pipelineHealth.check.apiQuota',
  aws_cost: 'pipelineHealth.check.awsCost',
};

const STATUS_LABEL_KEYS = {
  green: 'pipelineHealth.status.green',
  yellow: 'pipelineHealth.status.yellow',
  red: 'pipelineHealth.status.red',
};

/**
 * Localize a traffic-light status.
 *
 * @param {string} status - One of 'green'/'yellow'/'red' (health_checks.HealthStatus).
 * @param {string} locale
 * @returns {string} Localized label, falling back to the raw status string
 *   for an unrecognised/missing value rather than throwing.
 */
export function statusLabel(status, locale) {
  const key = STATUS_LABEL_KEYS[status];
  return key ? t(locale, key) : String(status ?? '');
}

/**
 * Localize a sub-light check's display name.
 *
 * @param {string} checkId - One of CHECK_IDS.
 * @param {string} locale
 * @returns {string} Localized human-readable check name, falling back to
 *   the raw id for an unrecognised value.
 */
export function checkLabel(checkId, locale) {
  const key = CHECK_LABEL_KEYS[checkId];
  return key ? t(locale, key) : String(checkId);
}

/**
 * Build the overall-status badge label.
 *
 * @param {string} status - Overall traffic-light status (document.overall_status).
 * @param {string} locale
 * @returns {string} e.g. 'Overall status: Green'.
 */
export function overallBadgeLabel(status, locale) {
  return t(locale, 'pipelineHealth.overallLabel', { status: statusLabel(status, locale) });
}

/**
 * Build the one-line display details for a single sub-light row.
 *
 * @param {string} checkId - One of CHECK_IDS.
 * @param {{status: string, summary: string}|null|undefined} check - The
 *   named check's result object (HealthCheckResult.to_dict() shape), or
 *   null/undefined if missing from the document (never throws).
 * @param {string} locale
 * @returns {{id: string, label: string, statusLabel: string, summary: string}}
 */
export function subLightDetails(checkId, check, locale) {
  return {
    id: checkId,
    label: checkLabel(checkId, locale),
    statusLabel: statusLabel(check?.status, locale),
    summary: check?.summary ?? '',
  };
}

/**
 * Build display rows for all 4 sub-lights from a full pipeline-health
 * document, in CHECK_IDS order. Never throws — a missing/null document (or
 * one missing individual checks) simply produces empty-summary rows so
 * app.js can render a safe placeholder instead of crashing.
 *
 * @param {object|null|undefined} document - Parsed pipeline-health JSON
 *   (schema_version '1.0'), or null/undefined when unavailable.
 * @param {string} locale
 * @returns {Array<{id: string, label: string, statusLabel: string, summary: string}>}
 */
export function buildSubLightRows(document, locale) {
  return CHECK_IDS.map((id) => subLightDetails(id, document?.[id], locale));
}

/**
 * @param {string} locale
 * @returns {string} Neutral message shown when the health JSON hasn't been
 *   published yet or failed to load.
 */
export function unavailableMessage(locale) {
  return t(locale, 'pipelineHealth.notAvailable');
}

// ---------------------------------------------------------------------------
// FEATURE-013 (task 13.6) — pure chart-data/threshold helpers for the detail
// views (charts + Medallion diagram). No DOM, no Plotly — chart renderer
// modules (src/charts/pipeline_*.js) turn these plain shapes into Plotly
// figures; pipeline_health_diagram.js consumes the raw document directly.
// ---------------------------------------------------------------------------

const THRESHOLD_KEYS = {
  execution_success: 'pipelineHealth.threshold.executionSuccess',
  execution_duration: 'pipelineHealth.threshold.executionDuration',
  api_quota: 'pipelineHealth.threshold.apiQuota',
  aws_cost: 'pipelineHealth.threshold.awsCost',
};

/**
 * Localized, human-readable Ampel threshold caption for one of CHECK_IDS.
 *
 * @param {string} checkId - One of CHECK_IDS.
 * @param {string} locale
 * @returns {string} Localized threshold text, or '' for an unrecognised id
 *   (never throws).
 */
export function thresholdRuleText(checkId, locale) {
  const key = THRESHOLD_KEYS[checkId];
  return key ? t(locale, key) : '';
}

/**
 * Build one oldest-first invocation series per monitored function from
 * execution_success.details.functions[*].recent_invocations (schema v1.1).
 *
 * @param {object|null|undefined} document - Full pipeline-health document.
 * @returns {Array<{functionName: string, points: Array<{timestamp: string, succeeded: boolean, durationSeconds: number}>}>}
 *   Empty array for a null/undefined/v1.0 document or one missing the
 *   execution_success block entirely (never throws).
 */
export function buildExecutionSuccessSeries(document) {
  return _buildInvocationSeries(document?.execution_success);
}

/**
 * Build one oldest-first duration series per monitored function from
 * execution_duration.details.functions[*].recent_invocations (schema v1.1).
 *
 * @param {object|null|undefined} document - Full pipeline-health document.
 * @returns {Array<{functionName: string, points: Array<{timestamp: string, succeeded: boolean, durationSeconds: number}>}>}
 */
export function buildExecutionDurationSeries(document) {
  return _buildInvocationSeries(document?.execution_duration);
}

/**
 * Shared implementation for buildExecutionSuccessSeries/buildExecutionDurationSeries
 * — both read the same `{functions: {name: {recent_invocations}}}` shape.
 *
 * @param {object|null|undefined} check - execution_success or execution_duration block.
 * @returns {Array<{functionName: string, points: Array<object>}>}
 */
function _buildInvocationSeries(check) {
  const functions = check?.details?.functions;
  if (!functions || typeof functions !== 'object') return [];

  return Object.entries(functions).map(([functionName, detail]) => {
    const recentInvocations = Array.isArray(detail?.recent_invocations)
      ? detail.recent_invocations
      : [];
    // Backend returns newest-first; charts read left-to-right chronologically.
    const oldestFirst = [...recentInvocations].reverse();
    return {
      functionName,
      points: oldestFirst.map((entry) => ({
        timestamp: entry.timestamp,
        succeeded: Boolean(entry.succeeded),
        durationSeconds: entry.duration_seconds,
      })),
    };
  });
}

/**
 * Build one series per credential set from
 * api_quota.details.credential_sets (schema v1.0/v1.1 — unchanged shape).
 *
 * @param {object|null|undefined} document - Full pipeline-health document.
 * @returns {Array<{credentialSet: string, label: string, quota: number, months: string[], values: number[]}>}
 *   Empty array for a null/undefined document or one missing the api_quota
 *   block (never throws). `months` is sorted ascending ('YYYY-MM' strings
 *   sort correctly lexicographically).
 */
export function buildApiQuotaSeries(document) {
  const credentialSets = document?.api_quota?.details?.credential_sets;
  if (!credentialSets || typeof credentialSets !== 'object') return [];

  return Object.entries(credentialSets).map(([credentialSet, detail]) => {
    const monthlyRequests = detail?.monthly_requests ?? {};
    const months = Object.keys(monthlyRequests).sort();
    return {
      credentialSet,
      label: detail?.label ?? credentialSet,
      quota: detail?.quota,
      months,
      values: months.map((month) => monthlyRequests[month]),
    };
  });
}

/**
 * Build a stacked-chart-ready shape from
 * aws_cost.details.monthly_cost_by_service (schema v1.1).
 *
 * @param {object|null|undefined} document - Full pipeline-health document.
 * @returns {{months: string[], services: string[], valuesByService: Record<string, number[]>}}
 *   `months` preserves the backend's oldest-first order. `services` is the
 *   union of every service seen across all months. Missing a service in a
 *   given month fills that month's value with 0 (never `undefined`/`NaN`),
 *   so callers can build one stacked trace per service directly.
 */
export function buildAwsCostSeries(document) {
  const history = document?.aws_cost?.details?.monthly_cost_by_service;
  if (!Array.isArray(history) || history.length === 0) {
    return { months: [], services: [], valuesByService: {} };
  }

  const months = history.map((entry) => entry.month);
  const serviceSet = new Set();
  for (const entry of history) {
    for (const service of Object.keys(entry.services ?? {})) {
      serviceSet.add(service);
    }
  }
  const services = Array.from(serviceSet);

  const valuesByService = {};
  for (const service of services) {
    valuesByService[service] = history.map((entry) => entry.services?.[service] ?? 0);
  }

  return { months, services, valuesByService };
}
