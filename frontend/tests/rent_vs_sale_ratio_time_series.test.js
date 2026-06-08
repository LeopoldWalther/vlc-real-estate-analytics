import { describe, it, expect } from 'vitest';
import { ratioTimeSeriesRenderer } from '../src/charts/rent_vs_sale_ratio_time_series.js';
import fixture from './fixtures/latest.sample.json';

describe('ratioTimeSeriesRenderer', () => {
  it('exposes the ChartRenderer contract: id, title, render', () => {
    expect(ratioTimeSeriesRenderer.id).toBe('rent-vs-sale-ratio-time-series');
    expect(typeof ratioTimeSeriesRenderer.title).toBe('string');
    expect(typeof ratioTimeSeriesRenderer.render).toBe('function');
  });

  it('returns a figure with scatter traces per neighbourhood', () => {
    const figure = ratioTimeSeriesRenderer.render(fixture.general);

    expect(figure.data.length).toBeGreaterThan(0);
    figure.data.forEach((t) => expect(t.type).toBe('scatter'));
  });

  it('y values are numeric ratios', () => {
    const figure = ratioTimeSeriesRenderer.render(fixture.general);

    figure.data.forEach((t) => t.y.forEach((v) => expect(typeof v).toBe('number')));
  });

  it('returns empty data for missing block — no throw', () => {
    expect(ratioTimeSeriesRenderer.render(null).data).toEqual([]);
    expect(ratioTimeSeriesRenderer.render({}).data).toEqual([]);
  });
});
