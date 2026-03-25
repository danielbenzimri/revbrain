import { describe, it, expect } from 'vitest';
import {
  buildSafeQuery,
  splitQuery,
  getAllSbqqFields,
  getCustomFields,
} from '../../src/salesforce/query-builder.ts';
import type { DescribeResult, DescribeField } from '../../src/salesforce/rest.ts';

function makeDescribe(
  fieldNames: string[],
  options?: { formulaFields?: string[]; compoundFields?: Record<string, string> }
): DescribeResult {
  const fields: DescribeField[] = fieldNames.map((name) => ({
    name,
    type: 'string',
    label: name,
    length: 255,
    referenceTo: [],
    calculatedFormula: options?.formulaFields?.includes(name) ? 'SOME_FORMULA' : null,
    custom: name.includes('__'),
    nillable: true,
    picklistValues: [],
    defaultValue: null,
    compoundFieldName: options?.compoundFields?.[name] ?? null,
  }));

  return {
    name: 'TestObject',
    label: 'Test Object',
    queryable: true,
    fields,
    fieldSets: [],
    recordTypeInfos: [],
    childRelationships: [],
  };
}

describe('buildSafeQuery', () => {
  it('should include only fields present in Describe', () => {
    const describe = makeDescribe(['Id', 'Name', 'SBQQ__Type__c']);
    const result = buildSafeQuery(
      'Product2',
      ['Id', 'Name', 'SBQQ__Type__c', 'SBQQ__Missing__c'],
      describe
    );

    expect(result.includedFields).toEqual(['Id', 'Name', 'SBQQ__Type__c']);
    expect(result.skippedFields).toEqual(['SBQQ__Missing__c']);
    expect(result.query).toContain('SELECT Id, Name, SBQQ__Type__c FROM Product2');
  });

  it('should add WHERE and ORDER BY clauses', () => {
    const describe = makeDescribe(['Id', 'Name']);
    const result = buildSafeQuery('Product2', ['Id', 'Name'], describe, {
      whereClause: 'IsActive = true',
      orderBy: 'Name ASC',
    });

    expect(result.query).toContain('WHERE IsActive = true');
    expect(result.query).toContain('ORDER BY Name ASC');
  });

  it('should expand compound fields to component fields', () => {
    const describe = makeDescribe(['Id', 'BillingStreet', 'BillingCity', 'BillingState'], {
      compoundFields: {
        BillingStreet: 'BillingAddress',
        BillingCity: 'BillingAddress',
        BillingState: 'BillingAddress',
      },
    });

    const result = buildSafeQuery('Account', ['Id', 'BillingAddress'], describe);
    // BillingAddress should be expanded to its components
    expect(result.includedFields).toContain('BillingStreet');
    expect(result.includedFields).toContain('BillingCity');
    expect(result.includedFields).toContain('BillingState');
    expect(result.includedFields).not.toContain('BillingAddress');
  });

  it('should reject invalid field names (injection prevention)', () => {
    const describe = makeDescribe(['Id', 'Name; DROP TABLE--']);
    expect(() => buildSafeQuery('Product2', ['Id', 'Name; DROP TABLE--'], describe)).toThrow(
      'Invalid field name'
    );
  });
});

describe('splitQuery', () => {
  it('should separate formula fields from non-formula', () => {
    const describe = makeDescribe(['Id', 'Name', 'FormulaField'], {
      formulaFields: ['FormulaField'],
    });

    const { core, extended } = splitQuery('Product2', ['Id', 'Name', 'FormulaField'], describe);
    expect(core.includedFields).toContain('Name');
    expect(core.includedFields).not.toContain('FormulaField');
    expect(extended?.includedFields).toContain('FormulaField');
    expect(extended?.includedFields).toContain('Id'); // For joining
  });
});

describe('getAllSbqqFields', () => {
  it('should return only SBQQ__ prefixed fields', () => {
    const describe = makeDescribe(['Id', 'Name', 'SBQQ__Type__c', 'SBQQ__Active__c', 'Custom__c']);
    const sbqqFields = getAllSbqqFields(describe);
    expect(sbqqFields).toEqual(['SBQQ__Type__c', 'SBQQ__Active__c']);
  });
});

describe('getCustomFields', () => {
  it('should return custom fields excluding managed packages', () => {
    const describe = makeDescribe([
      'Id',
      'Name',
      'SBQQ__Type__c',
      'sbaa__Rule__c',
      'Custom__c',
      'My_Field__c',
    ]);
    const customFields = getCustomFields(describe);
    const names = customFields.map((f) => f.name);
    expect(names).toEqual(['Custom__c', 'My_Field__c']);
    expect(names).not.toContain('SBQQ__Type__c');
    expect(names).not.toContain('sbaa__Rule__c');
  });
});
