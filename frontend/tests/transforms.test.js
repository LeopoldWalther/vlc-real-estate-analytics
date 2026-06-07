import { describe, it, expect } from 'vitest';
import { formatSeries } from '../src/transforms.js';
import fixture from './fixtures/latest.sample.json';

const records = fixture.general.price_time_series_neighborhood;

describe('formatSeries', () => {
  it('produces one trace per (operation, neighbourhood) from the records', () => {
    // Fixture: sale/Arrancapins (2 snapshots), rent/Arrancapins (1), sale/Gran Via (1) → 3 groups
    const traces = formatSeries(records);

    expect(traces).toHaveLength(3);
    traces.forEach((trace) => {
      expect(trace).toHaveProperty('x');
      expect(trace).toHaveProperty('y');
      expect(trace).toHaveProperty('name');
      expect(trace.type).toBe('scatter');
      expect(trace).toHaveProperty('meta.operation');
      expect(trace).toHaveProperty('meta.neighborhood');
    });
  });

  it('groups multiple snapshots for the same (operation, neighbourhood) into one trace', () => {
    const traces = formatSeries(records);

    const saleArrancapins = traces.find(
      (t) => t.meta.operation === 'sale' && t.meta.neighborhood === 'Arrancapins'
    );
    expect(saleArrancapins).toBeDefined();

    // sale/Arrancapins has two snapshot dates in the fixture
    expect(saleArrancapins.x).toHaveLength(2);
    expect(saleArrancapins.y).toHaveLength(2);
    expect(saleArrancapins.y[0]).toBe(2500.0);
    expect(saleArrancapins.y[1]).toBe(2550.0);
  });

  it('carries district metadata on each trace', () => {
    const traces = formatSeries(records);

    const saleArrancapins = traces.find(
      (t) => t.meta.operation === 'sale' && t.meta.neighborhood === 'Arrancapins'
    );
    expect(saleArrancapins.meta.district).toBe('Extramurs');
  });

  it("handles a district name with an apostrophe (L'Eixample)", () => {
    const traces = formatSeries(records);

    const granVia = traces.find((t) => t.meta.neighborhood === 'Gran Via');
    expect(granVia).toBeDefined();
    expect(granVia.meta.district).toBe("L'Eixample");
  });

  it('returns [] for an empty records array — no throw', () => {
    expect(formatSeries([])).toEqual([]);
  });

  it('returns [] for null input — no throw', () => {
    expect(formatSeries(null)).toEqual([]);
  });

  it('returns [] for undefined input — no throw', () => {
    expect(formatSeries(undefined)).toEqual([]);
  });
});
