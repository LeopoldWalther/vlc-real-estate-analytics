/**
 * App entry point — wires the DataSource, renderers, and Dashboard.
 *
 * window.CONFIG.DATA_URL is injected per-environment (dev/prod) either inline
 * in index.html or via a config.js sync'd by the deploy workflow.
 */

import { DataSource } from './src/data_source.js';
import { Dashboard } from './src/dashboard.js';
import { priceTimeSeriesRenderer } from './src/charts/price_time_series.js';
import { priceTimeSeriesDistrictRenderer } from './src/charts/price_time_series_district.js';
import { rentVsSaleRatioRenderer } from './src/charts/rent_vs_sale_ratio.js';
import { ratioTimeSeriesRenderer } from './src/charts/rent_vs_sale_ratio_time_series.js';
import { boxplotRenderer } from './src/charts/boxplot_by_neighborhood.js';

// Renderers that exist in both 'general' and 'relevant' populations.
// The population toggle switches which block is passed to render().
const TOGGLE_RENDERERS = [
  rentVsSaleRatioRenderer,
  ratioTimeSeriesRenderer,
  boxplotRenderer,
];

// Renderers only available in the 'general' population block.
const GENERAL_ONLY_RENDERERS = [
  priceTimeSeriesRenderer,
  priceTimeSeriesDistrictRenderer,
];

const ALL_RENDERERS = [...GENERAL_ONLY_RENDERERS, ...TOGGLE_RENDERERS];

const containers = {
  'price-time-series':          document.getElementById('price-time-series'),
  'price-time-series-district': document.getElementById('price-time-series-district'),
  'rent-vs-sale-ratio':         document.getElementById('rent-vs-sale-ratio'),
  'rent-vs-sale-ratio-time-series': document.getElementById('rent-vs-sale-ratio-time-series'),
  'boxplot-by-neighborhood':    document.getElementById('boxplot-by-neighborhood'),
};

const dataSource = new DataSource(window.CONFIG.DATA_URL);

// Active population — starts on 'general'; toggle switches to 'relevant'.
let activePopulation = 'general';
let cachedData = null;

/**
 * Mount all renderers using the currently active population block.
 * general-only renderers always receive data.general.
 */
function mountAll(data) {
  const pop = data[activePopulation];

  for (const renderer of GENERAL_ONLY_RENDERERS) {
    const container = containers[renderer.id];
    if (!container) continue;
    globalThis.Plotly.newPlot(container, ...Object.values(renderer.render(data.general)).map(Object.values).flat());
  }

  // Use the Dashboard for toggle-able renderers so the same wiring applies.
  const toggleDash = new (class {
    constructor() { this._renderers = TOGGLE_RENDERERS; }
    mount() {
      for (const r of this._renderers) {
        const c = containers[r.id];
        if (!c) continue;
        const fig = r.render(pop);
        globalThis.Plotly.newPlot(c, fig.data, fig.layout);
      }
    }
  })();
  toggleDash.mount();
}

// Simpler: use Dashboard directly for all renderers, adapting population per renderer.
// Replace the above with a single clean pass:
async function run() {
  cachedData = await dataSource.load();

  for (const renderer of ALL_RENDERERS) {
    const container = containers[renderer.id];
    if (!container) continue;
    const block = GENERAL_ONLY_RENDERERS.includes(renderer)
      ? cachedData.general
      : cachedData[activePopulation];
    const fig = renderer.render(block);
    globalThis.Plotly.newPlot(container, fig.data, fig.layout);
  }

  // Show the toggle only when 'relevant' data is present.
  const toggleEl = document.getElementById('population-toggle');
  if (toggleEl && cachedData.relevant) {
    toggleEl.style.display = 'flex';
    toggleEl.addEventListener('change', (e) => {
      activePopulation = e.target.value;
      for (const renderer of TOGGLE_RENDERERS) {
        const container = containers[renderer.id];
        if (!container) continue;
        const fig = renderer.render(cachedData[activePopulation]);
        globalThis.Plotly.react(container, fig.data, fig.layout);
      }
    });
  }
}

run().catch((err) => {
  console.error('[Dashboard] Failed to render:', err);
});
