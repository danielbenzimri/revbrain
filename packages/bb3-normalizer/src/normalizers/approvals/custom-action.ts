/**
 * CustomActionIR normalizer.
 *
 * Spec: §5.3 CustomActionIR, §7.6.
 * Conditions are INLINED (not separate nodes) — linked in Stage 4.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { FieldRefIR, IRNodeBase } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode } from '../base.ts';

export interface CustomActionIR extends IRNodeBase {
  nodeType: 'CustomAction';
  displayContext: 'quote' | 'quote-line' | 'group' | 'document' | 'unknown';
  actionType: 'visualforce' | 'lightning' | 'url' | 'script' | 'apex' | 'unknown';
  conditions: Array<{ field: FieldRefIR | null; operator: string; value: string | null }>;
  target: string;
  isActive: boolean;
}

function parseContext(raw: string | null): CustomActionIR['displayContext'] {
  if (!raw) return 'unknown';
  const l = raw.toLowerCase();
  if (l.includes('quote line')) return 'quote-line';
  if (l.includes('quote')) return 'quote';
  if (l.includes('group')) return 'group';
  if (l.includes('document')) return 'document';
  return 'unknown';
}

function parseActionType(raw: string | null): CustomActionIR['actionType'] {
  if (!raw) return 'unknown';
  const l = raw.toLowerCase();
  if (l.includes('visualforce')) return 'visualforce';
  if (l.includes('lightning')) return 'lightning';
  if (l.includes('url')) return 'url';
  if (l.includes('script')) return 'script';
  if (l.includes('apex')) return 'apex';
  return 'unknown';
}

export const normalizeCustomAction: NormalizerFn = (finding: AssessmentFindingInput) => {
  const developerName = finding.artifactName;
  const displayContext = parseContext(finding.sourceRef ?? null);
  const actionType = parseActionType(finding.notes ?? null);
  const target = finding.textValue ?? '';
  const isActive = finding.detected;

  const stableIdentity = { developerName };
  const semanticPayload = { ...stableIdentity, displayContext, actionType, target, isActive };

  const base = buildBaseNode({
    finding,
    nodeType: 'CustomAction',
    stableIdentity,
    semanticPayload,
    developerName,
  });
  const node: CustomActionIR = {
    ...base,
    nodeType: 'CustomAction',
    displayContext,
    actionType,
    conditions: [],
    target,
    isActive,
  };
  return { nodes: [node] };
};
