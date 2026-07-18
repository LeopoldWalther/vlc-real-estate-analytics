/**
 * tab_state.js — pure helpers for dashboard tab navigation.
 *
 * Design intent: mirrors dashboard_state.js/filters.js/i18n.js — no DOM and
 * no browser globals or charting-library references anywhere in this
 * module. app.js owns all side effects (reading/writing the location hash,
 * toggling `hidden`/`aria-selected`); this module only decides *what* the
 * resulting tab/hash should be given an input.
 *
 * Extensibility: `TAB_IDS` is the single source of truth for which tab ids
 * are valid. A future third tab (e.g. FEATURE-012's Pipeline Health) is
 * added by appending one more id to this array — `resolveActiveTab()` and
 * `buildTabHash()` need no changes, since both already operate generically
 * over a `validIds` list. No pipeline-health-specific id/logic is added
 * here; this module only provides the generic registry mechanism.
 */

/** Ordered list of currently valid tab ids. */
export const TAB_IDS = ['trend-analysis', 'data-basis'];

/** Tab id shown/activated when no valid hash is present. */
export const DEFAULT_TAB_ID = 'trend-analysis';

/**
 * Resolve a URL-hash-shaped string to a valid tab id, falling back
 * to `fallbackId` when the hash is missing, empty, or not a member of
 * `validIds`.
 *
 * @param {string|null|undefined} hash - e.g. '#data-basis', 'data-basis', '', null.
 * @param {string[]} [validIds] - Valid tab ids to resolve against; defaults
 *   to TAB_IDS. Callers may pass an extended list (e.g. with a future third
 *   tab appended) without any change to this function's logic.
 * @param {string} [fallbackId] - Tab id returned when resolution fails;
 *   defaults to DEFAULT_TAB_ID.
 * @returns {string} A member of `validIds`.
 */
export function resolveActiveTab(hash, validIds = TAB_IDS, fallbackId = DEFAULT_TAB_ID) {
  const normalized = (hash ?? '').replace(/^#/, '');
  return validIds.includes(normalized) ? normalized : fallbackId;
}

/**
 * Build the stable URL hash for a tab id (inverse of resolveActiveTab).
 *
 * @param {string} tabId
 * @returns {string} e.g. '#data-basis'.
 */
export function buildTabHash(tabId) {
  return `#${tabId}`;
}
