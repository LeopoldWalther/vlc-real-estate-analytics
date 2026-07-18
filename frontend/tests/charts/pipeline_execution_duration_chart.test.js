import { describe, it, expect } from 'vitest';
import {
  pipelineExecutionDurationChartRenderer,
  DURATION_YELLOW_THRESHOLD_SECONDS,
  DURATION_RED_THRESHOLD_SECONDS,
} from '../../src/charts/pipeline_execution_duration_chart.js';

const DOCUMENT = {
  schema_version: '1.1',
  execution_duration: {
    status: 'yellow',
    details: {
      functions: {
        'bronze-collector': {
          status: 'yellow',
          max_duration_seconds: 320,
          recent_invocations: [
            { timestamp: '2026-06-03T00:00:00', succeeded: true, duration_seconds: 320.0 },
            { timestamp: '2026-06-02T00:00:00', succeeded: true, duration_seconds: 100.0 },
          ],
        },
      },
    },
  },
};

describe('pipelineExecutionDurationChartRenderer', () => {
  it('has a stable id and title', () => {
    expect(pipelineExecutionDurationChartRenderer.id).toBe('pipeline-execution-duration-chart');
    expect(typeof pipelineExecutionDurationChartRenderer.title).toBe('string');
  });

  it('thresholds match backend constants (300s / 600s)', () => {
    expect(DURATION_YELLOW_THRESHOLD_SECONDS).toBe(300);
    expect(DURATION_RED_THRESHOLD_SECONDS).toBe(600);
  });

  it('bars match duration_seconds values', () => {
    const fig = pipelineExecutionDurationChartRenderer.render(DOCUMENT);
    const bronze = fig.data.find((t) => t.name === 'bronze-collector');
    expect(bronze.type).toBe('bar');
    // Oldest-first
    expect(bronze.y).toEqual([100.0, 320.0]);
  });

  it('threshold shapes exist at 300s and 600s', () => {
    const fig = pipelineExecutionDurationChartRenderer.render(DOCUMENT);
    const shapeYValues = fig.layout.shapes.map((s) => s.y0);
    expect(shapeYValues).toContain(300);
    expect(shapeYValues).toContain(600);
  });

  it('returns a valid empty figure for null/empty input', () => {
    expect(pipelineExecutionDurationChartRenderer.render(null).data).toEqual([]);
    expect(pipelineExecutionDurationChartRenderer.render(undefined).data).toEqual([]);
    expect(pipelineExecutionDurationChartRenderer.render({}).data).toEqual([]);
    // Threshold shapes/layout are still present even with no data.
    expect(pipelineExecutionDurationChartRenderer.render(null).layout.shapes).toHaveLength(2);
  });
});
