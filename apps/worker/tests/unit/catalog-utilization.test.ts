/**
 * Unit tests: Catalog field utilization + feature orphans (T-C02, T-C03)
 *
 * Tests the isPopulated() type-aware logic and field utilization
 * computation using the exported assembler helpers.
 */
import { describe, it, expect } from 'vitest';
import { isPopulated } from '../../src/report/assembler.ts';

describe('T-C02: isPopulated — type-aware field population check', () => {
  // Already tested in checkbox.test.ts but repeated here for collector context

  it('empty string → not populated', () => {
    expect(isPopulated('')).toBe(false);
  });

  it('whitespace → not populated', () => {
    expect(isPopulated('   ')).toBe(false);
  });

  it('picklist --None-- → not populated', () => {
    expect(isPopulated('--None--')).toBe(false);
  });

  it('boolean false → populated (real value)', () => {
    expect(isPopulated(false)).toBe(true);
  });

  it('numeric 0 → populated (real value)', () => {
    expect(isPopulated(0)).toBe(true);
  });

  it('null → not populated', () => {
    expect(isPopulated(null)).toBe(false);
  });

  it('undefined → not populated', () => {
    expect(isPopulated(undefined)).toBe(false);
  });

  it('non-empty string → populated', () => {
    expect(isPopulated('List')).toBe(true);
    expect(isPopulated('Cost')).toBe(true);
    expect(isPopulated('Renewable')).toBe(true);
  });
});

describe('T-C02: Field utilization computation logic', () => {
  it('computes correct population count from mock rows', () => {
    const rows = [
      { Family: 'Hardware', SBQQ__PricingMethod__c: 'List', SBQQ__BillingRule__c: null },
      { Family: 'Software', SBQQ__PricingMethod__c: null, SBQQ__BillingRule__c: null },
      { Family: null, SBQQ__PricingMethod__c: 'Cost', SBQQ__BillingRule__c: '' },
    ];

    const familyCount = rows.filter((r) => isPopulated(r.Family)).length;
    const pricingCount = rows.filter((r) => isPopulated(r.SBQQ__PricingMethod__c)).length;
    const billingCount = rows.filter((r) => isPopulated(r.SBQQ__BillingRule__c)).length;

    expect(familyCount).toBe(2); // Hardware, Software (not null)
    expect(pricingCount).toBe(2); // List, Cost (not null)
    expect(billingCount).toBe(0); // null, null, empty string
  });

  it('handles all-populated field', () => {
    const rows = [{ Family: 'A' }, { Family: 'B' }, { Family: 'C' }];
    const count = rows.filter((r) => isPopulated(r.Family)).length;
    expect(count).toBe(3);
    expect(count / rows.length).toBe(1); // 100%
  });

  it('handles all-empty field', () => {
    const rows = [
      { SBQQ__BillingRule__c: null },
      { SBQQ__BillingRule__c: undefined },
      { SBQQ__BillingRule__c: '' },
    ];
    const count = rows.filter((r) => isPopulated(r.SBQQ__BillingRule__c)).length;
    expect(count).toBe(0);
  });

  it('handles boolean fields correctly (false = populated)', () => {
    const rows = [
      { SBQQ__NonDiscountable__c: true },
      { SBQQ__NonDiscountable__c: false },
      { SBQQ__NonDiscountable__c: null },
    ];
    const count = rows.filter((r) => isPopulated(r.SBQQ__NonDiscountable__c)).length;
    expect(count).toBe(2); // true AND false are populated
  });
});

describe('T-C03: Feature orphan detection logic', () => {
  it('correctly identifies orphan features', () => {
    const allFeatureIds = ['001', '002', '003', '004', '005'];
    const referencedFeatureIds = new Set(['001', '002', '003']);
    const orphans = allFeatureIds.filter((id) => !referencedFeatureIds.has(id));

    expect(orphans).toHaveLength(2);
    expect(orphans).toContain('004');
    expect(orphans).toContain('005');
  });

  it('returns 0 orphans when all features are referenced', () => {
    const allFeatureIds = ['001', '002'];
    const referencedFeatureIds = new Set(['001', '002']);
    const orphans = allFeatureIds.filter((id) => !referencedFeatureIds.has(id));
    expect(orphans).toHaveLength(0);
  });

  it('returns all as orphans when no features are referenced', () => {
    const allFeatureIds = ['001', '002', '003'];
    const referencedFeatureIds = new Set<string>();
    const orphans = allFeatureIds.filter((id) => !referencedFeatureIds.has(id));
    expect(orphans).toHaveLength(3);
  });

  it('handles Salesforce 15-char vs 18-char ID normalization', () => {
    const normalizeId = (id: string) => id?.substring(0, 15) ?? '';
    const allFeatureIds = ['a0B7S000001abcDEFG']; // 18-char
    const referencedFeatureIds = new Set(['a0B7S000001abcD']); // 15-char
    const orphans = allFeatureIds.filter((id) => !referencedFeatureIds.has(normalizeId(id)));
    expect(orphans).toHaveLength(0); // matched via normalization
  });
});
