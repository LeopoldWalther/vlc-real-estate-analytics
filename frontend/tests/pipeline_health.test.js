import { describe, it, expect } from 'vitest';
import {
  CHECK_IDS,
  statusLabel,
  checkLabel,
  overallBadgeLabel,
  subLightDetails,
  buildSubLightRows,
  unavailableMessage,
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
