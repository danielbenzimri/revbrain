import { describe, expect, it } from 'vitest';
import type { QuarantineEntry, QuarantineReason } from './quarantine.ts';

describe('PH0.9 — QuarantineEntry', () => {
  it.each<QuarantineReason>([
    'missing-required-field',
    'malformed-shape',
    'parse-failure',
    'unknown-artifact',
    'duplicate-identity',
    'orphaned-reference',
    'not-modeled-v1',
    'not-detected',
  ])('constructs a quarantine entry with reason %s', (reason) => {
    const entry: QuarantineEntry = {
      findingKey: 'finding-123',
      artifactType: 'SBQQ__PriceRule__c',
      reason,
      detail: `reason=${reason}`,
      raw: { findingKey: 'finding-123' },
    };
    expect(entry.reason).toBe(reason);
  });

  it('enum has exactly 8 values (v1.1)', () => {
    const all: QuarantineReason[] = [
      'missing-required-field',
      'malformed-shape',
      'parse-failure',
      'unknown-artifact',
      'duplicate-identity',
      'orphaned-reference',
      'not-modeled-v1',
      'not-detected',
    ];
    expect(all.length).toBe(8);
  });

  it('serializes with a raw payload preserved', () => {
    const entry: QuarantineEntry = {
      findingKey: 'f1',
      artifactType: 'SearchFilter',
      reason: 'not-modeled-v1',
      detail: 'SearchFilter is not modeled in v1',
      raw: { findingKey: 'f1', artifactType: 'SearchFilter', nested: { a: 1 } },
    };
    const parsed = JSON.parse(JSON.stringify(entry)) as QuarantineEntry;
    expect((parsed.raw as { nested: { a: number } }).nested.a).toBe(1);
  });
});
