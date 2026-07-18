import { describe, it, expect } from 'vitest';
import { summaryStats, formatKpi } from '../src/summary.js';
import fixture from './fixtures/latest.sample.json';

describe('summaryStats', () => {
  it('computes a count-weighted median rent and median sale from boxplot_by_neighborhood', () => {
    const data = {
      generated_at: '2026-02-01T00:00:00Z',
      boxplot_by_neighborhood: [
        { operation: 'rent', neighborhood: 'A', count: 10, median: 10 },
        { operation: 'rent', neighborhood: 'B', count: 90, median: 20 },
        { operation: 'sale', neighborhood: 'A', count: 10, median: 2000 },
        { operation: 'sale', neighborhood: 'B', count: 90, median: 3000 },
      ],
      rent_vs_sale_ratio: [],
    };

    const stats = summaryStats(data);

    // 90% weight on median=20 (rent) pulls the weighted median toward 20, not
    // the naive mean-of-medians (15).
    expect(stats.medianRentEurPerM2Month).toBe(20);
    expect(stats.medianSaleEurPerM2).toBe(3000);
  });

  it('derives an implied gross yield % from mean_sales_price_by_rent_ratio using (12 / ratio) * 100', () => {
    const data = {
      generated_at: '2026-02-01T00:00:00Z',
      boxplot_by_neighborhood: [],
      rent_vs_sale_ratio: [
        {
          mean_sales_price_by_rent_ratio: 200,
          count_listings_sale: 10,
          count_listings_rent: 10,
        },
      ],
    };

    const stats = summaryStats(data);

    expect(stats.impliedGrossYieldPercent).toBeCloseTo((12 / 200) * 100, 5);
  });

  it('sums total listing counts across rent_vs_sale_ratio groups', () => {
    const data = {
      generated_at: '2026-02-01T00:00:00Z',
      boxplot_by_neighborhood: [],
      rent_vs_sale_ratio: [
        { mean_sales_price_by_rent_ratio: 200, count_listings_sale: 10, count_listings_rent: 8 },
        { mean_sales_price_by_rent_ratio: 210, count_listings_sale: 5, count_listings_rent: 4 },
      ],
    };

    const stats = summaryStats(data);

    expect(stats.totalListingCount).toBe(10 + 8 + 5 + 4);
  });

  it('reads lastUpdated from data.generated_at', () => {
    const data = {
      generated_at: '2026-02-01T00:00:00Z',
      boxplot_by_neighborhood: [],
      rent_vs_sale_ratio: [],
    };

    const stats = summaryStats(data);

    expect(stats.lastUpdated).toBe('2026-02-01T00:00:00Z');
  });

  it('returns every field null and does not throw for an empty object', () => {
    const stats = summaryStats({});

    expect(stats).toEqual({
      medianRentEurPerM2Month: null,
      medianSaleEurPerM2: null,
      impliedGrossYieldPercent: null,
      totalListingCount: null,
      lastUpdated: null,
    });
  });

  it('returns every field null and does not throw for null input', () => {
    const stats = summaryStats(null);

    expect(stats).toEqual({
      medianRentEurPerM2Month: null,
      medianSaleEurPerM2: null,
      impliedGrossYieldPercent: null,
      totalListingCount: null,
      lastUpdated: null,
    });
  });

  it('returns null for a field whose source array is present but empty', () => {
    const data = { generated_at: null, boxplot_by_neighborhood: [], rent_vs_sale_ratio: [] };

    const stats = summaryStats(data);

    expect(stats.medianRentEurPerM2Month).toBeNull();
    expect(stats.medianSaleEurPerM2).toBeNull();
    expect(stats.impliedGrossYieldPercent).toBeNull();
    expect(stats.totalListingCount).toBeNull();
    expect(stats.lastUpdated).toBeNull();
  });

  it('handles the real fixture.general shape without throwing (generated_at lives one level up, so lastUpdated is null here)', () => {
    const stats = summaryStats(fixture.general);

    expect(() => summaryStats(fixture.general)).not.toThrow();
    // fixture.general has one sale boxplot group (no rent group) and one
    // rent_vs_sale_ratio group.
    expect(stats.medianSaleEurPerM2).toBe(2500.0);
    expect(stats.medianRentEurPerM2Month).toBeNull();
    expect(stats.impliedGrossYieldPercent).toBeCloseTo((12 / 200.0) * 100, 5);
    expect(stats.totalListingCount).toBe(10 + 8);
    expect(stats.lastUpdated).toBeNull();
  });

  it('prefers boxplot_by_neighborhood_last_3m over boxplot_by_neighborhood when both exist (H1)', () => {
    const data = {
      generated_at: '2026-02-01T00:00:00Z',
      // All-time field has an old outlier that should be ignored once the
      // rolling field is present.
      boxplot_by_neighborhood: [
        { operation: 'rent', neighborhood: 'A', count: 500, median: 999 },
        { operation: 'sale', neighborhood: 'A', count: 500, median: 999 },
      ],
      boxplot_by_neighborhood_last_3m: [
        { operation: 'rent', neighborhood: 'A', count: 10, median: 20 },
        { operation: 'sale', neighborhood: 'A', count: 10, median: 3000 },
      ],
      rent_vs_sale_ratio: [],
    };

    const stats = summaryStats(data);

    expect(stats.medianRentEurPerM2Month).toBe(20);
    expect(stats.medianSaleEurPerM2).toBe(3000);
  });

  it('falls back to boxplot_by_neighborhood when boxplot_by_neighborhood_last_3m is absent (H1)', () => {
    const data = {
      generated_at: '2026-02-01T00:00:00Z',
      boxplot_by_neighborhood: [
        { operation: 'rent', neighborhood: 'A', count: 10, median: 20 },
        { operation: 'sale', neighborhood: 'A', count: 10, median: 3000 },
      ],
      rent_vs_sale_ratio: [],
    };

    const stats = summaryStats(data);

    expect(stats.medianRentEurPerM2Month).toBe(20);
    expect(stats.medianSaleEurPerM2).toBe(3000);
  });

  it('falls back to boxplot_by_neighborhood when boxplot_by_neighborhood_last_3m is an empty array (H1)', () => {
    const data = {
      generated_at: '2026-02-01T00:00:00Z',
      boxplot_by_neighborhood: [
        { operation: 'rent', neighborhood: 'A', count: 10, median: 20 },
        { operation: 'sale', neighborhood: 'A', count: 10, median: 3000 },
      ],
      boxplot_by_neighborhood_last_3m: [],
      rent_vs_sale_ratio: [],
    };

    const stats = summaryStats(data);

    expect(stats.medianRentEurPerM2Month).toBe(20);
    expect(stats.medianSaleEurPerM2).toBe(3000);
  });
});

describe('formatKpi', () => {
  it('formats eur_per_m2_month values', () => {
    expect(formatKpi(12.5, 'eur_per_m2_month')).toBe('12.50 €/m²/mo');
  });

  it('formats eur_per_m2 values', () => {
    expect(formatKpi(2500, 'eur_per_m2')).toBe('2,500 €/m²');
  });

  it('formats percent values', () => {
    expect(formatKpi(6.5, 'percent')).toBe('6.50%');
  });

  it('formats count values', () => {
    expect(formatKpi(1234, 'count')).toBe('1,234');
  });

  it('formats date values', () => {
    expect(formatKpi('2026-02-01T00:00:00Z', 'date')).toBe('2026-02-01');
  });

  it('returns an em-dash placeholder for null input regardless of kind', () => {
    expect(formatKpi(null, 'eur_per_m2_month')).toBe('—');
    expect(formatKpi(null, 'percent')).toBe('—');
    expect(formatKpi(null, 'count')).toBe('—');
    expect(formatKpi(null, 'date')).toBe('—');
  });

  it('does not throw for undefined input', () => {
    expect(formatKpi(undefined, 'count')).toBe('—');
  });
});
