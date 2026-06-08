import { describe, it, expect } from 'vitest';
import { priceTimeSeriesDistrictRenderer } from '../src/charts/price_time_series_district.js';
import fixture from './fixtures/latest.sample.json';

describe('priceTimeSeriesDistrictRenderer', () => {
  it('exposes the ChartRenderer contract: id, title, render', () => {
    expect(priceTimeSeriesDistrictRenderer.id).toBe('price-time-series-district');
    expect(typeof priceTimeSeriesDistrictRenderer.title).toBe('string');
    expect(typeof priceTimeSeriesDistrictRenderer.render).toBe('function');
  });

  it('returns scatter traces from price_time_series_district', () => {
    const figure = priceTimeSeriesDistrictRenderer.render(fixture.general);

    expect(figure.data.length).toBeGreaterThan(0);
    figure.data.forEach((t) => expect(t.type).toBe('scatter'));
  });

  it('traces carry district metadata', () => {
    const figure = priceTimeSeriesDistrictRenderer.render(fixture.general);

    figure.data.forEach((t) => expect(t).toHaveProperty('meta.district'));
  });

  it('returns empty data for missing block — no throw', () => {
    expect(priceTimeSeriesDistrictRenderer.render(null).data).toEqual([]);
    expect(priceTimeSeriesDistrictRenderer.render({}).data).toEqual([]);
  });
});
