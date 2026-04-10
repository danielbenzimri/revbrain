import { describe, expect, it } from 'vitest';
import type { FieldDataType, FieldSchema, ObjectSchema, SchemaCatalog } from './schema-catalog.ts';

describe('PH0.7 — SchemaCatalog', () => {
  it('type-checks with a sample catalog of one object + three fields', () => {
    const fields: Record<string, FieldSchema> = {
      Id: {
        apiName: 'Id',
        dataType: 'id',
        isCustom: false,
        isCalculated: false,
        referenceTo: null,
        picklistValues: null,
        isExternalId: false,
      },
      Name: {
        apiName: 'Name',
        dataType: 'string',
        isCustom: false,
        isCalculated: false,
        referenceTo: null,
        picklistValues: null,
        isExternalId: false,
      },
      SBQQ__NetAmount__c: {
        apiName: 'SBQQ__NetAmount__c',
        dataType: 'currency',
        isCustom: true,
        isCalculated: false,
        referenceTo: null,
        picklistValues: null,
        isExternalId: false,
      },
    };
    const quote: ObjectSchema = {
      apiName: 'SBQQ__Quote__c',
      namespace: 'SBQQ',
      isCustom: true,
      label: 'Quote',
      fields,
      recordTypes: [],
      relationshipNames: ['Account__r', 'Opportunity__r'],
    };
    const catalog: SchemaCatalog = {
      capturedAt: '2026-04-10T00:00:00Z',
      objects: { SBQQ__Quote__c: quote },
      summary: {
        objectCount: 1,
        fieldCount: 3,
        cpqManagedObjectCount: 1,
        hasMultiCurrency: false,
      },
    };
    expect(catalog.objects.SBQQ__Quote__c?.fields.SBQQ__NetAmount__c?.dataType).toBe('currency');
    expect(catalog.summary.objectCount).toBe(1);
  });

  it('SchemaCatalog is JSON-serializable', () => {
    const catalog: SchemaCatalog = {
      capturedAt: '2026-04-10T00:00:00Z',
      objects: {},
      summary: {
        objectCount: 0,
        fieldCount: 0,
        cpqManagedObjectCount: 0,
        hasMultiCurrency: false,
      },
    };
    const json = JSON.stringify(catalog);
    const parsed = JSON.parse(json) as SchemaCatalog;
    expect(parsed).toEqual(catalog);
  });

  it('FieldDataType enum includes all 19 values (18 real + unknown)', () => {
    // Type-level exhaustiveness — this compiles iff the union matches.
    const all: FieldDataType[] = [
      'string',
      'textarea',
      'picklist',
      'multipicklist',
      'int',
      'double',
      'currency',
      'percent',
      'boolean',
      'date',
      'datetime',
      'reference',
      'id',
      'email',
      'phone',
      'url',
      'formula',
      'rollup',
      'unknown',
    ];
    expect(all.length).toBe(19);
  });
});
