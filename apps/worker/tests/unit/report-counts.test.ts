/**
 * T1 — Comprehensive unit tests for ReportCounts.
 *
 * Tests all ReportCounts fields with mock findings fixtures. Covers:
 * - activeProducts from IsActive evidenceRef (present status)
 * - activeProducts fallback to usageLevel (inferred status)
 * - activeProducts when no Product2 findings (not_extracted status)
 * - activeUsers from UserAdoption (present)
 * - activeUsers from UserBehavior fallback (estimated)
 * - sbaa detection from InstalledPackage findings
 * - sbaa version extraction from InstalledPackage
 * - sbaa version fallback to OrgFingerprint
 * - sbaa version fallback to CPQSettingValue
 * - sbaa installed but version unknown
 * - bundle count from ConfigurationType
 * - product options count
 * - active/total price rules
 * - active/total product rules
 * - flow counts
 * - validation rule count
 * - apex class count
 * - trigger count
 *
 * See: docs/CPQ-REPORT-V4-MITIGATION-PLAN.md — Task T1 (row 16)
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

describe('ReportCounts — T1 comprehensive tests', () => {
  // ── activeProducts from IsActive evidenceRef ──
  describe('activeProducts', () => {
    it('counts products with IsActive=true evidenceRef (present status)', () => {
      const findings = [
        makeFinding({
          artifactType: 'Product2',
          artifactName: 'Active Product 1',
          evidenceRefs: [{ type: 'field-ref', value: 'true', label: 'IsActive' }],
        }),
        makeFinding({
          artifactType: 'Product2',
          artifactName: 'Active Product 2',
          evidenceRefs: [{ type: 'field-ref', value: 'true', label: 'IsActive' }],
        }),
        makeFinding({
          artifactType: 'Product2',
          artifactName: 'Inactive Product',
          evidenceRefs: [{ type: 'field-ref', value: 'false', label: 'IsActive' }],
        }),
      ];

      const report = assembleReport(findings);
      expect(report.counts.activeProducts).toBe(2);
      expect(report.counts.totalProducts).toBe(3);
      expect(report.counts.activeProductSource).toBe('IsActive');
      expect(report.counts.activeProductStatus).toBe('present');
    });

    it('falls back to usageLevel proxy when IsActive not available (inferred status)', () => {
      const findings = [
        makeFinding({
          artifactType: 'Product2',
          artifactName: 'Used Product',
          usageLevel: 'high',
        }),
        makeFinding({
          artifactType: 'Product2',
          artifactName: 'Another Used Product',
          usageLevel: 'medium',
        }),
        makeFinding({
          artifactType: 'Product2',
          artifactName: 'Dormant Product',
          usageLevel: 'dormant',
        }),
      ];

      const report = assembleReport(findings);
      expect(report.counts.activeProducts).toBe(2);
      expect(report.counts.totalProducts).toBe(3);
      expect(report.counts.activeProductSource).toBe('inferred');
      expect(report.counts.activeProductStatus).toBe('estimated');
    });

    it('reports not_extracted when no Product2 findings exist', () => {
      const findings = [
        makeFinding({ artifactType: 'OrgFingerprint', artifactName: 'Test Org' }),
      ];

      const report = assembleReport(findings);
      expect(report.counts.activeProducts).toBe(0);
      expect(report.counts.totalProducts).toBe(0);
      expect(report.counts.activeProductSource).toBe('unknown');
      expect(report.counts.activeProductStatus).toBe('not_extracted');
    });
  });

  // ── activeUsers ──
  describe('activeUsers', () => {
    it('uses UserAdoption finding when present (present status)', () => {
      const findings = [
        makeFinding({
          artifactType: 'UserAdoption',
          artifactName: 'Active Users',
          domain: 'usage',
          countValue: 12,
        }),
        makeFinding({
          artifactType: 'UserBehavior',
          artifactName: 'Sales Rep',
          domain: 'usage',
          countValue: 5,
        }),
      ];

      const report = assembleReport(findings);
      expect(report.counts.activeUsers).toBe(12);
      expect(report.counts.activeUsersSource).toBe('UserAdoption');
      expect(report.counts.activeUserStatus).toBe('present');
    });

    it('falls back to UserBehavior sum when no UserAdoption (estimated status)', () => {
      const findings = [
        makeFinding({
          artifactType: 'UserBehavior',
          artifactName: 'Sales Rep',
          domain: 'usage',
          countValue: 5,
        }),
        makeFinding({
          artifactType: 'UserBehavior',
          artifactName: 'Admin',
          domain: 'usage',
          countValue: 3,
        }),
      ];

      const report = assembleReport(findings);
      expect(report.counts.activeUsers).toBe(8);
      expect(report.counts.activeUsersSource).toBe('UserBehavior');
      expect(report.counts.activeUserStatus).toBe('estimated');
    });

    it('reports unknown when neither UserAdoption nor UserBehavior exist', () => {
      const findings = [
        makeFinding({ artifactType: 'OrgFingerprint', artifactName: 'Test Org' }),
      ];

      const report = assembleReport(findings);
      expect(report.counts.activeUsers).toBe(0);
      expect(report.counts.activeUsersSource).toBe('unknown');
      expect(report.counts.activeUserStatus).toBe('not_extracted');
    });

    it('ignores UserAdoption with zero countValue and uses UserBehavior', () => {
      const findings = [
        makeFinding({
          artifactType: 'UserAdoption',
          artifactName: 'Active Users',
          domain: 'usage',
          countValue: 0,
        }),
        makeFinding({
          artifactType: 'UserBehavior',
          artifactName: 'Sales Rep',
          domain: 'usage',
          countValue: 7,
        }),
      ];

      const report = assembleReport(findings);
      expect(report.counts.activeUsers).toBe(7);
      expect(report.counts.activeUsersSource).toBe('UserBehavior');
    });
  });

  // ── sbaa detection ──
  describe('sbaa detection', () => {
    it('detects sbaa from InstalledPackage findings', () => {
      const findings = [
        makeFinding({
          artifactType: 'InstalledPackage',
          artifactName: 'Salesforce CPQ Advanced Approvals',
          evidenceRefs: [
            { type: 'field-ref', value: 'sbaa', label: 'Namespace' },
            { type: 'field-ref', value: '3.4.0', label: 'Version' },
          ],
        }),
      ];

      const report = assembleReport(findings);
      expect(report.counts.sbaaInstalled).toBe(true);
      expect(report.counts.sbaaVersionRaw).toBe('3.4.0');
      expect(report.counts.sbaaVersionDisplay).toBe('sbaa v3.4.0 (Active)');
      expect(report.metadata.sbaaVersion).toBe('3.4.0');
    });

    it('falls back to OrgFingerprint for sbaa version', () => {
      const findings = [
        makeFinding({
          artifactType: 'OrgFingerprint',
          artifactName: 'Test Org',
          artifactId: '00D123',
          notes: 'Enterprise, CPQ v232.2.0, production, sbaa v3.4.0',
        }),
      ];

      const report = assembleReport(findings);
      expect(report.counts.sbaaInstalled).toBe(true);
      expect(report.counts.sbaaVersionRaw).toBe('v3.4.0');
    });

    it('falls back to CPQSettingValue for sbaa version', () => {
      const findings = [
        makeFinding({
          artifactType: 'CPQSettingValue',
          artifactName: 'Package: Advanced Approvals',
          notes: 'Version v3.4.0 installed',
        }),
      ];

      const report = assembleReport(findings);
      expect(report.counts.sbaaInstalled).toBe(true);
      expect(report.counts.sbaaVersionRaw).toBe('v3.4.0');
    });

    it('shows "Installed (version unknown)" when sbaa detected but no version', () => {
      // Use OrgFingerprint with sbaa mention (no version string) — CPQSettingValue
      // notes are regex-matched for version patterns, so we use a path that
      // detects sbaa without providing a parseable version.
      const findings = [
        makeFinding({
          artifactType: 'OrgFingerprint',
          artifactName: 'Test Org',
          notes: 'Enterprise, CPQ, production, has sbaa namespace detected',
        }),
      ];

      const report = assembleReport(findings);
      expect(report.counts.sbaaInstalled).toBe(true);
      expect(report.counts.sbaaVersionRaw).toBeNull();
      expect(report.counts.sbaaVersionDisplay).toBe('Installed (version unknown)');
    });

    it('shows "Not installed" when no sbaa anywhere', () => {
      const findings = [
        makeFinding({
          artifactType: 'OrgFingerprint',
          artifactName: 'Test Org',
          notes: 'Enterprise, CPQ v232.2.0, production',
        }),
      ];

      const report = assembleReport(findings);
      expect(report.counts.sbaaInstalled).toBe(false);
      expect(report.counts.sbaaVersionDisplay).toBe('Not installed');
      expect(report.metadata.sbaaVersion).toBeNull();
    });
  });

  // ── Bundle count ──
  describe('bundleProducts', () => {
    it('counts products with complexityLevel=medium as bundles', () => {
      const findings = [
        makeFinding({
          artifactType: 'Product2',
          artifactName: 'Bundle 1',
          complexityLevel: 'medium',
        }),
        makeFinding({
          artifactType: 'Product2',
          artifactName: 'Bundle 2',
          complexityLevel: 'medium',
        }),
        makeFinding({
          artifactType: 'Product2',
          artifactName: 'Simple Product',
          complexityLevel: 'low',
        }),
      ];

      const report = assembleReport(findings);
      expect(report.counts.bundleProducts).toBe(2);
    });
  });

  // ── Product options ──
  describe('productOptions', () => {
    it('counts ProductOption findings', () => {
      const findings = [
        makeFinding({
          artifactType: 'ProductOption',
          artifactName: 'Option 1',
          domain: 'catalog',
        }),
        makeFinding({
          artifactType: 'ProductOption',
          artifactName: 'Option 2',
          domain: 'catalog',
        }),
      ];

      const report = assembleReport(findings);
      expect(report.counts.productOptions).toBe(2);
    });

    it('falls back to DataCount for product options', () => {
      const findings = [
        makeFinding({
          artifactType: 'DataCount',
          artifactName: 'ProductOption',
          countValue: 475,
          domain: 'catalog',
        }),
      ];

      const report = assembleReport(findings);
      expect(report.counts.productOptions).toBe(475);
    });
  });

  // ── Price rules ──
  describe('price rules', () => {
    it('counts active and total price rules', () => {
      const findings = [
        makeFinding({
          artifactType: 'PriceRule',
          artifactName: 'Rule 1',
          domain: 'pricing',
        }),
        makeFinding({
          artifactType: 'PriceRule',
          artifactName: 'Rule 2',
          domain: 'pricing',
        }),
        makeFinding({
          artifactType: 'PriceRule',
          artifactName: 'Inactive Rule',
          domain: 'pricing',
          usageLevel: 'dormant',
        }),
      ];

      const report = assembleReport(findings);
      expect(report.counts.totalPriceRules).toBe(3);
      expect(report.counts.activePriceRules).toBe(2);
    });

    it('handles SBQQ__PriceRule__c artifact type', () => {
      const findings = [
        makeFinding({
          artifactType: 'SBQQ__PriceRule__c',
          artifactName: 'SF Rule',
          domain: 'pricing',
        }),
      ];

      const report = assembleReport(findings);
      expect(report.counts.totalPriceRules).toBe(1);
      expect(report.counts.activePriceRules).toBe(1);
    });
  });

  // ── Product rules ──
  describe('product rules', () => {
    it('counts active and total product rules', () => {
      const findings = [
        makeFinding({
          artifactType: 'ProductRule',
          artifactName: 'PRule 1',
          domain: 'pricing',
        }),
        makeFinding({
          artifactType: 'SBQQ__ProductRule__c',
          artifactName: 'PRule 2',
          domain: 'pricing',
          usageLevel: 'dormant',
        }),
      ];

      const report = assembleReport(findings);
      expect(report.counts.totalProductRules).toBe(2);
      expect(report.counts.activeProductRules).toBe(1);
    });
  });

  // ── Flow counts ──
  describe('flow counts', () => {
    it('counts CPQ-related flows', () => {
      const findings = [
        makeFinding({ artifactType: 'Flow', artifactName: 'Flow 1', domain: 'dependency' }),
        makeFinding({ artifactType: 'Flow', artifactName: 'Flow 2', domain: 'dependency' }),
        makeFinding({ artifactType: 'Flow', artifactName: 'Flow 3', domain: 'dependency' }),
      ];

      const report = assembleReport(findings);
      expect(report.counts.flowCountCpqRelated).toBe(3);
      expect(report.counts.flowCountActive).toBe(3);
    });

    it('includes non-CPQ summary flow count in flowCountActive', () => {
      const findings = [
        makeFinding({ artifactType: 'Flow', artifactName: 'CPQ Flow 1', domain: 'dependency' }),
        makeFinding({
          artifactType: 'Flow',
          artifactName: '31 additional active flows',
          domain: 'dependency',
          findingKey: 'deps:non_cpq_summary',
          countValue: 31,
        }),
      ];

      const report = assembleReport(findings);
      expect(report.counts.flowCountCpqRelated).toBe(2);
      // flowCountActive = cpqRelated + summary countValue
      expect(report.counts.flowCountActive).toBe(33);
    });
  });

  // ── Validation rules, apex, triggers ──
  describe('code and automation counts', () => {
    it('counts validation rules', () => {
      const findings = [
        makeFinding({ artifactType: 'ValidationRule', artifactName: 'VR1', domain: 'customization' }),
        makeFinding({ artifactType: 'ValidationRule', artifactName: 'VR2', domain: 'customization' }),
      ];

      const report = assembleReport(findings);
      expect(report.counts.validationRuleCount).toBe(2);
    });

    it('counts apex classes', () => {
      const findings = [
        makeFinding({ artifactType: 'ApexClass', artifactName: 'Class1', domain: 'dependency' }),
        makeFinding({ artifactType: 'ApexClass', artifactName: 'Class2', domain: 'dependency' }),
        makeFinding({ artifactType: 'ApexClass', artifactName: 'Class3', domain: 'dependency' }),
      ];

      const report = assembleReport(findings);
      expect(report.counts.apexClassCount).toBe(3);
    });

    it('counts triggers', () => {
      const findings = [
        makeFinding({ artifactType: 'ApexTrigger', artifactName: 'Trigger1', domain: 'dependency' }),
      ];

      const report = assembleReport(findings);
      expect(report.counts.triggerCount).toBe(1);
    });
  });

  // ── Approval rules ──
  describe('approval rules', () => {
    it('counts AdvancedApprovalRule findings', () => {
      const findings = [
        makeFinding({
          artifactType: 'AdvancedApprovalRule',
          artifactName: 'Rule 1',
          domain: 'approvals',
        }),
        makeFinding({
          artifactType: 'AdvancedApprovalRule',
          artifactName: 'Rule 2',
          domain: 'approvals',
        }),
      ];

      const report = assembleReport(findings);
      expect(report.counts.approvalRuleCount).toBe(2);
    });

    it('approval count is zero when no AdvancedApprovalRule findings', () => {
      const findings = [
        makeFinding({ artifactType: 'OrgFingerprint', artifactName: 'Test Org' }),
      ];

      const report = assembleReport(findings);
      expect(report.counts.approvalRuleCount).toBe(0);
    });
  });

  // ── Discount schedules ──
  describe('discount schedules', () => {
    it('counts total and unique discount schedules', () => {
      const findings = [
        makeFinding({
          artifactType: 'DiscountSchedule',
          artifactName: 'Schedule A',
          domain: 'pricing',
        }),
        makeFinding({
          artifactType: 'DiscountSchedule',
          artifactName: 'Schedule A',
          domain: 'pricing',
        }),
        makeFinding({
          artifactType: 'DiscountSchedule',
          artifactName: 'Schedule B',
          domain: 'pricing',
        }),
      ];

      const report = assembleReport(findings);
      expect(report.counts.discountScheduleTotal).toBe(3);
      expect(report.counts.discountScheduleUnique).toBe(2);
    });
  });

  // ── Quotes and quote lines ──
  describe('quotes and quote lines', () => {
    it('counts quotes from DataCount findings', () => {
      const findings = [
        makeFinding({
          artifactType: 'DataCount',
          artifactName: 'Quotes (all)',
          countValue: 150,
          domain: 'usage',
        }),
        makeFinding({
          artifactType: 'DataCount',
          artifactName: 'Quote Lines (all)',
          countValue: 800,
          domain: 'usage',
        }),
      ];

      const report = assembleReport(findings);
      expect(report.counts.totalQuotes).toBe(150);
      expect(report.counts.totalQuoteLines).toBe(800);
    });
  });

  // ── Product families ──
  describe('product families', () => {
    it('counts distinct non-empty families from active products', () => {
      const findings = [
        makeFinding({
          artifactType: 'Product2',
          artifactName: 'P1',
          usageLevel: 'high',
          evidenceRefs: [{ type: 'field-ref', value: 'Product2.Family', label: 'Hardware' }],
        }),
        makeFinding({
          artifactType: 'Product2',
          artifactName: 'P2',
          usageLevel: 'medium',
          evidenceRefs: [{ type: 'field-ref', value: 'Product2.Family', label: 'Hardware' }],
        }),
        makeFinding({
          artifactType: 'Product2',
          artifactName: 'P3',
          usageLevel: 'high',
          evidenceRefs: [{ type: 'field-ref', value: 'Product2.Family', label: 'Software' }],
        }),
        makeFinding({
          artifactType: 'Product2',
          artifactName: 'P4',
          usageLevel: 'dormant',
          evidenceRefs: [{ type: 'field-ref', value: 'Product2.Family', label: 'Services' }],
        }),
      ];

      const report = assembleReport(findings);
      // Hardware + Software (dormant excluded)
      expect(report.counts.productFamilies).toBe(2);
    });

    it('excludes (none) from family count', () => {
      const findings = [
        makeFinding({
          artifactType: 'Product2',
          artifactName: 'P1',
          usageLevel: 'high',
          evidenceRefs: [{ type: 'field-ref', value: 'Product2.Family', label: '(none)' }],
        }),
      ];

      const report = assembleReport(findings);
      expect(report.counts.productFamilies).toBe(0);
    });
  });
});
