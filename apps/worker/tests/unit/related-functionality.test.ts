/**
 * Unit tests: Related Functionality section (T-07)
 */
import { describe, it, expect } from 'vitest';
import { assembleReport, isSectionEnabled } from '../../src/report/assembler.ts';
import { renderReport } from '../../src/report/templates/index.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';

function makeFinding(overrides: Partial<AssessmentFindingInput>): AssessmentFindingInput {
  return {
    domain: 'integration',
    collectorName: 'integrations',
    artifactType: 'ExperienceCloud',
    artifactName: 'Test',
    findingKey: `rf-${Math.random().toString(36).slice(2)}`,
    sourceType: 'object',
    detected: true,
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...overrides,
  };
}

describe('T-07: Related Functionality', () => {
  it('returns null when no related functionality is detected', () => {
    const findings = [
      makeFinding({
        domain: 'catalog',
        artifactType: 'Product2',
        artifactName: 'Prod1',
        evidenceRefs: [{ type: 'field-ref', value: 'Product2.IsActive', label: 'true' }],
      }),
    ];
    const result = assembleReport(findings);
    expect(result.relatedFunctionality).toBeNull();
    expect(isSectionEnabled('10', result)).toBe(false);
  });

  it('builds section when Experience Cloud is detected', () => {
    const findings = [
      makeFinding({
        domain: 'catalog',
        artifactType: 'Product2',
        artifactName: 'Prod1',
        evidenceRefs: [{ type: 'field-ref', value: 'Product2.IsActive', label: 'true' }],
      }),
      makeFinding({
        artifactType: 'ExperienceCloud',
        artifactName: 'Experience Cloud',
        detected: true,
        countValue: 2,
        notes: '2 Experience Cloud site(s) detected',
      }),
    ];
    const result = assembleReport(findings);
    expect(result.relatedFunctionality).not.toBeNull();
    expect(isSectionEnabled('10', result)).toBe(true);
    expect(
      result.relatedFunctionality!.items.some((i) => i.label === 'Experience Cloud' && i.used)
    ).toBe(true);
    expect(result.relatedFunctionality!.observations.some((o) => o.includes('Community'))).toBe(
      true
    );
  });

  it('builds section when Billing is detected', () => {
    const findings = [
      makeFinding({
        domain: 'catalog',
        artifactType: 'Product2',
        artifactName: 'Prod1',
        evidenceRefs: [{ type: 'field-ref', value: 'Product2.IsActive', label: 'true' }],
      }),
      makeFinding({
        artifactType: 'BillingDetection',
        artifactName: 'Salesforce Billing Package',
        detected: true,
        notes: 'Salesforce Billing (blng) package installed',
      }),
    ];
    const result = assembleReport(findings);
    expect(result.relatedFunctionality).not.toBeNull();
    expect(
      result.relatedFunctionality!.items.some((i) => i.label === 'Salesforce Billing' && i.used)
    ).toBe(true);
  });

  it('renders section 10 in HTML when related functionality exists', () => {
    const findings = [
      makeFinding({
        domain: 'catalog',
        artifactType: 'Product2',
        artifactName: 'Prod1',
        evidenceRefs: [{ type: 'field-ref', value: 'Product2.IsActive', label: 'true' }],
      }),
      makeFinding({
        artifactType: 'ExperienceCloud',
        artifactName: 'Experience Cloud',
        detected: true,
        countValue: 1,
        notes: '1 site detected',
      }),
    ];
    const result = assembleReport(findings);
    const html = renderReport(result);
    expect(html).toContain('10. Related Functionality Analysis');
    expect(html).toContain('Experience Cloud');
  });

  it('does NOT render section 10 when no functionality detected', () => {
    const findings = [
      makeFinding({
        domain: 'catalog',
        artifactType: 'Product2',
        artifactName: 'Prod1',
        evidenceRefs: [{ type: 'field-ref', value: 'Product2.IsActive', label: 'true' }],
      }),
    ];
    const result = assembleReport(findings);
    const html = renderReport(result);
    expect(html).not.toContain('10. Related Functionality Analysis');
  });

  it('shows all items including Not Used when at least one is Used', () => {
    const findings = [
      makeFinding({
        domain: 'catalog',
        artifactType: 'Product2',
        artifactName: 'Prod1',
        evidenceRefs: [{ type: 'field-ref', value: 'Product2.IsActive', label: 'true' }],
      }),
      makeFinding({
        artifactType: 'TaxCalculator',
        artifactName: 'Tax Calculator',
        detected: true,
        notes: 'Tax calculator detected: Avalara',
      }),
    ];
    const result = assembleReport(findings);
    expect(result.relatedFunctionality).not.toBeNull();
    // Tax Calculator is used, but Experience Cloud/Billing should still appear as Not Used
    expect(
      result.relatedFunctionality!.items.some((i) => i.label === 'Experience Cloud' && !i.used)
    ).toBe(true);
    expect(
      result.relatedFunctionality!.items.some((i) => i.label === 'Tax Calculator' && i.used)
    ).toBe(true);
  });
});
