/**
 * app_tab_wiring.test.js — integration test for the tab-navigation wiring in
 * app.js (task 11.10): tab clicks, hashchange deep-linking, lazy Data Basis
 * rendering, and Plotly.Plots.resize on tab re-activation.
 *
 * app.js is a browser entry point (no exports, side effects at import time),
 * so this test builds a small, purpose-built fake DOM/window sufficient to
 * import and exercise it end-to-end — no jsdom/happy-dom dependency is
 * available/allowed for this task (see technical plan allowed_files), and
 * app.js itself stays free of any test-only exports/hooks.
 *
 * The fake DOM only supports the (small) subset of selector syntax app.js
 * actually uses: `#id`, `.class`, `[attr]`/`[attr="value"]`, plain tag
 * names, and a single descendant combinator (`A B`). Every other app.js
 * selector call is written defensively with `?.` in production code, so an
 * unsupported/no-match selector simply resolves to null/[] there, matching
 * real DOM behaviour for "not found".
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal fake DOM
// ---------------------------------------------------------------------------

class FakeClassList {
  constructor(el) {
    this._el = el;
    this._set = new Set();
  }
  add(...names) { for (const n of names) this._set.add(n); }
  remove(...names) { for (const n of names) this._set.delete(n); }
  contains(name) { return this._set.has(name); }
  toggle(name, force) {
    const has = this._set.has(name);
    const next = force === undefined ? !has : force;
    if (next) this._set.add(name); else this._set.delete(name);
    return next;
  }
  get value() { return [...this._set].join(' '); }
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
    this.classList = new FakeClassList(this);
    this._hidden = false;
    this._textContent = '';
    this.tabIndex = 0;
    if (className) {
      for (const c of className.split(/\s+/).filter(Boolean)) this.classList.add(c);
    }
  }

  get hidden() { return this._hidden; }
  set hidden(v) { this._hidden = Boolean(v); }

  get textContent() { return this._textContent; }
  set textContent(v) {
    this._textContent = String(v);
    this.children = [];
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name.startsWith('data-')) {
      this.dataset[toCamelCase(name.slice(5))] = String(value);
    }
    if (name === 'hidden') this._hidden = true;
  }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); if (name === 'hidden') this._hidden = false; }
  toggleAttribute(name, force) {
    const has = this.hasAttribute(name);
    const next = force === undefined ? !has : force;
    if (next) this.setAttribute(name, ''); else this.removeAttribute(name);
    return next;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  append(...nodes) { for (const n of nodes) this.appendChild(n); }
  remove() {
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter((c) => c !== this);
      this.parentElement = null;
    }
  }

  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { this._listeners.get(type)?.delete(fn); }
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

function toCamelCase(str) {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/** Parse a single compound selector (no combinators) into a matcher. */
function matchesCompound(el, compound) {
  // Attribute selectors: [attr] or [attr="value"]
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
  // Id selector
  const idMatch = rest.match(/#([\w-]+)/);
  if (idMatch) {
    if (el.id !== idMatch[1]) return false;
    rest = rest.replace(idMatch[0], '');
  }
  // Class selectors (possibly several)
  const classMatches = [...rest.matchAll(/\.([\w-]+)/g)];
  for (const cm of classMatches) {
    if (!el.classList.contains(cm[1])) return false;
    rest = rest.replace(cm[0], '');
  }
  // Remaining text, if any, is a tag name.
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
  if (parts.length === 1) {
    return universe.filter((el) => matchesCompound(el, parts[0]));
  }
  // Only descendant-combinator chains are supported (sufficient for app.js).
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

function buildFakeDocument() {
  const root = new FakeElement('html');
  const registry = new Map();

  function register(el) {
    if (el.id) registry.set(el.id, el);
  }

  function make(tagName, opts) {
    const el = new FakeElement(tagName, opts);
    register(el);
    return el;
  }

  // --- Build the page structure app.js expects ---
  const statusAnnouncer = make('div', { id: 'status-announcer' });
  const tabTrendAnalysis = make('button', { id: 'tab-trend-analysis', className: 'tab-button' });
  tabTrendAnalysis.dataset.tabId = 'trend-analysis';
  tabTrendAnalysis.setAttribute('data-tab-id', 'trend-analysis');
  const tabDataBasis = make('button', { id: 'tab-data-basis', className: 'tab-button' });
  tabDataBasis.dataset.tabId = 'data-basis';
  tabDataBasis.setAttribute('data-tab-id', 'data-basis');

  const panelTrendAnalysis = make('section', { id: 'panel-trend-analysis', className: 'tab-panel' });
  const panelDataBasis = make('section', { id: 'panel-data-basis', className: 'tab-panel' });
  panelDataBasis.hidden = true;

  const dashboardError = make('div', { id: 'dashboard-error' });
  dashboardError.hidden = true;
  const retryButton = make('button', { id: 'retry-button' });
  const relevantLabel = make('span', { id: 'relevant-label' });
  const populationToggle = make('div', { id: 'population-toggle' });
  const scopeReset = make('button', { id: 'scope-reset' });
  const themeToggle = make('button', { id: 'theme-toggle' });
  const languageMenu = make('details', { id: 'language-menu' });

  const chartIds = [
    'price-time-series-rent', 'price-time-series-sale',
    'price-time-series-district-rent', 'price-time-series-district-sale',
    'rent-vs-sale-ratio', 'rent-vs-sale-ratio-time-series',
    'boxplot-by-neighborhood-rent', 'boxplot-by-neighborhood-sale',
    'weekly-listing-volume', 'size-histogram', 'rooms-distribution',
    'price-per-area-histogram-rent', 'price-per-area-histogram-sale',
    'listing-locations-map',
  ];
  const chartContainers = {};
  for (const id of chartIds) {
    const section = make('section', { className: 'chart-section' });
    const container = make('div', { id, className: 'chart-container' });
    section.appendChild(container);
    chartContainers[id] = container;
    (id.startsWith('price-time-series') || id.startsWith('rent-vs-sale') || id.startsWith('boxplot')
      ? panelTrendAnalysis
      : panelDataBasis
    ).appendChild(section);
  }

  const searchConfigDl = make('dl', { id: 'data-basis-search-config' });
  panelDataBasis.appendChild(searchConfigDl);

  const districtsFieldset = new FakeElement('fieldset');
  districtsFieldset.setAttribute('data-scope-options', 'districts');
  const neighborhoodsFieldset = new FakeElement('fieldset');
  neighborhoodsFieldset.setAttribute('data-scope-options', 'neighborhoods');
  panelTrendAnalysis.appendChild(districtsFieldset);
  panelTrendAnalysis.appendChild(neighborhoodsFieldset);

  root.appendChild(statusAnnouncer);
  root.appendChild(tabTrendAnalysis);
  root.appendChild(tabDataBasis);
  root.appendChild(panelTrendAnalysis);
  root.appendChild(panelDataBasis);
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
    fakeDocument,
    tabTrendAnalysis,
    tabDataBasis,
    panelTrendAnalysis,
    panelDataBasis,
    chartContainers,
    districtsFieldset,
  };
}

function buildFixture() {
  return {
    schema_version: '1.0',
    generated_at: '2026-06-01T12:00:00Z',
    scope_districts: ['Extramurs'],
    min_count: 5,
    relevant_filter: null,
    general: {
      price_time_series_neighborhood: [
        { district: 'Extramurs', neighborhood: 'La Petxina', snapshot_date: '2026-01-05', operation: 'rent', median_price_eur_m2: 12 },
      ],
      price_time_series_district: [],
      rent_vs_sale_ratio: [],
      rent_vs_sale_ratio_time_series: [],
      boxplot_by_neighborhood: [],
    },
    data_basis: {
      search_config: [
        { center_lat: 39.4693441, center_lon: -0.379561, distance_m: 1500, min_size_m2: 100, max_size_m2: 160, elevator: true, preservation: 'good', property_type: 'homes', sale_credential_label: 'LVW', rent_credential_label: 'PMV' },
      ],
      weekly_listing_volume: [{ operation: 'sale', snapshot_date: '2026-01-05', count_listings: 10 }],
      size_histogram_10sqm: [{ operation: 'sale', bin_start_m2: 100, bin_end_m2: 110, count_listings: 5 }],
      rooms_distribution: [{ operation: 'sale', rooms: 2, count_listings: 5 }],
      price_per_area_histogram: [{ operation: 'sale', bin_start_price_m2: 2250, bin_end_price_m2: 2500, count_listings: 5 }],
      listing_locations_last_3m: [{ operation: 'sale', district: 'Extramurs', neighborhood: 'La Petxina', latitude: 39.474, longitude: -0.39 }],
    },
  };
}

let harness;
let plotlyNewPlot;
let plotlyReact;
let plotlyResize;

const DATA_BASIS_CONTAINER_IDS = [
  'weekly-listing-volume', 'size-histogram', 'rooms-distribution',
  'price-per-area-histogram-rent', 'price-per-area-histogram-sale',
  'listing-locations-map',
];

beforeAll(async () => {
  const { fakeDocument, tabTrendAnalysis, tabDataBasis, panelTrendAnalysis, panelDataBasis, chartContainers, districtsFieldset } = buildFakeDocument();

  const listeners = new Map();
  let currentHash = '';
  const fakeWindow = {
    CONFIG: { DATA_URL: 'https://example.invalid/latest.json' },
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
  };

  plotlyNewPlot = vi.fn(async () => {});
  plotlyReact = vi.fn(async () => {});
  plotlyResize = vi.fn();
  const fakePlotly = { newPlot: plotlyNewPlot, react: plotlyReact, Plots: { resize: plotlyResize } };

  vi.stubGlobal('document', fakeDocument);
  vi.stubGlobal('window', fakeWindow);
  vi.stubGlobal('Plotly', fakePlotly);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => buildFixture() })));

  harness = { fakeWindow, tabTrendAnalysis, tabDataBasis, panelTrendAnalysis, panelDataBasis, chartContainers, listeners, districtsFieldset };

  await import('../app.js');
  // Let the fire-and-forget async run()/renderDataBasisTab() promise chains settle.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe('app.js tab wiring (task 11.10)', () => {
  it('starts on the Trend Analysis tab with Data Basis panel hidden', () => {
    expect(harness.tabTrendAnalysis.getAttribute('aria-selected')).toBe('true');
    expect(harness.tabDataBasis.getAttribute('aria-selected')).toBe('false');
    expect(harness.panelDataBasis.hidden).toBe(true);
    expect(harness.panelTrendAnalysis.hidden).toBe(false);
  });

  it('does not render any Data Basis chart before its panel has ever been visible', () => {
    const dataBasisCalls = plotlyNewPlot.mock.calls.filter(([container]) =>
      container === harness.chartContainers['weekly-listing-volume'] ||
      container === harness.chartContainers['listing-locations-map'],
    );
    expect(dataBasisCalls).toHaveLength(0);
  });

  it('a tab click activates Data Basis: aria-selected, hidden panels, and hash update', () => {
    harness.tabDataBasis.dispatchEvent({ type: 'click' });
    expect(harness.tabDataBasis.getAttribute('aria-selected')).toBe('true');
    expect(harness.tabTrendAnalysis.getAttribute('aria-selected')).toBe('false');
    expect(harness.panelDataBasis.hidden).toBe(false);
    expect(harness.panelTrendAnalysis.hidden).toBe(true);
    expect(harness.fakeWindow.location.hash).toBe('#data-basis');
  });

  it('lazily renders every Data Basis chart the first time its panel becomes visible', async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(plotlyNewPlot).toHaveBeenCalledWith(
      harness.chartContainers['weekly-listing-volume'],
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(plotlyNewPlot).toHaveBeenCalledWith(
      harness.chartContainers['listing-locations-map'],
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('calls Plotly.Plots.resize (not newPlot again) when re-activating an already-rendered tab', () => {
    const newPlotCallsBefore = plotlyNewPlot.mock.calls.length;
    harness.tabTrendAnalysis.dispatchEvent({ type: 'click' });
    harness.tabDataBasis.dispatchEvent({ type: 'click' });
    expect(plotlyResize).toHaveBeenCalledWith(harness.chartContainers['weekly-listing-volume']);
    expect(plotlyResize).toHaveBeenCalledWith(harness.chartContainers['listing-locations-map']);
    expect(plotlyNewPlot.mock.calls.length).toBe(newPlotCallsBefore);
  });

  it('hashchange deep-links to Trend Analysis or Data Basis', () => {
    harness.fakeWindow.location.hash = '#trend-analysis';
    harness.fakeWindow.dispatchEvent({ type: 'hashchange' });
    expect(harness.tabTrendAnalysis.getAttribute('aria-selected')).toBe('true');
    expect(harness.panelDataBasis.hidden).toBe(true);

    harness.fakeWindow.location.hash = '#data-basis';
    harness.fakeWindow.dispatchEvent({ type: 'hashchange' });
    expect(harness.tabDataBasis.getAttribute('aria-selected')).toBe('true');
    expect(harness.panelDataBasis.hidden).toBe(false);
  });

  it('district/neighbourhood scope filter changes never re-render Data Basis charts', async () => {
    const checkbox = harness.districtsFieldset.querySelector('input');
    expect(checkbox).toBeTruthy();
    const newPlotCallsBefore = plotlyNewPlot.mock.calls.length;
    const reactCallsBefore = plotlyReact.mock.calls.length;
    checkbox.checked = true;
    checkbox.dispatchEvent({ type: 'change', target: checkbox });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const dataBasisContainers = new Set(DATA_BASIS_CONTAINER_IDS.map((id) => harness.chartContainers[id]));
    const touchedDataBasisContainers = [...plotlyNewPlot.mock.calls, ...plotlyReact.mock.calls]
      .slice(newPlotCallsBefore + reactCallsBefore)
      .some(([container]) => dataBasisContainers.has(container));
    expect(touchedDataBasisContainers).toBe(false);
  });

  it('an invalid hash falls back to Trend Analysis safely', () => {
    harness.fakeWindow.location.hash = '#not-a-real-tab';
    harness.fakeWindow.dispatchEvent({ type: 'hashchange' });
    expect(harness.tabTrendAnalysis.getAttribute('aria-selected')).toBe('true');
    expect(harness.panelTrendAnalysis.hidden).toBe(false);
  });
});
