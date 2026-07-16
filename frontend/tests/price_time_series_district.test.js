import { describe, it, expect } from 'vitest';
import {
  priceTimeSeriesDistrictRenderer,
  priceTimeSeriesDistrictRentRenderer,
  priceTimeSeriesDistrictSaleRenderer,
} from '../src/charts/price_time_series_district.js';
import { buildLayout } from '../src/chart_theme.js';
import fixture from './fixtures/latest.sample.json';

describe('priceTimeSeriesDistrictRenderer', () => {
  it('exposes the ChartRenderer contract: id, title, render', () => {
    expect(priceTimeSeriesDistrictRenderer.id).toBe('price-time-series-district');
    expect(typeof priceTimeSeriesDistrictRenderer.title).toBe('string');
    expect(typeof priceTimeSeriesDistrictRenderer.render).toBe('function');
  });

  it('returns scatter traces from price_time_series_district', () => {
    const figure = priceTimeSeriesDistrictRenderer.render(fixture.general);

    // Fixture now has 2 records (sale + rent for Extramurs) = 2 traces
    expect(figure.data.length).toBe(2);
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

  it('layout equals buildLayout(...) merged with { title } under the default context', () => {
    const figure = priceTimeSeriesDistrictRenderer.render(fixture.general);

    const expectedLayout = buildLayout({
      viewport: 'desktop',
      colorScheme: 'light',
      overrides: {
        xaxis: { title: { text: 'Date' } },
        yaxis: { title: { text: 'Price per m² (€)' } },
      },
    });

    expect(figure.layout).toEqual({
      ...expectedLayout,
      title: { text: priceTimeSeriesDistrictRenderer.title },
    });
  });
});

describe('priceTimeSeriesDistrictRentRenderer', () => {
  it('exposes the ChartRenderer contract: id, title, render', () => {
    expect(priceTimeSeriesDistrictRentRenderer.id).toBe('price-time-series-district-rent');
    expect(typeof priceTimeSeriesDistrictRentRenderer.render).toBe('function');
  });

  it('returns only rent traces — 1 group from fixture', () => {
    const figure = priceTimeSeriesDistrictRentRenderer.render(fixture.general);

    expect(figure.data).toHaveLength(1);
    figure.data.forEach((t) => expect(t.meta.operation).toBe('rent'));
  });

  it('returns empty data for null — no throw', () => {
    expect(priceTimeSeriesDistrictRentRenderer.render(null).data).toEqual([]);
  });
});

describe('priceTimeSeriesDistrictSaleRenderer', () => {
  it('exposes the ChartRenderer contract: id, title, render', () => {
    expect(priceTimeSeriesDistrictSaleRenderer.id).toBe('price-time-series-district-sale');
    expect(typeof priceTimeSeriesDistrictSaleRenderer.render).toBe('function');
  });

  it('returns only sale traces — 1 group from fixture', () => {
    const figure = priceTimeSeriesDistrictSaleRenderer.render(fixture.general);

    expect(figure.data).toHaveLength(1);
    figure.data.forEach((t) => expect(t.meta.operation).toBe('sale'));
  });

  it('returns empty data for null — no throw', () => {
    expect(priceTimeSeriesDistrictSaleRenderer.render(null).data).toEqual([]);
  });
});
