import { describe, it, expect } from 'vitest';
import { pipelineAwsCostChartRenderer } from '../../src/charts/pipeline_aws_cost_chart.js';

const DOCUMENT = {
  aws_cost: {
    status: 'green',
    details: {
      monthly_cost_by_service: [
        { month: '2026-01', services: { 'AWS Lambda': 1.0, 'Amazon S3': 0.2 } },
        { month: '2026-02', services: { 'AWS Lambda': 1.1 } },
      ],
    },
  },
};

describe('pipelineAwsCostChartRenderer', () => {
  it('has a stable id and title', () => {
    expect(pipelineAwsCostChartRenderer.id).toBe('pipeline-aws-cost-chart');
    expect(typeof pipelineAwsCostChartRenderer.title).toBe('string');
  });

  it('creates one stacked trace per service', () => {
    const fig = pipelineAwsCostChartRenderer.render(DOCUMENT);
    expect(fig.data).toHaveLength(2);
    expect(fig.layout.barmode).toBe('stack');
  });

  it('month totals match fixture data, filling gaps with 0', () => {
    const fig = pipelineAwsCostChartRenderer.render(DOCUMENT);
    const lambda = fig.data.find((t) => t.name === 'AWS Lambda');
    const s3 = fig.data.find((t) => t.name === 'Amazon S3');
    expect(lambda.x).toEqual(['2026-01', '2026-02']);
    expect(lambda.y).toEqual([1.0, 1.1]);
    expect(s3.y).toEqual([0.2, 0]);
  });

  it('returns a valid empty figure for null/empty input', () => {
    expect(pipelineAwsCostChartRenderer.render(null).data).toEqual([]);
    expect(pipelineAwsCostChartRenderer.render(undefined).data).toEqual([]);
    expect(pipelineAwsCostChartRenderer.render({}).data).toEqual([]);
    expect(pipelineAwsCostChartRenderer.render(null).layout).toBeTypeOf('object');
  });
});
