import { describe, expect, it } from 'vitest';
import { prepareCatalog } from './s2-5-schema-catalog.ts';
import type { SchemaCatalog } from '@revbrain/migration-ir-contract';

const catalog: SchemaCatalog = {
  capturedAt: '2026-04-10T00:00:00Z',
  objects: {
    SBQQ__Quote__c: {
      apiName: 'SBQQ__Quote__c',
      namespace: 'SBQQ',
      isCustom: true,
      label: 'Quote',
      fields: {
        SBQQ__NetAmount__c: {
          apiName: 'SBQQ__NetAmount__c',
          dataType: 'currency',
          isCustom: true,
          isCalculated: false,
          referenceTo: null,
          picklistValues: null,
          isExternalId: false,
        },
      },
      recordTypes: [],
      relationshipNames: [],
    },
  },
  summary: {
    objectCount: 1,
    fieldCount: 1,
    cpqManagedObjectCount: 1,
    hasMultiCurrency: false,
  },
};

describe('PH3.3 — prepareCatalog', () => {
  it('with catalog: lookup finds a known field', () => {
    const ctx = prepareCatalog(catalog);
    const field = ctx.lookup('SBQQ__Quote__c', 'SBQQ__NetAmount__c');
    expect(field?.dataType).toBe('currency');
  });

  it('with catalog: lookup of unknown field returns null', () => {
    const ctx = prepareCatalog(catalog);
    expect(ctx.lookup('SBQQ__Quote__c', 'NotAField')).toBeNull();
  });

  it('with catalog: lookup of unknown object returns null', () => {
    const ctx = prepareCatalog(catalog);
    expect(ctx.lookup('NotAnObject__c', 'Foo')).toBeNull();
  });

  it('without catalog: lookup always returns null and warning is recorded', () => {
    const ctx = prepareCatalog();
    expect(ctx.catalog).toBeNull();
    expect(ctx.lookup('SBQQ__Quote__c', 'SBQQ__NetAmount__c')).toBeNull();
    expect(ctx.warnings.length).toBe(1);
    expect(ctx.warnings[0]).toContain('degraded');
  });

  it('case-insensitive lookup: sbqq__quote__c / sbqq__netamount__c finds the canonical entry', () => {
    const ctx = prepareCatalog(catalog);
    const field = ctx.lookup('sbqq__quote__c', 'sbqq__netamount__c');
    expect(field?.dataType).toBe('currency');
  });

  it('lookupObject returns the full ObjectSchema', () => {
    const ctx = prepareCatalog(catalog);
    const obj = ctx.lookupObject('SBQQ__Quote__c');
    expect(obj?.namespace).toBe('SBQQ');
  });

  it('lookupObject is case-insensitive', () => {
    const ctx = prepareCatalog(catalog);
    expect(ctx.lookupObject('sbqq__quote__c')?.apiName).toBe('SBQQ__Quote__c');
  });
});

describe('PH9.6 — schemaCatalogHash (G3)', () => {
  it('with catalog: hash is a stable 22-char URL-safe base64 string', () => {
    const ctx = prepareCatalog(catalog);
    expect(ctx.hash).not.toBeNull();
    expect(ctx.hash).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('without catalog: hash is null', () => {
    const ctx = prepareCatalog();
    expect(ctx.hash).toBeNull();
  });

  it('determinism: same catalog → same hash across re-runs', () => {
    const a = prepareCatalog(catalog);
    const b = prepareCatalog(catalog);
    expect(a.hash).toBe(b.hash);
  });

  it('sensitivity: different catalogs → different hashes', () => {
    const mutated: SchemaCatalog = {
      ...catalog,
      summary: { ...catalog.summary, objectCount: 99 },
    };
    const a = prepareCatalog(catalog);
    const b = prepareCatalog(mutated);
    expect(a.hash).not.toBe(b.hash);
  });
});
