/**
 * Unit tests for the report assembler.
 * Verifies that assembleReport produces a complete ReportData from findings.
 *
 * Updated: Redline mitigation R0–R2 (percentage fixes, active filtering,
 *          tech debt, feature utilization, scoring methodology)
 */
import { describe, it, expect } from 'vitest';
import { assembleReport } from '../../src/report/assembler.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';

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

describe('assembleReport', () => {
  it('produces a ReportData with all sections', () => {
    const findings: AssessmentFindingInput[] = [
      makeFinding({
        artifactType: 'OrgFingerprint',
        artifactName: 'Test Org',
        artifactId: '00D123',
        notes: 'Enterprise, CPQ v232.2.0, production',
      }),
      makeFinding({
        artifactType: 'PriceRule',
        artifactName: 'Apply Freight',
        domain: 'pricing',
        riskLevel: 'high',
        complexityLevel: 'high',
      }),
      makeFinding({
        artifactType: 'PriceRule',
        artifactName: 'Apply Tax',
        domain: 'pricing',
        riskLevel: 'medium',
      }),
      makeFinding({ artifactType: 'ProductRule', artifactName: 'Add Default Item' }),
      makeFinding({
        artifactType: 'CPQSettingValue',
        artifactName: 'Quote Line Editor',
        evidenceRefs: [{ type: 'field-ref', value: 'SBQQ__QLE__c', label: 'Enabled' }],
      }),
      makeFinding({
        artifactType: 'PluginStatus',
        artifactName: 'Quote Calculator Plugin (QCP)',
        countValue: 0,
      }),
      makeFinding({
        artifactType: 'PluginStatus',
        artifactName: 'Electronic Signature',
        countValue: 1,
      }),
      makeFinding({
        artifactType: 'ComplexityHotspot',
        artifactName: 'Quote Pricing Engine',
        riskLevel: 'critical',
        notes: '2 Price Rules + 1 Product Rule',
      }),
      makeFinding({ artifactType: 'TopQuotedProduct', artifactName: 'Widget A', countValue: 100 }),
      makeFinding({
        artifactType: 'ObjectInventoryItem',
        artifactName: 'SBQQ__PriceRule__c',
        countValue: 2,
        complexityLevel: 'high',
      }),
      makeFinding({
        artifactType: 'CPQReport',
        artifactName: 'Quote Leaderboard',
        notes: 'Top products by quote lines',
      }),
      makeFinding({
        artifactType: 'DataQualityFlag',
        artifactName: 'Orphaned Quote Lines',
        countValue: 5,
      }),
      makeFinding({
        artifactType: 'ApexClass',
        artifactName: 'QuoteHandler',
        countValue: 320,
        domain: 'dependency',
      }),
      makeFinding({
        artifactType: 'Flow',
        artifactName: 'Quote Before Save',
        domain: 'dependency',
      }),
    ];

    const report = assembleReport(findings);

    // Metadata
    expect(report.metadata.orgId).toBe('00D123');
    expect(report.metadata.cpqVersion).toBe('v232.2.0');
    expect(report.metadata.environment).toBe('Production');
    expect(report.metadata.assessmentPeriod).toContain('90 Days');
    expect(report.metadata.assessmentPeriod).toContain('–'); // actual date range

    // Executive Summary
    expect(report.executiveSummary.keyFindings.length).toBeGreaterThan(0);
    expect(report.executiveSummary.keyFindings[0].title).toBe('Quote Pricing Engine');

    // Scoring Methodology
    expect(report.executiveSummary.scoringMethodology.length).toBe(5);
    expect(report.executiveSummary.scoringMethodology[0].dimension).toBe('Configuration Depth');
    expect(report.executiveSummary.scoringMethodology[0].weight).toBe(25);

    // Complexity Scores — NOT zero
    expect(report.executiveSummary.complexityScores.overall).toBeGreaterThan(0);
    expect(report.executiveSummary.complexityScores.configurationDepth).toBeGreaterThan(0);

    // Settings
    expect(report.packageSettings.coreSettings.length).toBe(1);
    expect(report.packageSettings.coreSettings[0].setting).toBe('Quote Line Editor');
    expect(report.packageSettings.coreSettings[0].value).toBe('Enabled');

    // Plugins
    expect(report.packageSettings.plugins.length).toBe(2);
    expect(report.packageSettings.plugins[0].status).toBe('Not Configured'); // QCP
    expect(report.packageSettings.plugins[1].status).toBe('Active'); // E-Sig

    // Configuration Domain — price rules have status, not usage
    expect(report.configurationDomain.priceRules.length).toBe(2);
    expect(report.configurationDomain.priceRules[0].status).toBe('Active');
    expect(report.configurationDomain.activePriceRuleSummary).toContain('2 active of 2 total');

    // Product rules have type column
    expect(report.configurationDomain.productRules.length).toBe(1);
    expect(report.configurationDomain.productRules[0]).toHaveProperty('type');

    // Discount schedule analysis and option attachment
    expect(report.configurationDomain).toHaveProperty('discountScheduleAnalysis');
    expect(report.configurationDomain).toHaveProperty('optionAttachmentSummary');

    // Field completeness
    expect(report.dataQuality.fieldCompleteness.length).toBeGreaterThan(0);

    // Usage — top products have calculated percentages
    expect(report.usageAdoption.topProducts.length).toBe(1);
    expect(report.usageAdoption.topProducts[0].name).toBe('Widget A');
    expect(report.usageAdoption.topProducts[0].percentQuotes).not.toBe('0%');

    // Data Quality
    expect(report.dataQuality.flaggedAreas.length).toBe(1);
    expect(report.dataQuality.flaggedAreas[0].status).toBe('Flagged');

    // Feature utilization populated
    expect(report.dataQuality.featureUtilization.length).toBeGreaterThan(0);

    // Custom Code — origin inferred from name
    expect(report.customCode.apexClasses.length).toBe(1);
    expect(report.customCode.apexClasses[0].origin).toBe('Custom'); // QuoteHandler — not SBQQ prefixed
    expect(report.customCode.apexClasses[0].purpose).toBe('Quote processing'); // inferred from name
    expect(report.customCode.triggersFlows.length).toBe(1);

    // Approvals & Docs section exists
    expect(report.approvalsAndDocs).toBeTruthy();
    expect(report.approvalsAndDocs.documentGeneration).toBeTruthy();

    // Report banners initialized
    expect(report.reportBanners).toEqual([]);

    // Hotspots
    expect(report.complexityHotspots.length).toBe(1);
    expect(report.complexityHotspots[0].severity).toBe('critical');

    // Appendix A — has isCpqObject flag
    expect(report.appendixA.length).toBe(1);
    expect(report.appendixA[0].objectName).toBe('SBQQ__PriceRule__c');

    // Appendix B
    expect(report.appendixB.length).toBe(1);

    // Appendix D — dynamic coverage, not hardcoded "Full"
    expect(report.appendixD.length).toBeGreaterThanOrEqual(5);

    // Lifecycle
    expect(report.quoteLifecycle.length).toBe(7);

    // Glance dashboard — 7 panels (5 original + tech debt + feature utilization)
    expect(Object.keys(report.cpqAtAGlance).length).toBeGreaterThanOrEqual(7);
  });

  it('produces default key findings when no hotspots', () => {
    const findings: AssessmentFindingInput[] = [
      makeFinding({ artifactType: 'Product2', artifactName: 'Product 1' }),
      makeFinding({ artifactType: 'Product2', artifactName: 'Product 2' }),
      makeFinding({
        artifactType: 'PriceRule',
        artifactName: 'Rule 1',
        domain: 'pricing',
        riskLevel: 'medium',
      }),
    ];

    const report = assembleReport(findings);
    expect(report.executiveSummary.keyFindings.length).toBeGreaterThanOrEqual(3);
    // First finding should be analytical (rules, QCP, or products) not "X artifacts extracted"
    expect(report.executiveSummary.keyFindings[0].title).not.toContain('extracted');

    // No migration/RCA language in findings
    for (const finding of report.executiveSummary.keyFindings) {
      expect(finding.detail).not.toContain('RCA');
      expect(finding.detail).not.toContain('migration');
    }
  });

  it('computes non-zero complexity scores from findings', () => {
    const findings: AssessmentFindingInput[] = [
      makeFinding({ domain: 'catalog', riskLevel: 'high', complexityLevel: 'high' }),
      makeFinding({ domain: 'catalog', riskLevel: 'medium', complexityLevel: 'medium' }),
      makeFinding({ domain: 'pricing', riskLevel: 'critical', complexityLevel: 'very-high' }),
    ];

    const report = assembleReport(findings);
    expect(report.executiveSummary.complexityScores.overall).toBeGreaterThan(0);
    expect(report.executiveSummary.complexityScores.configurationDepth).toBeGreaterThan(0);
    expect(report.executiveSummary.complexityScores.pricingLogic).toBeGreaterThan(0);
  });

  it('calculates top product percentages correctly', () => {
    const findings: AssessmentFindingInput[] = [
      makeFinding({
        artifactType: 'DataCount',
        artifactName: 'Quote',
        domain: 'usage',
        countValue: 23,
      }),
      makeFinding({
        artifactType: 'TopQuotedProduct',
        artifactName: 'Widget A',
        domain: 'usage',
        countValue: 7,
      }),
      makeFinding({
        artifactType: 'TopQuotedProduct',
        artifactName: 'Widget B',
        domain: 'usage',
        countValue: 4,
      }),
    ];

    const report = assembleReport(findings);
    expect(report.usageAdoption.topProducts.length).toBe(2);
    // 7/23 = 30%
    expect(report.usageAdoption.topProducts[0].percentQuotes).toContain('30%');
    // 4/23 = 17%
    expect(report.usageAdoption.topProducts[1].percentQuotes).toContain('17%');
  });

  it('calculates discount distribution percentages correctly', () => {
    const findings: AssessmentFindingInput[] = [
      makeFinding({
        artifactType: 'DiscountDistribution',
        artifactName: 'DiscountBuckets',
        domain: 'usage',
        evidenceRefs: [
          { type: 'count', value: '10', label: '0-5%' },
          { type: 'count', value: '7', label: '5-10%' },
          { type: 'count', value: '3', label: '>20%' },
        ],
      }),
    ];

    const report = assembleReport(findings);
    expect(report.usageAdoption.discountDistribution.length).toBe(3);
    // 10/20 = 50%
    expect(report.usageAdoption.discountDistribution[0].percent).toContain('50%');
    // 3/20 = 15%
    expect(report.usageAdoption.discountDistribution[2].percent).toContain('15%');
  });

  it('filters active/inactive price rules correctly', () => {
    const findings: AssessmentFindingInput[] = [
      makeFinding({
        artifactType: 'PriceRule',
        artifactName: 'Active Rule 1',
        domain: 'pricing',
      }),
      makeFinding({
        artifactType: 'PriceRule',
        artifactName: 'Active Rule 2',
        domain: 'pricing',
      }),
      makeFinding({
        artifactType: 'PriceRule',
        artifactName: 'Test Inactive Rule',
        domain: 'pricing',
        usageLevel: 'dormant',
      }),
    ];

    const report = assembleReport(findings);
    expect(report.configurationDomain.priceRules.length).toBe(3);
    expect(report.configurationDomain.activePriceRuleSummary).toBe('2 active of 3 total');
    expect(report.configurationDomain.priceRules[2].status).toBe('Inactive');
    expect(report.configurationDomain.priceRules[2].name).toContain('tech debt');
  });

  it('builds technical debt inventory from findings', () => {
    const findings: AssessmentFindingInput[] = [
      makeFinding({ artifactType: 'Product2', artifactName: 'Good Product', usageLevel: 'high' }),
      makeFinding({
        artifactType: 'Product2',
        artifactName: 'Dormant Product',
        usageLevel: 'dormant',
      }),
      makeFinding({
        artifactType: 'PriceRule',
        artifactName: 'DELETE ME: Old Rule',
        domain: 'pricing',
        usageLevel: 'dormant',
      }),
    ];

    const report = assembleReport(findings);
    expect(report.dataQuality.technicalDebt.length).toBeGreaterThan(0);

    const dormantProducts = report.dataQuality.technicalDebt.find(
      (d) => d.category === 'Dormant Products'
    );
    expect(dormantProducts).toBeTruthy();
    expect(dormantProducts!.count).toBe(1);

    const staleRules = report.dataQuality.technicalDebt.find(
      (d) => d.category === 'Stale/Test Rules'
    );
    expect(staleRules).toBeTruthy();
    expect(staleRules!.count).toBe(1);
  });

  it('shows low-volume warning for sparse data', () => {
    const findings: AssessmentFindingInput[] = [
      makeFinding({
        artifactType: 'DataCount',
        artifactName: 'Quote',
        domain: 'usage',
        countValue: 3,
      }),
    ];

    const report = assembleReport(findings);
    expect(report.metadata.lowVolumeWarning).toBeTruthy();
    expect(report.metadata.lowVolumeWarning).toContain('Low activity');
  });

  it('detects Apex class origin from namespace prefix', () => {
    const findings: AssessmentFindingInput[] = [
      makeFinding({
        artifactType: 'ApexClass',
        artifactName: 'SBQQ__QuotePlugin',
        domain: 'dependency',
        countValue: 100,
      }),
      makeFinding({
        artifactType: 'ApexClass',
        artifactName: 'MyCustomHandler',
        domain: 'dependency',
        countValue: 50,
      }),
    ];

    const report = assembleReport(findings);
    expect(report.customCode.apexClasses[0].origin).toBe('Managed (CPQ)');
    expect(report.customCode.apexClasses[1].origin).toBe('Custom');
  });

  it('builds dynamic extraction coverage', () => {
    const findings: AssessmentFindingInput[] = [
      makeFinding({ domain: 'catalog' }),
      makeFinding({ domain: 'catalog' }),
      makeFinding({ domain: 'catalog' }),
      makeFinding({ domain: 'catalog' }),
      makeFinding({ domain: 'catalog' }),
      makeFinding({ domain: 'catalog' }),
      makeFinding({ domain: 'pricing' }),
    ];

    const report = assembleReport(findings);
    const catalogCoverage = report.appendixD.find((d) => d.category === 'Product Catalog');
    expect(catalogCoverage).toBeTruthy();
    expect(catalogCoverage!.coverage).toBe('Full'); // 6 findings > 5 threshold

    const pricingCoverage = report.appendixD.find((d) => d.category === 'Pricing & Rules');
    expect(pricingCoverage).toBeTruthy();
    expect(pricingCoverage!.coverage).toBe('Partial'); // 1 finding <= 5 threshold

    const templatesCoverage = report.appendixD.find((d) => d.category === 'Quote Templates');
    expect(templatesCoverage).toBeTruthy();
    expect(templatesCoverage!.coverage).toBe('Not extracted'); // no findings in templates domain
  });

  it('removes migration/RCA language from all findings', () => {
    const findings: AssessmentFindingInput[] = [
      makeFinding({
        artifactType: 'PriceRule',
        artifactName: 'Rule 1',
        domain: 'pricing',
        riskLevel: 'medium',
      }),
      makeFinding({
        artifactType: 'PluginStatus',
        artifactName: 'Quote Calculator Plugin (QCP)',
        countValue: 1,
      }),
      makeFinding({
        artifactType: 'CPQSettingValue',
        artifactName: 'Multi-Currency',
        notes: 'Enabled',
      }),
    ];

    const report = assembleReport(findings);
    for (const finding of report.executiveSummary.keyFindings) {
      expect(finding.detail).not.toContain('RCA');
      expect(finding.detail).not.toContain('migration');
      expect(finding.detail).not.toContain('post-migration');
    }
  });
});
