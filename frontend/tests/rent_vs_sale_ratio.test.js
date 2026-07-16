import { describe, it, expect } from 'vitest';
import { rentVsSaleRatioRenderer } from '../src/charts/rent_vs_sale_ratio.js';
import { buildLayout } from '../src/chart_theme.js';
import fixture from './fixtures/latest.sample.json';

describe('rentVsSaleRatioRenderer', () => {
  it('exposes the ChartRenderer contract: id, title, render', () => {
    expect(rentVsSaleRatioRenderer.id).toBe('rent-vs-sale-ratio');
    expect(typeof rentVsSaleRatioRenderer.title).toBe('string');
    expect(typeof rentVsSaleRatioRenderer.render).toBe('function');
  });

  it('returns a Plotly figure with data and layout from a population block', () => {
    const figure = rentVsSaleRatioRenderer.render(fixture.general);

    expect(figure).toHaveProperty('data');
    expect(figure).toHaveProperty('layout');
    expect(figure.data.length).toBeGreaterThan(0);
    expect(figure.data[0].type).toBe('scatter');
  });

  it('x axis is rent price, y axis is sale price', () => {
    const figure = rentVsSaleRatioRenderer.render(fixture.general);
    const records = fixture.general.rent_vs_sale_ratio;

    expect(figure.data[0].x[0]).toBe(records[0].mean_priceByArea_rent);
    expect(figure.data[0].y[0]).toBe(records[0].mean_priceByArea_sale);
  });

  it('returns empty data for missing block — no throw', () => {
    expect(rentVsSaleRatioRenderer.render(null).data).toEqual([]);
    expect(rentVsSaleRatioRenderer.render({}).data).toEqual([]);
  });

  it('layout equals buildLayout(...) merged with { title } and retains hovermode:closest', () => {
    const figure = rentVsSaleRatioRenderer.render(fixture.general);

    const expectedLayout = buildLayout({
      viewport: 'desktop',
      colorScheme: 'light',
      overrides: {
        xaxis: { title: { text: 'Rent price per m² per month (€)' } },
        yaxis: { title: { text: 'Sale price per m² (€)' } },
        hovermode: 'closest',
      },
    });

    expect(figure.layout).toEqual({
      ...expectedLayout,
      title: { text: rentVsSaleRatioRenderer.title },
    });
    expect(figure.layout.hovermode).toBe('closest');
  });
});
