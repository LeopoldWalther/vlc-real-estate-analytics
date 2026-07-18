import { describe, it, expect } from 'vitest';
import { formatSearchConfigSummary } from '../src/search_config.js';

const fullConfig = {
  center_lat: 39.4693441,
  center_lon: -0.379561,
  distance_m: 1500,
  min_size_m2: 100,
  max_size_m2: 160,
  elevator: true,
  preservation: 'good',
  property_type: 'homes',
  sale_credential_label: 'LVW',
  rent_credential_label: 'PMV',
};

describe('formatSearchConfigSummary', () => {
  it('returns an empty array for missing/null input', () => {
    expect(formatSearchConfigSummary(null, 'en')).toEqual([]);
    expect(formatSearchConfigSummary(undefined, 'en')).toEqual([]);
  });

  it('formats every known field into a labelled row with metric units', () => {
    const rows = formatSearchConfigSummary(fullConfig, 'en');
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));

    expect(byKey.radius.value).toContain('1500');
    expect(byKey.radius.value).toMatch(/m\b/); // metres unit
    expect(byKey.sizeRange.value).toContain('100');
    expect(byKey.sizeRange.value).toContain('160');
    expect(byKey.sizeRange.value).toMatch(/m²/);
    expect(byKey.propertyType.value).toBe('homes');
    expect(byKey.preservation.value).toBe('good');
    expect(byKey.center.value).toContain('39.4693');
    expect(byKey.center.value).toContain('-0.3796');
  });

  it('every row has a non-empty label sourced from i18n (locale-independent formatting)', () => {
    const rows = formatSearchConfigSummary(fullConfig, 'en');
    for (const row of rows) {
      expect(typeof row.label).toBe('string');
      expect(row.label.length).toBeGreaterThan(0);
    }
    // Same field set/order regardless of locale (only the label text differs).
    const rowsDe = formatSearchConfigSummary(fullConfig, 'de');
    expect(rowsDe.map((r) => r.key)).toEqual(rows.map((r) => r.key));
  });

  it('translates the elevator boolean into a yes/no label per locale', () => {
    const rowsEn = formatSearchConfigSummary(fullConfig, 'en');
    const rowsDe = formatSearchConfigSummary(fullConfig, 'de');
    const elevatorEn = rowsEn.find((r) => r.key === 'elevator');
    const elevatorDe = rowsDe.find((r) => r.key === 'elevator');
    expect(elevatorEn.value).not.toBe(elevatorDe.value);
  });

  it('gracefully skips missing fields instead of emitting broken rows', () => {
    const partial = { distance_m: 1500 };
    const rows = formatSearchConfigSummary(partial, 'en');
    const keys = rows.map((r) => r.key);
    expect(keys).toContain('radius');
    expect(keys).not.toContain('sizeRange');
    expect(keys).not.toContain('center');
  });

  it('defaults to English when no locale is given', () => {
    const rows = formatSearchConfigSummary(fullConfig);
    expect(rows.find((r) => r.key === 'propertyType').label.length).toBeGreaterThan(0);
  });
});
