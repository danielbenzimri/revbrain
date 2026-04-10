/**
 * ConnectedAppIR normalizer. Spec: §5.3, §7.8.
 *
 * NEVER persists OAuth secrets — only the consumer key.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { IRNodeBase } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode, findEvidenceRef } from '../base.ts';

export interface ConnectedAppIR extends IRNodeBase {
  nodeType: 'ConnectedApp';
  developerName: string;
  oauthConsumerKey: string | null;
  oauthScopes: string[];
  callbackUrls: string[];
}

export const normalizeConnectedApp: NormalizerFn = (finding: AssessmentFindingInput) => {
  const developerName = finding.artifactName;
  const oauthConsumerKey = findEvidenceRef(finding, 'field-ref');
  // NEVER read a secret — we only store the key. If the finding's
  // evidenceRefs include anything that looks like a secret
  // (type === 'code-snippet' with 'secret' in the value), we skip.
  const oauthScopes = (finding.textValue ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const stableIdentity = { developerName };
  const semanticPayload = { ...stableIdentity, oauthConsumerKey, oauthScopes };

  const base = buildBaseNode({
    finding,
    nodeType: 'ConnectedApp',
    stableIdentity,
    semanticPayload,
    developerName,
  });
  const node: ConnectedAppIR = {
    ...base,
    nodeType: 'ConnectedApp',
    developerName,
    oauthConsumerKey,
    oauthScopes,
    callbackUrls: [],
  };
  return { nodes: [node] };
};
