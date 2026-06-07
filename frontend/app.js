/**
 * App entry point — wires the DataSource, renderers, and Dashboard.
 *
 * window.CONFIG.DATA_URL is injected per-environment (dev/prod) either inline
 * in index.html or via a config.js sync'd by the deploy workflow.
 */

import { DataSource } from './src/data_source.js';
import { Dashboard } from './src/dashboard.js';
import { priceTimeSeriesRenderer } from './src/charts/price_time_series.js';

const dataSource = new DataSource(window.CONFIG.DATA_URL);

const dashboard = new Dashboard(dataSource, [
  priceTimeSeriesRenderer,
]);

const containers = {
  'price-time-series': document.getElementById('price-time-series'),
};

dashboard.mount(containers).catch((err) => {
  console.error('[Dashboard] Failed to render:', err);
});
