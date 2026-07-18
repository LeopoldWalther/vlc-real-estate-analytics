import { describe, it, expect } from 'vitest';
import {
  priceHistogramRentRenderer,
  priceHistogramSaleRenderer,
} from '../src/charts/price_per_area_histogram.js';

const dataBasis = {
  price_per_area_histogram: [
    { operation: 'sale', bin_start_price_m2: 2250.0, bin_end_price_m2: 2500.0, count_listings: 9 },
    { operation: 'sale', bin_start_price_m2: 2500.0, bin_end_price_m2: 2750.0, count_listings: 14 },
    { operation: 'rent', bin_start_price_m2: 9.0, bin_end_price_m2: 10.0, count_listings: 5 },
    { operation: 'rent', bin_start_price_m2: 10.0, bin_end_price_m2: 11.0, count_listings: 7 },
  ],
};

describe('price_per_area_histogram renderers', () => {
  it('each has a stable id and title', () => {
    expect(priceHistogramRentRenderer.id).toBe('price-per-area-histogram-rent');
    expect(priceHistogramSaleRenderer.id).toBe('price-per-area-histogram-sale');
  });

  it('rent renderer uses bar traces restricted to rent bins', () => {
    const fig = priceHistogramRentRenderer.render(dataBasis);
    expect(fig.data).toHaveLength(1);
    expect(fig.data[0].type).toBe('bar');
    expect(fig.data[0].x).toEqual(['9-10', '10-11']);
    expect(fig.data[0].y).toEqual([5, 7]);
  });

  it('sale renderer uses bar traces restricted to sale bins (different scale)', () => {
    const fig = priceHistogramSaleRenderer.render(dataBasis);
    expect(fig.data).toHaveLength(1);
    expect(fig.data[0].type).toBe('bar');
    expect(fig.data[0].x).toEqual(['2250-2500', '2500-2750']);
    expect(fig.data[0].y).toEqual([9, 14]);
  });

  it('both renderers return safe empty data/layout for missing data_basis input', () => {
    expect(priceHistogramRentRenderer.render(null).data).toEqual([]);
    expect(priceHistogramSaleRenderer.render(undefined).data).toEqual([]);
    expect(priceHistogramRentRenderer.render({}).data).toEqual([]);
    expect(priceHistogramSaleRenderer.render(null).layout).toBeTypeOf('object');
  });
});
