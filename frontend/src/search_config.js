/**
 * search_config.js — pure formatter for data_basis.search_config (schema
 * v1.0, FEATURE-011).
 *
 * Design intent: mirrors summary.js's formatKpi pattern — no DOM access.
 * app.js renders the returned rows as plain i18n'd text/definition-list
 * markup; this module only decides *what* rows exist and their
 * locale-appropriate label/value text.
 */

import { t } from './i18n.js';

/**
 * Format a single `data_basis.search_config[0]` record into an ordered list
 * of `{ key, label, value }` rows, ready for a definition-list-style
 * rendering. Missing fields are skipped rather than emitting a broken row;
 * a null/undefined `searchConfig` returns an empty array.
 *
 * @param {{
 *   center_lat?: number,
 *   center_lon?: number,
 *   distance_m?: number,
 *   min_size_m2?: number,
 *   max_size_m2?: number,
 *   elevator?: boolean,
 *   preservation?: string,
 *   property_type?: string,
 *   sale_credential_label?: string,
 *   rent_credential_label?: string,
 * }|null|undefined} searchConfig
 * @param {string} [locale] - One of SUPPORTED_LOCALES; defaults to 'en'.
 * @returns {Array<{key: string, label: string, value: string}>}
 */
export function formatSearchConfigSummary(searchConfig, locale = 'en') {
  if (!searchConfig) return [];

  const rows = [];

  if (searchConfig.distance_m != null) {
    rows.push({
      key: 'radius',
      label: t(locale, 'dataBasis.searchConfig.radius'),
      value: `${searchConfig.distance_m} m`,
    });
  }

  if (searchConfig.min_size_m2 != null && searchConfig.max_size_m2 != null) {
    rows.push({
      key: 'sizeRange',
      label: t(locale, 'dataBasis.searchConfig.sizeRange'),
      value: `${searchConfig.min_size_m2}\u2013${searchConfig.max_size_m2} m\u00b2`,
    });
  }

  if (searchConfig.property_type) {
    rows.push({
      key: 'propertyType',
      label: t(locale, 'dataBasis.searchConfig.propertyType'),
      value: searchConfig.property_type,
    });
  }

  if (searchConfig.elevator != null) {
    rows.push({
      key: 'elevator',
      label: t(locale, 'dataBasis.searchConfig.elevator'),
      value: searchConfig.elevator
        ? t(locale, 'dataBasis.searchConfig.yes')
        : t(locale, 'dataBasis.searchConfig.no'),
    });
  }

  if (searchConfig.preservation) {
    rows.push({
      key: 'preservation',
      label: t(locale, 'dataBasis.searchConfig.preservation'),
      value: searchConfig.preservation,
    });
  }

  if (searchConfig.center_lat != null && searchConfig.center_lon != null) {
    rows.push({
      key: 'center',
      label: t(locale, 'dataBasis.searchConfig.center'),
      value: `${searchConfig.center_lat.toFixed(4)}, ${searchConfig.center_lon.toFixed(4)}`,
    });
  }

  return rows;
}
