/**
 * app.test.js — integration test for the Pipeline Health tab detail-view
 * wiring in app.js (FEATURE-013, task 13.12): the Medallion diagram, the 4
 * detail charts and their threshold captions get mounted on first tab
 * activation, degrade to the "not yet available" state (and never touch
 * Plotly) when the pipeline-health document fails to load, tolerate a
 * legacy v1.0 fixture without crashing, and re-render (via Plotly.react,
 * not newPlot) on a locale/theme change without refetching.
 *
 * app.js is a browser entry point (no exports, side effects at import
 * time), so — like tests/app_tab_wiring.test.js — this test builds a small,
 * purpose-built fake DOM/window sufficient to import and exercise it
 * end-to-end. The fake DOM only supports the small selector subset app.js
 * actually uses.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal fake DOM (trimmed copy of tests/app_tab_wiring.test.js's harness)
// ---------------------------------------------------------------------------

class FakeClassList {
  constructor() { this._set = new Set(); }
  add(...names) { for (const n of names) this._set.add(n); }
  remove(...names) { for (const n of names) this._set.delete(n); }
  contains(name) { return this._set.has(name); }
  toggle(name, force) {
    const has = this._set.has(name);
    const next = force === undefined ? !has : force;
    if (next) this._set.add(name); else this._set.delete(name);
    return next;
  }
}

class FakeElement {
  constructor(tagName, { id, className } = {}) {
    this.tagName = tagName.toUpperCase();
    this.id = id ?? '';
    this.attributes = new Map();
    this.dataset = {};
    this.style = {};
    this.children = [];
    this.parentElement = null;
    this._listeners = new Map();
    this.classList = new FakeClassList();
    this._hidden = false;
    this._textContent = '';
    this._innerHTML = '';
    if (className) {
      for (const c of className.split(/\s+/).filter(Boolean)) this.classList.add(c);
    }
  }

  get hidden() { return this._hidden; }
  set hidden(v) { this._hidden = Boolean(v); }

  get textContent() { return this._textContent; }
  set textContent(v) { this._textContent = String(v); this.children = []; }

  get innerHTML() { return this._innerHTML; }
  set innerHTML(v) { this._innerHTML = String(v); }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'hidden') this._hidden = true;
  }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); if (name === 'hidden') this._hidden = false; }

  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  append(...nodes) { for (const n of nodes) this.appendChild(n); }

  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
  }
  dispatchEvent(event) {
    for (const fn of this._listeners.get(event.type) ?? []) fn(event);
    return true;
  }

  querySelector(selector) { return querySelectorAll(this, selector)[0] ?? null; }
  querySelectorAll(selector) { return querySelectorAll(this, selector); }
  closest(selector) {
    let node = this;
    while (node) {
      if (matchesCompound(node, selector)) return node;
      node = node.parentElement;
    }
    return null;
  }
}

function matchesCompound(el, compound) {
  const attrRe = /\[([^\]=]+)(?:="([^"]*)")?\]/g;
  let rest = compound;
  let m;
  while ((m = attrRe.exec(compound))) {
    const [, attr, value] = m;
    if (value !== undefined) {
      if (el.getAttribute(attr) !== value) return false;
    } else if (!el.hasAttribute(attr)) {
      return false;
    }
    rest = rest.replace(m[0], '');
  }
  const idMatch = rest.match(/#([\w-]+)/);
  if (idMatch) {
    if (el.id !== idMatch[1]) return false;
    rest = rest.replace(idMatch[0], '');
  }
  const classMatches = [...rest.matchAll(/\.([\w-]+)/g)];
  for (const cm of classMatches) {
    if (!el.classList.contains(cm[1])) return false;
    rest = rest.replace(cm[0], '');
  }
  const tag = rest.trim();
  if (tag && el.tagName !== tag.toUpperCase()) return false;
  return true;
}

function allDescendants(root) {
  const out = [];
  for (const child of root.children) {
    out.push(child);
    out.push(...allDescendants(child));
  }
  return out;
}

function querySelectorAll(root, selector) {
  const parts = selector.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return [];
  const universe = allDescendants(root);
  if (parts.length === 1) return universe.filter((el) => matchesCompound(el, parts[0]));
  const last = parts[parts.length - 1];
  const ancestorsChain = parts.slice(0, -1);
  return universe.filter((el) => {
    if (!matchesCompound(el, last)) return false;
    let node = el.parentElement;
    let chainIdx = ancestorsChain.length - 1;
    while (node && chainIdx >= 0) {
      if (matchesCompound(node, ancestorsChain[chainIdx])) chainIdx -= 1;
      node = node.parentElement;
    }
    return chainIdx < 0;
  });
}

const PIPELINE_CHART_IDS = [
  'pipeline-execution-success-chart',
  'pipeline-execution-duration-chart',
  'pipeline-api-quota-chart',
  'pipeline-aws-cost-chart',
];
const PIPELINE_CHECK_IDS = ['execution_success', 'execution_duration', 'api_quota', 'aws_cost'];

function buildFakeDocument() {
  const root = new FakeElement('html');
  const registry = new Map();
  function register(el) { if (el.id) registry.set(el.id, el); }
  function make(tagName, opts) { const el = new FakeElement(tagName, opts); register(el); return el; }

  const tabTrendAnalysis = make('button', { id: 'tab-trend-analysis', className: 'tab-button' });
  tabTrendAnalysis.dataset.tabId = 'trend-analysis';
  tabTrendAnalysis.setAttribute('data-tab-id', 'trend-analysis');
  const tabPipelineHealth = make('button', { id: 'tab-pipeline-health', className: 'tab-button' });
  tabPipelineHealth.dataset.tabId = 'pipeline-health';
  tabPipelineHealth.setAttribute('data-tab-id', 'pipeline-health');

  const panelTrendAnalysis = make('section', { id: 'panel-trend-analysis', className: 'tab-panel' });
  const panelPipelineHealth = make('section', { id: 'panel-pipeline-health', className: 'tab-panel' });
  panelPipelineHealth.hidden = true;

  const overallEl = make('div', { id: 'pipeline-health-overall' });
  const sublightsEl = make('ul', { id: 'pipeline-health-sublights' });
  const unavailableEl = make('p', { id: 'pipeline-health-unavailable' });
  unavailableEl.hidden = true;
  const diagramEl = make('div', { id: 'pipeline-health-diagram' });

  const chartContainers = {};
  const captionEls = {};
  for (const id of PIPELINE_CHART_IDS) {
    chartContainers[id] = make('div', { id });
    panelPipelineHealth.appendChild(chartContainers[id]);
  }
  for (const checkId of PIPELINE_CHECK_IDS) {
    const id = `pipeline-health-threshold-${checkId}`;
    captionEls[checkId] = make('p', { id });
    panelPipelineHealth.appendChild(captionEls[checkId]);
  }

  panelPipelineHealth.appendChild(overallEl);
  panelPipelineHealth.appendChild(sublightsEl);
  panelPipelineHealth.appendChild(unavailableEl);
  panelPipelineHealth.appendChild(diagramEl);

  const dashboardError = make('div', { id: 'dashboard-error' });
  dashboardError.hidden = true;
  const retryButton = make('button', { id: 'retry-button' });
  const relevantLabel = make('span', { id: 'relevant-label' });
  const populationToggle = make('div', { id: 'population-toggle' });
  const scopeReset = make('button', { id: 'scope-reset' });
  const themeToggle = make('button', { id: 'theme-toggle' });
  const languageMenu = make('details', { id: 'language-menu' });
  const languageFieldset = new FakeElement('fieldset');
  const localeRadios = {};
  for (const value of ['en', 'de', 'es', 'ar', 'tr']) {
    const radio = new FakeElement('input');
    radio.type = 'radio';
    radio.name = 'language';
    radio.value = value;
    radio.checked = value === 'en';
    localeRadios[value] = radio;
    languageFieldset.appendChild(radio);
  }
  languageMenu.appendChild(languageFieldset);

  // Trend Analysis needs its own set of chart containers for run()'s initial
  // render to complete without errors (app.js renders this tab eagerly).
  const trendChartIds = [
    'price-time-series-rent', 'price-time-series-sale',
    'price-time-series-district-rent', 'price-time-series-district-sale',
    'listing-count-time-series-district', 'listing-count-time-series-neighborhood',
    'rent-vs-sale-ratio', 'rent-vs-sale-ratio-time-series',
    'boxplot-by-neighborhood-rent', 'boxplot-by-neighborhood-sale',
  ];
  for (const id of trendChartIds) {
    panelTrendAnalysis.appendChild(make('div', { id }));
  }
  const districtsFieldset = new FakeElement('fieldset');
  districtsFieldset.setAttribute('data-scope-options', 'districts');
  const neighborhoodsFieldset = new FakeElement('fieldset');
  neighborhoodsFieldset.setAttribute('data-scope-options', 'neighborhoods');
  panelTrendAnalysis.appendChild(districtsFieldset);
  panelTrendAnalysis.appendChild(neighborhoodsFieldset);

  root.appendChild(make('div', { id: 'status-announcer' }));
  root.appendChild(tabTrendAnalysis);
  root.appendChild(tabPipelineHealth);
  root.appendChild(panelTrendAnalysis);
  root.appendChild(panelPipelineHealth);
  root.appendChild(dashboardError);
  root.appendChild(retryButton);
  root.appendChild(relevantLabel);
  root.appendChild(populationToggle);
  root.appendChild(scopeReset);
  root.appendChild(themeToggle);
  root.appendChild(languageMenu);

  const documentElement = new FakeElement('html');

  const fakeDocument = {
    documentElement,
    getElementById: (id) => registry.get(id) ?? null,
    querySelector: (selector) => root.querySelector(selector),
    querySelectorAll: (selector) => root.querySelectorAll(selector),
    createElement: (tag) => new FakeElement(tag),
  };

  return {
    fakeDocument, tabTrendAnalysis, tabPipelineHealth, panelTrendAnalysis, panelPipelineHealth,
    overallEl, sublightsEl, unavailableEl, diagramEl, chartContainers, captionEls, localeRadios,
    languageFieldset,
  };
}

function buildGoldFixture() {
  return {
    schema_version: '1.0',
    generated_at: '2026-06-01T12:00:00Z',
    scope_districts: ['Extramurs'],
    min_count: 5,
    relevant_filter: null,
    general: {
      price_time_series_neighborhood: [
        {
          operation: 'sale', district: 'Extramurs', neighborhood: 'Arrancapins',
          snapshot_date: '2026-05-01', count_listings: 12, mean_priceByArea: 2500.0,
        },
      ],
      price_time_series_district: [
        {
          operation: 'sale', district: 'Extramurs',
          snapshot_date: '2026-05-01', count_listings: 30, mean_priceByArea: 2400.0,
        },
      ],
      rent_vs_sale_ratio: [],
      rent_vs_sale_ratio_time_series: [],
      boxplot_by_neighborhood: [],
    },
    data_basis: {
      search_config: [],
      weekly_listing_volume: [],
      size_histogram_10sqm: [],
      rooms_distribution: [],
      price_per_area_histogram: [],
      listing_locations_last_3m: [],
    },
  };
}

function buildPipelineHealthV11Fixture() {
  return {
    schema_version: '1.1',
    generated_at: '2026-06-03T00:00:00Z',
    overall_status: 'yellow',
    execution_success: {
      status: 'green',
      details: {
        functions: {
          'bronze-collector': {
            status: 'green',
            recent_invocations: [
              { timestamp: '2026-06-01T00:00:00', succeeded: true, duration_seconds: 12.0 },
              { timestamp: '2026-06-02T00:00:00', succeeded: true, duration_seconds: 10.0 },
            ],
          },
        },
      },
    },
    execution_duration: {
      status: 'yellow',
      details: {
        functions: {
          'bronze-collector': {
            status: 'yellow',
            max_duration_seconds: 320,
            recent_invocations: [
              { timestamp: '2026-06-01T00:00:00', succeeded: true, duration_seconds: 100.0 },
              { timestamp: '2026-06-02T00:00:00', succeeded: true, duration_seconds: 320.0 },
            ],
          },
        },
      },
    },
    api_quota: {
      status: 'green',
      details: {
        credential_sets: {
          LVW: { status: 'green', label: 'sale', quota: 100, monthly_requests: { '2026-01': 40 } },
          PMV: { status: 'green', label: 'rent', quota: 100, monthly_requests: { '2026-01': 20 } },
        },
      },
    },
    aws_cost: {
      status: 'green',
      details: {
        included_total_usd: 1.2,
        excluded_total_usd: 0,
        excluded_services: [],
        excluded_services_configured: [],
        monthly_cost_by_service: [
          { month: '2026-01', services: { 'AWS Lambda': 1.0 } },
          { month: '2026-02', services: { 'AWS Lambda': 1.2 } },
        ],
      },
    },
  };
}

function buildPipelineHealthV10Fixture() {
  return {
    schema_version: '1.0',
    generated_at: '2026-05-01T00:00:00Z',
    overall_status: 'green',
    execution_success: { status: 'green', details: {} },
    execution_duration: { status: 'green', details: {} },
    api_quota: { status: 'green', details: {} },
    aws_cost: { status: 'green', details: {} },
  };
}

function makeFakeWindow(overrides = {}) {
  const listeners = new Map();
  let currentHash = '';
  return {
    CONFIG: {
      DATA_URL: 'https://example.invalid/latest.json',
      PIPELINE_HEALTH_URL: 'https://example.invalid/pipeline_health/latest.json',
    },
    innerWidth: 1024,
    localStorage: {
      _store: {},
      getItem(k) { return Object.prototype.hasOwnProperty.call(this._store, k) ? this._store[k] : null; },
      setItem(k, v) { this._store[k] = String(v); },
    },
    location: {
      get hash() { return currentHash; },
      set hash(v) { currentHash = v.startsWith('#') ? v : `#${v}`; },
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    dispatchEvent(event) {
      for (const fn of listeners.get(event.type) ?? []) fn(event);
    },
    ...overrides,
  };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// ---------------------------------------------------------------------------
// Scenario 1: v1.1 document — diagram + 4 charts + captions mount on first
// activation of the Pipeline Health tab.
// ---------------------------------------------------------------------------

describe('Pipeline Health tab detail views — v1.1 document (task 13.12)', () => {
  let harness;
  let plotlyNewPlot;
  let plotlyReact;

  beforeAll(async () => {
    vi.resetModules();
    harness = buildFakeDocument();
    const fakeWindow = makeFakeWindow();

    plotlyNewPlot = vi.fn(async () => {});
    plotlyReact = vi.fn(async () => {});
    const fakePlotly = { newPlot: plotlyNewPlot, react: plotlyReact, Plots: { resize: vi.fn() } };

    vi.stubGlobal('document', harness.fakeDocument);
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('Plotly', fakePlotly);
    vi.stubGlobal('fetch', vi.fn(async (url) => ({
      ok: true,
      json: async () => (String(url).includes('pipeline_health') ? buildPipelineHealthV11Fixture() : buildGoldFixture()),
    })));

    await import('../app.js');
    await settle();
    harness.tabPipelineHealth.dispatchEvent({ type: 'click' });
    await settle();
  });

  it('shows the overall badge and hides the unavailable message', () => {
    expect(harness.overallEl.hidden).toBe(false);
    expect(harness.unavailableEl.hidden).toBe(true);
  });

  it('renders the Medallion diagram markup', () => {
    expect(harness.diagramEl.innerHTML.length).toBeGreaterThan(0);
    expect(harness.diagramEl.innerHTML).toContain('<svg');
  });

  it('mounts all 4 detail charts via Plotly.newPlot', () => {
    for (const id of PIPELINE_CHART_IDS) {
      expect(plotlyNewPlot).toHaveBeenCalledWith(
        harness.chartContainers[id],
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    }
  });

  it('sets a non-empty threshold caption for every check', () => {
    for (const checkId of PIPELINE_CHECK_IDS) {
      expect(harness.captionEls[checkId].textContent.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: pipeline health fetch fails — unavailable state, Plotly never
// called for pipeline-health containers, diagram left empty.
// ---------------------------------------------------------------------------

describe('Pipeline Health tab detail views — load failure (task 13.12)', () => {
  let harness;
  let plotlyNewPlot;

  beforeAll(async () => {
    vi.resetModules();
    harness = buildFakeDocument();
    const fakeWindow = makeFakeWindow();

    plotlyNewPlot = vi.fn(async () => {});
    const fakePlotly = { newPlot: plotlyNewPlot, react: vi.fn(async () => {}), Plots: { resize: vi.fn() } };

    vi.stubGlobal('document', harness.fakeDocument);
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('Plotly', fakePlotly);
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('pipeline_health')) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      return { ok: true, json: async () => buildGoldFixture() };
    }));

    await import('../app.js');
    await settle();
    harness.tabPipelineHealth.dispatchEvent({ type: 'click' });
    await settle();
  });

  it('shows the unavailable message and hides the overall badge/sublights', () => {
    expect(harness.unavailableEl.hidden).toBe(false);
    expect(harness.overallEl.hidden).toBe(true);
    expect(harness.sublightsEl.hidden).toBe(true);
  });

  it('never calls Plotly for any pipeline-health chart container', () => {
    const pipelineCalls = plotlyNewPlot.mock.calls.filter(([container]) =>
      Object.values(harness.chartContainers).includes(container),
    );
    expect(pipelineCalls).toHaveLength(0);
  });

  it('leaves the diagram container empty', () => {
    expect(harness.diagramEl.innerHTML).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: legacy v1.0 pipeline health document — must not crash; charts
// render with empty/neutral data instead of throwing.
// ---------------------------------------------------------------------------

describe('Pipeline Health tab detail views — legacy v1.0 document (task 13.12)', () => {
  let harness;

  beforeAll(async () => {
    vi.resetModules();
    harness = buildFakeDocument();
    const fakeWindow = makeFakeWindow();
    const fakePlotly = { newPlot: vi.fn(async () => {}), react: vi.fn(async () => {}), Plots: { resize: vi.fn() } };

    vi.stubGlobal('document', harness.fakeDocument);
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('Plotly', fakePlotly);
    vi.stubGlobal('fetch', vi.fn(async (url) => ({
      ok: true,
      json: async () => (String(url).includes('pipeline_health') ? buildPipelineHealthV10Fixture() : buildGoldFixture()),
    })));

    await import('../app.js');
    await settle();
    harness.tabPipelineHealth.dispatchEvent({ type: 'click' });
    await settle();
  });

  it('does not throw and still shows the overall badge', () => {
    expect(harness.overallEl.hidden).toBe(false);
    expect(harness.unavailableEl.hidden).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: locale change re-renders pipeline-health charts via
// Plotly.react (not newPlot again) without refetching the document.
// ---------------------------------------------------------------------------

describe('Pipeline Health tab detail views — locale change re-render (task 13.12)', () => {
  let harness;
  let plotlyNewPlot;
  let plotlyReact;
  let fetchSpy;

  beforeAll(async () => {
    vi.resetModules();
    harness = buildFakeDocument();
    const fakeWindow = makeFakeWindow();

    plotlyNewPlot = vi.fn(async () => {});
    plotlyReact = vi.fn(async () => {});
    const fakePlotly = { newPlot: plotlyNewPlot, react: plotlyReact, Plots: { resize: vi.fn() } };

    fetchSpy = vi.fn(async (url) => ({
      ok: true,
      json: async () => (String(url).includes('pipeline_health') ? buildPipelineHealthV11Fixture() : buildGoldFixture()),
    }));

    vi.stubGlobal('document', harness.fakeDocument);
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('Plotly', fakePlotly);
    vi.stubGlobal('fetch', fetchSpy);

    await import('../app.js');
    await settle();
    harness.tabPipelineHealth.dispatchEvent({ type: 'click' });
    await settle();
  });

  it('re-renders the 4 detail charts via Plotly.react (not newPlot again) and does not refetch on locale change', async () => {
    const fetchCallsBefore = fetchSpy.mock.calls.length;
    const newPlotCallsBefore = plotlyNewPlot.mock.calls.length;

    const deRadio = harness.localeRadios.de;
    deRadio.checked = true;
    harness.languageFieldset.dispatchEvent({ type: 'change', target: deRadio });
    await settle();

    for (const id of PIPELINE_CHART_IDS) {
      expect(plotlyReact).toHaveBeenCalledWith(
        harness.chartContainers[id],
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    }
    expect(plotlyNewPlot.mock.calls.length).toBe(newPlotCallsBefore);
    expect(fetchSpy.mock.calls.length).toBe(fetchCallsBefore);
  });

  it('translates the threshold captions for the new locale', () => {
    for (const checkId of PIPELINE_CHECK_IDS) {
      expect(harness.captionEls[checkId].textContent.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario: FEATURE-014 task 14.6 — listing-count-over-time charts wired
// into the Trend Analysis tab alongside the existing general-only charts.
// ---------------------------------------------------------------------------

describe('Trend Analysis tab — listing count charts (FEATURE-014, task 14.6)', () => {
  let harness;
  let plotlyNewPlot;

  beforeAll(async () => {
    vi.resetModules();
    harness = buildFakeDocument();
    const fakeWindow = makeFakeWindow();

    plotlyNewPlot = vi.fn(async () => {});
    const fakePlotly = { newPlot: plotlyNewPlot, react: vi.fn(async () => {}), Plots: { resize: vi.fn() } };

    vi.stubGlobal('document', harness.fakeDocument);
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('Plotly', fakePlotly);
    vi.stubGlobal('fetch', vi.fn(async (url) => ({
      ok: true,
      json: async () => (String(url).includes('pipeline_health') ? buildPipelineHealthV11Fixture() : buildGoldFixture()),
    })));

    await import('../app.js');
    await settle();
  });

  it('mounts both listing-count charts via Plotly.newPlot alongside the existing general-only charts', () => {
    expect(plotlyNewPlot).toHaveBeenCalledWith(
      harness.fakeDocument.getElementById('listing-count-time-series-district'),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(plotlyNewPlot).toHaveBeenCalledWith(
      harness.fakeDocument.getElementById('listing-count-time-series-neighborhood'),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    // Existing Trend Analysis charts remain unaffected.
    expect(plotlyNewPlot).toHaveBeenCalledWith(
      harness.fakeDocument.getElementById('price-time-series-district-rent'),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });
});
