/**
 * dashboard_state.js — pure reducer/helper functions for theme resolution,
 * viewport classification, re-render gating, and the data-load lifecycle.
 *
 * Design intent: this module never touches the DOM, never calls fetch, and
 * never references `document`/`window`/`globalThis`. All side effects
 * (reading localStorage/matchMedia, calling Plotly) live in app.js, which
 * calls these pure functions and applies their results.
 */

const VIEWPORT_BREAKPOINT_PX = 768;
const VALID_THEMES = new Set(['light', 'dark']);

/**
 * Resolve the active color theme.
 *
 * An explicit, valid stored value always wins. Otherwise the function falls
 * back to the system preference.
 *
 * @param {string|null|undefined} stored - Explicit theme choice, e.g. from localStorage.
 * @param {'light'|'dark'} systemPrefers - The OS/browser color-scheme preference.
 * @returns {'light'|'dark'}
 */
export function resolveTheme(stored, systemPrefers) {
  if (VALID_THEMES.has(stored)) {
    return stored;
  }
  return systemPrefers;
}

/**
 * Classify a viewport width into a coarse responsive bucket.
 *
 * @param {number} width - Viewport width in pixels.
 * @returns {'mobile'|'desktop'} 'mobile' below 768px, 'desktop' at/above it.
 */
export function resolveViewport(width) {
  return width < VIEWPORT_BREAKPOINT_PX ? 'mobile' : 'desktop';
}

/**
 * Decide whether charts need to re-render given a previous and next
 * viewport/colorScheme pair. Only a change in one of those two axes
 * warrants a re-render — any other field change (or no change at all)
 * does not.
 *
 * @param {{viewport: string, colorScheme: string}} prev
 * @param {{viewport: string, colorScheme: string}} next
 * @returns {boolean}
 */
export function shouldRerender(prev, next) {
  return prev.viewport !== next.viewport || prev.colorScheme !== next.colorScheme;
}

/**
 * Create the initial data-load lifecycle state.
 *
 * @returns {{status: 'loading'}}
 */
export function createLoadState() {
  return { status: 'loading' };
}

/**
 * Transition the load-lifecycle state given an event.
 *
 * States: loading -> ready | error. A 'retry' event resets any state back
 * to loading, regardless of the current status.
 *
 * @param {{status: string}} state - Current lifecycle state.
 * @param {{type: 'success'|'error'|'retry'}} event
 * @returns {{status: string}} Next lifecycle state.
 */
export function transition(state, event) {
  if (event.type === 'retry') {
    return { status: 'loading' };
  }
  if (state.status === 'loading' && event.type === 'success') {
    return { status: 'ready' };
  }
  if (state.status === 'loading' && event.type === 'error') {
    return { status: 'error' };
  }
  return state;
}
