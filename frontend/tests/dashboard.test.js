import { describe, it, expect, vi, afterEach } from 'vitest';
import { Dashboard } from '../src/dashboard.js';
import { FakeDataSource } from '../src/data_source.js';
import fixture from './fixtures/latest.sample.json';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Dashboard', () => {
  it('calls Plotly.newPlot for each renderer with its resolved container', async () => {
    const mockNewPlot = vi.fn();
    vi.stubGlobal('Plotly', { newPlot: mockNewPlot });

    const container = { id: 'chart-container' }; // plain object — no real DOM needed
    const renderer = {
      id: 'test-chart',
      title: 'Test',
      render: vi.fn().mockReturnValue({ data: [{ type: 'scatter' }], layout: { title: 'Test' } }),
    };

    const dashboard = new Dashboard(new FakeDataSource(fixture), [renderer]);
    await dashboard.mount({ 'test-chart': container });

    expect(renderer.render).toHaveBeenCalledOnce();
    expect(mockNewPlot).toHaveBeenCalledOnce();
    expect(mockNewPlot).toHaveBeenCalledWith(
      container,
      [{ type: 'scatter' }],
      { title: 'Test' }
    );
  });

  it('passes data.general to each renderer', async () => {
    vi.stubGlobal('Plotly', { newPlot: vi.fn() });

    const renderer = {
      id: 'c1',
      render: vi.fn().mockReturnValue({ data: [], layout: {} }),
    };

    await new Dashboard(new FakeDataSource(fixture), [renderer]).mount({ c1: {} });

    // Dashboard must pass the full general population block — not just a sub-key
    expect(renderer.render).toHaveBeenCalledWith(fixture.general);
  });

  it('skips a renderer whose id is absent from the containers map', async () => {
    const mockNewPlot = vi.fn();
    vi.stubGlobal('Plotly', { newPlot: mockNewPlot });

    const renderer = { id: 'missing', render: vi.fn() };
    await new Dashboard(new FakeDataSource(fixture), [renderer]).mount({});

    expect(renderer.render).not.toHaveBeenCalled();
    expect(mockNewPlot).not.toHaveBeenCalled();
  });

  it('mounts multiple renderers in declaration order', async () => {
    const calls = [];
    vi.stubGlobal('Plotly', {
      newPlot: vi.fn((container) => calls.push(container.id)),
    });

    const r1 = { id: 'r1', render: vi.fn().mockReturnValue({ data: [], layout: {} }) };
    const r2 = { id: 'r2', render: vi.fn().mockReturnValue({ data: [], layout: {} }) };

    await new Dashboard(new FakeDataSource(fixture), [r1, r2]).mount({
      r1: { id: 'r1' },
      r2: { id: 'r2' },
    });

    expect(calls).toEqual(['r1', 'r2']);
  });

  it('propagates a DataSource load() rejection to the caller', async () => {
    vi.stubGlobal('Plotly', { newPlot: vi.fn() });

    const brokenSource = { load: vi.fn().mockRejectedValue(new Error('network error')) };
    const dashboard = new Dashboard(brokenSource, []);

    await expect(dashboard.mount({})).rejects.toThrow('network error');
  });
});
