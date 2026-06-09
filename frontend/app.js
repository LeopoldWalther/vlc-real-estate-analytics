/**
 * App entry point — wires the DataSource and all chart renderers.
 *
 * window.CONFIG.DATA_URL is injected per-environment (dev/prod) either inline
 * in index.html or via a config.js sync'd by the deploy workflow.
 *
 * Orchestration lives entirely in run(): load gold data, render every chart,
 * then attach the population toggle for the four charts that support it.
 */

import { DataSource } from './src/data_source.js';
import { priceTimeSeriesRentRenderer, priceTimeSeriesSaleRenderer } from './src/charts/price_time_series.js';
import { priceTimeSeriesDistrictRentRenderer, priceTimeSeriesDistrictSaleRenderer } from './src/charts/price_time_series_district.js';
import { rentVsSaleRatioRenderer } from './src/charts/rent_vs_sale_ratio.js';
import { ratioTimeSeriesRenderer } from './src/charts/rent_vs_sale_ratio_time_series.js';
import { boxplotRentRenderer, boxplotSaleRenderer } from './src/charts/boxplot_by_neighborhood.js';

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

const dataSource = new DataSource(window.CONFIG.DATA_URL);

// Active population — starts on 'general'; toggle switches to 'relevant'.
let activePopulation = 'general';
let cachedData = null;

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
 * Load the gold data once, then render every chart. General-only renderers
 * always receive data.general; toggle renderers receive the active population.
 */
async function run() {
  cachedData = await dataSource.load();

  // Update the toggle label to show the actual filter criteria.
  const relevantLabelEl = document.getElementById('relevant-label');
  if (relevantLabelEl && cachedData.relevant_filter) {
    relevantLabelEl.textContent = buildRelevantLabel(cachedData.relevant_filter);
  }

  for (const renderer of ALL_RENDERERS) {
    const container = containers[renderer.id];
    if (!container) continue;
    const isToggle = TOGGLE_RENDERERS.includes(renderer);
    const block = isToggle ? cachedData[activePopulation] : cachedData.general;
    const fig = renderer.render(block);
    // Stamp the active population into toggle-chart titles so users can see
    // the switch take effect even before scrolling to changed data points.
    if (isToggle) {
      const popLabel = activePopulation === 'general'
        ? 'All listings'
        : buildRelevantLabel(cachedData.relevant_filter);
      fig.layout.title = { text: `${renderer.title} — ${popLabel}` };
    }
    // Await each Plotly call so errors in one chart do not silently stop
    // subsequent renders, and sequential rendering avoids any shared-state race.
    try {
      await globalThis.Plotly.newPlot(container, fig.data, fig.layout);
    } catch (err) {
      console.error(`[Dashboard] Failed to render chart '${renderer.id}':`, err);
    }
  }

  // Show the toggle only when 'relevant' data is present.
  const toggleEl = document.getElementById('population-toggle');
  if (toggleEl && cachedData.relevant) {
    toggleEl.style.display = 'flex';
    toggleEl.addEventListener('change', async (e) => {
      activePopulation = e.target.value;
      for (const renderer of TOGGLE_RENDERERS) {
        const container = containers[renderer.id];
        if (!container) continue;
        const fig = renderer.render(cachedData[activePopulation]);
        // Update title to reflect the newly active population.
        const popLabel = activePopulation === 'general'
          ? 'All listings'
          : buildRelevantLabel(cachedData.relevant_filter);
        fig.layout.title = { text: `${renderer.title} — ${popLabel}` };
        try {
          await globalThis.Plotly.react(container, fig.data, fig.layout);
        } catch (err) {
          console.error(`[Dashboard] Failed to re-render chart '${renderer.id}':`, err);
        }
      }
    });
  }
}

run().catch((err) => {
  console.error('[Dashboard] Failed to render:', err);
});
