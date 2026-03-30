/**
 * Unit tests for post-extraction validation & consistency rules V1–V8.
 *
 * See: docs/CPQ-REPORT-REDLINE-ANALYSIS.md — Task R1.2
 */
import { describe, it, expect, vi } from 'vitest';
import { validateExtraction } from '../../src/normalize/validation.ts';
import type { CollectorResult, CollectorContext } from '../../src/collectors/base.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';

// Mock logger to suppress output
vi.mock('../../src/lib/logger.ts', () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

function makeFinding(overrides: Partial<AssessmentFindingInput>): AssessmentFindingInput {
  return {
    domain: 'catalog',
    collectorName: 'test',
    artifactType: 'Product2',
    artifactName: 'Test Product',
    findingKey: `test:${Math.random()}`,
    sourceType: 'object',
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...overrides,
  };
}

function makeResult(
  findings: AssessmentFindingInput[],
  status: 'success' | 'partial' | 'failed' = 'success'
): CollectorResult {
  return {
    findings,
    relationships: [],
    metrics: { collectorName: 'test', domain: 'catalog', coverage: 100, durationMs: 1000 },
    status,
  };
}

const mockCtx = {} as CollectorContext;

describe('validateExtraction — V1–V8 consistency rules', () => {
  it('V1: detects quotes with zero lines but nonzero top products', async () => {
    const results = new Map<string, CollectorResult>();
    results.set(
      'usage',
      makeResult([
        makeFinding({
          artifactType: 'DataCount',
          artifactName: 'Quote',
          countValue: 23,
          domain: 'usage',
        }),
        makeFinding({
          artifactType: 'DataCount',
          artifactName: 'QuoteLine',
          countValue: 0,
          domain: 'usage',
        }),
        makeFinding({
          artifactType: 'TopQuotedProduct',
          artifactName: 'Widget A',
          countValue: 7,
          domain: 'usage',
        }),
      ])
    );

    const result = await validateExtraction(mockCtx, results);
    const v1 = result.rules.find((r) => r.id === 'V1');
    expect(v1).toBeTruthy();
    expect(v1!.passed).toBe(false);
    expect(v1!.message).toContain('0 quote lines');
    expect(result.reportBanners.length).toBeGreaterThan(0);
  });

  it('V1: passes when quotes have lines', async () => {
    const results = new Map<string, CollectorResult>();
    results.set(
      'usage',
      makeResult([
        makeFinding({
          artifactType: 'DataCount',
          artifactName: 'Quote',
          countValue: 23,
          domain: 'usage',
        }),
        makeFinding({
          artifactType: 'DataCount',
          artifactName: 'QuoteLine',
          countValue: 115,
          domain: 'usage',
        }),
        makeFinding({
          artifactType: 'TopQuotedProduct',
          artifactName: 'Widget A',
          countValue: 7,
          domain: 'usage',
        }),
      ])
    );

    const result = await validateExtraction(mockCtx, results);
    const v1 = result.rules.find((r) => r.id === 'V1');
    expect(v1!.passed).toBe(true);
  });

  it('V2: detects catalog-vs-top-products contradiction', async () => {
    const results = new Map<string, CollectorResult>();
    results.set(
      'mixed',
      makeResult([
        makeFinding({ artifactType: 'Product2', artifactName: 'Prod 1', usageLevel: 'dormant' }),
        makeFinding({ artifactType: 'Product2', artifactName: 'Prod 2', usageLevel: 'dormant' }),
        makeFinding({
          artifactType: 'TopQuotedProduct',
          artifactName: 'Prod 1',
          countValue: 7,
          domain: 'usage',
        }),
      ])
    );

    const result = await validateExtraction(mockCtx, results);
    const v2 = result.rules.find((r) => r.id === 'V2');
    expect(v2!.passed).toBe(false);
    expect(v2!.message).toContain('dormant');
  });

  it('V4: detects uniform complexity across many rules', async () => {
    const rules = Array.from({ length: 10 }, (_, i) =>
      makeFinding({
        artifactType: 'PriceRule',
        artifactName: `Rule ${i}`,
        domain: 'pricing',
        complexityLevel: 'medium',
      })
    );

    const results = new Map<string, CollectorResult>();
    results.set('pricing', makeResult(rules));

    const result = await validateExtraction(mockCtx, results);
    const v4 = result.rules.find((r) => r.id === 'V4');
    expect(v4!.passed).toBe(false);
    expect(v4!.message).toContain('identical complexity');
  });

  it('V6: detects failed collectors with no domain data', async () => {
    const results = new Map<string, CollectorResult>();
    results.set('catalog', makeResult([makeFinding({ domain: 'catalog' })]));
    results.set('templates', makeResult([], 'failed'));

    const result = await validateExtraction(mockCtx, results);
    const v6 = result.rules.find((r) => r.id === 'V6');
    expect(v6!.passed).toBe(false);
    expect(v6!.message).toContain('templates');
  });

  it('V7: flags tiny denominator when quotes < 10', async () => {
    const results = new Map<string, CollectorResult>();
    results.set(
      'usage',
      makeResult([
        makeFinding({
          artifactType: 'DataCount',
          artifactName: 'Quote',
          countValue: 3,
          domain: 'usage',
        }),
      ])
    );

    const result = await validateExtraction(mockCtx, results);
    const v7 = result.rules.find((r) => r.id === 'V7');
    expect(v7!.passed).toBe(false);
    expect(v7!.message).toContain('3 quotes');
  });

  it('V8: flags when all rules appear active with many rules', async () => {
    const rules = Array.from({ length: 15 }, (_, i) =>
      makeFinding({
        artifactType: 'PriceRule',
        artifactName: `Rule ${i}`,
        domain: 'pricing',
        // No usageLevel or inactive note — all look active
      })
    );

    const results = new Map<string, CollectorResult>();
    results.set('pricing', makeResult(rules));

    const result = await validateExtraction(mockCtx, results);
    const v8 = result.rules.find((r) => r.id === 'V8');
    expect(v8!.passed).toBe(false);
    expect(v8!.message).toContain('appear active');
  });

  it('tracks dropped fields from collectors', async () => {
    const results = new Map<string, CollectorResult>();
    results.set('catalog', {
      ...makeResult([makeFinding({ domain: 'catalog' })]),
      droppedFields: [{ object: 'Product2', fields: ['Family', 'SBQQ__ConfigurationType__c'] }],
    });

    const result = await validateExtraction(mockCtx, results);
    expect(result.stats.droppedFields.length).toBe(1);
    expect(result.warnings.some((w) => w.includes('[FLS]'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('Family'))).toBe(true);
  });

  it('all rules pass for clean data', async () => {
    const results = new Map<string, CollectorResult>();
    results.set(
      'catalog',
      makeResult([
        makeFinding({ domain: 'catalog', usageLevel: 'high' }),
        makeFinding({ domain: 'catalog', usageLevel: 'dormant' }),
      ])
    );
    results.set(
      'pricing',
      makeResult([
        makeFinding({ domain: 'pricing', artifactType: 'PriceRule', complexityLevel: 'high' }),
        makeFinding({
          domain: 'pricing',
          artifactType: 'PriceRule',
          complexityLevel: 'low',
          usageLevel: 'dormant',
        }),
      ])
    );
    results.set(
      'usage',
      makeResult([
        makeFinding({
          domain: 'usage',
          artifactType: 'DataCount',
          artifactName: 'Quote',
          countValue: 100,
        }),
        makeFinding({
          domain: 'usage',
          artifactType: 'DataCount',
          artifactName: 'QuoteLine',
          countValue: 500,
        }),
      ])
    );
    results.set('customization', makeResult([makeFinding({ domain: 'customization' })]));
    results.set('dependencies', makeResult([makeFinding({ domain: 'dependency' })]));
    results.set('order-lifecycle', makeResult([makeFinding({ domain: 'order-lifecycle' })]));

    const result = await validateExtraction(mockCtx, results);
    const failedRules = result.rules.filter((r) => !r.passed);
    expect(failedRules.length).toBe(0);
    expect(result.reportBanners.length).toBe(0);
  });
});
