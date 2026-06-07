import { describe, it, expect, vi, afterEach } from 'vitest';
import { DataSource, FakeDataSource } from '../src/data_source.js';
import fixture from './fixtures/latest.sample.json';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('DataSource', () => {
  it('resolves with parsed data when schema_version is 1.0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => fixture })
    );

    const ds = new DataSource('https://example.test/latest.json');
    const data = await ds.load();

    expect(data.schema_version).toBe('1.0');
    expect(data.general).toBeDefined();
    expect(data.relevant).toBeDefined();
  });

  it('rejects with a clear error message when schema_version is not 1.0', async () => {
    const wrongSchema = { ...fixture, schema_version: '2.0' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => wrongSchema })
    );

    const ds = new DataSource('https://example.test/latest.json');
    await expect(ds.load()).rejects.toThrow('schema_version');
  });

  it('rejects when the HTTP response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));

    const ds = new DataSource('https://example.test/latest.json');
    await expect(ds.load()).rejects.toThrow('403');
  });
});

describe('FakeDataSource', () => {
  it('returns the fixture without making any network call', async () => {
    // Stub fetch so any accidental call throws immediately
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      throw new Error('fetch must not be called in unit tests');
    }));

    const fake = new FakeDataSource(fixture);
    const data = await fake.load();

    expect(data.schema_version).toBe('1.0');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects wrong schema_version even for in-memory fixtures', async () => {
    const wrongSchema = { ...fixture, schema_version: '99.0' };
    const fake = new FakeDataSource(wrongSchema);

    await expect(fake.load()).rejects.toThrow('schema_version');
  });

  it('satisfies the same load() interface as DataSource (polymorphism)', async () => {
    // FakeDataSource and DataSource both respond to load() and return the same shape
    const fake = new FakeDataSource(fixture);
    const data = await fake.load();

    expect(data.schema_version).toBe('1.0');
    expect(data.general.price_time_series_neighborhood).toBeInstanceOf(Array);
    expect(data.relevant.rent_vs_sale_ratio).toBeInstanceOf(Array);
  });
});
