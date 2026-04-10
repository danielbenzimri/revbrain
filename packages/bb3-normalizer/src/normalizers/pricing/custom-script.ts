/**
 * CustomComputationIR normalizer (QCP placeholder).
 *
 * Spec: §5.3 CustomComputationIR, §8.7.
 *
 * BB-3 v1 treats every SBQQ__CustomScript__c finding as opaque.
 * BB-3b replaces each placeholder with per-function nodes.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { FieldRefIR, IRNodeBase } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode } from '../base.ts';

export interface CustomComputationIR extends IRNodeBase {
  nodeType: 'CustomComputation';
  scriptDeveloperName: string;
  functionName: string | null;
  rawSource: string;
  lineCount: number;
  sbqqFieldRefs: FieldRefIR[];
  customFieldRefs: FieldRefIR[];
  parseStatus: 'deferred-to-bb3b';
}

export const normalizeCustomScript: NormalizerFn = (finding: AssessmentFindingInput) => {
  const scriptDeveloperName = finding.artifactName;
  const rawSource = finding.textValue ?? '';
  const lineCount = rawSource.split('\n').length;

  const stableIdentity = { scriptDeveloperName, functionName: null };
  // Do NOT include raw source in the identity — it's opaque to BB-3.
  // contentHash uses a SHA-256 of the raw source per §5.2.
  const semanticPayload = { ...stableIdentity, rawSourceLength: rawSource.length };

  const base = buildBaseNode({
    finding,
    nodeType: 'CustomComputation',
    stableIdentity,
    semanticPayload,
    developerName: scriptDeveloperName,
    warnings: ['QCP AST decomposition pending BB-3b'],
  });

  const node: CustomComputationIR = {
    ...base,
    nodeType: 'CustomComputation',
    scriptDeveloperName,
    functionName: null,
    rawSource,
    lineCount,
    sbqqFieldRefs: [],
    customFieldRefs: [],
    parseStatus: 'deferred-to-bb3b',
  };
  return { nodes: [node] };
};
