/**
 * Unit tests for section rendering tier logic (Task T-04)
 *
 * Tests isSectionEnabled() with various ReportData states.
 */
import { describe, it, expect } from 'vitest';
import {
  isSectionEnabled,
  SECTION_RENDER_RULES,
  type ReportData,
  type SectionKey,
} from '../../src/report/assembler.ts';

/** Minimal valid ReportData for testing — all T2 sections absent */
function makeMinimalReportData(overrides: Partial<ReportData> = {}): ReportData {
  return {
    metadata: {
      clientName: 'Test',
      orgId: '00D000000000000',
      environment: 'Production',
      assessmentDate: '2026-04-01',
      assessmentPeriod: '2026-01-01 – 2026-04-01',
      cpqVersion: '240.0',
      sbaaVersion: null,
      documentVersion: '1.0',
      generatedBy: 'Test',
      lowVolumeWarning: null,
    },
    executiveSummary: {
      keyFindings: [],
      complexityScores: {
        overall: 50,
        configurationDepth: 50,
        pricingLogic: 50,
        customizationLevel: 50,
        dataVolumeUsage: 50,
        technicalDebt: 50,
      },
      scoringMethodology: [],
    },
    cpqAtAGlance: {},
    dataConfidenceSummary: null,
    packageSettings: { installedPackages: [], coreSettings: [], plugins: [] },
    quoteLifecycle: [],
    configurationDomain: {
      productCatalog: [],
      dormantFamilies: [],
      priceRules: [],
      priceRuleSummary: { active: 0, total: 0, highComplexity: 0, inactive: 0, stale: 0 },
      productRules: [],
      productRuleSummary: {
        selection: 0,
        alert: 0,
        validation: 0,
        filter: 0,
        inactive: 0,
        stale: 0,
      },
      activePriceRuleSummary: '',
      activeProductRuleSummary: '',
      discountScheduleAnalysis: [],
      discountScheduleTotalCount: 0,
      discountScheduleUniqueCount: 0,
      discountScheduleDuplicateDetail: '',
      optionAttachmentSummary: null,
    },
    usageAdoption: {
      quotingActivity: [],
      conversionBySize: [],
      discountDistribution: [],
      overrideAnalysis: null,
      userBehavior: [],
      topProducts: [],
      isLowVolume: false,
    },
    dataQuality: {
      flaggedAreas: [],
      technicalDebt: [],
      featureUtilization: [],
      fieldCompleteness: [],
    },
    customCode: {
      apexClasses: [],
      triggersFlows: [],
      validationRules: [],
      permissionSets: [],
    },
    approvalsAndDocs: {
      customActions: [],
      advancedApprovalRules: [],
      approvalChains: { count: 0, approvers: 0 },
      approvalRules: [],
      quoteTemplates: [],
      documentGeneration: {
        templateCount: 0,
        totalTemplateRecords: 0,
        usableTemplateCount: 0,
        docuSignActive: false,
      },
    },
    counts: {
      totalProducts: 0,
      activeProducts: 0,
      activeProductSource: 'unknown',
      activeProductStatus: 'not_extracted',
      bundleProducts: 0,
      configuredBundles: 0,
      productOptions: 0,
      productFamilies: 0,
      activePriceRules: 0,
      totalPriceRules: 0,
      activeProductRules: 0,
      totalProductRules: 0,
      totalQuotes: 0,
      totalQuoteLines: 0,
      activeUsers: 0,
      activeUsersSource: 'unknown',
      activeUserStatus: 'not_extracted',
      discountScheduleTotal: 0,
      discountScheduleUnique: 0,
      sbaaInstalled: false,
      sbaaVersionRaw: null,
      sbaaVersionDisplay: 'Not installed',
      approvalRuleCount: 0,
      flowCountActive: 0,
      flowCountCpqRelated: 0,
      validationRuleCount: 0,
      apexClassCount: 0,
      triggerCount: 0,
    },
    reportBanners: [],
    complexityHotspots: [],
    appendixA: [],
    appendixB: [],
    appendixBSummary: { total: 0, runLast12Mo: 0, staleCount: 0 },
    appendixD: [],
    productDeepDive: null,
    bundlesDeepDive: null,
    ...overrides,
  } as ReportData;
}

describe('isSectionEnabled', () => {
  // T1 sections — always enabled
  const t1Sections: SectionKey[] = [
    '1',
    '2',
    '3',
    '4',
    '5',
    '6.1',
    '6.3',
    '6.4',
    '6.5',
    '6.7',
    '7',
    '8',
    '9',
    '11',
    'appendixA',
    'appendixB',
    'appendixC',
    'appendixD',
  ];

  for (const section of t1Sections) {
    it(`T1 section '${section}' is always enabled`, () => {
      const data = makeMinimalReportData();
      expect(isSectionEnabled(section, data)).toBe(true);
    });
  }

  // T2 section 6.2 — conditional on productDeepDive
  it('T2 section 6.2 is disabled when productDeepDive is null', () => {
    const data = makeMinimalReportData({ productDeepDive: null });
    expect(isSectionEnabled('6.2', data)).toBe(false);
  });

  it('T2 section 6.2 is enabled when productDeepDive has data', () => {
    const data = makeMinimalReportData({
      productDeepDive: {
        summary: {
          activeProducts: 100,
          inactiveProducts: 5,
          bundleCapableProducts: 10,
          priceBooks: 2,
          dormantPercent: '20%',
        },
        fieldUtilization: [],
        pricingMethodDistribution: [],
        subscriptionProfile: [],
        hasDenominatorFootnote: true,
        denominatorLabel: 'Active Products (100)',
      },
    });
    expect(isSectionEnabled('6.2', data)).toBe(true);
  });

  // T2 section 6.6 — conditional on bundlesDeepDive
  it('T2 section 6.6 is disabled when bundlesDeepDive is null', () => {
    const data = makeMinimalReportData({ bundlesDeepDive: null });
    expect(isSectionEnabled('6.6', data)).toBe(false);
  });

  it('T2 section 6.6 is enabled when bundlesDeepDive has data', () => {
    const data = makeMinimalReportData({
      bundlesDeepDive: {
        summary: {
          bundleCapable: 76,
          configuredBundles: 19,
          nestedBundles: 2,
          avgOptionsPerBundle: '5.2',
          totalOptions: 475,
          optionsWithConstraintsPercent: '3%',
          configAttributesPercent: '15%',
          configRulesPercent: '8%',
        },
        relatedObjectUtilization: [],
        hasDenominatorFootnote: true,
        denominatorLabel: 'Active Products (176)',
      },
    });
    expect(isSectionEnabled('6.6', data)).toBe(true);
  });

  // T2 section 10 — currently always false (not yet implemented)
  it('T2 section 10 is disabled (not yet implemented)', () => {
    const data = makeMinimalReportData();
    expect(isSectionEnabled('10', data)).toBe(false);
  });

  // T2 appendixE — currently always false (not yet implemented)
  it('T2 appendixE is disabled (not yet implemented)', () => {
    const data = makeMinimalReportData();
    expect(isSectionEnabled('appendixE', data)).toBe(false);
  });

  // Invalid section key
  it('returns false for unknown section key', () => {
    const data = makeMinimalReportData();
    expect(isSectionEnabled('99' as SectionKey, data)).toBe(false);
  });

  // Registry structure check
  it('registry has entries for all standard sections', () => {
    const allKeys: SectionKey[] = [
      '1',
      '2',
      '3',
      '4',
      '5',
      '6.1',
      '6.2',
      '6.3',
      '6.4',
      '6.5',
      '6.6',
      '6.7',
      '7',
      '8',
      '9',
      '10',
      '11',
      'appendixA',
      'appendixB',
      'appendixC',
      'appendixD',
      'appendixE',
    ];
    for (const key of allKeys) {
      expect(SECTION_RENDER_RULES[key]).toBeDefined();
    }
  });
});
