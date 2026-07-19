import { describe, it, expect } from 'vitest';
import { listingCountTimeSeriesDistrictRenderer } from '../src/charts/listing_count_time_series_district.js';
import { buildLayout } from '../src/chart_theme.js';
import fixture from './fixtures/latest.sample.json';

describe('listingCountTimeSeriesDistrictRenderer', () => {
  it('exposes the ChartRenderer contract: id, title, render', () => {
    expect(listingCountTimeSeriesDistrictRenderer.id).toBe('listing-count-time-series-district');
    expect(typeof listingCountTimeSeriesDistrictRenderer.title).toBe('string');
    expect(typeof listingCountTimeSeriesDistrictRenderer.render).toBe('function');
  });

  it('returns scatter traces with y = count_listings from price_time_series_district', () => {
    const figure = listingCountTimeSeriesDistrictRenderer.render(fixture.general);
    const records = fixture.general.price_time_series_district;

    expect(figure.data.length).toBeGreaterThan(0);
    figure.data.forEach((t) => expect(t.type).toBe('scatter'));

    const match = figure.data.find(
      (t) => t.meta.operation === records[0].operation && t.meta.district === records[0].district
    );
    expect(match.y[0]).toBe(records[0].count_listings);
  });

  it('traces carry district metadata', () => {
    const figure = listingCountTimeSeriesDistrictRenderer.render(fixture.general);
    figure.data.forEach((t) => expect(t).toHaveProperty('meta.district'));
  });

  it('returns a valid empty figure for null/empty population block — no throw', () => {
    expect(listingCountTimeSeriesDistrictRenderer.render(null).data).toEqual([]);
    expect(listingCountTimeSeriesDistrictRenderer.render(undefined).data).toEqual([]);
    expect(listingCountTimeSeriesDistrictRenderer.render({}).data).toEqual([]);
  });

  it('layout equals buildLayout(...) merged with { title } under the default context', () => {
    const figure = listingCountTimeSeriesDistrictRenderer.render(fixture.general);

    const expectedLayout = buildLayout({
      viewport: 'desktop',
      colorScheme: 'light',
      overrides: {
        xaxis: { title: { text: 'Date' } },
        yaxis: { title: { text: 'Listing count' } },
      },
    });

    expect(figure.layout).toEqual({
      ...expectedLayout,
      title: { text: listingCountTimeSeriesDistrictRenderer.title },
    });
  });
});
