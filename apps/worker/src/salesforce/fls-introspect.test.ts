/**
 * Unit tests for the FLS introspection helper (EXT-CC1).
 */

import { describe, expect, it, vi } from 'vitest';
import { introspectFls, REQUIRED_FLS, type FieldPermissionsRow } from './fls-introspect.ts';

function granted(...fields: string[]): FieldPermissionsRow[] {
  return fields.map((Field) => ({ Field, PermissionsRead: true }));
}

function denied(...fields: string[]): FieldPermissionsRow[] {
  return fields.map((Field) => ({ Field, PermissionsRead: false }));
}

describe('introspectFls', () => {
  it('returns no gaps when every required field has read permission', async () => {
    const queryFn = vi.fn(async () => {
      const rows: FieldPermissionsRow[] = [];
      for (const [object, fields] of Object.entries(REQUIRED_FLS)) {
        for (const field of fields) {
          rows.push({ Field: `${object}.${field}`, PermissionsRead: true });
        }
      }
      return rows;
    });
    const result = await introspectFls(queryFn);
    expect(result.gaps).toEqual([]);
    expect(result.hasHardFailures).toBe(false);
    expect(result.requiredCount).toBeGreaterThan(0);
  });

  it('flags a hard failure when an identifier (Id) is denied', async () => {
    const queryFn = vi.fn(async () => denied('Product2.Id', 'Product2.Name'));
    const result = await introspectFls(queryFn, {
      Product2: ['Id', 'Name', 'ProductCode'],
    });
    expect(result.hasHardFailures).toBe(true);
    const idGap = result.gaps.find((g) => g.field === 'Id');
    expect(idGap).toBeDefined();
    expect(idGap!.severity).toBe('hard');
  });

  it('warns (does NOT hard-fail) when a non-identifier field is denied', async () => {
    const queryFn = vi.fn(async () => denied('Product2.SBQQ__BillingFrequency__c'));
    const result = await introspectFls(queryFn, {
      Product2: ['SBQQ__BillingFrequency__c'],
    });
    expect(result.hasHardFailures).toBe(false);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]!.severity).toBe('warn');
  });

  it('treats absence-from-FieldPermissions as unrestricted (no gap)', async () => {
    // Empty result set: nothing is in FieldPermissions, meaning
    // these fields are unrestrictable. The user is presumed to
    // have read.
    const queryFn = vi.fn(async () => [] as FieldPermissionsRow[]);
    const result = await introspectFls(queryFn, {
      Product2: ['Id', 'Name', 'IsActive'],
    });
    expect(result.gaps).toEqual([]);
    expect(result.hasHardFailures).toBe(false);
  });

  it('mixed: some granted, some denied → only the denied surfaces', async () => {
    const queryFn = vi.fn(async () => [
      ...granted('Product2.Id', 'Product2.Name', 'Product2.ProductCode'),
      ...denied('Product2.IsActive', 'Product2.Family'),
    ]);
    const result = await introspectFls(queryFn, {
      Product2: ['Id', 'Name', 'ProductCode', 'IsActive', 'Family'],
    });
    expect(result.gaps).toHaveLength(2);
    expect(result.gaps.map((g) => g.field).sort()).toEqual(['Family', 'IsActive']);
    expect(result.hasHardFailures).toBe(false);
  });

  it('sorts gaps deterministically by (object, field)', async () => {
    const queryFn = vi.fn(async () => [
      ...denied('Product2.IsActive'),
      ...denied('SBQQ__Quote__c.SBQQ__NetAmount__c'),
      ...denied('Product2.Family'),
    ]);
    const result = await introspectFls(queryFn, {
      Product2: ['IsActive', 'Family'],
      SBQQ__Quote__c: ['SBQQ__NetAmount__c'],
    });
    // Expected order: Product2.Family, Product2.IsActive,
    // SBQQ__Quote__c.SBQQ__NetAmount__c
    expect(result.gaps.map((g) => `${g.object}.${g.field}`)).toEqual([
      'Product2.Family',
      'Product2.IsActive',
      'SBQQ__Quote__c.SBQQ__NetAmount__c',
    ]);
  });

  it('uses the static REQUIRED_FLS map when no override is provided', async () => {
    const queryFn = vi.fn(async () => denied('Product2.SBQQ__BillingFrequency__c'));
    const result = await introspectFls(queryFn);
    expect(result.gaps.some((g) => g.field === 'SBQQ__BillingFrequency__c')).toBe(true);
  });

  it('passes the sorted object list to the query function', async () => {
    const queryFn = vi.fn(
      async (_objects: readonly string[]): Promise<FieldPermissionsRow[]> => []
    );
    await introspectFls(queryFn, {
      Product2: ['Id'],
      SBQQ__Quote__c: ['Id'],
      SBQQ__PriceRule__c: ['Id'],
    });
    const arg = queryFn.mock.calls[0]![0];
    // Sorted alphabetically.
    expect(arg).toEqual(['Product2', 'SBQQ__PriceRule__c', 'SBQQ__Quote__c']);
  });
});
