import { describe, it, expect } from 'vitest';
import {
  formatSeries,
  formatDistrictSeries,
  formatRentVsSaleRatio,
  formatRatioTimeSeries,
  formatBoxplot,
  formatDistrictCountSeries,
  formatNeighborhoodCountSeries,
} from '../src/transforms.js';
import fixture from './fixtures/latest.sample.json';

describe('formatDistrictSeries', () => {
  const records = fixture.general.price_time_series_district;

  it('returns one trace per (operation, district)', () => {
    const traces = formatDistrictSeries(records);

    expect(traces.length).toBeGreaterThan(0);
    traces.forEach((t) => {
      expect(t.type).toBe('scatter');
      expect(t).toHaveProperty('meta.operation');
      expect(t).toHaveProperty('meta.district');
    });
  });

  it('groups multiple snapshots for the same (operation, district) into one trace', () => {
    const multi = [
      ...records,
      { ...records[0], snapshot_date: '2026-02-01', mean_priceByArea: 2600.0 },
    ];
    const traces = formatDistrictSeries(multi);
    const match = traces.find(
      (t) => t.meta.operation === records[0].operation && t.meta.district === records[0].district
    );
    expect(match.x).toHaveLength(2);
    expect(match.y).toHaveLength(2);
  });

  it('returns [] for null — no throw', () => {
    expect(formatDistrictSeries(null)).toEqual([]);
  });

  it('returns [] for empty array — no throw', () => {
    expect(formatDistrictSeries([])).toEqual([]);
  });
});

describe('formatRentVsSaleRatio', () => {
  const records = fixture.general.rent_vs_sale_ratio;

  it('returns a single trace with x=rent prices and y=sale prices', () => {
    const traces = formatRentVsSaleRatio(records);

    expect(traces).toHaveLength(1);
    expect(traces[0].x).toEqual(records.map((r) => r.mean_priceByArea_rent));
    expect(traces[0].y).toEqual(records.map((r) => r.mean_priceByArea_sale));
    expect(traces[0].type).toBe('scatter');
  });

  it('includes neighbourhood labels as text', () => {
    const traces = formatRentVsSaleRatio(records);

    expect(traces[0].text).toHaveLength(records.length);
    expect(traces[0].text[0]).toContain('Arrancapins');
  });

  it('returns [] for null — no throw', () => {
    expect(formatRentVsSaleRatio(null)).toEqual([]);
  });
});

describe('formatRatioTimeSeries', () => {
  const records = fixture.general.rent_vs_sale_ratio_time_series;

  it('returns one trace per neighbourhood', () => {
    const traces = formatRatioTimeSeries(records);

    expect(traces.length).toBeGreaterThan(0);
    traces.forEach((t) => {
      expect(t.type).toBe('scatter');
      expect(t).toHaveProperty('meta.neighborhood');
    });
  });

  it('y values are the rent-to-sale ratio', () => {
    const traces = formatRatioTimeSeries(records);

    traces.forEach((t) => {
      t.y.forEach((v) => expect(typeof v).toBe('number'));
    });
  });

  it('returns [] for null — no throw', () => {
    expect(formatRatioTimeSeries(null)).toEqual([]);
  });
});

describe('formatBoxplot', () => {
  const records = fixture.general.boxplot_by_neighborhood;

  it('returns one box trace per record', () => {
    const traces = formatBoxplot(records);

    expect(traces).toHaveLength(records.length);
    traces.forEach((t) => {
      expect(t.type).toBe('box');
      expect(t).toHaveProperty('lowerfence');
      expect(t).toHaveProperty('q1');
      expect(t).toHaveProperty('median');
      expect(t).toHaveProperty('q3');
      expect(t).toHaveProperty('upperfence');
    });
  });

  it('maps min/max to lowerfence/upperfence', () => {
    const traces = formatBoxplot(records);

    expect(traces[0].lowerfence[0]).toBe(records[0].min);
    expect(traces[0].upperfence[0]).toBe(records[0].max);
    expect(traces[0].median[0]).toBe(records[0].median);
  });

  it('returns [] for null — no throw', () => {
    expect(formatBoxplot(null)).toEqual([]);
  });
});

// Ensure the original formatSeries still works (no regression)
describe('formatSeries (regression)', () => {
  it('still returns traces from price_time_series_neighborhood', () => {
    const traces = formatSeries(fixture.general.price_time_series_neighborhood);
    expect(traces.length).toBeGreaterThan(0);
  });
});

describe('formatDistrictCountSeries', () => {
  const records = fixture.general.price_time_series_district;

  it('returns one trace per (operation, district) with y = count_listings', () => {
    const traces = formatDistrictCountSeries(records);

    expect(traces.length).toBeGreaterThan(0);
    traces.forEach((t) => {
      expect(t.type).toBe('scatter');
      expect(t).toHaveProperty('meta.operation');
      expect(t).toHaveProperty('meta.district');
    });

    const match = traces.find(
      (t) => t.meta.operation === records[0].operation && t.meta.district === records[0].district
    );
    expect(match.y[0]).toBe(records[0].count_listings);
  });

  it('groups multiple snapshots for the same (operation, district) into one trace', () => {
    const multi = [
      ...records,
      { ...records[0], snapshot_date: '2026-02-01', count_listings: 42 },
    ];
    const traces = formatDistrictCountSeries(multi);
    const match = traces.find(
      (t) => t.meta.operation === records[0].operation && t.meta.district === records[0].district
    );
    expect(match.x).toHaveLength(2);
    expect(match.y).toHaveLength(2);
    expect(match.y[1]).toBe(42);
  });

  it('returns [] for null — no throw', () => {
    expect(formatDistrictCountSeries(null)).toEqual([]);
  });

  it('returns [] for empty array — no throw', () => {
    expect(formatDistrictCountSeries([])).toEqual([]);
  });
});

describe('formatNeighborhoodCountSeries', () => {
  const records = fixture.general.price_time_series_neighborhood;

  it('returns one trace per (operation, neighbourhood) with y = count_listings', () => {
    const traces = formatNeighborhoodCountSeries(records);

    expect(traces.length).toBeGreaterThan(0);
    traces.forEach((t) => {
      expect(t.type).toBe('scatter');
      expect(t).toHaveProperty('meta.operation');
      expect(t).toHaveProperty('meta.neighborhood');
    });

    const match = traces.find(
      (t) =>
        t.meta.operation === records[0].operation &&
        t.meta.neighborhood === records[0].neighborhood
    );
    expect(match.y[0]).toBe(records[0].count_listings);
  });

  it('carries district metadata on each trace', () => {
    const traces = formatNeighborhoodCountSeries(records);
    traces.forEach((t) => expect(t).toHaveProperty('meta.district'));
  });

  it('returns [] for null — no throw', () => {
    expect(formatNeighborhoodCountSeries(null)).toEqual([]);
  });

  it('returns [] for empty array — no throw', () => {
    expect(formatNeighborhoodCountSeries([])).toEqual([]);
  });
});
