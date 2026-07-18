import { describe, it, expect } from 'vitest';
import { weeklyListingVolumeRenderer } from '../src/charts/weekly_listing_volume.js';

const dataBasis = {
  weekly_listing_volume: [
    { operation: 'sale', snapshot_date: '2026-01-05', count_listings: 42 },
    { operation: 'sale', snapshot_date: '2026-01-12', count_listings: 45 },
    { operation: 'rent', snapshot_date: '2026-01-05', count_listings: 30 },
    { operation: 'rent', snapshot_date: '2026-01-12', count_listings: 33 },
  ],
};

describe('weeklyListingVolumeRenderer', () => {
  it('has a stable id and title', () => {
    expect(weeklyListingVolumeRenderer.id).toBe('weekly-listing-volume');
    expect(typeof weeklyListingVolumeRenderer.title).toBe('string');
  });

  it('creates separate sale/rent traces over snapshot_date', () => {
    const fig = weeklyListingVolumeRenderer.render(dataBasis);
    expect(fig.data).toHaveLength(2);
    const sale = fig.data.find((t) => t.meta?.operation === 'sale');
    const rent = fig.data.find((t) => t.meta?.operation === 'rent');
    expect(sale.x).toEqual(['2026-01-05', '2026-01-12']);
    expect(sale.y).toEqual([42, 45]);
    expect(rent.x).toEqual(['2026-01-05', '2026-01-12']);
    expect(rent.y).toEqual([30, 33]);
  });

  it('returns safe empty data/layout for missing data_basis input', () => {
    expect(weeklyListingVolumeRenderer.render(null).data).toEqual([]);
    expect(weeklyListingVolumeRenderer.render(undefined).data).toEqual([]);
    expect(weeklyListingVolumeRenderer.render({}).data).toEqual([]);
    expect(weeklyListingVolumeRenderer.render(null).layout).toBeTypeOf('object');
  });

  it('uses buildLayout-produced layout (has margin/font from chart_theme)', () => {
    const fig = weeklyListingVolumeRenderer.render(dataBasis);
    expect(fig.layout.margin).toBeDefined();
    expect(fig.layout.font).toBeDefined();
  });
});
