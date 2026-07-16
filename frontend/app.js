/**
 * App entry point — wires the DataSource, chart renderers, KPI summary, and
 * responsive/theming behaviour.
 *
 * window.CONFIG.DATA_URL is injected per-environment (dev/prod) either inline
 * in index.html or via a config.js sync'd by the deploy workflow.
 *
 * This module is deliberately thin: all aggregation math lives in summary.js,
 * all theme/viewport/rerender decisions live in dashboard_state.js, and all
 * chart layout construction lives in chart_theme.js (via each renderer). This
 * module only reads DOM/browser state, calls those pure functions, and
 * applies their results to the page.
 */

import { DataSource } from './src/data_source.js';
import { priceTimeSeriesRentRenderer, priceTimeSeriesSaleRenderer } from './src/charts/price_time_series.js';
import { priceTimeSeriesDistrictRentRenderer, priceTimeSeriesDistrictSaleRenderer } from './src/charts/price_time_series_district.js';
import { rentVsSaleRatioRenderer } from './src/charts/rent_vs_sale_ratio.js';
import { ratioTimeSeriesRenderer } from './src/charts/rent_vs_sale_ratio_time_series.js';
import { boxplotRentRenderer, boxplotSaleRenderer } from './src/charts/boxplot_by_neighborhood.js';
import { summaryStats, formatKpi } from './src/summary.js';
import { resolveTheme, resolveViewport, shouldRerender, createLoadState, transition } from './src/dashboard_state.js';

const THEME_STORAGE_KEY = 'vlc-dashboard-theme';
const RESIZE_DEBOUNCE_MS = 200;

// Renderers that exist in both 'general' and 'relevant' populations.
// The population toggle switches which block is passed to render().
const TOGGLE_RENDERERS = [
  rentVsSaleRatioRenderer,
  ratioTimeSeriesRenderer,
  boxplotRentRenderer,
  boxplotSaleRenderer,
];

// Renderers only available in the 'general' population block.
// Neighbourhood and district are split into rent + sale to avoid a 300×
// Y-axis mismatch (€/m²/month rent vs €/m² sale).
const GENERAL_ONLY_RENDERERS = [
  priceTimeSeriesRentRenderer,
  priceTimeSeriesSaleRenderer,
  priceTimeSeriesDistrictRentRenderer,
  priceTimeSeriesDistrictSaleRenderer,
];

const ALL_RENDERERS = [...GENERAL_ONLY_RENDERERS, ...TOGGLE_RENDERERS];

const containers = {
  'price-time-series-rent':          document.getElementById('price-time-series-rent'),
  'price-time-series-sale':          document.getElementById('price-time-series-sale'),
  'price-time-series-district-rent': document.getElementById('price-time-series-district-rent'),
  'price-time-series-district-sale': document.getElementById('price-time-series-district-sale'),
  'rent-vs-sale-ratio':              document.getElementById('rent-vs-sale-ratio'),
  'rent-vs-sale-ratio-time-series':  document.getElementById('rent-vs-sale-ratio-time-series'),
  'boxplot-by-neighborhood-rent':    document.getElementById('boxplot-by-neighborhood-rent'),
  'boxplot-by-neighborhood-sale':    document.getElementById('boxplot-by-neighborhood-sale'),
};

const KPI_FORMATTERS = {
  'median-rent': (stats) => formatKpi(stats.medianRentEurPerM2Month, 'eur_per_m2_month'),
  'median-sale': (stats) => formatKpi(stats.medianSaleEurPerM2, 'eur_per_m2'),
  'gross-yield': (stats) => formatKpi(stats.impliedGrossYieldPercent, 'percent'),
  'listing-count': (stats) => formatKpi(stats.totalListingCount, 'count'),
  'last-updated': (stats) => formatKpi(stats.lastUpdated, 'date'),
};

const LOAD_STATE_MESSAGES = {
  loading: 'Loading market data…',
  ready: 'Market data loaded.',
  error: 'Failed to load market data.',
};

const dataSource = new DataSource(window.CONFIG.DATA_URL);

// Active population — starts on 'general'; toggle switches to 'relevant'.
let activePopulation = 'general';
let cachedData = null;
let loadState = createLoadState();

// Responsive/theme context passed to every renderer's buildLayout call.
// Reads (localStorage/matchMedia) happen once here; dashboard_state.js
// resolves what they mean.
let currentContext = {
  viewport: resolveViewport(window.innerWidth),
  colorScheme: resolveTheme(getStoredTheme(), systemPrefersDarkMode() ? 'dark' : 'light'),
};

/**
 * Read the explicitly stored theme choice, if any.
 *
 * @returns {string|null} 'light', 'dark', or null if never set / unavailable.
 */
function getStoredTheme() {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    // Storage unavailable (e.g. privacy mode) — behave as if nothing is stored.
    return null;
  }
}

/**
 * @returns {boolean} Whether the OS/browser currently prefers dark mode.
 */
function systemPrefersDarkMode() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

/**
 * Reflect the active color scheme on the document root so CSS custom
 * properties (light/dark tokens) apply.
 *
 * @param {'light'|'dark'} colorScheme
 */
function applyTheme(colorScheme) {
  document.documentElement.setAttribute('data-theme', colorScheme);
}

/**
 * Push a message into the aria-live region so screen readers announce
 * load-lifecycle changes.
 *
 * @param {string} message
 */
function announce(message) {
  const el = document.getElementById('status-announcer');
  if (el) el.textContent = message;
}

/**
 * Apply a load-lifecycle state to the DOM: toggle the error block and
 * announce the change.
 *
 * @param {{status: 'loading'|'ready'|'error'}} nextState
 */
function setLoadState(nextState) {
  loadState = nextState;
  const errorEl = document.getElementById('dashboard-error');
  if (errorEl) errorEl.hidden = loadState.status !== 'error';
  announce(LOAD_STATE_MESSAGES[loadState.status] ?? '');
}

/**
 * Build a human-readable label from a relevant_filter object so the toggle
 * shows the actual criteria (e.g. "Flats: ≥120 m², lift, ≥2 rooms") rather
 * than a generic placeholder.
 *
 * @param {object|null|undefined} filter - relevant_filter from the gold JSON.
 * @returns {string} Short filter summary.
 */
function buildRelevantLabel(filter) {
  if (!filter) return 'Filtered apartments';
  const parts = [];
  if (filter.size_gt != null) parts.push(`≥${filter.size_gt} m²`);
  if (filter.hasLift) parts.push('lift');
  if (filter.rooms_gte != null) parts.push(`≥${filter.rooms_gte} rooms`);
  if (filter.bathrooms_gte != null) parts.push(`≥${filter.bathrooms_gte} baths`);
  if (filter.floor_not != null) parts.push(`not floor ${filter.floor_not}`);
  return parts.length > 0 ? `Flats: ${parts.join(', ')}` : 'Filtered apartments';
}

/**
 * Render the KPI headline row from the general population block.
 *
 * @param {object|null|undefined} generalBlock
 */
function renderKpis(generalBlock) {
  const stats = summaryStats(generalBlock);
  for (const [kpi, format] of Object.entries(KPI_FORMATTERS)) {
    const el = document.querySelector(`.kpi-card[data-kpi="${kpi}"] .kpi-value`);
    if (el) el.textContent = format(stats);
  }
}

/**
 * Reveal a chart's container by hiding its loading skeleton.
 *
 * @param {string} rendererId
 */
function markChartLoaded(rendererId) {
  const section = containers[rendererId]?.closest('.chart-section');
  section?.classList.add('is-loaded');
}

/**
 * Render (or re-render) a single chart into its container.
 *
 * First render uses Plotly.newPlot; subsequent calls (population toggle,
 * viewport/theme change) use Plotly.react so Plotly can diff efficiently.
 *
 * @param {{id: string, title: string, render: function}} renderer
 * @param {object|null|undefined} block - Population block passed to render().
 * @param {{viewport: string, colorScheme: string}} context
 * @param {{initial: boolean}} options
 */
async function plotChart(renderer, block, context, { initial }) {
  const container = containers[renderer.id];
  if (!container) return;

  const fig = renderer.render(block, context);
  // Stamp the active population into toggle-chart titles so users can see
  // the switch take effect even before scrolling to changed data points.
  if (TOGGLE_RENDERERS.includes(renderer)) {
    const popLabel = activePopulation === 'general'
      ? 'All listings'
      : buildRelevantLabel(cachedData?.relevant_filter);
    fig.layout.title = { text: `${renderer.title} — ${popLabel}` };
  }

  try {
    if (initial) {
      await globalThis.Plotly.newPlot(container, fig.data, fig.layout, { responsive: true });
    } else {
      await globalThis.Plotly.react(container, fig.data, fig.layout, { responsive: true });
    }
    markChartLoaded(renderer.id);
  } catch (err) {
    console.error(`[Dashboard] Failed to render chart '${renderer.id}':`, err);
    // Hide the skeleton anyway so a chart-level failure doesn't pulse forever.
    markChartLoaded(renderer.id);
  }
}

/**
 * Render every chart against the given responsive/theme context.
 *
 * @param {{viewport: string, colorScheme: string}} context
 * @param {{initial: boolean}} [options]
 */
async function renderAllCharts(context, { initial = true } = {}) {
  for (const renderer of GENERAL_ONLY_RENDERERS) {
    await plotChart(renderer, cachedData.general, context, { initial });
  }
  for (const renderer of TOGGLE_RENDERERS) {
    await plotChart(renderer, cachedData[activePopulation], context, { initial });
  }
}

/**
 * Merge a partial context change, apply the resulting theme, and re-render
 * charts only when dashboard_state.shouldRerender says the change is
 * significant (viewport bucket or color scheme actually changed).
 *
 * @param {{viewport?: string, colorScheme?: string}} partial
 */
function updateContext(partial) {
  const next = { ...currentContext, ...partial };
  const rerenderNeeded = shouldRerender(currentContext, next);
  currentContext = next;
  applyTheme(currentContext.colorScheme);
  if (rerenderNeeded && cachedData) {
    renderAllCharts(currentContext, { initial: false });
  }
}

/**
 * Explicitly set the theme (from a user-driven toggle), persisting the
 * choice so it survives reloads and takes precedence over the system
 * preference.
 *
 * @param {'light'|'dark'} nextTheme
 */
function setExplicitTheme(nextTheme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  } catch {
    // Storage unavailable — the choice just won't persist across reloads.
  }
  updateContext({ colorScheme: nextTheme });
}

// Optional theme-toggle control — markup is added by a follow-up task; wiring
// the behaviour here means the button works the moment it exists in the DOM.
document.getElementById('theme-toggle')?.addEventListener('click', () => {
  setExplicitTheme(currentContext.colorScheme === 'dark' ? 'light' : 'dark');
});

// Debounced resize listener — only recompute/rerender on an actual viewport
// bucket change (mobile <-> desktop), never on every resize pixel.
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    updateContext({ viewport: resolveViewport(window.innerWidth) });
  }, RESIZE_DEBOUNCE_MS);
});

// System color-scheme change listener — only applies when the user has not
// made an explicit choice (an explicit choice always wins, see resolveTheme).
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (getStoredTheme()) return;
  updateContext({ colorScheme: e.matches ? 'dark' : 'light' });
});

/**
 * Load the gold data once, then render the KPI row and every chart.
 * General-only renderers always receive data.general; toggle renderers
 * receive the active population. On failure, shows the retry block.
 */
async function run() {
  setLoadState(createLoadState());

  try {
    cachedData = await dataSource.load();
  } catch (err) {
    console.error('[Dashboard] Failed to load data:', err);
    setLoadState(transition(loadState, { type: 'error' }));
    return;
  }
  setLoadState(transition(loadState, { type: 'success' }));

  // Update the toggle label to show the actual filter criteria.
  const relevantLabelEl = document.getElementById('relevant-label');
  if (relevantLabelEl && cachedData.relevant_filter) {
    relevantLabelEl.textContent = buildRelevantLabel(cachedData.relevant_filter);
  }

  renderKpis(cachedData.general);
  applyTheme(currentContext.colorScheme);
  await renderAllCharts(currentContext, { initial: true });

  // Show the toggle only when 'relevant' data is present.
  const toggleEl = document.getElementById('population-toggle');
  if (toggleEl && cachedData.relevant) {
    toggleEl.style.display = 'flex';
    toggleEl.addEventListener('change', async (e) => {
      activePopulation = e.target.value;
      for (const renderer of TOGGLE_RENDERERS) {
        await plotChart(renderer, cachedData[activePopulation], currentContext, { initial: false });
      }
    });
  }
}

document.getElementById('retry-button')?.addEventListener('click', () => {
  run().catch((err) => console.error('[Dashboard] Retry failed:', err));
});

run().catch((err) => {
  console.error('[Dashboard] Failed to render:', err);
});
