/**
 * T4a — FindingsValidator warning scenarios for V0 enhancements.
 *
 * Tests the degradation warning checks added in V0:
 * 1. Product2 IsActive field dropped (FLS) -> FLS warning
 * 2. sbaa installed but no AdvancedApprovalRule findings -> dependency warning
 * 3. Expected domain with no findings -> extraction gap warning
 *
 * See: docs/CPQ-REPORT-V4-MITIGATION-PLAN.md — Task T4a (row 19a)
 */
import { describe, it, expect, vi } from 'vitest';
import { validateExtraction } from '../../src/normalize/validation.ts';
import type { CollectorResult } from '../../src/collectors/base.ts';
import type { CollectorContext } from '../../src/collectors/base.ts';
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
  opts?: {
    status?: 'success' | 'partial' | 'failed';
    droppedFields?: Array<{ object: string; fields: string[] }>;
  }
): CollectorResult {
  return {
    findings,
    relationships: [],
    metrics: { collectorName: 'test', domain: 'catalog', coverage: 100, durationMs: 1000 },
    status: opts?.status ?? 'success',
    droppedFields: opts?.droppedFields,
  };
}

const mockCtx = {} as CollectorContext;

describe('FindingsValidator V0 warning scenarios — T4a', () => {
  it('V0-FLS: Product2 IsActive field dropped emits FLS warning', async () => {
    const results = new Map<string, CollectorResult>();
    results.set(
      'catalog',
      makeResult(
        [
          makeFinding({ domain: 'catalog', usageLevel: 'high' }),
          makeFinding({ domain: 'catalog', usageLevel: 'dormant' }),
        ],
        {
          droppedFields: [{ object: 'Product2', fields: ['IsActive', 'Family'] }],
        }
      )
    );
    // Add other expected domains to avoid unrelated warnings
    results.set(
      'pricing',
      makeResult([makeFinding({ domain: 'pricing', artifactType: 'PriceRule' })])
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

    // Should have FLS warning about IsActive
    const flsWarning = result.warnings.find((w) => w.includes('[V0-FLS]'));
    expect(flsWarning).toBeTruthy();
    expect(flsWarning).toContain('IsActive');
    expect(flsWarning).toContain('FLS');

    // Should also have general FLS warning from critical field drops
    expect(result.warnings.some((w) => w.includes('[FLS]'))).toBe(true);
    expect(result.stats.droppedFields.length).toBe(1);
  });

  it('V0-DEP: sbaa installed but no AdvancedApprovalRule findings emits dependency warning', async () => {
    const results = new Map<string, CollectorResult>();
    results.set(
      'settings',
      makeResult([
        makeFinding({
          artifactType: 'InstalledPackage',
          artifactName: 'Advanced Approvals',
          domain: 'settings',
          evidenceRefs: [
            { type: 'field-ref', value: 'sbaa', label: 'Namespace' },
            { type: 'field-ref', value: '3.4.0', label: 'Version' },
          ],
        }),
      ])
    );
    // No AdvancedApprovalRule findings anywhere
    results.set('catalog', makeResult([makeFinding({ domain: 'catalog' })]));
    results.set(
      'pricing',
      makeResult([makeFinding({ domain: 'pricing', artifactType: 'PriceRule' })])
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

    const depWarning = result.warnings.find((w) => w.includes('[V0-DEP]') && w.includes('sbaa'));
    expect(depWarning).toBeTruthy();
    expect(depWarning).toContain('AdvancedApprovalRule');
  });

  it('V0-SKIP: Expected domain with no findings and no failure emits skip warning', async () => {
    const results = new Map<string, CollectorResult>();
    results.set('catalog', makeResult([makeFinding({ domain: 'catalog' })]));
    // pricing domain has no findings and no failure
    results.set('pricing', makeResult([]));
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

    const skipWarning = result.warnings.find(
      (w) => w.includes('[V0-SKIP]') && w.includes('pricing')
    );
    expect(skipWarning).toBeTruthy();
    expect(skipWarning).toContain('no findings');
  });
});
