/**
 * T4 — Approvals independence verification via assembler integration.
 *
 * Tests that the assembler correctly handles approval rule findings
 * when sbaa is installed vs not installed. Since the collector requires
 * a full CollectorContext, these tests verify at the finding/assembler level.
 *
 * See: docs/CPQ-REPORT-V4-MITIGATION-PLAN.md — Task T4 (row 19)
 */
import { describe, it, expect } from 'vitest';
import { assembleReport } from '../../src/report/assembler.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';

function makeFinding(overrides: Partial<AssessmentFindingInput>): AssessmentFindingInput {
  return {
    domain: 'approvals',
    collectorName: 'test',
    artifactType: 'AdvancedApprovalRule',
    artifactName: 'Test Rule',
    findingKey: `test:${Math.random()}`,
    sourceType: 'object',
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...overrides,
  };
}

describe('Approvals independence — T4', () => {
  it('AdvancedApprovalRule findings present when sbaa installed -> approvalRuleCount > 0', () => {
    const findings = [
      // sbaa is installed
      makeFinding({
        artifactType: 'InstalledPackage',
        artifactName: 'Advanced Approvals',
        domain: 'settings',
        evidenceRefs: [
          { type: 'field-ref', value: 'sbaa', label: 'Namespace' },
          { type: 'field-ref', value: '3.4.0', label: 'Version' },
        ],
      }),
      // Approval rules extracted
      makeFinding({
        artifactType: 'AdvancedApprovalRule',
        artifactName: 'Discount > 20% Approval',
        countValue: 3,
      }),
      makeFinding({
        artifactType: 'AdvancedApprovalRule',
        artifactName: 'Large Deal Approval',
        countValue: 2,
      }),
    ];

    const report = assembleReport(findings);
    expect(report.counts.sbaaInstalled).toBe(true);
    expect(report.counts.approvalRuleCount).toBe(2);
    expect(report.approvalsAndDocs.advancedApprovalRules.length).toBe(2);
  });

  it('no sbaa findings -> approvalRuleCount = 0', () => {
    const findings = [
      makeFinding({
        artifactType: 'OrgFingerprint',
        artifactName: 'Test Org',
        domain: 'catalog',
        notes: 'Enterprise, CPQ v232.2.0, production',
      }),
      makeFinding({
        artifactType: 'Product2',
        artifactName: 'Some Product',
        domain: 'catalog',
      }),
    ];

    const report = assembleReport(findings);
    expect(report.counts.sbaaInstalled).toBe(false);
    expect(report.counts.approvalRuleCount).toBe(0);
    expect(report.approvalsAndDocs.advancedApprovalRules.length).toBe(0);
  });

  it('InstalledPackage shows sbaa but no AdvancedApprovalRule findings -> count = 0 (validator should flag)', () => {
    const findings = [
      makeFinding({
        artifactType: 'InstalledPackage',
        artifactName: 'Advanced Approvals',
        domain: 'settings',
        evidenceRefs: [
          { type: 'field-ref', value: 'sbaa', label: 'Namespace' },
          { type: 'field-ref', value: '3.4.0', label: 'Version' },
        ],
      }),
      // No AdvancedApprovalRule findings at all
    ];

    const report = assembleReport(findings);
    expect(report.counts.sbaaInstalled).toBe(true);
    expect(report.counts.approvalRuleCount).toBe(0);
    // The sbaa version should still be detected
    expect(report.counts.sbaaVersionDisplay).toBe('sbaa v3.4.0 (Active)');
    // V22 should catch this when validator runs (tested in T4a)
  });
});
