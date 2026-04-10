import { describe, expect, it } from 'vitest';
import { normalizeFieldRef } from './field-ref-normalize.ts';
import type { SchemaCatalog } from '@revbrain/migration-ir-contract';

const quoteCatalog: SchemaCatalog = {
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
      relationshipNames: ['Account__r'],
    },
  },
  summary: {
    objectCount: 1,
    fieldCount: 1,
    cpqManagedObjectCount: 1,
    hasMultiCurrency: false,
  },
};

describe('PH2.2 — normalizeFieldRef', () => {
  describe('namespace canonicalization', () => {
    it('lower-case sbqq__ gets canonicalized to SBQQ__', () => {
      const r = normalizeFieldRef('sbqq__quote__c.sbqq__netamount__c');
      expect(r.kind).toBe('field');
      if (r.kind === 'field') {
        expect(r.object).toBe('SBQQ__quote__c');
        expect(r.field).toBe('SBQQ__netamount__c');
      }
    });

    it('preserves sbaa__ as-is (already canonical lowercase)', () => {
      const r = normalizeFieldRef('sbaa__ApprovalRule__c.Name');
      expect(r.kind).toBe('field');
      if (r.kind === 'field') {
        expect(r.object).toBe('sbaa__ApprovalRule__c');
      }
    });

    it('canonicalizes namespace casing insensitively (SBQQ__ stays SBQQ__)', () => {
      const r = normalizeFieldRef('SBQQ__Quote__c.SBQQ__NetAmount__c');
      expect(r.kind).toBe('field');
      if (r.kind === 'field') {
        expect(r.object).toBe('SBQQ__Quote__c');
        expect(r.field).toBe('SBQQ__NetAmount__c');
      }
    });
  });

  describe('direct refs', () => {
    it('two-segment object.field is a direct ref', () => {
      const r = normalizeFieldRef('Account.Name');
      expect(r.kind).toBe('field');
      if (r.kind === 'field') {
        expect(r.object).toBe('Account');
        expect(r.field).toBe('Name');
        expect(r.isCustom).toBe(false);
        expect(r.isCpqManaged).toBe(false);
      }
    });

    it('bare field name with no context becomes direct with <unknown> object', () => {
      const r = normalizeFieldRef('NetAmount__c');
      expect(r.kind).toBe('field');
      if (r.kind === 'field') {
        expect(r.object).toBe('<unknown>');
        expect(r.field).toBe('NetAmount__c');
        expect(r.isCustom).toBe(true);
        expect(r.isResolved).toBe(false);
      }
    });

    it('bare field name with contextObject uses that as object', () => {
      const r = normalizeFieldRef('NetAmount__c', { contextObject: 'SBQQ__Quote__c' });
      expect(r.kind).toBe('field');
      if (r.kind === 'field') {
        expect(r.object).toBe('SBQQ__Quote__c');
      }
    });

    it('flags isCustom on __c suffix', () => {
      const r = normalizeFieldRef('Foo__c', { contextObject: 'Acct' });
      if (r.kind === 'field') {
        expect(r.isCustom).toBe(true);
      }
    });

    it('flags isCpqManaged on SBQQ__ prefix', () => {
      const r = normalizeFieldRef('SBQQ__ActivePriceBook__c', {
        contextObject: 'SBQQ__Quote__c',
      });
      if (r.kind === 'field') {
        expect(r.isCpqManaged).toBe(true);
      }
    });
  });

  describe('path refs', () => {
    it('Account__r.Owner.Name with contextObject produces a path ref', () => {
      const r = normalizeFieldRef('Account__r.Owner.Name', {
        contextObject: 'SBQQ__Quote__c',
      });
      expect(r.kind).toBe('path');
      if (r.kind === 'path') {
        expect(r.rootObject).toBe('SBQQ__Quote__c');
        expect(r.path).toEqual(['Account__r', 'Owner']);
        expect(r.terminalField).toBe('Name');
      }
    });

    it('explicit object prefix on path: SBQQ__Quote__c.Account__r.Owner.Name', () => {
      const r = normalizeFieldRef('SBQQ__Quote__c.Account__r.Owner.Name');
      expect(r.kind).toBe('path');
      if (r.kind === 'path') {
        expect(r.rootObject).toBe('SBQQ__Quote__c');
        expect(r.path).toEqual(['Account__r', 'Owner']);
        expect(r.terminalField).toBe('Name');
      }
    });

    it('path without contextObject sets rootObject to <unknown> and marks unresolved', () => {
      const r = normalizeFieldRef('Account__r.Owner.Name');
      expect(r.kind).toBe('path');
      if (r.kind === 'path') {
        expect(r.rootObject).toBe('<unknown>');
        expect(r.isResolved).toBe(false);
        expect(r.unresolvedReason).toBe('object-not-in-catalog');
      }
    });
  });

  describe('catalog resolution', () => {
    it('known object + known field → isResolved: true', () => {
      const r = normalizeFieldRef('SBQQ__Quote__c.SBQQ__NetAmount__c', {
        catalog: quoteCatalog,
      });
      expect(r.isResolved).toBe(true);
      expect(r.unresolvedReason).toBeUndefined();
    });

    it('known object + unknown field → isResolved: false, field-not-in-catalog', () => {
      const r = normalizeFieldRef('SBQQ__Quote__c.MadeUpField__c', {
        catalog: quoteCatalog,
      });
      expect(r.isResolved).toBe(false);
      expect(r.unresolvedReason).toBe('field-not-in-catalog');
    });

    it('unknown object → isResolved: false, object-not-in-catalog', () => {
      const r = normalizeFieldRef('NotReal__c.Name', { catalog: quoteCatalog });
      expect(r.isResolved).toBe(false);
      expect(r.unresolvedReason).toBe('object-not-in-catalog');
    });

    it('no catalog supplied → isResolved: false, no-catalog', () => {
      const r = normalizeFieldRef('SBQQ__Quote__c.SBQQ__NetAmount__c');
      expect(r.isResolved).toBe(false);
      expect(r.unresolvedReason).toBe('no-catalog');
    });
  });

  describe('dynamic refs', () => {
    it('empty string is treated as dynamic', () => {
      const r = normalizeFieldRef('');
      expect(r.isResolved).toBe(false);
      expect(r.unresolvedReason).toBe('dynamic');
    });

    it('<dynamic> sentinel is treated as dynamic', () => {
      const r = normalizeFieldRef('<dynamic>', { contextObject: 'Foo' });
      expect(r.isResolved).toBe(false);
      expect(r.unresolvedReason).toBe('dynamic');
    });
  });

  describe('source location passthrough', () => {
    it('preserves sourceLocation when provided', () => {
      const r = normalizeFieldRef('Foo.Bar', { sourceLocation: 'file.cls:42' });
      expect(r.sourceLocation).toBe('file.cls:42');
    });
  });
});
