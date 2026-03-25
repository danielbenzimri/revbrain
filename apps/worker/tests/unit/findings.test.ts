import { describe, it, expect } from 'vitest';
import { createFinding } from '../../src/normalize/findings.ts';
import { generateFindingKey } from '@revbrain/contract';

describe('Finding factory', () => {
  it('should create a record-based finding with correct key', () => {
    const finding = createFinding({
      domain: 'pricing',
      collector: 'pricing',
      artifactType: 'SBQQ__PriceRule__c',
      artifactName: 'Volume Discount Rule',
      artifactId: 'a1B000000123456',
      findingType: 'has_apex_dep',
      sourceType: 'object',
      riskLevel: 'high',
      rcaTargetConcept: 'PricingProcedure',
    });

    expect(finding.findingKey).toBe('pricing:SBQQ__PriceRule__c:a1B000000123456:has_apex_dep');
    expect(finding.domain).toBe('pricing');
    expect(finding.riskLevel).toBe('high');
    expect(finding.rcaTargetConcept).toBe('PricingProcedure');
    expect(finding.detected).toBe(true);
    expect(finding.evidenceRefs).toEqual([]);
    expect(finding.schemaVersion).toBe('1.0');
  });

  it('should create an aggregate finding with correct key', () => {
    const finding = createFinding({
      domain: 'catalog',
      collector: 'catalog',
      artifactType: 'metric',
      artifactName: 'Nested Bundle Depth',
      metricName: 'nested_bundle_depth',
      scope: 'global',
      sourceType: 'inferred',
      countValue: 3,
    });

    expect(finding.findingKey).toBe('catalog:nested_bundle_depth:global');
    expect(finding.countValue).toBe(3);
  });

  it('should include LLM-readiness fields', () => {
    const finding = createFinding({
      domain: 'pricing',
      collector: 'pricing',
      artifactType: 'SBQQ__CustomScript__c',
      artifactName: 'QCP Main',
      artifactId: 'qcp-1',
      findingType: 'source',
      sourceType: 'object',
      textValue: 'export function onBeforePriceRules(quoteModel) { ... }',
      evidenceRefs: [
        {
          type: 'field-ref',
          value: 'SBQQ__NetPrice__c',
          referencedObjects: ['SBQQ__QuoteLine__c'],
          referencedFields: ['SBQQ__NetPrice__c'],
        },
      ],
    });

    expect(finding.textValue).toContain('onBeforePriceRules');
    expect(finding.evidenceRefs).toHaveLength(1);
    expect(finding.evidenceRefs[0].referencedFields).toContain('SBQQ__NetPrice__c');
  });
});

describe('generateFindingKey', () => {
  it('should generate record-based key', () => {
    const key = generateFindingKey({
      collector: 'pricing',
      artifactType: 'SBQQ__PriceRule__c',
      recordId: 'a1B123',
      findingType: 'active',
    });
    expect(key).toBe('pricing:SBQQ__PriceRule__c:a1B123:active');
  });

  it('should generate aggregate key', () => {
    const key = generateFindingKey({
      collector: 'catalog',
      artifactType: 'metric',
      metricName: 'total_products',
      scope: 'global',
    });
    expect(key).toBe('catalog:total_products:global');
  });

  it('should generate cross-object key', () => {
    const key = generateFindingKey({
      collector: 'catalog',
      artifactType: 'twin_field',
      sourceType: 'Product2',
      targetType: 'QuoteLine',
      key: 'Custom_Field__c',
    });
    expect(key).toBe('catalog:Product2:QuoteLine:Custom_Field__c');
  });

  it('should handle missing optional fields with defaults', () => {
    const key = generateFindingKey({
      collector: 'test',
      artifactType: 'unknown',
    });
    expect(key).toBe('test:unknown:unknown');
  });
});
