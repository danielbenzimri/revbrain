/**
 * T8 — Golden file regression test with frozen fixture.
 *
 * Loads a frozen subset of assessment findings, assembles a report,
 * and verifies key fields against known-good values. Catches assembler
 * regressions that change report output for the same input data.
 *
 * The fixture is a representative sample (85 findings) from the real
 * assessment-results.json, covering all 38 artifact types.
 *
 * See: docs/CPQ-REPORT-V4-MITIGATION-PLAN.md — Task T8 (row 20)
 */
import { describe, it, expect } from 'vitest';
import { assembleReport } from '../../src/report/assembler.ts';
import goldenData from '../fixtures/golden-findings.json';

describe('Golden file regression — T8', () => {
  // Phase 2 fix (2026-04-11): assembleReport no longer reads wall-clock;
  // callers must pass assessmentTimestamp. Frozen here so the golden
  // snapshot stays reproducible.
  const report = assembleReport(goldenData.findings as Parameters<typeof assembleReport>[0], {
    assessmentTimestamp: '2026-04-11T00:00:00Z',
  });

  // ── Metadata ──
  it('metadata fields are populated', () => {
    expect(report.metadata.orgId).toBeTruthy();
    expect(report.metadata.assessmentDate).toBeTruthy();
    expect(report.metadata.assessmentPeriod).toContain('90 Days');
    expect(report.metadata.documentVersion).toBe('1.0');
    expect(report.metadata.generatedBy).toContain('RevBrain');
  });

  // ── Counts snapshot ──
  it('counts match golden snapshot', () => {
    // These are the key counts from the frozen fixture.
    // If the assembler changes how it counts, this test will fail.
    expect(report.counts.totalProducts).toBe(3);
    expect(typeof report.counts.activeProducts).toBe('number');
    expect(report.counts.activeProducts).toBeLessThanOrEqual(report.counts.totalProducts);
    expect(report.counts.totalPriceRules).toBe(3);
    expect(report.counts.totalProductRules).toBe(3);
    expect(report.counts.validationRuleCount).toBe(3);
    expect(report.counts.apexClassCount).toBe(3);
    expect(report.counts.triggerCount).toBe(3);
    expect(report.counts.flowCountCpqRelated).toBe(3);
    expect(typeof report.counts.sbaaInstalled).toBe('boolean');
    expect(typeof report.counts.approvalRuleCount).toBe('number');
  });

  // ── Section structure ──
  it('all report sections are present', () => {
    expect(report.executiveSummary).toBeTruthy();
    expect(report.executiveSummary.keyFindings.length).toBeGreaterThan(0);
    expect(report.executiveSummary.complexityScores.overall).toBeGreaterThan(0);
    expect(report.executiveSummary.scoringMethodology.length).toBe(5);

    expect(report.cpqAtAGlance).toBeTruthy();
    expect(Object.keys(report.cpqAtAGlance).length).toBeGreaterThanOrEqual(5);

    expect(report.packageSettings).toBeTruthy();
    expect(report.packageSettings.coreSettings).toBeDefined();
    expect(report.packageSettings.plugins).toBeDefined();

    expect(report.configurationDomain).toBeTruthy();
    expect(report.configurationDomain.priceRules.length).toBe(3);
    expect(report.configurationDomain.productRules.length).toBeGreaterThan(0);

    expect(report.usageAdoption).toBeTruthy();
    expect(report.usageAdoption.topProducts.length).toBe(3);

    expect(report.dataQuality).toBeTruthy();
    expect(report.dataQuality.flaggedAreas.length).toBeGreaterThan(0);

    expect(report.customCode).toBeTruthy();
    expect(report.customCode.apexClasses.length).toBe(3);
    expect(report.customCode.triggersFlows.length).toBeGreaterThan(0);

    expect(report.approvalsAndDocs).toBeTruthy();
    expect(report.quoteLifecycle.length).toBe(7);
    expect(report.appendixA.length).toBeGreaterThan(0);
    expect(report.appendixD.length).toBeGreaterThanOrEqual(5);
  });

  // ── Catalog percentages are bounded ──
  it('product catalog percentages do not exceed 100%', () => {
    for (const c of report.configurationDomain.productCatalog) {
      const match = c.percentQuoted.match(/^(\d+)%/);
      if (match) {
        expect(Number(match[1])).toBeLessThanOrEqual(100);
      }
    }
  });

  // ── Top products have valid structure ──
  it('top products have required fields', () => {
    for (const p of report.usageAdoption.topProducts) {
      expect(p.name).toBeTruthy();
      expect(typeof p.quotedCount).toBe('number');
      expect(p.percentQuotes).toBeTruthy();
      // Note: topProducts percentages depend on collector data scoping (C4 fix).
      // The golden fixture preserves pre-C4 data where quotedCount may exceed
      // the denominator — this is expected for the frozen fixture.
    }
  });

  // ── sbaaVersion consistency ──
  it('sbaaVersion is consistent with counts', () => {
    if (report.counts.sbaaInstalled) {
      expect(report.metadata.sbaaVersion).not.toBe('Not installed');
      expect(report.counts.sbaaVersionDisplay).not.toBe('Not installed');
    } else {
      expect(report.metadata.sbaaVersion).toBeNull();
      expect(report.counts.sbaaVersionDisplay).toBe('Not installed');
    }
  });

  // ── Low volume warning consistency ──
  it('low volume warning user count matches counts.activeUsers', () => {
    if (report.metadata.lowVolumeWarning) {
      const match = report.metadata.lowVolumeWarning.match(/(\d+)\s*active users/);
      if (match) {
        expect(Number(match[1])).toBe(report.counts.activeUsers);
      }
    }
  });

  // ── Report banners ──
  it('report banners array is initialized', () => {
    expect(Array.isArray(report.reportBanners)).toBe(true);
  });

  // ── Complexity scores are bounded ──
  it('complexity scores are between 0 and 100', () => {
    const scores = report.executiveSummary.complexityScores;
    for (const [, value] of Object.entries(scores)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  // ── Rule summaries match counts ──
  it('price rule summary matches count', () => {
    expect(report.configurationDomain.activePriceRuleSummary).toContain(
      `${report.counts.activePriceRules} active of ${report.counts.totalPriceRules} total`
    );
  });

  it('product rule summary matches count', () => {
    expect(report.configurationDomain.activeProductRuleSummary).toContain(
      `${report.counts.activeProductRules} active of ${report.counts.totalProductRules} total`
    );
  });
});
