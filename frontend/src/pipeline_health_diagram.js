/**
 * pipeline_health_diagram.js — pure Medallion pipeline topology model +
 * lightweight SVG renderer for the Pipeline Health tab (FEATURE-013, task
 * 13.11).
 *
 * Two responsibilities kept sharply separate (mirrors pipeline_health.js /
 * chart renderer split):
 *   - buildDiagramModel(document, ...) — pure, DOM-free: derives the full
 *     pipeline topology — the external Idealista API data source, one node
 *     per Medallion stage (bronze/silver/gold), the dashboard consumer, and
 *     the pipeline-health observer node — plus the edges between them, from
 *     the pipeline-health document. The source/dashboard nodes are
 *     contextual only (no Lambda backs them, so they always report
 *     "unknown"); the 3 Medallion stages derive their status from the
 *     execution_success/execution_duration checks. Never throws —
 *     missing/renamed functions and a null document degrade to an "unknown"
 *     status rather than crashing.
 *   - renderDiagramSvg(model, locale) — turns a model into a self-contained
 *     SVG markup string (horizontal flow with arrowheads, plus a fan of
 *     arrows from every stage down to the observer node). No `document`/DOM
 *     APIs are touched; app.js is responsible for injecting the returned
 *     markup (e.g. via innerHTML).
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

/** Contextual, always-unknown nodes: not backed by a Lambda/health check,
 * shown only to give the Medallion stages their upstream/downstream context. */
const CONTEXT_LABEL_KEYS = {
  source: 'pipelineHealth.diagram.source',
  dashboard: 'pipelineHealth.diagram.dashboard',
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
 * Build the pure Medallion pipeline diagram model: 6 nodes — the external
 * Idealista API data source, the 3 Medallion stages (bronze, silver, gold),
 * the dashboard consumer, and the pipeline-health observer — plus the edges
 * between them (a horizontal source→bronze→silver→gold→dashboard flow, and
 * a fan of edges from every one of those 5 nodes down to the observer).
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
  const nodes = [
    { id: 'source', labelKey: CONTEXT_LABEL_KEYS.source, status: UNKNOWN },
    ...stageIds.map((stageId) => ({
      id: stageId,
      labelKey: STAGE_LABEL_KEYS[stageId],
      status: stageStatus(document, stageFunctionNames[stageId]),
    })),
    { id: 'dashboard', labelKey: CONTEXT_LABEL_KEYS.dashboard, status: UNKNOWN },
  ];

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

  const flowIds = ['source', 'bronze', 'silver', 'gold', 'dashboard'];
  // Only the 3 Medallion stages (not the source/dashboard context nodes)
  // fan an arrow down to the pipeline-health observer — the observer
  // monitors the Lambda-backed pipeline stages, not the external API or
  // the dashboard consumer.
  const edges = [
    ...flowIds.slice(0, -1).map((from, i) => ({ from, to: flowIds[i + 1] })),
    ...stageIds.map((from) => ({ from, to: 'pipeline-health' })),
  ];

  return { nodes, edges };
}

const STATUS_COLORS = {
  [GREEN]: '#16a34a',
  [YELLOW]: '#eab308',
  [RED]: '#dc2626',
  [UNKNOWN]: '#94a3b8',
};

const EDGE_COLOR = '#94a3b8';

// Horizontal flow row (source → bronze → silver → gold → dashboard), with the
// pipeline-health observer node centered below. Boxes are intentionally small
// (compact glance-able topology, not a detailed architecture diagram).
const NODE_WIDTH = 88;
const NODE_HEIGHT = 46;
const ROW_Y = 22;
const ROW_GAP = 14;
const ROW_ORDER = ['source', 'bronze', 'silver', 'gold', 'dashboard'];

const NODE_POSITIONS = ROW_ORDER.reduce((positions, id, index) => {
  positions[id] = { x: 8 + index * (NODE_WIDTH + ROW_GAP), y: ROW_Y };
  return positions;
}, {});

const rowRight = NODE_POSITIONS[ROW_ORDER[ROW_ORDER.length - 1]].x + NODE_WIDTH;
const OBSERVER_WIDTH = 150;
NODE_POSITIONS['pipeline-health'] = {
  x: (8 + rowRight) / 2 - OBSERVER_WIDTH / 2,
  y: ROW_Y + NODE_HEIGHT + 70,
};

const VIEWBOX_WIDTH = rowRight + 8;
const VIEWBOX_HEIGHT = NODE_POSITIONS['pipeline-health'].y + NODE_HEIGHT + 10;

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
 * @param {string} nodeId
 * @returns {{x: number, y: number, width: number, height: number}}
 */
function boxOf(nodeId) {
  const pos = NODE_POSITIONS[nodeId] ?? { x: 0, y: 0 };
  const width = nodeId === 'pipeline-health' ? OBSERVER_WIDTH : NODE_WIDTH;
  return { x: pos.x, y: pos.y, width, height: NODE_HEIGHT };
}

/**
 * Split a "Main label (parenthetical detail)" string into its two parts so
 * the renderer can wrap it onto two short lines instead of overflowing a
 * compact box on one long line. Labels without a parenthetical detail are
 * returned as a single-element array.
 *
 * @param {string} label
 * @returns {[string] | [string, string]}
 */
function splitLabelLines(label) {
  const match = /^(.*?)\s\((.*)\)$/.exec(label);
  return match ? [match[1], `(${match[2]})`] : [label];
}

/**
 * Render a diagram model as a self-contained SVG markup string. Pure
 * string-building — no DOM/`document` access, so it is safe to call from
 * any environment (including SSR/tests without jsdom).
 *
 * Renders the horizontal source→bronze→silver→gold→dashboard flow as
 * right-pointing arrows between adjacent boxes, and a fan of downward arrows
 * from every one of those 5 nodes to the pipeline-health observer box below.
 *
 * @param {{nodes: Array<{id: string, labelKey: string, status: string}>, edges: Array<{from: string, to: string}>}} model
 * @param {string} locale
 * @returns {string} SVG markup, ready to inject via `innerHTML`.
 */
export function renderDiagramSvg(model, locale) {
  // Edges converge on distinct points along the observer box's top edge
  // (spread across its width) rather than all meeting at one pixel, so the
  // fan of arrows stays legible instead of collapsing into a single line.
  const observerBox = boxOf('pipeline-health');
  const flowSourceIds = model.edges
    .filter((edge) => edge.to === 'pipeline-health')
    .map((edge) => edge.from);
  const observerTargetX = (index, total) =>
    total <= 1
      ? observerBox.x + observerBox.width / 2
      : observerBox.x + (observerBox.width * (index + 1)) / (total + 1);

  const edgeLines = model.edges
    .map((edge) => {
      const fromBox = boxOf(edge.from);
      const toBox = boxOf(edge.to);
      const isDownToObserver = edge.to === 'pipeline-health';
      const start = isDownToObserver
        ? { x: fromBox.x + fromBox.width / 2, y: fromBox.y + fromBox.height }
        : { x: fromBox.x + fromBox.width, y: fromBox.y + fromBox.height / 2 };
      const end = isDownToObserver
        ? {
            x: observerTargetX(flowSourceIds.indexOf(edge.from), flowSourceIds.length),
            y: observerBox.y,
          }
        : { x: toBox.x, y: toBox.y + toBox.height / 2 };
      return (
        `<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" ` +
        `stroke="${EDGE_COLOR}" stroke-width="1.25" marker-end="url(#pipeline-health-arrowhead)" />`
      );
    })
    .join('');

  const statusPrefix = escapeXml(t(locale, 'pipelineHealth.diagram.statusLabel'));

  const nodeShapes = model.nodes
    .map((node) => {
      const box = boxOf(node.id);
      const color = STATUS_COLORS[node.status] ?? STATUS_COLORS[UNKNOWN];
      const [mainLabel, subLabel] = splitLabelLines(t(locale, node.labelKey)).map(escapeXml);
      const statusText = escapeXml(t(locale, `pipelineHealth.status.${node.status}`) ?? node.status);
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      // 3 short lines (main label / parenthetical detail / status) instead of
      // one long line, so compact boxes stay readable at a small font size.
      const labelLines = subLabel
        ? `<text x="${cx}" y="${cy - 12}" text-anchor="middle" font-size="8">${mainLabel}</text>` +
          `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="7">${subLabel}</text>`
        : `<text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="8">${mainLabel}</text>`;
      return (
        `<g data-node-id="${node.id}" data-status="${node.status}">` +
        `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="6" fill="${color}" />` +
        labelLines +
        `<text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="7">${statusPrefix}: ${statusText}</text>` +
        `</g>`
      );
    })
    .join('');

  return (
    `<svg viewBox="0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}" role="img" aria-label="${escapeXml(t(locale, 'pipelineHealth.diagram.title'))}">` +
    `<defs><marker id="pipeline-health-arrowhead" viewBox="0 0 10 10" refX="9" refY="5" ` +
    `markerWidth="6" markerHeight="6" orient="auto-start-reverse">` +
    `<path d="M0,0 L10,5 L0,10 z" fill="${EDGE_COLOR}" /></marker></defs>` +
    edgeLines +
    nodeShapes +
    `</svg>`
  );
}
