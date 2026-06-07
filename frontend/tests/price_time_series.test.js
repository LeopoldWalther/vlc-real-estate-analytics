import { describe, it, expect } from 'vitest';
import { priceTimeSeriesRenderer } from '../src/charts/price_time_series.js';
import fixture from './fixtures/latest.sample.json';

describe('priceTimeSeriesRenderer', () => {
  it('exposes the required ChartRenderer shape: id, title, render', () => {
    expect(typeof priceTimeSeriesRenderer.id).toBe('string');
    expect(priceTimeSeriesRenderer.id).toBe('price-time-series');
    expect(typeof priceTimeSeriesRenderer.title).toBe('string');
    expect(typeof priceTimeSeriesRenderer.render).toBe('function');
  });

  it('returns a Plotly figure with data[] and layout from a population block', () => {
    const figure = priceTimeSeriesRenderer.render(fixture.general);

    expect(figure).toHaveProperty('data');
    expect(figure).toHaveProperty('layout');
    expect(Array.isArray(figure.data)).toBe(true);
    expect(figure.data.length).toBeGreaterThan(0);
  });

  it('produces one trace per (operation, neighbourhood) — 3 groups from fixture', () => {
    const figure = priceTimeSeriesRenderer.render(fixture.general);

    // Fixture: sale/Arrancapins (2 snaps), rent/Arrancapins (1), sale/Gran Via (1) = 3 groups
    expect(figure.data).toHaveLength(3);
    figure.data.forEach((trace) => {
      expect(trace.type).toBe('scatter');
      expect(trace).toHaveProperty('x');
      expect(trace).toHaveProperty('y');
      expect(trace).toHaveProperty('meta.operation');
      expect(trace).toHaveProperty('meta.neighborhood');
    });
  });

  it('layout carries x-axis and y-axis titles', () => {
    const figure = priceTimeSeriesRenderer.render(fixture.general);

    expect(figure.layout.xaxis).toBeDefined();
    expect(figure.layout.yaxis).toBeDefined();
  });

  it('returns empty data array for a population block missing the key — no throw', () => {
    const figure = priceTimeSeriesRenderer.render({});

    expect(figure.data).toEqual([]);
  });

  it('returns empty data array for null population block — no throw', () => {
    const figure = priceTimeSeriesRenderer.render(null);

    expect(figure.data).toEqual([]);
  });
});
