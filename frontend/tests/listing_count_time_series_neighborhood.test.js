import { describe, it, expect } from 'vitest';
import { listingCountTimeSeriesNeighborhoodRenderer } from '../src/charts/listing_count_time_series_neighborhood.js';
import { buildLayout } from '../src/chart_theme.js';
import fixture from './fixtures/latest.sample.json';

describe('listingCountTimeSeriesNeighborhoodRenderer', () => {
  it('exposes the ChartRenderer contract: id, title, render', () => {
    expect(listingCountTimeSeriesNeighborhoodRenderer.id).toBe(
      'listing-count-time-series-neighborhood'
    );
    expect(typeof listingCountTimeSeriesNeighborhoodRenderer.title).toBe('string');
    expect(typeof listingCountTimeSeriesNeighborhoodRenderer.render).toBe('function');
  });

  it('returns scatter traces with y = count_listings from price_time_series_neighborhood', () => {
    const figure = listingCountTimeSeriesNeighborhoodRenderer.render(fixture.general);
    const records = fixture.general.price_time_series_neighborhood;

    expect(figure.data.length).toBeGreaterThan(0);
    figure.data.forEach((t) => expect(t.type).toBe('scatter'));

    const match = figure.data.find(
      (t) =>
        t.meta.operation === records[0].operation &&
        t.meta.neighborhood === records[0].neighborhood
    );
    expect(match.y[0]).toBe(records[0].count_listings);
  });

  it('traces carry neighbourhood + district metadata', () => {
    const figure = listingCountTimeSeriesNeighborhoodRenderer.render(fixture.general);
    figure.data.forEach((t) => {
      expect(t).toHaveProperty('meta.neighborhood');
      expect(t).toHaveProperty('meta.district');
    });
  });

  it('returns a valid empty figure for null/empty population block — no throw', () => {
    expect(listingCountTimeSeriesNeighborhoodRenderer.render(null).data).toEqual([]);
    expect(listingCountTimeSeriesNeighborhoodRenderer.render(undefined).data).toEqual([]);
    expect(listingCountTimeSeriesNeighborhoodRenderer.render({}).data).toEqual([]);
  });

  it('layout equals buildLayout(...) merged with { title } under the default context', () => {
    const figure = listingCountTimeSeriesNeighborhoodRenderer.render(fixture.general);

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
      title: { text: listingCountTimeSeriesNeighborhoodRenderer.title },
    });
  });
});
