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
 * Supported schema_version: '1.0' and '1.1' (FEATURE-013, task 13.4 — the
 * frontend must tolerate both during the v1.1 backend rollout window).
 */

const SUPPORTED_SCHEMA_VERSIONS = ['1.0', '1.1'];

/**
 * Assert that the parsed JSON declares a supported schema_version.
 *
 * @param {object} data - Parsed JSON object.
 * @throws {Error} If schema_version is absent or not one of
 *   SUPPORTED_SCHEMA_VERSIONS.
 */
function _assertSchemaVersion(data) {
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(data.schema_version)) {
    throw new Error(
      `Unsupported schema_version '${data.schema_version}'. ` +
        `Expected one of: ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}.`
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
   * @returns {Promise<object>} The validated pipeline-health document (schema v1.0 or v1.1).
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
