/**
 * ValidationRuleIR normalizer.
 *
 * Spec: §5.3 ValidationRuleIR, §7.4.
 * Identity: object + developerName.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { IRNodeBase } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode, findEvidenceRef } from '../base.ts';
import { parseFormula } from '../../parsers/formula.ts';
import type { FormulaIR } from './formula-field.ts';

export interface ValidationRuleIR extends IRNodeBase {
  nodeType: 'ValidationRule';
  object: string;
  errorConditionFormula: FormulaIR;
  errorMessage: string;
  errorDisplayField: string | null;
  isActive: boolean;
}

export const normalizeValidationRule: NormalizerFn = (finding, context) => {
  const object = findEvidenceRef(finding, 'object-ref') ?? '<unknown-object>';
  const developerName = finding.artifactName;
  const rawFormula = finding.textValue ?? '';
  const parsed = parseFormula(rawFormula, {
    rootObject: object,
    ...(context.catalog.catalog !== null && { catalog: context.catalog.catalog }),
  });

  const errorConditionFormula: FormulaIR = {
    raw: rawFormula,
    referencedFields: parsed.referencedFields,
    referencedObjects: parsed.referencedObjects,
    hasCrossObjectRef: parsed.hasCrossObjectRef,
    hasGlobalVariableRef: parsed.hasGlobalVariableRef,
    complexity: parsed.complexity,
    parseStatus: parsed.parseStatus,
  };

  const stableIdentity = { object, developerName };
  const semanticPayload = {
    ...stableIdentity,
    formulaRaw: rawFormula,
    errorMessage: finding.notes ?? '',
  };

  const base = buildBaseNode({
    finding,
    nodeType: 'ValidationRule',
    stableIdentity,
    semanticPayload,
    developerName,
  });

  const node: ValidationRuleIR = {
    ...base,
    nodeType: 'ValidationRule',
    object,
    errorConditionFormula,
    errorMessage: finding.notes ?? '',
    errorDisplayField: null,
    isActive: finding.detected,
  };
  return { nodes: [node] };
};
