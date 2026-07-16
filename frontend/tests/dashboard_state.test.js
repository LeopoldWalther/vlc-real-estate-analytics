import { describe, it, expect } from 'vitest';
import {
  resolveTheme,
  resolveViewport,
  shouldRerender,
  createLoadState,
  transition,
} from '../src/dashboard_state.js';

describe('resolveTheme', () => {
  it('prefers a valid explicit stored value over systemPrefers', () => {
    expect(resolveTheme('dark', 'light')).toBe('dark');
    expect(resolveTheme('light', 'dark')).toBe('light');
  });

  it('falls back to systemPrefers when stored is null', () => {
    expect(resolveTheme(null, 'dark')).toBe('dark');
    expect(resolveTheme(null, 'light')).toBe('light');
  });

  it('falls back to systemPrefers when stored is invalid', () => {
    expect(resolveTheme('not-a-theme', 'dark')).toBe('dark');
  });
});

describe('resolveViewport', () => {
  it('returns mobile below the 768px breakpoint', () => {
    expect(resolveViewport(0)).toBe('mobile');
    expect(resolveViewport(767)).toBe('mobile');
  });

  it('returns desktop at/above the 768px breakpoint', () => {
    expect(resolveViewport(768)).toBe('desktop');
    expect(resolveViewport(1280)).toBe('desktop');
  });
});

describe('shouldRerender', () => {
  it('returns false when viewport and colorScheme are both unchanged', () => {
    const prev = { viewport: 'mobile', colorScheme: 'light' };
    const next = { viewport: 'mobile', colorScheme: 'light' };
    expect(shouldRerender(prev, next)).toBe(false);
  });

  it('returns true when viewport changes', () => {
    const prev = { viewport: 'mobile', colorScheme: 'light' };
    const next = { viewport: 'desktop', colorScheme: 'light' };
    expect(shouldRerender(prev, next)).toBe(true);
  });

  it('returns true when colorScheme changes', () => {
    const prev = { viewport: 'mobile', colorScheme: 'light' };
    const next = { viewport: 'mobile', colorScheme: 'dark' };
    expect(shouldRerender(prev, next)).toBe(true);
  });
});

describe('load lifecycle', () => {
  it('starts in loading state', () => {
    const state = createLoadState();
    expect(state.status).toBe('loading');
  });

  it('transitions loading -> ready', () => {
    const state = transition(createLoadState(), { type: 'success' });
    expect(state.status).toBe('ready');
  });

  it('transitions loading -> error', () => {
    const state = transition(createLoadState(), { type: 'error' });
    expect(state.status).toBe('error');
  });

  it('transitions retry -> loading from any state', () => {
    const ready = transition(createLoadState(), { type: 'success' });
    expect(transition(ready, { type: 'retry' }).status).toBe('loading');

    const errored = transition(createLoadState(), { type: 'error' });
    expect(transition(errored, { type: 'retry' }).status).toBe('loading');
  });
});
