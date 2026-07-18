/**
 * pipeline_health_diagram.js — pure Medallion pipeline topology model +
 * lightweight SVG renderer for the Pipeline Health tab (FEATURE-013, task
 * 13.11).
 *
 * Two responsibilities kept sharply separate (mirrors pipeline_health.js /
 * chart renderer split):
 *   - buildDiagramModel(document, ...) — pure, DOM-free: derives one node
 *     per Medallion stage (bronze/silver/gold) plus the pipeline-health
 *     observer node, and the edges between them, from the pipeline-health
 *     document. Never throws — missing/renamed functions and a null
 *     document degrade to an "unknown" status rather than crashing.
 *   - renderDiagramSvg(model, locale) — turns a model into a self-contained
 *     SVG markup string. No `document`/DOM APIs are touched; app.js is
 *     responsible for injecting the returned markup (e.g. via innerHTML).
 */

import { t } from './i18n.js';

export const GREEN = 'green';
export const YELLOW = 'yellow';
export const RED = 'red';
export const UNKNOWN = 'unknown';

const STATUS_PRECEDENCE = { [RED]: 0, [YELLOW]: 1, [GREEN]: 2 };

/**
 * Default Lambda function names for each Medallion stage, matching
 * PIPELINE_FUNCTION_NAMES (pipeline_health_lambda.py env var) ordering.
 */
export const DEFAULT_STAGE_FUNCTION_NAMES = {
  bronze: 'bronze-collector',
  silver: 'silver-cleaner',
  gold: 'gold-aggregator',
};

const STAGE_LABEL_KEYS = {
  bronze: 'pipelineHealth.diagram.bronze',
  silver: 'pipelineHealth.diagram.silver',
  gold: 'pipelineHealth.diagram.gold',
};

/**
 * Worst of the given known (non-unknown) statuses; 'unknown' if none given.
 *
 * @param {Array<string|null|undefined>} statuses
 * @returns {string} One of GREEN/YELLOW/RED/UNKNOWN.
 */
function worstKnownStatus(statuses) {
  const known = statuses.filter((s) => s === GREEN || s === YELLOW || s === RED);
  if (known.length === 0) return UNKNOWN;
  return known.reduce((worst, s) => (STATUS_PRECEDENCE[s] < STATUS_PRECEDENCE[worst] ? s : worst));
}

/**
 * Derive one Medallion-stage node's status from the execution_success and
 * execution_duration checks' per-function details (worst of the two).
 *
 * @param {object|null|undefined} document - Full pipeline-health document.
 * @param {string} functionName
 * @returns {string} One of GREEN/YELLOW/RED/UNKNOWN — UNKNOWN when the
 *   function is missing/renamed in either check (never throws).
 */
function stageStatus(document, functionName) {
  const successStatus = document?.execution_success?.details?.functions?.[functionName]?.status;
  const durationStatus = document?.execution_duration?.details?.functions?.[functionName]?.status;
  return worstKnownStatus([successStatus, durationStatus]);
}

/**
 * Build the pure Medallion pipeline diagram model: 4 nodes (bronze, silver,
 * gold, pipeline-health observer) and the edges between them.
 *
 * @param {object|null|undefined} document - Full pipeline-health JSON document.
 * @param {{stageFunctionNames?: Record<'bronze'|'silver'|'gold', string>}} [options]
 * @returns {{
 *   nodes: Array<{id: string, labelKey: string, status: string}>,
 *   edges: Array<{from: string, to: string}>,
 * }}
 *   Never throws — a null document produces a valid all-unknown model.
 */
export function buildDiagramModel(document, { stageFunctionNames = DEFAULT_STAGE_FUNCTION_NAMES } = {}) {
  const stageIds = ['bronze', 'silver', 'gold'];
  const nodes = stageIds.map((stageId) => ({
    id: stageId,
    labelKey: STAGE_LABEL_KEYS[stageId],
    status: stageStatus(document, stageFunctionNames[stageId]),
  }));

  const observerStatus =
    document?.overall_status === GREEN ||
    document?.overall_status === YELLOW ||
    document?.overall_status === RED
      ? document.overall_status
      : UNKNOWN;

  nodes.push({
    id: 'pipeline-health',
    labelKey: 'pipelineHealth.diagram.observer',
    status: observerStatus,
  });

  const edges = [
    { from: 'bronze', to: 'silver' },
    { from: 'silver', to: 'gold' },
    { from: 'bronze', to: 'pipeline-health' },
    { from: 'silver', to: 'pipeline-health' },
    { from: 'gold', to: 'pipeline-health' },
  ];

  return { nodes, edges };
}

const STATUS_COLORS = {
  [GREEN]: '#16a34a',
  [YELLOW]: '#eab308',
  [RED]: '#dc2626',
  [UNKNOWN]: '#94a3b8',
};

const NODE_POSITIONS = {
  bronze: { x: 20, y: 60 },
  silver: { x: 180, y: 60 },
  gold: { x: 340, y: 60 },
  'pipeline-health': { x: 180, y: 180 },
};

const NODE_WIDTH = 120;
const NODE_HEIGHT = 50;

/**
 * @param {string} value
 * @returns {string} XML/HTML-escaped text safe to inline in SVG markup.
 */
function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render a diagram model as a self-contained SVG markup string. Pure
 * string-building — no DOM/`document` access, so it is safe to call from
 * any environment (including SSR/tests without jsdom).
 *
 * @param {{nodes: Array<{id: string, labelKey: string, status: string}>, edges: Array<{from: string, to: string}>}} model
 * @param {string} locale
 * @returns {string} SVG markup, ready to inject via `innerHTML`.
 */
export function renderDiagramSvg(model, locale) {
  const centerOf = (nodeId) => {
    const pos = NODE_POSITIONS[nodeId] ?? { x: 0, y: 0 };
    return { x: pos.x + NODE_WIDTH / 2, y: pos.y + NODE_HEIGHT / 2 };
  };

  const edgeLines = model.edges
    .map((edge) => {
      const from = centerOf(edge.from);
      const to = centerOf(edge.to);
      return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="#94a3b8" stroke-width="1.5" />`;
    })
    .join('');

  const nodeShapes = model.nodes
    .map((node) => {
      const pos = NODE_POSITIONS[node.id] ?? { x: 0, y: 0 };
      const color = STATUS_COLORS[node.status] ?? STATUS_COLORS[UNKNOWN];
      const label = escapeXml(t(locale, node.labelKey));
      const statusLabel = escapeXml(
        node.status === UNKNOWN ? t(locale, 'pipelineHealth.status.unknown') : node.status,
      );
      return (
        `<g data-node-id="${node.id}" data-status="${node.status}">` +
        `<rect x="${pos.x}" y="${pos.y}" width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="8" fill="${color}" />` +
        `<text x="${pos.x + NODE_WIDTH / 2}" y="${pos.y + NODE_HEIGHT / 2 - 4}" text-anchor="middle" font-size="12">${label}</text>` +
        `<text x="${pos.x + NODE_WIDTH / 2}" y="${pos.y + NODE_HEIGHT / 2 + 12}" text-anchor="middle" font-size="10">${statusLabel}</text>` +
        `</g>`
      );
    })
    .join('');

  return (
    `<svg viewBox="0 0 480 250" role="img" aria-label="${escapeXml(t(locale, 'pipelineHealth.diagram.title'))}">` +
    edgeLines +
    nodeShapes +
    `</svg>`
  );
}
