import { describe, it, expect } from 'vitest';
import { buildLayout } from '../src/chart_theme.js';

describe('buildLayout', () => {
  it('never includes a top-level title key, regardless of overrides', () => {
    const layout = buildLayout({
      viewport: 'desktop',
      colorScheme: 'light',
      overrides: { title: { text: 'Should be ignored' } },
    });

    expect(layout).not.toHaveProperty('title');
  });

  describe('viewport = mobile', () => {
    it('returns compact margins, a horizontal bottom legend, and smaller fonts', () => {
      const layout = buildLayout({ viewport: 'mobile', colorScheme: 'light', overrides: {} });

      expect(layout.margin.l).toBeLessThan(80);
      expect(layout.margin.r).toBeLessThan(40);
      expect(layout.legend.orientation).toBe('h');
      expect(layout.legend.y).toBeLessThan(0);
      expect(layout.font.size).toBeLessThan(12);
    });
  });

  describe('viewport = desktop', () => {
    it('matches today\'s hand-rolled margin/legend defaults', () => {
      const layout = buildLayout({ viewport: 'desktop', colorScheme: 'light', overrides: {} });

      expect(layout.margin.l).toBe(80);
      expect(layout.margin.r).toBe(40);
      expect(layout.margin.t).toBe(60);
      expect(layout.margin.b).toBeGreaterThanOrEqual(60);
      expect(layout.margin.b).toBeLessThanOrEqual(80);
      expect(layout.legend.orientation).toBe('v');
    });
  });

  describe('colorScheme', () => {
    it('dark vs light change colorway/gridline/font colour fields, all else equal', () => {
      const light = buildLayout({ viewport: 'desktop', colorScheme: 'light', overrides: {} });
      const dark = buildLayout({ viewport: 'desktop', colorScheme: 'dark', overrides: {} });

      expect(dark.font.color).not.toBe(light.font.color);
      expect(dark.xaxis.gridcolor).not.toBe(light.xaxis.gridcolor);
      expect(dark.paper_bgcolor).not.toBe(light.paper_bgcolor);
      expect(dark.colorway).not.toEqual(light.colorway);

      // Non-color-related fields are unaffected by the colorScheme axis.
      expect(dark.margin).toEqual(light.margin);
      expect(dark.legend.orientation).toBe(light.legend.orientation);
    });
  });

  describe('overrides deep-merge', () => {
    it('merges nested xaxis/yaxis override keys without deleting sibling base keys', () => {
      const layout = buildLayout({
        viewport: 'desktop',
        colorScheme: 'light',
        overrides: { xaxis: { title: { text: 'Date' } } },
      });

      expect(layout.xaxis.title.text).toBe('Date');
      // Sibling base keys on xaxis (e.g. automargin) must survive the merge.
      expect(layout.xaxis.automargin).toBe(true);
      // Unrelated top-level keys must survive too.
      expect(layout.yaxis).toBeDefined();
      expect(layout.margin).toBeDefined();
      expect(layout.legend).toBeDefined();
    });

    it('merges top-level scalar overrides (e.g. hovermode) without dropping other keys', () => {
      const layout = buildLayout({
        viewport: 'desktop',
        colorScheme: 'light',
        overrides: { hovermode: 'closest' },
      });

      expect(layout.hovermode).toBe('closest');
      expect(layout.margin).toBeDefined();
      expect(layout.yaxis).toBeDefined();
    });
  });
});
