import { describe, it, expect } from 'vitest';
import {
  pipelineApiQuotaChartRenderer,
  API_QUOTA_YELLOW_THRESHOLD_REQUESTS,
  API_QUOTA_RED_THRESHOLD_REQUESTS,
} from '../../src/charts/pipeline_api_quota_chart.js';

const DOCUMENT = {
  api_quota: {
    status: 'yellow',
    details: {
      credential_sets: {
        LVW: {
          status: 'yellow',
          label: 'sale',
          quota: 100,
          monthly_requests: { '2026-01': 40, '2026-02': 82 },
        },
        PMV: {
          status: 'green',
          label: 'rent',
          quota: 100,
          monthly_requests: { '2026-01': 20, '2026-02': 25 },
        },
      },
    },
  },
};

describe('pipelineApiQuotaChartRenderer', () => {
  it('has a stable id and title', () => {
    expect(pipelineApiQuotaChartRenderer.id).toBe('pipeline-api-quota-chart');
    expect(typeof pipelineApiQuotaChartRenderer.title).toBe('string');
  });

  it('thresholds match backend constants (80 / 95 requests)', () => {
    expect(API_QUOTA_YELLOW_THRESHOLD_REQUESTS).toBe(80);
    expect(API_QUOTA_RED_THRESHOLD_REQUESTS).toBe(95);
  });

  it('LVW and PMV traces render over available months', () => {
    const fig = pipelineApiQuotaChartRenderer.render(DOCUMENT);
    expect(fig.data).toHaveLength(2);
    const sale = fig.data.find((t) => t.name === 'sale');
    const rent = fig.data.find((t) => t.name === 'rent');
    expect(sale.x).toEqual(['2026-01', '2026-02']);
    expect(sale.y).toEqual([40, 82]);
    expect(rent.y).toEqual([20, 25]);
  });

  it('quota/threshold reference shapes render correctly', () => {
    const fig = pipelineApiQuotaChartRenderer.render(DOCUMENT);
    const shapeYValues = fig.layout.shapes.map((s) => s.y0);
    expect(shapeYValues).toContain(80);
    expect(shapeYValues).toContain(95);
  });

  it('returns a valid empty figure for null/empty input', () => {
    expect(pipelineApiQuotaChartRenderer.render(null).data).toEqual([]);
    expect(pipelineApiQuotaChartRenderer.render(undefined).data).toEqual([]);
    expect(pipelineApiQuotaChartRenderer.render({}).data).toEqual([]);
    expect(pipelineApiQuotaChartRenderer.render(null).layout.shapes).toHaveLength(2);
  });
});
