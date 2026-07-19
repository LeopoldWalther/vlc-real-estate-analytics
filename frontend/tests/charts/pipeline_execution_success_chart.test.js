import { describe, it, expect } from 'vitest';
import { pipelineExecutionSuccessChartRenderer } from '../../src/charts/pipeline_execution_success_chart.js';

const DOCUMENT = {
  schema_version: '1.1',
  execution_success: {
    status: 'yellow',
    details: {
      functions: {
        'bronze-collector': {
          status: 'green',
          recent_invocations: [
            { timestamp: '2026-06-03T00:00:00', succeeded: true, duration_seconds: 12.0 },
            { timestamp: '2026-06-02T00:00:00', succeeded: false, duration_seconds: 15.0 },
          ],
        },
        'silver-cleaner': {
          status: 'green',
          recent_invocations: [
            { timestamp: '2026-06-03T00:00:00', succeeded: true, duration_seconds: 8.0 },
          ],
        },
      },
    },
  },
};

describe('pipelineExecutionSuccessChartRenderer', () => {
  it('has a stable id and title', () => {
    expect(pipelineExecutionSuccessChartRenderer.id).toBe('pipeline-execution-success-chart');
    expect(typeof pipelineExecutionSuccessChartRenderer.title).toBe('string');
  });

  it('creates one trace per function', () => {
    const fig = pipelineExecutionSuccessChartRenderer.render(DOCUMENT);
    expect(fig.data).toHaveLength(2);
    const names = fig.data.map((t) => t.name);
    expect(names).toContain('bronze-collector');
    expect(names).toContain('silver-cleaner');
  });

  it('marker colors match invocation success/failure', () => {
    const fig = pipelineExecutionSuccessChartRenderer.render(DOCUMENT);
    const bronze = fig.data.find((t) => t.name === 'bronze-collector');
    // Oldest-first: [failed, succeeded]
    expect(bronze.marker.color).toEqual(['#dc2626', '#16a34a']);
  });

  it('places each function on its own constant horizontal row', () => {
    const fig = pipelineExecutionSuccessChartRenderer.render(DOCUMENT);
    const bronze = fig.data.find((t) => t.name === 'bronze-collector');
    const silver = fig.data.find((t) => t.name === 'silver-cleaner');
    // All points for a function share the same y (row) value.
    expect(new Set(bronze.y).size).toBe(1);
    expect(new Set(silver.y).size).toBe(1);
    // Different functions occupy different rows.
    expect(bronze.y[0]).not.toBe(silver.y[0]);
  });

  it('labels the y-axis with function names instead of Succeeded/Failed', () => {
    const fig = pipelineExecutionSuccessChartRenderer.render(DOCUMENT);
    expect(fig.layout.yaxis.ticktext).toEqual(['bronze-collector', 'silver-cleaner']);
  });

  it('returns a valid empty figure for null/empty input', () => {
    expect(pipelineExecutionSuccessChartRenderer.render(null).data).toEqual([]);
    expect(pipelineExecutionSuccessChartRenderer.render(undefined).data).toEqual([]);
    expect(pipelineExecutionSuccessChartRenderer.render({}).data).toEqual([]);
    expect(pipelineExecutionSuccessChartRenderer.render(null).layout).toBeTypeOf('object');
  });

  it('uses buildLayout-produced layout (has margin/font from chart_theme)', () => {
    const fig = pipelineExecutionSuccessChartRenderer.render(DOCUMENT);
    expect(fig.layout.margin).toBeDefined();
    expect(fig.layout.font).toBeDefined();
  });
});
