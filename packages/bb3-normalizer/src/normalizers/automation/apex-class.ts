/**
 * ApexClassAutomationIR normalizer (v1.2 discriminated union variant).
 *
 * Spec: §5.3 ApexClassAutomationIR, §7.3, §8.4.
 *
 * Emits a discriminated-union variant with `sourceType: 'ApexClass'`.
 * Apex-specific metrics (`lineCount`, `calloutCount`,
 * `hasTriggerControl`, `hasDynamicFieldRef`, `isTestClass`,
 * `parseErrors`) live ONLY on this variant — per v1.2 Auditor 3 P2
 * #10 they MUST NOT leak onto Flow, WorkflowRule, or OutboundMessage.
 *
 * Identity: ('ApexClass', developerName). Apex classes have a
 * reliable DeveloperName — no structural signature needed.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { ApexClassAutomationIR, FieldRefIR, NodeRef } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode } from '../base.ts';
import { createGlobalBudgetState, parseApexClass } from '../../parsers/apex.ts';

/**
 * Synchronous wrapper around the async `parseApexClass`. For PH5.1
 * the registry expects a sync normalizer, so we synthesize a
 * "parsing-deferred" placeholder for the first pass. The real
 * per-run orchestration happens in Stage 5 (PH3.6) which is
 * async-aware; this normalizer returns a node with empty parse
 * metrics that Stage 5 fills in.
 *
 * This split lets the normalizer dispatcher (PH3.4) stay sync while
 * the expensive Apex AST walk lives in Stage 5.
 */
export const normalizeApexClass: NormalizerFn = (finding: AssessmentFindingInput) => {
  const developerName = finding.artifactName;
  const rawSource = finding.textValue ?? '';
  const lineCount = rawSource.split('\n').length;

  const stableIdentity = { sourceType: 'ApexClass' as const, developerName };
  const semanticPayload = {
    ...stableIdentity,
    rawSourceLength: rawSource.length,
    isTestClass: /@isTest\b/i.test(rawSource),
    hasTriggerControl: /\bSBQQ\.TriggerControl\b/.test(rawSource),
  };

  const base = buildBaseNode({
    finding,
    nodeType: 'Automation',
    stableIdentity,
    semanticPayload,
    developerName,
  });

  const node: ApexClassAutomationIR = {
    ...base,
    nodeType: 'Automation',
    sourceType: 'ApexClass',
    sbqqFieldRefs: [] as FieldRefIR[],
    writtenFields: [] as FieldRefIR[],
    relatedRules: [] as NodeRef[],
    lineCount,
    calloutCount: 0,
    hasTriggerControl: semanticPayload.hasTriggerControl,
    hasDynamicFieldRef: false,
    isTestClass: semanticPayload.isTestClass,
    parseStatus: 'partial', // Stage 5 upgrades this after AST walk
    parseErrors: [],
  };
  return { nodes: [node] };
};

/**
 * Async variant used by Stage 5 (PH3.6) to enrich the placeholder
 * with full AST-walk results. Normalizer dispatcher stays sync;
 * Stage 5 opts into this when driving code parsing.
 */
export async function enrichApexClass(
  draft: ApexClassAutomationIR,
  source: string,
  globalState = createGlobalBudgetState()
): Promise<ApexClassAutomationIR> {
  const result = await parseApexClass(source, { globalState });
  return {
    ...draft,
    lineCount: result.lineCount,
    calloutCount: result.calloutCount,
    hasTriggerControl: result.hasTriggerControl,
    hasDynamicFieldRef: result.hasDynamicFieldRef,
    isTestClass: result.isTestClass,
    parseStatus: result.parseStatus,
    parseErrors: result.parseErrors,
    sbqqFieldRefs: result.fieldRefs,
    writtenFields: result.writtenFields,
  };
}
