/**
 * T3 — sbaaVersion fallback chain tests (5 scenarios, all branches covered).
 *
 * Tests the three-level fallback chain for sbaa version detection:
 * 1. InstalledPackage finding with sbaa namespace -> version extracted
 * 2. No InstalledPackage, OrgFingerprint notes contain "sbaa v232.2.0" -> regex match
 * 3. No InstalledPackage or OrgFingerprint, CPQSettingValue "Package: Advanced Approvals" -> parse notes
 * 4. All three miss but another finding shows sbaa namespace -> "Installed (version unknown)"
 * 5. Truly not installed (no sbaa anywhere) -> "Not installed"
 *
 * See: docs/CPQ-REPORT-V4-MITIGATION-PLAN.md — Task T3 (row 18)
 */
import { describe, it, expect } from 'vitest';
import { assembleReport } from '../../src/report/assembler.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';

function makeFinding(overrides: Partial<AssessmentFindingInput>): AssessmentFindingInput {
  return {
    domain: 'catalog',
    collectorName: 'test',
    artifactType: 'Product2',
    artifactName: 'Test',
    findingKey: `test:${Math.random()}`,
    sourceType: 'object',
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...overrides,
  };
}

describe('sbaaVersion fallback chain — T3', () => {
  it('Scenario 1: InstalledPackage finding with sbaa namespace -> version extracted', () => {
    const findings = [
      makeFinding({
        artifactType: 'InstalledPackage',
        artifactName: 'Salesforce CPQ Advanced Approvals',
        evidenceRefs: [
          { type: 'field-ref', value: 'sbaa', label: 'Namespace' },
          { type: 'field-ref', value: '3.4.0', label: 'Version' },
          { type: 'field-ref', value: '50', label: 'LicenseCount' },
        ],
      }),
      // OrgFingerprint also mentions sbaa (should be ignored — InstalledPackage wins)
      makeFinding({
        artifactType: 'OrgFingerprint',
        artifactName: 'Test Org',
        artifactId: '00D123',
        notes: 'Enterprise, CPQ v232.2.0, production, sbaa v2.0.0',
      }),
    ];

    const report = assembleReport(findings);
    expect(report.counts.sbaaInstalled).toBe(true);
    // InstalledPackage version takes precedence over OrgFingerprint regex
    expect(report.counts.sbaaVersionRaw).toBe('3.4.0');
    expect(report.counts.sbaaVersionDisplay).toBe('3.4.0');
    expect(report.metadata.sbaaVersion).toBe('3.4.0');
  });

  it('Scenario 2: No InstalledPackage, OrgFingerprint notes contain "sbaa v232.2.0" -> regex match', () => {
    const findings = [
      makeFinding({
        artifactType: 'OrgFingerprint',
        artifactName: 'Test Org',
        artifactId: '00D123',
        notes: 'Enterprise, CPQ v232.2.0, production, sbaa v232.2.0',
      }),
    ];

    const report = assembleReport(findings);
    expect(report.counts.sbaaInstalled).toBe(true);
    expect(report.counts.sbaaVersionRaw).toBe('v232.2.0');
    expect(report.counts.sbaaVersionDisplay).toBe('v232.2.0');
    expect(report.metadata.sbaaVersion).toBe('v232.2.0');
  });

  it('Scenario 3: No InstalledPackage or OrgFingerprint, CPQSettingValue "Advanced Approvals" -> parse from notes', () => {
    const findings = [
      makeFinding({
        artifactType: 'OrgFingerprint',
        artifactName: 'Test Org',
        artifactId: '00D123',
        notes: 'Enterprise, CPQ v232.2.0, production',
      }),
      makeFinding({
        artifactType: 'CPQSettingValue',
        artifactName: 'Package: Advanced Approvals',
        notes: 'sbaa v3.6.1 installed',
      }),
    ];

    const report = assembleReport(findings);
    expect(report.counts.sbaaInstalled).toBe(true);
    expect(report.counts.sbaaVersionRaw).toBe('v3.6.1');
    expect(report.counts.sbaaVersionDisplay).toBe('v3.6.1');
    expect(report.metadata.sbaaVersion).toBe('v3.6.1');
  });

  it('Scenario 4: All three miss version but sbaa namespace detected -> "Installed (version unknown)"', () => {
    const findings = [
      // OrgFingerprint mentions sbaa but without a parseable version
      makeFinding({
        artifactType: 'OrgFingerprint',
        artifactName: 'Test Org',
        artifactId: '00D123',
        notes: 'Enterprise, CPQ, production, has sbaa namespace in describe',
      }),
    ];

    const report = assembleReport(findings);
    expect(report.counts.sbaaInstalled).toBe(true);
    expect(report.counts.sbaaVersionRaw).toBeNull();
    expect(report.counts.sbaaVersionDisplay).toBe('Installed (version unknown)');
    // metadata.sbaaVersion shows "Installed (version unknown)" when installed but no version
    expect(report.metadata.sbaaVersion).toBe('Installed (version unknown)');
  });

  it('Scenario 5: Truly not installed (no sbaa anywhere) -> "Not installed"', () => {
    const findings = [
      makeFinding({
        artifactType: 'OrgFingerprint',
        artifactName: 'Test Org',
        artifactId: '00D123',
        notes: 'Enterprise, CPQ v232.2.0, production',
      }),
      makeFinding({
        artifactType: 'CPQSettingValue',
        artifactName: 'Quote Calculator Plugin',
        notes: 'Enabled',
      }),
    ];

    const report = assembleReport(findings);
    expect(report.counts.sbaaInstalled).toBe(false);
    expect(report.counts.sbaaVersionRaw).toBeNull();
    expect(report.counts.sbaaVersionDisplay).toBe('Not installed');
    expect(report.metadata.sbaaVersion).toBeNull();
  });
});
