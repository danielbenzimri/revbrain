import { describe, expect, it } from 'vitest';
import { normalizeFormulaField, type FormulaFieldIR } from './formula-field.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';
import { prepareCatalog } from '../../stages/s2-5-schema-catalog.ts';

function validFF(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'customization',
    collectorName: 'customization',
    artifactType: 'FormulaField',
    artifactName: 'Total_Amount__c',
    findingKey: 'ff-1',
    sourceType: 'metadata',
    detected: true,
    notes: 'Currency',
    textValue: 'Amount__c + Tax__c',
    evidenceRefs: [{ type: 'object-ref', value: 'SBQQ__Quote__c' }],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeFormulaField,
  taskId: 'PH4.16',
  nodeType: 'FormulaField',
  validFinding: validFF,
  malformedFinding: null,
  // Identity = (object, field). field is derived from artifactName,
  // so a rename of artifactName is a true rename in the spec sense
  // and DOES change id. For the baseline rename test, mutate an
  // unrelated field so id/contentHash both stay stable.
  renameMutation: (f) => ({ ...f, notes: f.notes + ' (updated docs)' }),
  contentChangeMutation: (f) => ({ ...f, textValue: 'Amount__c * 1.1' }),
});

describe('PH4.16 — FormulaField v1.2 returnType enum', () => {
  const ctx = { catalog: prepareCatalog(), diagnostics: [] };

  it('does not expose picklist as a valid returnType', () => {
    const result = normalizeFormulaField(validFF({ notes: 'picklist' }), ctx);
    const node = result.nodes[0]! as FormulaFieldIR;
    // 'picklist' falls through to 'unknown' because it was removed from the enum.
    expect(node.returnType).toBe('unknown');
  });

  it('parses nested formula into referencedFields', () => {
    const result = normalizeFormulaField(
      validFF({ textValue: 'IF(Active__c, Amount__c, 0)' }),
      ctx
    );
    const node = result.nodes[0]! as FormulaFieldIR;
    expect(node.formula.referencedFields.length).toBeGreaterThanOrEqual(2);
  });
});
