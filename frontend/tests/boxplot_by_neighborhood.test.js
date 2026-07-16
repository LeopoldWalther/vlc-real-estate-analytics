import { describe, it, expect } from 'vitest';
import {
  boxplotRenderer,
  boxplotRentRenderer,
  boxplotSaleRenderer,
} from '../src/charts/boxplot_by_neighborhood.js';
import { buildLayout } from '../src/chart_theme.js';
import fixture from './fixtures/latest.sample.json';

describe('boxplotRenderer', () => {
  it('exposes the ChartRenderer contract: id, title, render', () => {
    expect(boxplotRenderer.id).toBe('boxplot-by-neighborhood');
    expect(typeof boxplotRenderer.title).toBe('string');
    expect(typeof boxplotRenderer.render).toBe('function');
  });

  it('returns one box trace per record in boxplot_by_neighborhood', () => {
    const figure = boxplotRenderer.render(fixture.general);
    const records = fixture.general.boxplot_by_neighborhood;

    expect(figure.data).toHaveLength(records.length);
    figure.data.forEach((t) => expect(t.type).toBe('box'));
  });

  it('box traces carry the 5-number summary', () => {
    const figure = boxplotRenderer.render(fixture.general);
    const r = fixture.general.boxplot_by_neighborhood[0];
    const t = figure.data[0];

    expect(t.lowerfence[0]).toBe(r.min);
    expect(t.q1[0]).toBe(r.q1);
    expect(t.median[0]).toBe(r.median);
    expect(t.q3[0]).toBe(r.q3);
    expect(t.upperfence[0]).toBe(r.max);
  });

  it('returns empty data for missing block — no throw', () => {
    expect(boxplotRenderer.render(null).data).toEqual([]);
    expect(boxplotRenderer.render({}).data).toEqual([]);
  });

  it('layout equals buildLayout(...) merged with { title } and retains boxmode:group', () => {
    const figure = boxplotRenderer.render(fixture.general);

    const expectedLayout = buildLayout({
      viewport: 'desktop',
      colorScheme: 'light',
      overrides: {
        yaxis: { title: { text: 'Price per m² (€)' } },
        boxmode: 'group',
      },
    });

    expect(figure.layout).toEqual({ ...expectedLayout, title: { text: boxplotRenderer.title } });
    expect(figure.layout.boxmode).toBe('group');
  });
});

describe('boxplotRentRenderer / boxplotSaleRenderer', () => {
  it('boxplotSaleRenderer.render(fixture.general) matches buildLayout parity and retains boxmode:group', () => {
    const figure = boxplotSaleRenderer.render(fixture.general);

    const expectedLayout = buildLayout({
      viewport: 'desktop',
      colorScheme: 'light',
      overrides: {
        yaxis: { title: { text: 'Sale price per m² (€)' } },
        boxmode: 'group',
      },
    });

    expect(figure.layout).toEqual({
      ...expectedLayout,
      title: { text: boxplotSaleRenderer.title },
    });
    expect(figure.data.length).toBeGreaterThan(0);
  });

  it('boxplotRentRenderer.render(fixture.general) returns no traces (fixture has no rent boxplot group) without throwing', () => {
    const figure = boxplotRentRenderer.render(fixture.general);

    expect(figure.data).toEqual([]);
  });
});
