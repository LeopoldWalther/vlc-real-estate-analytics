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
import { MAX_SCOPE_SELECTION, extractDistricts, extractNeighborhoods, filterPopulationBlock, toggleScopeSelection } from './src/filters.js';

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

// District/neighborhood scope filters — both cap at MAX_SCOPE_SELECTION.
// Empty array means "no restriction" on that axis (see filters.js).
let selectedDistricts = [];
let selectedNeighborhoods = [];

// Responsive/theme context passed to every renderer's buildLayout call.
// Reads (localStorage/matchMedia) happen once here; dashboard_state.js
// resolves what they mean.
// DEFAULT_COLOR_SCHEME wins whenever the visitor has not made an explicit
// choice yet (see resolveTheme) — dark is the portfolio's default look,
// regardless of the OS/browser preference. An explicit toggle click (see
// setExplicitTheme) always overrides this and persists across reloads.
const DEFAULT_COLOR_SCHEME = 'dark';

let currentContext = {
  viewport: resolveViewport(window.innerWidth),
  colorScheme: resolveTheme(getStoredTheme(), DEFAULT_COLOR_SCHEME),
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
 * Apply the current district/neighborhood scope selection to a raw
 * population block. Pure passthrough (no clone) when nothing is selected.
 *
 * @param {object|null|undefined} rawBlock
 * @returns {object|null|undefined}
 */
function applyScope(rawBlock) {
  return filterPopulationBlock(rawBlock, {
    districts: selectedDistricts,
    neighborhoods: selectedNeighborhoods,
  });
}

/**
 * Render the KPI headline row for a given population block.
 *
 * `generated_at` lives on the top-level payload (not inside `general`/
 * `relevant`), so it's merged in here from the module-level `cachedData`
 * rather than expected on `populationBlock` itself.
 *
 * @param {object|null|undefined} populationBlock - `cachedData.general` or
 *   `cachedData[activePopulation]`.
 */
function renderKpis(populationBlock) {
  const stats = summaryStats({ ...populationBlock, generated_at: cachedData?.generated_at });
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
  const generalScoped = applyScope(cachedData.general);
  const activeScoped = applyScope(cachedData[activePopulation]);
  for (const renderer of GENERAL_ONLY_RENDERERS) {
    await plotChart(renderer, generalScoped, context, { initial });
  }
  for (const renderer of TOGGLE_RENDERERS) {
    await plotChart(renderer, activeScoped, context, { initial });
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

/**
 * (Re)build the checkbox list inside a scope-filter <fieldset>, replacing any
 * previously rendered options/labels. The fieldset's <legend> (accessible
 * name) is preserved.
 *
 * @param {string} axis - 'districts' or 'neighborhoods' — matches the
 *   fieldset's [data-scope-options] attribute.
 * @param {string[]} options - Available values for this axis.
 * @param {string[]} selected - Currently selected values for this axis.
 */
function renderScopeOptions(axis, options, selected) {
  const fieldset = document.querySelector(`[data-scope-options="${axis}"]`);
  if (!fieldset) return;

  // Remove previously rendered labels/empty-state, keep the <legend>.
  fieldset.querySelectorAll('label, .scope-empty').forEach((el) => el.remove());

  if (options.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'scope-empty';
    empty.textContent = 'No data available';
    fieldset.appendChild(empty);
    return;
  }

  const atCap = selected.length >= MAX_SCOPE_SELECTION;
  for (const value of options) {
    const isChecked = selected.includes(value);
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = value;
    checkbox.checked = isChecked;
    checkbox.disabled = atCap && !isChecked;
    const span = document.createElement('span');
    span.textContent = value;
    label.append(checkbox, span);
    fieldset.appendChild(label);
  }
}

/**
 * Update a scope dropdown's summary badge to reflect its current selection
 * count (or 'All' when nothing is selected).
 *
 * @param {string} axis - 'districts' or 'neighborhoods'.
 * @param {string[]} selected
 */
function updateScopeBadge(axis, selected) {
  const badge = document.querySelector(`[data-scope-count="${axis}"]`);
  if (!badge) return;
  badge.textContent = selected.length > 0 ? `${selected.length}/${MAX_SCOPE_SELECTION}` : 'All';
  badge.toggleAttribute('data-active', selected.length > 0);
}

/**
 * Rebuild both scope-filter checkbox lists and badges from the current
 * selection state, and prune any selected neighborhoods that fall outside
 * the districts currently selected (avoids a silently-ignored stale
 * selection biasing the filtered data without appearing checked anywhere).
 *
 * District/neighborhood *options* are always derived from the unfiltered
 * 'general' population block, so the available choices stay stable
 * regardless of the population toggle.
 */
function renderScopeFilters() {
  const districtOptions = extractDistricts(cachedData.general);
  const neighborhoodOptions = extractNeighborhoods(cachedData.general, selectedDistricts);
  selectedNeighborhoods = selectedNeighborhoods.filter((n) => neighborhoodOptions.includes(n));

  renderScopeOptions('districts', districtOptions, selectedDistricts);
  renderScopeOptions('neighborhoods', neighborhoodOptions, selectedNeighborhoods);
  updateScopeBadge('districts', selectedDistricts);
  updateScopeBadge('neighborhoods', selectedNeighborhoods);

  const resetBtn = document.getElementById('scope-reset');
  if (resetBtn) resetBtn.hidden = selectedDistricts.length === 0 && selectedNeighborhoods.length === 0;
}

/**
 * React to a district/neighborhood scope change: rebuild the filter UI and
 * re-render the KPI row + every chart against the newly scoped data.
 */
async function onScopeChange() {
  renderScopeFilters();
  if (!cachedData) return;
  renderKpis(applyScope(cachedData[activePopulation]));
  await renderAllCharts(currentContext, { initial: false });
}

// Event delegation: one listener per fieldset handles all its checkboxes,
// including ones re-created by renderScopeOptions() on every change.
document.querySelector('[data-scope-options="districts"]')?.addEventListener('change', (e) => {
  if (e.target.type !== 'checkbox') return;
  selectedDistricts = toggleScopeSelection(selectedDistricts, e.target.value);
  onScopeChange().catch((err) => console.error('[Dashboard] Scope change failed:', err));
});

document.querySelector('[data-scope-options="neighborhoods"]')?.addEventListener('change', (e) => {
  if (e.target.type !== 'checkbox') return;
  selectedNeighborhoods = toggleScopeSelection(selectedNeighborhoods, e.target.value);
  onScopeChange().catch((err) => console.error('[Dashboard] Scope change failed:', err));
});

document.getElementById('scope-reset')?.addEventListener('click', () => {
  selectedDistricts = [];
  selectedNeighborhoods = [];
  onScopeChange().catch((err) => console.error('[Dashboard] Scope reset failed:', err));
});

// NOTE: no longer auto-following OS color-scheme changes — the dashboard
// defaults to dark (DEFAULT_COLOR_SCHEME) regardless of the OS preference,
// and only an explicit in-page toggle click (setExplicitTheme) changes it.

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

  renderScopeFilters();
  renderKpis(applyScope(cachedData.general));
  applyTheme(currentContext.colorScheme);
  await renderAllCharts(currentContext, { initial: true });

  // Show the toggle only when 'relevant' data is present. Wire the change
  // listener once (a retry-triggered re-run of run() must not attach a
  // second listener that would double-fire chart updates on every toggle).
  const toggleEl = document.getElementById('population-toggle');
  if (toggleEl && cachedData.relevant) {
    toggleEl.style.display = 'flex';
    if (!toggleEl.dataset.wired) {
      toggleEl.dataset.wired = 'true';
      toggleEl.addEventListener('change', async (e) => {
        activePopulation = e.target.value;
        const activeScoped = applyScope(cachedData[activePopulation]);
        // Update the KPI row immediately too, so the toggle gives visible
        // feedback even before scrolling down to the population-specific charts.
        renderKpis(activeScoped);
        for (const renderer of TOGGLE_RENDERERS) {
          await plotChart(renderer, activeScoped, currentContext, { initial: false });
        }
      });
    }
  }
}

document.getElementById('retry-button')?.addEventListener('click', () => {
  run().catch((err) => console.error('[Dashboard] Retry failed:', err));
});

run().catch((err) => {
  console.error('[Dashboard] Failed to render:', err);
});
