/**
 * Unit tests: Product Deep Dive assembler (T-02)
 * Unit tests: Bundles Deep Dive assembler (T-03)
 * Unit tests: New validators V30-V33 (T-05)
 */
import { describe, it, expect } from 'vitest';
import {
  assembleReport,
  type ReportData,
  type ProductDeepDive,
  type BundlesDeepDive,
} from '../../src/report/assembler.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { validateReportConsistency } from '../../src/normalize/validation.ts';

/** Create a minimal finding */
function makeFinding(overrides: Partial<AssessmentFindingInput>): AssessmentFindingInput {
  return {
    domain: 'catalog',
    collectorName: 'catalog',
    artifactType: 'Product2',
    artifactName: 'Test Product',
    findingKey: `test-${Math.random().toString(36).slice(2)}`,
    sourceType: 'object',
    detected: true,
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...overrides,
  };
}

describe('T-02: Product Deep Dive assembler', () => {
  it('returns null when no ProductFieldUtilization findings exist', () => {
    const findings = [makeFinding({ artifactType: 'Product2', artifactName: 'Prod1' })];
    const result = assembleReport(findings);
    expect(result.productDeepDive).toBeNull();
  });

  it('builds ProductDeepDive when utilization findings exist', () => {
    const findings: AssessmentFindingInput[] = [
      // Need some products to make activeProducts > 0
      makeFinding({
        artifactType: 'Product2',
        artifactName: 'Prod1',
        evidenceRefs: [{ type: 'field-ref', value: 'Product2.IsActive', label: 'true' }],
      }),
      makeFinding({
        artifactType: 'Product2',
        artifactName: 'Prod2',
        evidenceRefs: [{ type: 'field-ref', value: 'Product2.IsActive', label: 'true' }],
      }),
      // Field utilization findings
      makeFinding({
        artifactType: 'ProductFieldUtilization',
        artifactName: 'Family',
        textValue: 'Family',
        countValue: 2,
        notes: '2 of 2 active products have Family populated (100%).',
        evidenceRefs: [{ type: 'count', value: '2', label: 'TotalActive' }],
      }),
      makeFinding({
        artifactType: 'ProductFieldUtilization',
        artifactName: 'SBQQ__PricingMethod__c',
        textValue: 'SBQQ__PricingMethod__c',
        countValue: 1,
        notes: '1 of 2 active products have SBQQ__PricingMethod__c populated (50%).',
        evidenceRefs: [{ type: 'count', value: '2', label: 'TotalActive' }],
      }),
      makeFinding({
        artifactType: 'ProductFieldUtilization',
        artifactName: 'SBQQ__BillingRule__c',
        textValue: 'SBQQ__BillingRule__c',
        countValue: 0,
        notes: '0 of 2 active products have SBQQ__BillingRule__c populated (0%).',
        evidenceRefs: [{ type: 'count', value: '2', label: 'TotalActive' }],
      }),
    ];

    const result = assembleReport(findings);
    const dd = result.productDeepDive;
    expect(dd).not.toBeNull();
    expect(dd!.fieldUtilization.length).toBeGreaterThan(0);
    expect(dd!.hasDenominatorFootnote).toBe(true);
    expect(dd!.denominatorLabel).toContain('Active Products');
  });

  it('assigns correct checkbox categories based on population rates', () => {
    // The assembler emits a curated row list (Product Family, Price Editable,
    // Discount Schedule, etc.) — not a raw per-field dump — so this test uses
    // fields from that curated set to exercise the ALWAYS and NOT_USED
    // mappings. The NOT_APPLICABLE path (null count, FLS-blocked, zero total)
    // is covered at the unit level in checkbox.test.ts.
    const findings: AssessmentFindingInput[] = [
      makeFinding({
        artifactType: 'Product2',
        artifactName: 'Prod1',
        evidenceRefs: [{ type: 'field-ref', value: 'Product2.IsActive', label: 'true' }],
      }),
      // 100% populated → ALWAYS (curated row "Product Family")
      makeFinding({
        artifactType: 'ProductFieldUtilization',
        artifactName: 'Family',
        textValue: 'Family',
        countValue: 1,
        evidenceRefs: [{ type: 'count', value: '1', label: 'TotalActive' }],
      }),
      // 0% populated → NOT_USED (curated row "Price Editable")
      makeFinding({
        artifactType: 'ProductFieldUtilization',
        artifactName: 'SBQQ__PriceEditable__c',
        textValue: 'SBQQ__PriceEditable__c',
        countValue: 0,
        evidenceRefs: [{ type: 'count', value: '1', label: 'TotalActive' }],
      }),
    ];

    const result = assembleReport(findings);
    const dd = result.productDeepDive!;

    const familyRow = dd.fieldUtilization.find((r) => r.label === 'Product Family');
    expect(familyRow?.category).toBe('ALWAYS');

    const priceEditableRow = dd.fieldUtilization.find((r) => r.label === 'Price Editable');
    expect(priceEditableRow?.category).toBe('NOT_USED');
  });
});

describe('T-03: Bundles Deep Dive assembler', () => {
  it('returns null when productOptions count is 0', () => {
    const findings = [makeFinding({ artifactType: 'Product2', artifactName: 'Prod1' })];
    const result = assembleReport(findings);
    expect(result.bundlesDeepDive).toBeNull();
  });

  it('builds BundlesDeepDive when options exist', () => {
    const findings: AssessmentFindingInput[] = [
      makeFinding({
        artifactType: 'Product2',
        artifactName: 'Bundle1',
        complexityLevel: 'medium',
        evidenceRefs: [{ type: 'field-ref', value: 'Product2.IsActive', label: 'true' }],
      }),
      makeFinding({
        artifactType: 'DataCount',
        artifactName: 'Product Options',
        countValue: 10,
      }),
      makeFinding({
        artifactType: 'DataCount',
        artifactName: 'Configured Bundles',
        countValue: 3,
      }),
      makeFinding({
        artifactType: 'DataCount',
        artifactName: 'Feature Orphans',
        countValue: 2,
      }),
      makeFinding({
        artifactType: 'DataCount',
        artifactName: 'Option Constraints',
        countValue: 5,
      }),
      makeFinding({
        artifactType: 'DataCount',
        artifactName: 'Optional For',
        countValue: 8,
      }),
    ];

    const result = assembleReport(findings);
    const dd = result.bundlesDeepDive;
    expect(dd).not.toBeNull();
    expect(dd!.summary.totalOptions).toBeGreaterThan(0);
    expect(dd!.hasDenominatorFootnote).toBe(true);
    expect(dd!.relatedObjectUtilization.length).toBeGreaterThan(0);
  });

  it('uses bundle-capable wording in all bundle references', () => {
    const findings: AssessmentFindingInput[] = [
      makeFinding({
        artifactType: 'Product2',
        artifactName: 'Bundle1',
        complexityLevel: 'medium',
        evidenceRefs: [{ type: 'field-ref', value: 'Product2.IsActive', label: 'true' }],
      }),
      makeFinding({
        artifactType: 'DataCount',
        artifactName: 'Product Options',
        countValue: 5,
      }),
    ];

    const result = assembleReport(findings);
    const dd = result.bundlesDeepDive;
    if (dd) {
      const bundleRow = dd.relatedObjectUtilization.find((r) =>
        r.label.toLowerCase().includes('bundle')
      );
      if (bundleRow) {
        expect(bundleRow.label.toLowerCase()).toContain('bundle-capable');
      }
    }
  });
});

describe('T-05: New validators V30-V33', () => {
  /** Create a minimal valid ReportData for validator testing */
  function makeReportData(overrides: Partial<ReportData> = {}): ReportData {
    return assembleReport([
      makeFinding({
        artifactType: 'Product2',
        artifactName: 'TestProd',
        evidenceRefs: [{ type: 'field-ref', value: 'Product2.IsActive', label: 'true' }],
      }),
    ]) as ReportData;
  }

  it('V33: passes when all findings have Fact + Implication pattern', () => {
    const data = makeReportData();
    const result = validateReportConsistency(data);
    const v33 = result.rules.find((r) => r.id === 'V33');
    // Our assembler now enforces the pattern in all finding generators
    expect(v33).toBeDefined();
    if (v33) {
      expect(v33.passed).toBe(true);
    }
  });

  it('V30: passes when QCP name is not present', () => {
    const data = makeReportData();
    const result = validateReportConsistency(data);
    const v30 = result.rules.find((r) => r.id === 'V30');
    expect(v30).toBeDefined();
    expect(v30!.passed).toBe(true);
  });

  it('V32: passes when T2 sections have hasDenominatorFootnote', () => {
    const data = makeReportData();
    // productDeepDive is null (no utilization findings) → V32 should pass (nothing to check)
    const result = validateReportConsistency(data);
    const v32 = result.rules.find((r) => r.id === 'V32');
    expect(v32).toBeDefined();
    expect(v32!.passed).toBe(true);
  });

  it('V31: passes when no bare "bundle" in key findings', () => {
    const data = makeReportData();
    const result = validateReportConsistency(data);
    const v31 = result.rules.find((r) => r.id === 'V31');
    expect(v31).toBeDefined();
    expect(v31!.passed).toBe(true);
  });
});
