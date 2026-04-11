/**
 * Phase 2 — tests for the requireFinding / optionalFinding primitive.
 * Spec: docs/PDF-AND-GRAPH-DECISIONS.md Phase 2.
 */
import { describe, expect, it } from 'vitest';
import type { AssessmentFindingInput } from '@revbrain/contract';
import {
  buildAssembleReportContext,
  optionalFinding,
  requireFinding,
} from '../../src/report/require-finding.ts';

function f(partial: Partial<AssessmentFindingInput>): AssessmentFindingInput {
  return {
    domain: 'catalog',
    collectorName: 'test',
    artifactType: 'Product2',
    artifactName: 'Test',
    findingKey: 'test-1',
    sourceType: 'object',
    detected: true,
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...partial,
  };
}

describe('requireFinding / optionalFinding', () => {
  it('requireFinding returns extracted value when finding present', () => {
    const ctx = buildAssembleReportContext([
      f({ artifactType: 'OrgFingerprint', artifactName: 'org', notes: 'Enterprise' }),
    ]);
    const value = requireFinding(ctx, 'Header', 'OrgFingerprint', (x) => x.notes ?? null);
    expect(value).toBe('Enterprise');
    expect(ctx.missingBanners).toHaveLength(0);
  });

  it('requireFinding returns null + banner when finding missing', () => {
    const ctx = buildAssembleReportContext([f({ artifactType: 'Product2' })]);
    const value = requireFinding(ctx, 'Header', 'OrgFingerprint', (x) => x.notes ?? null);
    expect(value).toBeNull();
    expect(ctx.missingBanners).toHaveLength(1);
    expect(ctx.missingBanners[0]!.section).toBe('Header');
    expect(ctx.missingBanners[0]!.key).toBe('OrgFingerprint');
    expect(ctx.missingBanners[0]!.message).toContain('missing');
  });

  it('requireFinding returns null + banner when extractor returns null', () => {
    const ctx = buildAssembleReportContext([
      f({ artifactType: 'OrgFingerprint', artifactName: 'org', notes: null as unknown as string }),
    ]);
    const value = requireFinding(ctx, 'Header', 'OrgFingerprint', (x) => x.notes ?? null);
    expect(value).toBeNull();
    expect(ctx.missingBanners).toHaveLength(1);
    expect(ctx.missingBanners[0]!.message).toContain('null');
  });

  it('requireFinding supports artifactType:artifactName lookup', () => {
    const ctx = buildAssembleReportContext([
      f({ artifactType: 'DataCount', artifactName: 'Products', countValue: 179 }),
      f({ artifactType: 'DataCount', artifactName: 'Bundles', countValue: 19 }),
    ]);
    const value = requireFinding(ctx, 'Catalog', 'DataCount:Bundles', (x) => x.countValue ?? null);
    expect(value).toBe(19);
  });

  it('optionalFinding returns value when present, logs rationale', () => {
    const ctx = buildAssembleReportContext([
      f({ artifactType: 'DataCount', artifactName: 'x', countValue: 42 }),
    ]);
    const value = optionalFinding(
      ctx,
      'Test',
      'DataCount',
      (x) => x.countValue ?? null,
      0,
      'zero means no data'
    );
    expect(value).toBe(42);
    expect(ctx.optionalRationales).toHaveLength(1);
    expect(ctx.optionalRationales[0]!.usedFallback).toBe(false);
  });

  it('optionalFinding returns fallback when missing, logs fallback usage', () => {
    const ctx = buildAssembleReportContext([]);
    const value = optionalFinding(
      ctx,
      'Test',
      'DataCount',
      (x) => x.countValue ?? null,
      0,
      'no DataCount found → zero is the legitimate absence answer'
    );
    expect(value).toBe(0);
    expect(ctx.optionalRationales).toHaveLength(1);
    expect(ctx.optionalRationales[0]!.usedFallback).toBe(true);
    expect(ctx.optionalRationales[0]!.rationale).toContain('legitimate');
  });

  it('optionalFinding returns fallback when extractor returns null', () => {
    const ctx = buildAssembleReportContext([
      f({ artifactType: 'DataCount', artifactName: 'x', countValue: null as unknown as number }),
    ]);
    const value = optionalFinding(
      ctx,
      'Test',
      'DataCount',
      (x) => x.countValue ?? null,
      0,
      'absent countValue ok'
    );
    expect(value).toBe(0);
    expect(ctx.optionalRationales[0]!.usedFallback).toBe(true);
  });

  it('buildAssembleReportContext indexes findings by artifactType', () => {
    const ctx = buildAssembleReportContext([
      f({ artifactType: 'Product2', artifactName: 'P1' }),
      f({ artifactType: 'Product2', artifactName: 'P2' }),
      f({ artifactType: 'SBQQ__PriceRule__c', artifactName: 'R1' }),
    ]);
    expect(ctx.byType.get('Product2')).toHaveLength(2);
    expect(ctx.byType.get('SBQQ__PriceRule__c')).toHaveLength(1);
    expect(ctx.byType.get('Missing')).toBeUndefined();
  });
});
