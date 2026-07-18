import { describe, it, expect, vi, afterEach } from 'vitest';
import { PipelineHealthDataSource } from '../src/pipeline_health_data_source.js';

const VALID_FIXTURE = {
  schema_version: '1.0',
  generated_at: '2026-06-01T12:00:00Z',
  overall_status: 'green',
  execution_success: { status: 'green', summary: 'All recent invocations succeeded.', details: {}, evaluated_at: '2026-06-01T12:00:00Z' },
  execution_duration: { status: 'green', summary: 'Durations within bounds.', details: {}, evaluated_at: '2026-06-01T12:00:00Z' },
  api_quota: { status: 'yellow', summary: 'Approaching monthly quota.', details: {}, evaluated_at: '2026-06-01T12:00:00Z' },
  aws_cost: { status: 'red', summary: 'Cost above threshold.', details: {}, evaluated_at: '2026-06-01T12:00:00Z' },
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PipelineHealthDataSource', () => {
  it('resolves with parsed data when schema_version is 1.0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => VALID_FIXTURE }));

    const ds = new PipelineHealthDataSource('https://example.test/pipeline_health/latest.json');
    const data = await ds.load();

    expect(data.schema_version).toBe('1.0');
    expect(data.overall_status).toBe('green');
    expect(data.execution_success).toBeDefined();
    expect(data.execution_duration).toBeDefined();
    expect(data.api_quota).toBeDefined();
    expect(data.aws_cost).toBeDefined();
  });

  it('rejects with a clear error message when schema_version is not 1.0', async () => {
    const wrongSchema = { ...VALID_FIXTURE, schema_version: '2.0' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => wrongSchema }));

    const ds = new PipelineHealthDataSource('https://example.test/pipeline_health/latest.json');
    await expect(ds.load()).rejects.toThrow('schema_version');
  });

  it('rejects when the HTTP response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    const ds = new PipelineHealthDataSource('https://example.test/pipeline_health/latest.json');
    await expect(ds.load()).rejects.toThrow('404');
  });

  it('rejects when fetch itself throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const ds = new PipelineHealthDataSource('https://example.test/pipeline_health/latest.json');
    await expect(ds.load()).rejects.toThrow('network down');
  });

  it('rejects when the response body is not valid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => { throw new Error('Unexpected token in JSON'); },
    }));

    const ds = new PipelineHealthDataSource('https://example.test/pipeline_health/latest.json');
    await expect(ds.load()).rejects.toThrow();
  });
});

describe('PipelineHealthDataSource.loadOrUnavailable', () => {
  it('resolves with the parsed data on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => VALID_FIXTURE }));

    const ds = new PipelineHealthDataSource('https://example.test/pipeline_health/latest.json');
    const data = await ds.loadOrUnavailable();

    expect(data).not.toBeNull();
    expect(data.schema_version).toBe('1.0');
  });

  it('resolves with null (never rejects) on an HTTP failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const ds = new PipelineHealthDataSource('https://example.test/pipeline_health/latest.json');
    await expect(ds.loadOrUnavailable()).resolves.toBeNull();
  });

  it('resolves with null (never rejects) on a schema_version mismatch', async () => {
    const wrongSchema = { ...VALID_FIXTURE, schema_version: '99.0' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => wrongSchema }));

    const ds = new PipelineHealthDataSource('https://example.test/pipeline_health/latest.json');
    await expect(ds.loadOrUnavailable()).resolves.toBeNull();
  });

  it('resolves with null (never rejects) on a network/fetch throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const ds = new PipelineHealthDataSource('https://example.test/pipeline_health/latest.json');
    await expect(ds.loadOrUnavailable()).resolves.toBeNull();
  });

  it('resolves with null (never rejects) when the JSON body is malformed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => { throw new Error('Unexpected token in JSON'); },
    }));

    const ds = new PipelineHealthDataSource('https://example.test/pipeline_health/latest.json');
    await expect(ds.loadOrUnavailable()).resolves.toBeNull();
  });
});
