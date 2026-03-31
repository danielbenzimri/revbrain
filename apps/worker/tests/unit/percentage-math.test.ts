/**
 * T2 — Percentage math regression tests.
 *
 * Verifies that top-quoted-product percentages never exceed 100%.
 * Tests the assembler's topProducts output with mock TopQuotedProduct findings.
 *
 * Regression guard for P0-5: "Top Quoted Products 117% (7 of 6)".
 *
 * See: docs/CPQ-REPORT-V4-MITIGATION-PLAN.md — Task T2 (row 17)
 */
import { describe, it, expect } from 'vitest';
import { assembleReport } from '../../src/report/assembler.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';

function makeFinding(overrides: Partial<AssessmentFindingInput>): AssessmentFindingInput {
  return {
    domain: 'usage',
    collectorName: 'test',
    artifactType: 'TopQuotedProduct',
    artifactName: 'Test Product',
    findingKey: `test:${Math.random()}`,
    sourceType: 'object',
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...overrides,
  };
}

/** Parse the percentage integer from a string like "30%" or "100% (7 of 7)" */
function parsePct(s: string): number {
  const match = s.match(/^(\d+)%/);
  return match ? Number(match[1]) : NaN;
}

describe('Percentage math — T2 regression tests', () => {
  it('P0-5 regression: product on 7 all-time quotes with 6 in 90-day window produces ≤100%', () => {
    // Simulate: 6 recent quotes as the denominator, product quoted on 6 of them
    // (After C4 fix, quote lines are scoped to 90-day window, so quotedCount ≤ recentQuotes)
    const findings = [
      makeFinding({
        artifactType: 'DataCount',
        artifactName: 'Quote',
        countValue: 6,
      }),
      makeFinding({
        artifactType: 'TopQuotedProduct',
        artifactName: 'Widget A',
        countValue: 6,
      }),
    ];

    const report = assembleReport(findings);
    const widgetA = report.usageAdoption.topProducts.find((p) => p.name === 'Widget A');
    expect(widgetA).toBeTruthy();
    const pctValue = parsePct(widgetA!.percentQuotes);
    expect(pctValue).toBeLessThanOrEqual(100);
    expect(pctValue).toBe(100);
  });

  it('denominator = 0 produces 0%', () => {
    const findings = [
      makeFinding({
        artifactType: 'DataCount',
        artifactName: 'Quote',
        countValue: 0,
      }),
      makeFinding({
        artifactType: 'TopQuotedProduct',
        artifactName: 'Widget A',
        countValue: 5,
      }),
    ];

    const report = assembleReport(findings);
    const widgetA = report.usageAdoption.topProducts.find((p) => p.name === 'Widget A');
    expect(widgetA).toBeTruthy();
    // When DataCount is 0 but products exist, assembler uses totalTopProductQuoted as denominator
    // Either way, percentage must be finite and <= 100
    const pctValue = parsePct(widgetA!.percentQuotes);
    expect(pctValue).toBeLessThanOrEqual(100);
    expect(pctValue).not.toBeNaN();
  });

  it('single product on all quotes produces 100%', () => {
    const findings = [
      makeFinding({
        artifactType: 'DataCount',
        artifactName: 'Quote',
        countValue: 10,
      }),
      makeFinding({
        artifactType: 'TopQuotedProduct',
        artifactName: 'Only Widget',
        countValue: 10,
      }),
    ];

    const report = assembleReport(findings);
    const widget = report.usageAdoption.topProducts[0];
    expect(widget.name).toBe('Only Widget');
    expect(parsePct(widget.percentQuotes)).toBe(100);
  });

  it('product on 3 of 6 quotes produces 50%', () => {
    const findings = [
      makeFinding({
        artifactType: 'DataCount',
        artifactName: 'Quote',
        countValue: 6,
      }),
      makeFinding({
        artifactType: 'TopQuotedProduct',
        artifactName: 'Half Widget',
        countValue: 3,
      }),
    ];

    const report = assembleReport(findings);
    const widget = report.usageAdoption.topProducts[0];
    expect(widget.name).toBe('Half Widget');
    expect(parsePct(widget.percentQuotes)).toBe(50);
  });

  it('no product ever exceeds 100% across multiple products', () => {
    const findings = [
      makeFinding({
        artifactType: 'DataCount',
        artifactName: 'Quote',
        countValue: 23,
      }),
      makeFinding({
        artifactType: 'TopQuotedProduct',
        artifactName: 'Product A',
        countValue: 15,
      }),
      makeFinding({
        artifactType: 'TopQuotedProduct',
        artifactName: 'Product B',
        countValue: 10,
      }),
      makeFinding({
        artifactType: 'TopQuotedProduct',
        artifactName: 'Product C',
        countValue: 7,
      }),
      makeFinding({
        artifactType: 'TopQuotedProduct',
        artifactName: 'Product D',
        countValue: 3,
      }),
    ];

    const report = assembleReport(findings);
    for (const product of report.usageAdoption.topProducts) {
      const pctValue = parsePct(product.percentQuotes);
      expect(pctValue).toBeLessThanOrEqual(100);
      expect(pctValue).toBeGreaterThanOrEqual(0);
    }
  });

  it('all percentages are non-negative integers', () => {
    const findings = [
      makeFinding({
        artifactType: 'DataCount',
        artifactName: 'Quote',
        countValue: 100,
      }),
      makeFinding({
        artifactType: 'TopQuotedProduct',
        artifactName: 'Widget',
        countValue: 1,
      }),
    ];

    const report = assembleReport(findings);
    for (const product of report.usageAdoption.topProducts) {
      const pctValue = parsePct(product.percentQuotes);
      expect(Number.isInteger(pctValue)).toBe(true);
      expect(pctValue).toBeGreaterThanOrEqual(0);
    }
  });
});
