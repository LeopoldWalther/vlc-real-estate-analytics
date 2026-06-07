/**
 * DataSource adapter and in-memory fake for the gold aggregations JSON.
 *
 * Wraps fetch() (or a fixture) behind a stable load() interface so tests and
 * renderers depend on the interface, not on the network.
 *
 * Design patterns (FEATURE-005):
 *   Adapter     — wraps fetch() behind a project-owned interface.
 *   Dependency Inversion — Dashboard depends on this interface; tests inject
 *                          FakeDataSource so no real network is needed.
 *
 * Supported schema_version: '1.0' (frozen by FEATURE-004).
 */

const SUPPORTED_SCHEMA_VERSION = '1.0';

/**
 * Assert that the parsed JSON declares schema_version '1.0'.
 *
 * Fails loudly so a gold-schema bump cannot silently render a broken
 * dashboard.
 *
 * @param {object} data - Parsed JSON object.
 * @throws {Error} If schema_version is absent or does not equal '1.0'.
 */
function _assertSchemaVersion(data) {
  if (data.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported schema_version '${data.schema_version}'. ` +
        `Expected '${SUPPORTED_SCHEMA_VERSION}'.`
    );
  }
}

/**
 * DataSource — fetches and validates the gold aggregations JSON from a URL.
 *
 * Callers (Dashboard) receive this via constructor injection; tests inject
 * FakeDataSource so no network is involved in unit tests.
 */
export class DataSource {
  /**
   * @param {string} url - URL of the gold/aggregations/latest.json file,
   *   set via window.CONFIG.DATA_URL in the page.
   */
  constructor(url) {
    this._url = url;
  }

  /**
   * Fetch and validate the aggregations JSON.
   *
   * @returns {Promise<object>} The validated gold aggregations object (schema v1.0).
   * @throws {Error} On HTTP failure or schema_version mismatch.
   */
  async load() {
    const response = await fetch(this._url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching data from ${this._url}`);
    }
    const data = await response.json();
    _assertSchemaVersion(data);
    return data;
  }
}

/**
 * FakeDataSource — returns a pre-built fixture without any network call.
 *
 * Satisfies the same load() interface as DataSource (polymorphism) so the
 * Dashboard and renderers run unchanged in tests.
 */
export class FakeDataSource {
  /**
   * @param {object} fixture - An object conforming to schema v1.0.
   */
  constructor(fixture) {
    this._fixture = fixture;
  }

  /**
   * Return the fixture, applying the same schema_version check as DataSource.
   *
   * @returns {Promise<object>} The fixture object (schema v1.0).
   * @throws {Error} If the fixture declares a mismatched schema_version.
   */
  async load() {
    _assertSchemaVersion(this._fixture);
    return this._fixture;
  }
}
