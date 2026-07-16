import { describe, it, expect } from 'vitest';
import {
  MAX_SCOPE_SELECTION,
  extractDistricts,
  extractNeighborhoods,
  filterPopulationBlock,
  toggleScopeSelection,
} from '../src/filters.js';

const sampleBlock = {
  price_time_series_neighborhood: [
    { district: 'Extramurs', neighborhood: 'Arrancapins', mean_priceByArea: 10 },
    { district: 'Extramurs', neighborhood: 'Botanic', mean_priceByArea: 20 },
    { district: 'Ciutat Vella', neighborhood: 'El Carme', mean_priceByArea: 30 },
  ],
  price_time_series_district: [
    { district: 'Extramurs', mean_priceByArea: 15 },
    { district: 'Ciutat Vella', mean_priceByArea: 25 },
  ],
  boxplot_by_neighborhood: [
    { district: 'Extramurs', neighborhood: 'Arrancapins', median: 10 },
    { district: 'Ciutat Vella', neighborhood: 'El Carme', median: 30 },
  ],
  min_count: 5,
};

describe('extractDistricts', () => {
  it('returns sorted, de-duplicated districts across all array fields', () => {
    expect(extractDistricts(sampleBlock)).toEqual(['Ciutat Vella', 'Extramurs']);
  });

  it('returns an empty array for null/undefined input', () => {
    expect(extractDistricts(null)).toEqual([]);
    expect(extractDistricts(undefined)).toEqual([]);
  });

  it('ignores non-array fields', () => {
    expect(extractDistricts({ min_count: 5 })).toEqual([]);
  });
});

describe('extractNeighborhoods', () => {
  it('returns sorted, de-duplicated neighborhoods across all array fields', () => {
    expect(extractNeighborhoods(sampleBlock)).toEqual(['Arrancapins', 'Botanic', 'El Carme']);
  });

  it('restricts to neighborhoods within the given districts when provided', () => {
    expect(extractNeighborhoods(sampleBlock, ['Extramurs'])).toEqual(['Arrancapins', 'Botanic']);
  });

  it('returns all neighborhoods when the districts filter is empty', () => {
    expect(extractNeighborhoods(sampleBlock, [])).toEqual(['Arrancapins', 'Botanic', 'El Carme']);
  });

  it('ignores rows without a neighborhood field', () => {
    expect(extractNeighborhoods({ price_time_series_district: sampleBlock.price_time_series_district })).toEqual([]);
  });
});

describe('filterPopulationBlock', () => {
  it('returns a shallow clone unfiltered when no scope is given', () => {
    const result = filterPopulationBlock(sampleBlock);
    expect(result).not.toBe(sampleBlock);
    expect(result).toEqual(sampleBlock);
  });

  it('passes through null/undefined unchanged', () => {
    expect(filterPopulationBlock(null)).toBe(null);
    expect(filterPopulationBlock(undefined)).toBe(undefined);
  });

  it('filters rows by district, leaving district-level rows without neighborhood intact', () => {
    const result = filterPopulationBlock(sampleBlock, { districts: ['Extramurs'] });
    expect(result.price_time_series_neighborhood).toEqual([
      { district: 'Extramurs', neighborhood: 'Arrancapins', mean_priceByArea: 10 },
      { district: 'Extramurs', neighborhood: 'Botanic', mean_priceByArea: 20 },
    ]);
    expect(result.price_time_series_district).toEqual([
      { district: 'Extramurs', mean_priceByArea: 15 },
    ]);
  });

  it('filters rows by neighborhood, leaving rows without a neighborhood field unaffected by that axis', () => {
    const result = filterPopulationBlock(sampleBlock, { neighborhoods: ['El Carme'] });
    expect(result.price_time_series_neighborhood).toEqual([
      { district: 'Ciutat Vella', neighborhood: 'El Carme', mean_priceByArea: 30 },
    ]);
    // district-level series has no neighborhood field, so it's untouched by
    // the neighborhood-only filter.
    expect(result.price_time_series_district).toEqual(sampleBlock.price_time_series_district);
  });

  it('combines district and neighborhood filters with AND semantics', () => {
    const result = filterPopulationBlock(sampleBlock, {
      districts: ['Extramurs'],
      neighborhoods: ['El Carme'],
    });
    // El Carme is not in Extramurs, so nothing matches both.
    expect(result.price_time_series_neighborhood).toEqual([]);
  });

  it('leaves non-array fields untouched', () => {
    const result = filterPopulationBlock(sampleBlock, { districts: ['Extramurs'] });
    expect(result.min_count).toBe(5);
  });
});

describe('toggleScopeSelection', () => {
  it('adds a value not yet selected', () => {
    expect(toggleScopeSelection([], 'A')).toEqual(['A']);
    expect(toggleScopeSelection(['A'], 'B')).toEqual(['A', 'B']);
  });

  it('removes a value already selected', () => {
    expect(toggleScopeSelection(['A', 'B'], 'A')).toEqual(['B']);
  });

  it('is a no-op when adding beyond the max selection size', () => {
    expect(toggleScopeSelection(['A', 'B', 'C'], 'D', 3)).toEqual(['A', 'B', 'C']);
  });

  it('defaults the max to MAX_SCOPE_SELECTION (3)', () => {
    expect(MAX_SCOPE_SELECTION).toBe(3);
    expect(toggleScopeSelection(['A', 'B', 'C'], 'D')).toEqual(['A', 'B', 'C']);
  });

  it('does not mutate the input array', () => {
    const current = ['A'];
    toggleScopeSelection(current, 'B');
    expect(current).toEqual(['A']);
  });
});
