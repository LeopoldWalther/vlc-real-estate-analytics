/**
 * chart_theme.js — buildLayout(...) factory producing the Plotly `layout`
 * base object for every chart renderer, parameterised by viewport and
 * colorScheme, with caller-supplied overrides deep-merged on top.
 *
 * Deliberately a plain factory function (not a class hierarchy): the
 * viewport/colorScheme axes are independent config inputs, not a set of
 * polymorphic behaviours, so a config-producing function is sufficient and
 * avoids over-engineering.
 *
 * `title` is intentionally never part of the returned layout — each chart
 * renderer stamps its own title (and app.js the population label) on top of
 * this base layout so this module never has to know about chart-specific
 * copy.
 */

const LIGHT_COLORS = {
  fontColor: '#212529',
  gridColor: '#dee2e6',
  paperBg: '#ffffff',
  plotBg: '#ffffff',
  colorway: ['#2563eb', '#f97316', '#16a34a', '#dc2626', '#7c3aed', '#0891b2'],
};

const DARK_COLORS = {
  fontColor: '#e9ecef',
  gridColor: '#343a40',
  paperBg: '#1e2328',
  plotBg: '#1e2328',
  colorway: ['#60a5fa', '#fb923c', '#4ade80', '#f87171', '#a78bfa', '#22d3ee'],
};

const DESKTOP_GEOMETRY = {
  margin: { l: 80, r: 40, t: 60, b: 60 },
  fontSize: 12,
  legend: { orientation: 'v' },
};

const MOBILE_GEOMETRY = {
  margin: { l: 45, r: 20, t: 40, b: 90 },
  fontSize: 10,
  legend: { orientation: 'h', y: -0.35, x: 0 },
};

/**
 * Recursively merge `source` into `target`, returning a new plain object.
 * Arrays and non-plain-object values are replaced outright (not merged
 * element-by-element); nested plain objects are merged key-by-key so
 * sibling keys on the same sub-object survive.
 *
 * @param {object} target
 * @param {object} source
 * @returns {object}
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = target[key];
    const bothPlainObjects =
      isPlainObject(sourceValue) && isPlainObject(targetValue);
    result[key] = bothPlainObjects ? deepMerge(targetValue, sourceValue) : sourceValue;
  }
  return result;
}

/** @param {*} value @returns {boolean} */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Build a Plotly `layout` base object for the given viewport/colorScheme,
 * with `overrides` deep-merged on top. Never returns a `title` key.
 *
 * @param {{
 *   viewport?: 'mobile'|'desktop',
 *   colorScheme?: 'light'|'dark',
 *   overrides?: object,
 * }} params
 * @returns {object} Plotly layout object (without `title`).
 */
export function buildLayout({ viewport = 'desktop', colorScheme = 'light', overrides = {} } = {}) {
  const geometry = viewport === 'mobile' ? MOBILE_GEOMETRY : DESKTOP_GEOMETRY;
  const colors = colorScheme === 'dark' ? DARK_COLORS : LIGHT_COLORS;

  const base = {
    margin: { ...geometry.margin },
    legend: { ...geometry.legend },
    font: { size: geometry.fontSize, color: colors.fontColor },
    paper_bgcolor: colors.paperBg,
    plot_bgcolor: colors.plotBg,
    colorway: [...colors.colorway],
    xaxis: { automargin: true, gridcolor: colors.gridColor },
    yaxis: { automargin: true, gridcolor: colors.gridColor },
  };

  const merged = deepMerge(base, overrides);
  delete merged.title;
  return merged;
}
