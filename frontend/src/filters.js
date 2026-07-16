/**
 * filters.js — pure helpers for the district/neighbourhood scope filter.
 *
 * Design intent: mirrors dashboard_state.js — no DOM, no fetch, no
 * `document`/`window` references. app.js reads the checkbox DOM, calls these
 * pure functions, and applies the results.
 *
 * A population block (e.g. `data.general` or `data.relevant`) is a bag of
 * named arrays (`price_time_series_neighborhood`, `boxplot_by_neighborhood`,
 * ...). Every row in every array carries a `district` field; most (but not
 * `price_time_series_district`) also carry a `neighborhood` field. Filtering
 * therefore has to be per-row and per-field-presence, not a single global
 * predicate: a row without a `neighborhood` field is district-level and must
 * still respect the district filter, but is unaffected by the neighbourhood
 * filter (there is nothing narrower to check).
 */

export const MAX_SCOPE_SELECTION = 3;

/**
 * Collect the sorted, de-duplicated set of `district` values appearing
 * anywhere in a population block.
 *
 * @param {object|null|undefined} populationBlock
 * @returns {string[]}
 */
export function extractDistricts(populationBlock) {
  const districts = new Set();
  for (const rows of Object.values(populationBlock ?? {})) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (row?.district) districts.add(row.district);
    }
  }
  return [...districts].sort();
}

/**
 * Collect the sorted, de-duplicated set of `neighborhood` values appearing
 * anywhere in a population block, optionally restricted to rows whose
 * `district` is one of `districts` (when non-empty).
 *
 * @param {object|null|undefined} populationBlock
 * @param {string[]} [districts] - When non-empty, only neighbourhoods within
 *   these districts are returned.
 * @returns {string[]}
 */
export function extractNeighborhoods(populationBlock, districts = []) {
  const scoped = districts.length > 0 ? new Set(districts) : null;
  const neighborhoods = new Set();
  for (const rows of Object.values(populationBlock ?? {})) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row?.neighborhood) continue;
      if (scoped && !scoped.has(row.district)) continue;
      neighborhoods.add(row.neighborhood);
    }
  }
  return [...neighborhoods].sort();
}

/**
 * Filter every array field of a population block down to rows matching the
 * selected districts/neighborhoods. Both selections are ANDed together; an
 * empty selection for either axis means "no restriction" on that axis.
 *
 * Never mutates the input; returns a new object with the same keys.
 *
 * @param {object|null|undefined} populationBlock
 * @param {{districts?: string[], neighborhoods?: string[]}} [scope]
 * @returns {object} A shallow-cloned population block with filtered arrays.
 */
export function filterPopulationBlock(populationBlock, { districts = [], neighborhoods = [] } = {}) {
  if (!populationBlock) return populationBlock;
  const hasDistrictFilter = districts.length > 0;
  const hasNeighborhoodFilter = neighborhoods.length > 0;
  if (!hasDistrictFilter && !hasNeighborhoodFilter) return { ...populationBlock };

  const districtSet = new Set(districts);
  const neighborhoodSet = new Set(neighborhoods);

  const result = {};
  for (const [key, rows] of Object.entries(populationBlock)) {
    if (!Array.isArray(rows)) {
      result[key] = rows;
      continue;
    }
    result[key] = rows.filter((row) => {
      if (hasDistrictFilter && row?.district && !districtSet.has(row.district)) return false;
      // A row without a `neighborhood` field (e.g. district-level time
      // series) is not narrowed further by the neighbourhood filter.
      if (hasNeighborhoodFilter && row?.neighborhood && !neighborhoodSet.has(row.neighborhood)) return false;
      return true;
    });
  }
  return result;
}

/**
 * Toggle `value` in/out of `current`, enforcing a maximum selection size.
 * Attempting to add a value beyond the cap is a no-op (the caller should
 * reflect this back onto the checkbox, e.g. by re-rendering from state).
 *
 * @param {string[]} current - Current selection.
 * @param {string} value - Value being checked/unchecked.
 * @param {number} [max] - Maximum number of simultaneously selected values.
 * @returns {string[]} The next selection (a new array; `current` untouched).
 */
export function toggleScopeSelection(current, value, max = MAX_SCOPE_SELECTION) {
  if (current.includes(value)) {
    return current.filter((v) => v !== value);
  }
  if (current.length >= max) {
    return current;
  }
  return [...current, value];
}
