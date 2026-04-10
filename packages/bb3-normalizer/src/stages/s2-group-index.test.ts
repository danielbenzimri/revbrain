import { describe, expect, it } from 'vitest';
import { buildFindingIndex } from './s2-group-index.ts';
import { BB3InputError } from '@revbrain/migration-ir-contract';
import type { AssessmentFindingInput } from '@revbrain/contract';

function f(over: Partial<AssessmentFindingInput>): AssessmentFindingInput {
  return {
    domain: 'catalog',
    collectorName: 'catalog',
    artifactType: 'Product2',
    artifactName: 'Prod',
    findingKey: 'k',
    sourceType: 'object',
    detected: true,
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...over,
  };
}

describe('PH3.2 — buildFindingIndex', () => {
  it('populates all three maps', () => {
    const findings: AssessmentFindingInput[] = [
      f({ findingKey: 'a', artifactType: 'Product2', collectorName: 'catalog' }),
      f({ findingKey: 'b', artifactType: 'Product2', collectorName: 'catalog' }),
      f({ findingKey: 'c', artifactType: 'SBQQ__PriceRule__c', collectorName: 'pricing' }),
    ];
    const idx = buildFindingIndex(findings);
    expect(idx.byFindingKey.size).toBe(3);
    expect(idx.byArtifactType.get('Product2')?.length).toBe(2);
    expect(idx.byArtifactType.get('SBQQ__PriceRule__c')?.length).toBe(1);
    expect(idx.byCollector.get('catalog')?.length).toBe(2);
    expect(idx.byCollector.get('pricing')?.length).toBe(1);
  });

  it('empty input returns empty maps', () => {
    const idx = buildFindingIndex([]);
    expect(idx.byFindingKey.size).toBe(0);
    expect(idx.byArtifactType.size).toBe(0);
    expect(idx.byCollector.size).toBe(0);
  });

  it('duplicate findingKey hard-fails with BB3InputError (I2 invariant)', () => {
    const findings: AssessmentFindingInput[] = [f({ findingKey: 'dup' }), f({ findingKey: 'dup' })];
    expect(() => buildFindingIndex(findings)).toThrow(BB3InputError);
  });

  it('byFindingKey lookup returns the original finding', () => {
    const needle = f({ findingKey: 'needle', artifactName: 'NeedleProduct' });
    const idx = buildFindingIndex([needle]);
    expect(idx.byFindingKey.get('needle')).toBe(needle);
  });
});

describe('PH9.2 — byArtifactId and byArtifactName', () => {
  it('indexes findings by their Salesforce artifactId', () => {
    const idx = buildFindingIndex([
      f({ findingKey: 'k1', artifactId: 'a001000000000001' }),
      f({ findingKey: 'k2', artifactId: 'a001000000000002' }),
      f({ findingKey: 'k3' }), // no artifactId — skipped
    ]);
    expect(idx.byArtifactId.size).toBe(2);
    expect(idx.byArtifactId.get('a001000000000001')?.findingKey).toBe('k1');
    expect(idx.byArtifactId.get('a001000000000002')?.findingKey).toBe('k2');
  });

  it('indexes findings by artifactName (first-seen wins for duplicates)', () => {
    const idx = buildFindingIndex([
      f({ findingKey: 'k1', artifactName: 'MyRule', collectorName: 'pricing' }),
      f({ findingKey: 'k2', artifactName: 'MyRule', collectorName: 'dependency' }),
      f({ findingKey: 'k3', artifactName: 'OtherRule' }),
    ]);
    expect(idx.byArtifactName.size).toBe(2);
    // First-seen wins: k1 (pricing collector) not k2 (dependency).
    expect(idx.byArtifactName.get('MyRule')?.findingKey).toBe('k1');
    expect(idx.byArtifactName.get('OtherRule')?.findingKey).toBe('k3');
  });

  it('duplicate artifactId → first-seen wins, does NOT throw', () => {
    // Only findingKey is I2-unique; artifactId can legitimately
    // collide across collectors that see the same Salesforce row.
    const idx = buildFindingIndex([
      f({ findingKey: 'k1', artifactId: 'dupId' }),
      f({ findingKey: 'k2', artifactId: 'dupId' }),
    ]);
    expect(idx.byArtifactId.size).toBe(1);
    expect(idx.byArtifactId.get('dupId')?.findingKey).toBe('k1');
  });

  it('PH9.2 new maps are empty on empty input', () => {
    const idx = buildFindingIndex([]);
    expect(idx.byArtifactId.size).toBe(0);
    expect(idx.byArtifactName.size).toBe(0);
  });
});
