/**
 * Unit tests for the report assembler.
 * Verifies that assembleReport produces a complete ReportData from findings.
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
        riskLevel: 'high',
        complexityLevel: 'high',
      }),
      makeFinding({ artifactType: 'PriceRule', artifactName: 'Apply Tax', riskLevel: 'medium' }),
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

    // Executive Summary
    expect(report.executiveSummary.keyFindings.length).toBeGreaterThan(0);
    expect(report.executiveSummary.keyFindings[0].title).toBe('Quote Pricing Engine');

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

    // Configuration Domain
    expect(report.configurationDomain.priceRules.length).toBe(2);
    expect(report.configurationDomain.productRules.length).toBe(1);

    // Usage
    expect(report.usageAdoption.topProducts.length).toBe(1);
    expect(report.usageAdoption.topProducts[0].name).toBe('Widget A');

    // Data Quality
    expect(report.dataQuality.flaggedAreas.length).toBe(1);
    expect(report.dataQuality.flaggedAreas[0].status).toBe('Flagged');

    // Custom Code
    expect(report.customCode.apexClasses.length).toBe(1);
    expect(report.customCode.triggersFlows.length).toBe(1);

    // Hotspots
    expect(report.complexityHotspots.length).toBe(1);
    expect(report.complexityHotspots[0].severity).toBe('critical');

    // Appendix A
    expect(report.appendixA.length).toBe(1);
    expect(report.appendixA[0].objectName).toBe('SBQQ__PriceRule__c');

    // Appendix B
    expect(report.appendixB.length).toBe(1);

    // Lifecycle
    expect(report.quoteLifecycle.length).toBe(7);

    // Glance dashboard
    expect(Object.keys(report.cpqAtAGlance).length).toBeGreaterThanOrEqual(5);
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
    expect(report.executiveSummary.keyFindings[0].title).toContain('3 CPQ artifacts');
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
});
