import { describe, it, expect } from 'vitest';
import {
  CHECK_IDS,
  statusLabel,
  checkLabel,
  overallBadgeLabel,
  subLightDetails,
  buildSubLightRows,
  unavailableMessage,
  thresholdRuleText,
  buildExecutionSuccessSeries,
  buildExecutionDurationSeries,
  buildApiQuotaSeries,
  buildAwsCostSeries,
} from '../src/pipeline_health.js';

describe('CHECK_IDS', () => {
  it('lists the 4 named checks written by pipeline_health_aggregator', () => {
    expect(CHECK_IDS).toEqual(['execution_success', 'execution_duration', 'api_quota', 'aws_cost']);
  });
});

describe('statusLabel', () => {
  it('returns a localized label for each of the 3 traffic-light statuses (en)', () => {
    expect(statusLabel('green', 'en')).toBe('Green');
    expect(statusLabel('yellow', 'en')).toBe('Yellow');
    expect(statusLabel('red', 'en')).toBe('Red');
  });

  it('returns a localized label in a non-English locale', () => {
    expect(statusLabel('green', 'de')).not.toBe('');
    expect(statusLabel('green', 'de')).not.toBe('green');
  });

  it('falls back to the raw status string for an unrecognised value', () => {
    expect(statusLabel('purple', 'en')).toBe('purple');
  });
});

describe('checkLabel', () => {
  it('returns a distinct localized label for each of the 4 checks (en)', () => {
    const labels = CHECK_IDS.map((id) => checkLabel(id, 'en'));
    expect(new Set(labels).size).toBe(4);
    for (const label of labels) {
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe('overallBadgeLabel', () => {
  it('builds a badge label mentioning the status for each of the 3 statuses', () => {
    expect(overallBadgeLabel('green', 'en')).toContain('Green');
    expect(overallBadgeLabel('yellow', 'en')).toContain('Yellow');
    expect(overallBadgeLabel('red', 'en')).toContain('Red');
  });

  it('localizes in a non-English locale', () => {
    expect(overallBadgeLabel('green', 'es')).not.toContain('Green');
  });
});

describe('subLightDetails', () => {
  it('formats one row per check with label/statusLabel/summary', () => {
    const row = subLightDetails('api_quota', { status: 'yellow', summary: 'Approaching quota.' }, 'en');
    expect(row.id).toBe('api_quota');
    expect(row.label.length).toBeGreaterThan(0);
    expect(row.statusLabel).toBe('Yellow');
    expect(row.summary).toBe('Approaching quota.');
  });

  it('never throws when the check is missing', () => {
    const row = subLightDetails('aws_cost', undefined, 'en');
    expect(row.summary).toBe('');
    expect(typeof row.statusLabel).toBe('string');
  });
});

describe('buildSubLightRows', () => {
  it('builds all 4 rows in CHECK_IDS order from a full document', () => {
    const document = {
      execution_success: { status: 'green', summary: 'ok' },
      execution_duration: { status: 'green', summary: 'ok' },
      api_quota: { status: 'yellow', summary: 'near limit' },
      aws_cost: { status: 'red', summary: 'over budget' },
    };
    const rows = buildSubLightRows(document, 'en');
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.id)).toEqual(CHECK_IDS);
    expect(rows[2].statusLabel).toBe('Yellow');
    expect(rows[3].summary).toBe('over budget');
  });

  it('never throws for a null/undefined document', () => {
    const rows = buildSubLightRows(null, 'en');
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.summary === '')).toBe(true);
  });
});

describe('unavailableMessage', () => {
  it('returns a non-empty neutral message for every supported locale', () => {
    for (const locale of ['en', 'de', 'es', 'ar', 'tr']) {
      const message = unavailableMessage(locale);
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    }
  });
});

// FEATURE-013 task 13.6 — pure chart-data/threshold helpers for the detail views.

describe('thresholdRuleText', () => {
  it('returns a localized, non-empty threshold caption for every check id', () => {
    for (const id of CHECK_IDS) {
      for (const locale of ['en', 'de', 'es', 'ar', 'tr']) {
        const text = thresholdRuleText(id, locale);
        expect(typeof text).toBe('string');
        expect(text.length).toBeGreaterThan(0);
      }
    }
  });

  it('never throws for an unrecognised check id', () => {
    expect(() => thresholdRuleText('not-a-real-check', 'en')).not.toThrow();
    expect(thresholdRuleText('not-a-real-check', 'en')).toBe('');
  });
});

const V11_EXECUTION_DOCUMENT = {
  schema_version: '1.1',
  execution_success: {
    status: 'green',
    details: {
      functions: {
        'bronze-collector': {
          status: 'green',
          recent_invocations: [
            { timestamp: '2026-06-03T00:00:00', succeeded: true, duration_seconds: 12.0 },
            { timestamp: '2026-06-02T00:00:00', succeeded: false, duration_seconds: 15.0 },
            { timestamp: '2026-06-01T00:00:00', succeeded: true, duration_seconds: 10.0 },
          ],
        },
        'silver-cleaner': {
          status: 'yellow',
          query_error: 'Logs Insights query timed out',
        },
      },
    },
  },
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

describe('buildExecutionSuccessSeries', () => {
  it('returns one series per function, oldest-first, from recent_invocations', () => {
    const series = buildExecutionSuccessSeries(V11_EXECUTION_DOCUMENT);
    const bronze = series.find((s) => s.functionName === 'bronze-collector');
    expect(bronze.points).toHaveLength(3);
    expect(bronze.points[0].timestamp).toBe('2026-06-01T00:00:00');
    expect(bronze.points[0].succeeded).toBe(true);
    expect(bronze.points[2].timestamp).toBe('2026-06-03T00:00:00');
  });

  it('never throws for a function without recent_invocations (query error)', () => {
    const series = buildExecutionSuccessSeries(V11_EXECUTION_DOCUMENT);
    const silver = series.find((s) => s.functionName === 'silver-cleaner');
    expect(silver.points).toEqual([]);
  });

  it('returns an empty array for null/undefined/v1.0 documents', () => {
    expect(buildExecutionSuccessSeries(null)).toEqual([]);
    expect(buildExecutionSuccessSeries(undefined)).toEqual([]);
    expect(buildExecutionSuccessSeries({})).toEqual([]);
    expect(buildExecutionSuccessSeries({ execution_success: { status: 'green', details: {} } })).toEqual([]);
  });
});

describe('buildExecutionDurationSeries', () => {
  it('returns one series per function, oldest-first, with duration_seconds', () => {
    const series = buildExecutionDurationSeries(V11_EXECUTION_DOCUMENT);
    const bronze = series.find((s) => s.functionName === 'bronze-collector');
    expect(bronze.points).toHaveLength(2);
    expect(bronze.points[0].durationSeconds).toBe(100.0);
    expect(bronze.points[1].durationSeconds).toBe(320.0);
  });

  it('returns an empty array for null/malformed input', () => {
    expect(buildExecutionDurationSeries(null)).toEqual([]);
    expect(buildExecutionDurationSeries({})).toEqual([]);
  });
});

const V11_API_QUOTA_DOCUMENT = {
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

describe('buildApiQuotaSeries', () => {
  it('returns one series per credential set with matching months and values', () => {
    const series = buildApiQuotaSeries(V11_API_QUOTA_DOCUMENT);
    expect(series).toHaveLength(2);
    const lvw = series.find((s) => s.credentialSet === 'LVW');
    expect(lvw.label).toBe('sale');
    expect(lvw.quota).toBe(100);
    expect(lvw.months).toEqual(['2026-01', '2026-02']);
    expect(lvw.values).toEqual([40, 82]);
  });

  it('returns an empty array for null/malformed input', () => {
    expect(buildApiQuotaSeries(null)).toEqual([]);
    expect(buildApiQuotaSeries({})).toEqual([]);
  });
});

const V11_AWS_COST_DOCUMENT = {
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

describe('buildAwsCostSeries', () => {
  it('returns months and one value series per service, filling gaps with 0', () => {
    const result = buildAwsCostSeries(V11_AWS_COST_DOCUMENT);
    expect(result.months).toEqual(['2026-01', '2026-02']);
    expect(new Set(result.services)).toEqual(new Set(['AWS Lambda', 'Amazon S3']));
    const lambda = result.valuesByService['AWS Lambda'];
    const s3 = result.valuesByService['Amazon S3'];
    expect(lambda).toEqual([1.0, 1.1]);
    expect(s3).toEqual([0.2, 0]);
  });

  it('returns safe empty shape for null/malformed input', () => {
    const result = buildAwsCostSeries(null);
    expect(result.months).toEqual([]);
    expect(result.services).toEqual([]);
    expect(result.valuesByService).toEqual({});
    expect(buildAwsCostSeries({}).months).toEqual([]);
  });
});
