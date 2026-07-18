/**
 * PipelineHealthDataSource — fetches and validates the pipeline-health JSON
 * (gold/pipeline_health/latest.json) written by
 * PipelineHealthAggregator (FEATURE-012, task 12.8).
 *
 * Mirrors data_source.js's Adapter pattern exactly: wraps fetch() behind a
 * stable load() interface so app.js and tests depend on the interface, not
 * on the network.
 *
 * Unlike DataSource, this data source additionally exposes
 * loadOrUnavailable(): Pipeline Health is a supplementary, best-effort tab,
 * so any HTTP/JSON/schema/network failure must degrade to a neutral "not
 * yet available" state rather than throwing uncaught into app.js (task
 * 12.11 acceptance criterion).
 *
 * Supported schema_version: '1.0' (pipeline_health_aggregator.SCHEMA_VERSION).
 */

const SUPPORTED_SCHEMA_VERSION = '1.0';

/**
 * Assert that the parsed JSON declares schema_version '1.0'.
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
 * PipelineHealthDataSource — fetches and validates the pipeline-health JSON
 * from a URL.
 */
export class PipelineHealthDataSource {
  /**
   * @param {string} url - URL of the gold/pipeline_health/latest.json file.
   */
  constructor(url) {
    this._url = url;
  }

  /**
   * Fetch and validate the pipeline-health JSON.
   *
   * @returns {Promise<object>} The validated pipeline-health document (schema v1.0).
   * @throws {Error} On HTTP failure, network error, malformed JSON, or
   *   schema_version mismatch.
   */
  async load() {
    const response = await fetch(this._url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching pipeline health from ${this._url}`);
    }
    const data = await response.json();
    _assertSchemaVersion(data);
    return data;
  }

  /**
   * Safe wrapper around load(): resolves with the validated document on
   * success, or with `null` on ANY failure (HTTP error, network error,
   * malformed JSON, schema_version mismatch) — never rejects.
   *
   * @returns {Promise<object|null>}
   */
  async loadOrUnavailable() {
    try {
      return await this.load();
    } catch (err) {
      console.error('[PipelineHealthDataSource] Pipeline health unavailable:', err);
      return null;
    }
  }
}
