/**
 * FormulaFieldIR normalizer (v1.2 returnType enum fix).
 *
 * Spec: §5.3 FormulaFieldIR, §7.4.
 *
 * v1.2 (Auditor 3 P2 #8): 'picklist' REMOVED from returnType —
 * Salesforce formulas cannot return a picklist type.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { FieldRefIR, IRNodeBase, NodeRef } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode, findEvidenceRef } from '../base.ts';
import { parseFormula } from '../../parsers/formula.ts';

export interface FormulaIR {
  raw: string;
  referencedFields: FieldRefIR[];
  referencedObjects: string[];
  hasCrossObjectRef: boolean;
  hasGlobalVariableRef: boolean;
  complexity: 'simple' | 'moderate' | 'complex';
  parseStatus: 'parsed' | 'partial' | 'unparseable';
}

export interface FormulaFieldIR extends IRNodeBase {
  nodeType: 'FormulaField';
  object: string;
  field: string;
  returnType:
    | 'text'
    | 'number'
    | 'currency'
    | 'percent'
    | 'boolean'
    | 'date'
    | 'datetime'
    | 'time'
    | 'unknown';
  formula: FormulaIR;
  usedBy: NodeRef[];
}

function parseReturnType(raw: string | null): FormulaFieldIR['returnType'] {
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase();
  if (lower.includes('text')) return 'text';
  if (lower.includes('currency')) return 'currency';
  if (lower.includes('percent')) return 'percent';
  if (lower.includes('number') || lower.includes('double') || lower.includes('int'))
    return 'number';
  if (lower.includes('checkbox') || lower.includes('boolean')) return 'boolean';
  if (lower.includes('datetime')) return 'datetime';
  if (lower.includes('date')) return 'date';
  if (lower.includes('time')) return 'time';
  return 'unknown';
}

export const normalizeFormulaField: NormalizerFn = (finding, context) => {
  const object = findEvidenceRef(finding, 'object-ref') ?? '<unknown-object>';
  const field = finding.artifactName;
  const returnType = parseReturnType(finding.notes ?? null);
  const rawFormula = finding.textValue ?? '';
  const parsed = parseFormula(rawFormula, {
    rootObject: object,
    ...(context.catalog.catalog !== null && { catalog: context.catalog.catalog }),
  });

  const formula: FormulaIR = {
    raw: rawFormula,
    referencedFields: parsed.referencedFields,
    referencedObjects: parsed.referencedObjects,
    hasCrossObjectRef: parsed.hasCrossObjectRef,
    hasGlobalVariableRef: parsed.hasGlobalVariableRef,
    complexity: parsed.complexity,
    parseStatus: parsed.parseStatus,
  };

  const stableIdentity = { object, field };
  const semanticPayload = { ...stableIdentity, returnType, formulaRaw: rawFormula };

  const base = buildBaseNode({
    finding,
    nodeType: 'FormulaField',
    stableIdentity,
    semanticPayload,
    developerName: field,
  });

  const node: FormulaFieldIR = {
    ...base,
    nodeType: 'FormulaField',
    object,
    field,
    returnType,
    formula,
    usedBy: [],
  };
  return { nodes: [node] };
};
