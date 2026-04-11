/**
 * PricingRuleIR normalizer (v1.2 operator-edit stability).
 *
 * Spec: §5.2, §5.3 PricingRuleIR, §7.2, PH4.1 card.
 *
 * Turns a `SBQQ__PriceRule__c` finding into a `PricingRuleIR`.
 * The identity recipe uses `structuralSignature()` (PH1.4) so the
 * node `id` is stable across renames AND condition-operator edits —
 * the v1.2 A13 requirement (Auditor 3 P0 #2).
 *
 * Parses `SBQQ__EvaluationEvent__c` into multi-valued
 * `calculatorEvents[]` + `configuratorEvents[]` and preserves the
 * raw value verbatim for audit.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import {
  structuralSignature,
  type IRNodeBase,
  type NodeRef,
} from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode, extractFieldValue } from '../base.ts';

type CalculatorEvent = 'on-init' | 'before-calc' | 'on-calc' | 'after-calc';
type ConfiguratorEvent = 'save' | 'edit';

export interface PricingRuleIR extends IRNodeBase {
  nodeType: 'PricingRule';
  sourceCategory: 'PriceRule' | 'DiscountSchedule' | 'QCPFunction' | 'ApexPricing' | 'BlockPrice';
  parentObject: string;
  evaluationScope: 'calculator' | 'configurator' | 'unknown';
  calculatorEvents: CalculatorEvent[];
  configuratorEvents: ConfiguratorEvent[];
  rawEvaluationEventValue: string;
  evaluationOrder: number | null;
  contextScope: 'quote' | 'line' | 'bundle' | 'option' | 'group' | 'unknown';
  conditionLogic: 'all' | 'any' | 'custom';
  advancedConditionRaw: string | null;
  isActive: boolean;
  recordTypeFilter: string | null;
  conditions: NodeRef[];
  actions: NodeRef[];
  dependencies: NodeRef[];
  summaryVariablesConsumed: NodeRef[];
}

/** Parse CPQ's `SBQQ__EvaluationEvent__c` free-text into the v1.1 multi-valued enum. */
function parseEvaluationEvent(raw: string | null): {
  calculatorEvents: CalculatorEvent[];
  configuratorEvents: ConfiguratorEvent[];
  scope: 'calculator' | 'configurator' | 'unknown';
} {
  if (!raw || raw.length === 0) {
    return { calculatorEvents: [], configuratorEvents: [], scope: 'unknown' };
  }
  const tokens = raw
    .toLowerCase()
    .split(/[;,]/)
    .map((t) => t.trim())
    .filter(Boolean);
  const calculatorEvents: CalculatorEvent[] = [];
  const configuratorEvents: ConfiguratorEvent[] = [];
  for (const t of tokens) {
    if (t.includes('on init') || t.includes('on-init')) calculatorEvents.push('on-init');
    else if (t.includes('before calculate') || t.includes('before-calc'))
      calculatorEvents.push('before-calc');
    else if (t.includes('on calculate') || t.includes('on-calc')) calculatorEvents.push('on-calc');
    else if (t.includes('after calculate') || t.includes('after-calc'))
      calculatorEvents.push('after-calc');
    else if (t.includes('save')) configuratorEvents.push('save');
    else if (t.includes('edit')) configuratorEvents.push('edit');
  }
  const scope: 'calculator' | 'configurator' | 'unknown' =
    calculatorEvents.length > 0
      ? 'calculator'
      : configuratorEvents.length > 0
        ? 'configurator'
        : 'unknown';
  return { calculatorEvents, configuratorEvents, scope };
}

function parseContextScope(raw: string | null): PricingRuleIR['contextScope'] {
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase();
  if (lower.includes('quote')) return 'quote';
  if (lower.includes('line')) return 'line';
  if (lower.includes('bundle')) return 'bundle';
  if (lower.includes('option')) return 'option';
  if (lower.includes('group')) return 'group';
  return 'unknown';
}

function parseConditionLogic(raw: string | null): {
  logic: 'all' | 'any' | 'custom';
  advancedRaw: string | null;
} {
  if (!raw || raw.length === 0) return { logic: 'all', advancedRaw: null };
  const lower = raw.toLowerCase().trim();
  if (lower === 'all') return { logic: 'all', advancedRaw: null };
  if (lower === 'any') return { logic: 'any', advancedRaw: null };
  // Anything else is a custom advanced condition — preserve verbatim.
  return { logic: 'custom', advancedRaw: raw };
}

/**
 * The full `PricingRuleIR` normalizer.
 */
export const normalizePricingRule: NormalizerFn = (finding: AssessmentFindingInput) => {
  // PH9 §8.3 — read the actual evaluation event value via the
  // canonical helper. Both shapes are tolerated.
  const rawEvaluationEventValue =
    extractFieldValue(finding, 'SBQQ__EvaluationEvent__c') ||
    extractFieldValue(finding, 'EvaluationEvent') ||
    finding.textValue ||
    '';
  const { calculatorEvents, configuratorEvents, scope } =
    parseEvaluationEvent(rawEvaluationEventValue);
  const { logic: conditionLogic, advancedRaw: advancedConditionRaw } = parseConditionLogic(
    finding.notes ?? null
  );
  const contextScope = parseContextScope(finding.sourceRef ?? null);
  const parentObject = finding.sourceRef?.split('=')[0] ?? 'SBQQ__Quote__c';
  const isActive = finding.detected;
  const evaluationOrder = finding.countValue ?? null;

  // Identity recipe: structuralSignature over the shape-defining
  // fields. Operators are NOT in the signature per v1.2 A13.
  const signatureInput = {
    parentObject,
    evaluationScope: scope,
    evaluationOrder,
    conditionLogic,
    contextScope,
    conditions: [] as Array<{ field: string }>,
    actions: [] as Array<{ actionType: string; targetField: string }>,
  };
  // PH9 §8.3 — buildBaseNode adds the per-record discriminator
  // automatically. The signature stays focused on structural shape.
  const stableIdentity = {
    signature: structuralSignature(signatureInput),
  };
  const semanticPayload = {
    ...stableIdentity,
    calculatorEvents,
    configuratorEvents,
    advancedConditionRaw,
    isActive,
    rawEvaluationEventValue,
  };

  const base = buildBaseNode({
    finding,
    nodeType: 'PricingRule',
    stableIdentity,
    semanticPayload,
    evidenceExtras: {
      classificationReasons: [
        {
          decision: 'evaluationScope',
          chosenValue: scope,
          reason: `parsed SBQQ__EvaluationEvent__c = "${rawEvaluationEventValue}"`,
          confidence: rawEvaluationEventValue.length > 0 ? 'high' : 'low',
        },
      ],
    },
  });

  const node: PricingRuleIR = {
    ...base,
    nodeType: 'PricingRule',
    sourceCategory: 'PriceRule',
    parentObject,
    evaluationScope: scope,
    calculatorEvents,
    configuratorEvents,
    rawEvaluationEventValue,
    evaluationOrder,
    contextScope,
    conditionLogic,
    advancedConditionRaw,
    isActive,
    recordTypeFilter: null,
    conditions: [],
    actions: [],
    dependencies: [],
    summaryVariablesConsumed: [],
  };

  return { nodes: [node] };
};
