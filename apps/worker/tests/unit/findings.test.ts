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
    // Fallback when neither artifactName nor recordId/metric/cross-object
    // is supplied — preserved for back-compat with callers that don't
    // pass artifactName.
    expect(key).toBe('test:unknown:unknown');
  });

  // BB-3 invariant I2 (findingKey uniqueness) regression. Pre-2026-04,
  // describe-derived collectors (e.g., integrations.ts external-ID
  // fields) called createFinding without a recordId, metricName, or
  // cross-object key, collapsing every iteration into the literal
  // `<collector>:<artifactType>:unknown` key. The normalizer's
  // group-index stage caught this and hard-failed the entire run.
  // The fallback now incorporates artifactName so iterators over
  // multiple distinct artifacts produce distinct keys.
  it('uses artifactName in the fallback to prevent duplicate-key collisions', () => {
    const k1 = generateFindingKey({
      collector: 'integrations',
      artifactType: 'ExternalIdField',
      artifactName: 'Account.Foo__c',
    });
    const k2 = generateFindingKey({
      collector: 'integrations',
      artifactType: 'ExternalIdField',
      artifactName: 'Account.Bar__c',
    });
    expect(k1).toBe('integrations:ExternalIdField:Account.Foo__c');
    expect(k2).toBe('integrations:ExternalIdField:Account.Bar__c');
    expect(k1).not.toBe(k2);
  });
});
