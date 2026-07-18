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
