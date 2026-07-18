import { describe, it, expect } from 'vitest';
import { TAB_IDS, DEFAULT_TAB_ID, resolveActiveTab, buildTabHash } from '../src/tab_state.js';

describe('tab_state.js', () => {
  it('exports the current valid tab ids', () => {
    expect(TAB_IDS).toEqual(['trend-analysis', 'data-basis']);
  });

  it('exports a default tab id that is a member of TAB_IDS', () => {
    expect(TAB_IDS).toContain(DEFAULT_TAB_ID);
    expect(DEFAULT_TAB_ID).toBe('trend-analysis');
  });

  it('resolves a valid hash to its tab id', () => {
    expect(resolveActiveTab('#data-basis')).toBe('data-basis');
    expect(resolveActiveTab('#trend-analysis')).toBe('trend-analysis');
  });

  it('falls back to trend-analysis for a missing hash', () => {
    expect(resolveActiveTab('')).toBe('trend-analysis');
    expect(resolveActiveTab(undefined)).toBe('trend-analysis');
    expect(resolveActiveTab(null)).toBe('trend-analysis');
  });

  it('falls back to trend-analysis for an invalid hash', () => {
    expect(resolveActiveTab('#not-a-real-tab')).toBe('trend-analysis');
    expect(resolveActiveTab('#')).toBe('trend-analysis');
  });

  it('tolerates a hash without the leading #', () => {
    expect(resolveActiveTab('data-basis')).toBe('data-basis');
  });

  it('accepts an explicit valid-ids list and fallback so a future third tab can be added', () => {
    const extendedIds = [...TAB_IDS, 'pipeline-health'];
    expect(resolveActiveTab('#pipeline-health', extendedIds)).toBe('pipeline-health');
    expect(resolveActiveTab('#unknown', extendedIds, 'data-basis')).toBe('data-basis');
  });

  it('builds a stable URL hash for a tab id', () => {
    expect(buildTabHash('trend-analysis')).toBe('#trend-analysis');
    expect(buildTabHash('data-basis')).toBe('#data-basis');
  });

  it('buildTabHash and resolveActiveTab round-trip for every valid tab id', () => {
    for (const id of TAB_IDS) {
      expect(resolveActiveTab(buildTabHash(id))).toBe(id);
    }
  });

  it('has no document/window/fetch/Plotly references in its source', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(new URL('.', import.meta.url).pathname, '../src/tab_state.js'),
      'utf-8',
    );
    expect(src).not.toMatch(/\bdocument\b/);
    expect(src).not.toMatch(/\bwindow\b/);
    expect(src).not.toMatch(/\bfetch\b/);
    expect(src).not.toMatch(/\bPlotly\b/);
  });
});
