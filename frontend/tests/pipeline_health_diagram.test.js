import { describe, it, expect } from 'vitest';
import {
  buildDiagramModel,
  renderDiagramSvg,
  GREEN,
  YELLOW,
  RED,
  UNKNOWN,
} from '../src/pipeline_health_diagram.js';

const DOCUMENT = {
  overall_status: 'yellow',
  execution_success: {
    status: 'yellow',
    details: {
      functions: {
        'bronze-collector': { status: 'green' },
        'silver-cleaner': { status: 'yellow' },
        'gold-aggregator': { status: 'green' },
      },
    },
  },
  execution_duration: {
    status: 'green',
    details: {
      functions: {
        'bronze-collector': { status: 'green' },
        'silver-cleaner': { status: 'green' },
        'gold-aggregator': { status: 'green' },
      },
    },
  },
};

describe('buildDiagramModel', () => {
  it('creates 6 nodes (source, bronze, silver, gold, dashboard, pipeline-health) and expected edges', () => {
    const model = buildDiagramModel(DOCUMENT);
    expect(model.nodes).toHaveLength(6);
    expect(model.nodes.map((n) => n.id)).toEqual([
      'source',
      'bronze',
      'silver',
      'gold',
      'dashboard',
      'pipeline-health',
    ]);
    expect(model.edges.length).toBeGreaterThan(0);
    for (const edge of model.edges) {
      expect(model.nodes.some((n) => n.id === edge.from)).toBe(true);
      expect(model.nodes.some((n) => n.id === edge.to)).toBe(true);
    }
  });

  it('connects the horizontal flow source -> bronze -> silver -> gold -> dashboard', () => {
    const model = buildDiagramModel(DOCUMENT);
    const flowEdges = model.edges.filter((e) => e.to !== 'pipeline-health');
    expect(flowEdges).toEqual([
      { from: 'source', to: 'bronze' },
      { from: 'bronze', to: 'silver' },
      { from: 'silver', to: 'gold' },
      { from: 'gold', to: 'dashboard' },
    ]);
  });

  it('fans an edge from every Medallion stage (not source/dashboard) to the pipeline-health observer', () => {
    const model = buildDiagramModel(DOCUMENT);
    const observerEdges = model.edges.filter((e) => e.to === 'pipeline-health');
    expect(observerEdges.map((e) => e.from)).toEqual(['bronze', 'silver', 'gold']);
  });

  it('always reports the source and dashboard context nodes as unknown', () => {
    const model = buildDiagramModel(DOCUMENT);
    expect(model.nodes.find((n) => n.id === 'source').status).toBe(UNKNOWN);
    expect(model.nodes.find((n) => n.id === 'dashboard').status).toBe(UNKNOWN);
  });

  it('derives each stage status as the worst of execution_success/execution_duration', () => {
    const model = buildDiagramModel(DOCUMENT);
    const bronze = model.nodes.find((n) => n.id === 'bronze');
    const silver = model.nodes.find((n) => n.id === 'silver');
    expect(bronze.status).toBe(GREEN);
    expect(silver.status).toBe(YELLOW);
  });

  it('sets the observer node status from overall_status', () => {
    const model = buildDiagramModel(DOCUMENT);
    const observer = model.nodes.find((n) => n.id === 'pipeline-health');
    expect(observer.status).toBe(YELLOW);
  });

  it('uses RED when a stage function reports red in either check', () => {
    const doc = {
      ...DOCUMENT,
      execution_duration: {
        details: { functions: { 'gold-aggregator': { status: RED } } },
      },
    };
    const model = buildDiagramModel(doc);
    const gold = model.nodes.find((n) => n.id === 'gold');
    expect(gold.status).toBe(RED);
  });

  it('falls back to unknown status for a missing/renamed function', () => {
    const doc = {
      overall_status: 'green',
      execution_success: { details: { functions: {} } },
      execution_duration: { details: { functions: {} } },
    };
    const model = buildDiagramModel(doc);
    for (const stageId of ['bronze', 'silver', 'gold']) {
      expect(model.nodes.find((n) => n.id === stageId).status).toBe(UNKNOWN);
    }
  });

  it('produces a valid all-unknown model for a null document', () => {
    const model = buildDiagramModel(null);
    expect(model.nodes).toHaveLength(6);
    expect(model.nodes.every((n) => n.status === UNKNOWN)).toBe(true);
  });

  it('never throws for undefined/malformed input', () => {
    expect(() => buildDiagramModel(undefined)).not.toThrow();
    expect(() => buildDiagramModel({})).not.toThrow();
  });
});

describe('renderDiagramSvg', () => {
  it('renders an <svg> containing one <g> per node with a data-status attribute', () => {
    const model = buildDiagramModel(DOCUMENT);
    const svg = renderDiagramSvg(model, 'en');
    expect(svg).toContain('<svg');
    expect(svg).toContain('data-node-id="bronze"');
    expect(svg).toContain('data-status="green"');
    expect(svg).toContain('data-status="yellow"');
  });

  it('renders arrowhead markers on edge lines instead of plain unmarked lines', () => {
    const model = buildDiagramModel(DOCUMENT);
    const svg = renderDiagramSvg(model, 'en');
    expect(svg).toContain('<marker id="pipeline-health-arrowhead"');
    expect(svg).toContain('marker-end="url(#pipeline-health-arrowhead)"');
  });

  it('renders a localized "Status: <value>" label for each node', () => {
    const model = buildDiagramModel(DOCUMENT);
    const svg = renderDiagramSvg(model, 'en');
    expect(svg).toContain('Status: Green');
    expect(svg).toContain('Status: Yellow');
  });

  it('renders localized labels for each node', () => {
    const model = buildDiagramModel(DOCUMENT);
    const svgEn = renderDiagramSvg(model, 'en');
    const svgDe = renderDiagramSvg(model, 'de');
    expect(svgEn).not.toBe(svgDe);
  });

  it('renders an unknown-status fallback label without throwing', () => {
    const model = buildDiagramModel(null);
    expect(() => renderDiagramSvg(model, 'en')).not.toThrow();
    const svg = renderDiagramSvg(model, 'en');
    expect(svg).toContain('data-status="unknown"');
    expect(svg).toContain('Status: Unknown');
  });
});
