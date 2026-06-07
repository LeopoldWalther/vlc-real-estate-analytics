/**
 * Dashboard — orchestrates the DataSource and all ChartRenderers.
 *
 * Design pattern: Single Responsibility.
 *   The Dashboard wires a DataSource to a list of renderers and mounts each
 *   into its container. It owns no transform logic and no fetch logic.
 *
 * Dependency Inversion: receives a DataSource (or FakeDataSource in tests)
 *   via constructor — never imports fetch or AWS SDK directly.
 *
 * Plotly is a browser global loaded via vendor/plotly.min.js <script> before
 * the app module. In unit tests it is injected via vi.stubGlobal('Plotly', …).
 */

export class Dashboard {
  /**
   * @param {object} dataSource - An object with a load() method returning a
   *   Promise that resolves to a validated schema-v1.0 gold JSON object.
   *   Pass a FakeDataSource in tests; a real DataSource in production.
   * @param {Array<{ id: string, title: string, render: function }>} renderers -
   *   Ordered list of ChartRenderer objects (Strategy pattern). Each renderer
   *   receives the active population block and returns a Plotly figure descriptor.
   */
  constructor(dataSource, renderers) {
    this._dataSource = dataSource;
    this._renderers = renderers;
  }

  /**
   * Load gold data and mount every renderer into its container.
   *
   * Renderers whose id is absent from the containers map are silently skipped
   * so adding a renderer before its placeholder exists is safe.
   *
   * @param {Object.<string, Element|object>} containers - Map of renderer id
   *   to the DOM element (or plain object in tests) for Plotly to render into.
   * @returns {Promise<void>}
   * @throws {Error} Re-throws any DataSource.load() or Plotly error to the caller.
   */
  async mount(containers) {
    const data = await this._dataSource.load();

    for (const renderer of this._renderers) {
      const container = containers[renderer.id];

      // Skip renderers that don't yet have a placeholder in the page.
      if (!container) {
        continue;
      }

      const figure = renderer.render(data.general);

      // CRITICAL: Plotly is a browser global; loaded before this module via
      // <script src="vendor/plotly.min.js">. Accessed via globalThis so tests
      // can inject it with vi.stubGlobal without a module-level import.
      globalThis.Plotly.newPlot(container, figure.data, figure.layout);
    }
  }
}
