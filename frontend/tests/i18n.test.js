import { describe, it, expect } from 'vitest';
import { t, isRtl, resolveLocale, SUPPORTED_LOCALES, DEFAULT_LOCALE, localeKeys } from '../src/i18n.js';

describe('SUPPORTED_LOCALES / DEFAULT_LOCALE', () => {
  it('supports exactly the 5 required locales', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en', 'de', 'es', 'ar', 'tr']);
  });

  it('defaults to English', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });
});

describe('t', () => {
  it('returns the English string for a known key in en', () => {
    expect(t('en', 'filters.districts')).toBe('Districts');
  });

  it('returns a translated string for each supported non-English locale', () => {
    expect(t('de', 'filters.districts')).toBe('Bezirke');
    expect(t('es', 'filters.districts')).toBe('Distritos');
    expect(t('ar', 'filters.districts')).toBe('المناطق');
    expect(t('tr', 'filters.districts')).toBe('İlçeler');
  });

  it('interpolates {value} placeholders', () => {
    expect(t('en', 'population.sizeGte', { value: 120 })).toBe('≥120 m²');
    expect(t('de', 'population.roomsGte', { value: 2 })).toBe('≥2 Zimmer');
  });

  it('leaves an unmatched placeholder untouched rather than throwing', () => {
    expect(t('en', 'population.sizeGte')).toBe('≥{value} m²');
  });

  it('falls back to English when the locale is unsupported', () => {
    expect(t('fr', 'filters.districts')).toBe('Districts');
  });

  it('falls back to the English string when a key is missing from a locale dict', () => {
    // Every real key exists in every locale in production data, but the
    // fallback path itself must still hold for any future partial locale.
    expect(t('de', 'this.key.does.not.exist')).toBe('this.key.does.not.exist');
  });

  it('has every English key mirrored in every other locale (no missing translations)', () => {
    const knownKeys = [
      'app.title', 'app.subtitle', 'app.themeToggleLabel', 'app.languageToggleLabel',
      'error.message', 'error.retryButton',
      'kpi.medianRent', 'kpi.medianSale', 'kpi.grossYield', 'kpi.listingCount', 'kpi.lastUpdated',
      'population.label', 'population.all', 'population.filteredFallback', 'population.filteredPrefix',
      'population.sizeGte', 'population.lift', 'population.roomsGte', 'population.bathroomsGte', 'population.floorNot',
      'filters.districts', 'filters.neighborhoods', 'filters.clear', 'filters.badgeAll',
      'filters.selectUpToDistricts', 'filters.selectUpToNeighborhoods', 'filters.noDataAvailable',
      'footer.dataUpdated', 'footer.sourceLink',
      'charts.price-time-series-rent.title', 'charts.price-time-series-rent.yaxis',
      'charts.price-time-series-sale.title', 'charts.price-time-series-sale.yaxis',
      'charts.price-time-series-district-rent.title', 'charts.price-time-series-district-rent.yaxis',
      'charts.price-time-series-district-sale.title', 'charts.price-time-series-district-sale.yaxis',
      'charts.rent-vs-sale-ratio.title', 'charts.rent-vs-sale-ratio.xaxis', 'charts.rent-vs-sale-ratio.yaxis',
      'charts.rent-vs-sale-ratio-time-series.title', 'charts.rent-vs-sale-ratio-time-series.yaxis',
      'charts.boxplot-by-neighborhood-rent.title', 'charts.boxplot-by-neighborhood-rent.yaxis',
      'charts.boxplot-by-neighborhood-sale.title', 'charts.boxplot-by-neighborhood-sale.yaxis',
      'charts.xaxis.date',
    ];
    for (const locale of ['de', 'es', 'ar', 'tr']) {
      for (const key of knownKeys) {
        const value = t(locale, key);
        expect(value, `${locale}.${key} should not silently fall back to the raw key`).not.toBe(key);
      }
    }
  });

  it('discloses the last-3-month basis for median KPI labels in every locale (M1)', () => {
    // Each locale's own "3 month(s)" wording — not an English substring check,
    // since e.g. Arabic and Turkish translate the phrase.
    const threeMonthPhrase = {
      en: '3 month',
      de: '3 Monat',
      es: '3 meses',
      ar: '3 أشهر',
      tr: 'son 3 ay',
    };
    for (const locale of ['en', 'de', 'es', 'ar', 'tr']) {
      const phrase = threeMonthPhrase[locale];
      expect(
        t(locale, 'kpi.medianRent'),
        `${locale}.kpi.medianRent should mention the 3-month basis`,
      ).toContain(phrase);
      expect(
        t(locale, 'kpi.medianSale'),
        `${locale}.kpi.medianSale should mention the 3-month basis`,
      ).toContain(phrase);
    }
  });

  it('keeps the all-time boxplot chart titles unchanged (no 3-month wording)', () => {
    const chartTitleKeys = [
      'charts.boxplot-by-neighborhood-rent.title',
      'charts.boxplot-by-neighborhood-sale.title',
    ];
    for (const locale of ['en', 'de', 'es', 'ar', 'tr']) {
      for (const key of chartTitleKeys) {
        const value = t(locale, key);
        expect(value, `${locale}.${key} should not mention 3 months`).not.toMatch(/3\s*(month|Monat|mes|شهر|ay)/i);
      }
    }
  });
});

describe('isRtl', () => {
  it('is true only for Arabic', () => {
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('en')).toBe(false);
    expect(isRtl('de')).toBe(false);
    expect(isRtl('es')).toBe(false);
    expect(isRtl('tr')).toBe(false);
  });
});

describe('locale completeness (all 5 locales must expose identical key sets)', () => {
  it('every locale has exactly the same set of translation keys as en', () => {
    const englishKeys = new Set(localeKeys('en'));
    expect(englishKeys.size).toBeGreaterThan(0);
    for (const locale of SUPPORTED_LOCALES) {
      const keys = new Set(localeKeys(locale));
      const missing = [...englishKeys].filter((k) => !keys.has(k));
      const extra = [...keys].filter((k) => !englishKeys.has(k));
      expect(missing, `${locale} is missing keys: ${missing.join(', ')}`).toEqual([]);
      expect(extra, `${locale} has unexpected extra keys: ${extra.join(', ')}`).toEqual([]);
    }
  });

  it('includes the new tab/search-config/data-basis-chart keys introduced by FEATURE-011', () => {
    const requiredNewKeys = [
      'tabs.trendAnalysis',
      'tabs.dataBasis',
      'dataBasis.intro',
      'dataBasis.mapDescription',
      'dataBasis.searchConfig.heading',
      'dataBasis.searchConfig.radius',
      'dataBasis.searchConfig.sizeRange',
      'dataBasis.searchConfig.propertyType',
      'dataBasis.searchConfig.elevator',
      'dataBasis.searchConfig.preservation',
      'dataBasis.searchConfig.center',
      'dataBasis.searchConfig.yes',
      'dataBasis.searchConfig.no',
      'charts.weekly-listing-volume.title',
      'charts.weekly-listing-volume.yaxis',
      'charts.size-histogram.title',
      'charts.size-histogram.xaxis',
      'charts.size-histogram.yaxis',
      'charts.rooms-distribution.title',
      'charts.rooms-distribution.xaxis',
      'charts.rooms-distribution.yaxis',
      'charts.price-per-area-histogram-rent.title',
      'charts.price-per-area-histogram-rent.xaxis',
      'charts.price-per-area-histogram-rent.yaxis',
      'charts.price-per-area-histogram-sale.title',
      'charts.price-per-area-histogram-sale.xaxis',
      'charts.price-per-area-histogram-sale.yaxis',
      'charts.listing-location-grid-map.title',
      'charts.listing-location-grid-map.xaxis',
      'charts.listing-location-grid-map.yaxis',
    ];
    const englishKeys = new Set(localeKeys('en'));
    for (const key of requiredNewKeys) {
      expect(englishKeys.has(key), `en is missing required new key: ${key}`).toBe(true);
    }
  });

  it('the map copy describes an aggregated coordinate distribution, not a street map, in every locale', () => {
    // Locale-specific phrase fragments (not an English substring check).
    const aggregatedPhrase = {
      en: 'aggregat',
      de: 'aggregiert',
      es: 'agregad',
      ar: 'مجمّع',
      tr: 'toplu',
    };
    for (const locale of SUPPORTED_LOCALES) {
      const value = t(locale, 'dataBasis.mapDescription');
      expect(value.toLowerCase()).toContain(aggregatedPhrase[locale]);
    }
  });
});

describe('resolveLocale', () => {
  it('returns the given locale when supported', () => {
    expect(resolveLocale('de')).toBe('de');
  });

  it('falls back to DEFAULT_LOCALE for null/undefined/unsupported values', () => {
    expect(resolveLocale(null)).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
    expect(resolveLocale('fr')).toBe('en');
    expect(resolveLocale('')).toBe('en');
  });
});
