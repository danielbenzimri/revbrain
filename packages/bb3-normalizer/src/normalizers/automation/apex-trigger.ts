/**
 * ApexTriggerAutomationIR normalizer (v1.2 variant).
 *
 * Spec: §5.3 ApexTriggerAutomationIR, §7.3.
 *
 * Emits `sourceType: 'ApexTrigger'`. Shares Apex parsing with PH5.1
 * but adds trigger-specific fields (`triggerObject`, `triggerEvents`)
 * and does NOT carry `calloutCount` or `isTestClass` — those are
 * Apex-class concerns.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { ApexTriggerAutomationIR, FieldRefIR, NodeRef } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode } from '../base.ts';
import { createGlobalBudgetState, parseApexClass } from '../../parsers/apex.ts';

type DmlEvent = 'insert' | 'update' | 'delete' | 'undelete';

/**
 * Parse the `trigger Foo on X (insert, update)` declaration at the
 * top of the source. Returns (triggerObject, triggerEvents).
 */
function parseTriggerHeader(source: string): {
  triggerObject: string;
  triggerEvents: DmlEvent[];
} {
  const match = source.match(/\btrigger\s+\w+\s+on\s+(\w+)\s*\(([^)]+)\)/i);
  if (!match) return { triggerObject: '<unknown>', triggerEvents: [] };
  const obj = match[1]!;
  const eventsRaw = match[2]!
    .toLowerCase()
    .split(/\s*,\s*|\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const valid: DmlEvent[] = [];
  for (const e of eventsRaw) {
    if (e === 'before' || e === 'after') continue; // before/after are modifiers
    if (e === 'insert' || e === 'update' || e === 'delete' || e === 'undelete') valid.push(e);
  }
  return { triggerObject: obj, triggerEvents: [...new Set(valid)].sort() };
}

export const normalizeApexTrigger: NormalizerFn = (finding: AssessmentFindingInput) => {
  const developerName = finding.artifactName;
  const rawSource = finding.textValue ?? '';
  const { triggerObject, triggerEvents } = parseTriggerHeader(rawSource);
  const lineCount = rawSource.split('\n').length;

  const stableIdentity = { sourceType: 'ApexTrigger' as const, developerName };
  const semanticPayload = {
    ...stableIdentity,
    triggerObject,
    triggerEvents,
    hasTriggerControl: /\bSBQQ\.TriggerControl\b/.test(rawSource),
    rawSourceLength: rawSource.length,
  };

  const base = buildBaseNode({
    finding,
    nodeType: 'Automation',
    stableIdentity,
    semanticPayload,
    developerName,
  });

  const node: ApexTriggerAutomationIR = {
    ...base,
    nodeType: 'Automation',
    sourceType: 'ApexTrigger',
    sbqqFieldRefs: [] as FieldRefIR[],
    writtenFields: [] as FieldRefIR[],
    relatedRules: [] as NodeRef[],
    triggerObject,
    triggerEvents,
    lineCount,
    hasTriggerControl: semanticPayload.hasTriggerControl,
    hasDynamicFieldRef: false,
    parseStatus: 'partial',
    parseErrors: [],
  };
  return { nodes: [node] };
};

/**
 * PH9.5 — Async enrichment helper for Stage 5. Mirrors
 * {@link enrichApexClass}: runs the shared Apex parser against the
 * trigger's raw source, rewrites the parse metrics, and returns a
 * new node. The normalizer dispatcher stays sync; Stage 5 opts in.
 */
export async function enrichApexTrigger(
  draft: ApexTriggerAutomationIR,
  source: string,
  globalState = createGlobalBudgetState()
): Promise<ApexTriggerAutomationIR> {
  const result = await parseApexClass(source, { globalState });
  return {
    ...draft,
    lineCount: result.lineCount,
    hasTriggerControl: result.hasTriggerControl,
    hasDynamicFieldRef: result.hasDynamicFieldRef,
    parseStatus: result.parseStatus,
    parseErrors: result.parseErrors,
    sbqqFieldRefs: result.fieldRefs,
    writtenFields: result.writtenFields,
  };
}
