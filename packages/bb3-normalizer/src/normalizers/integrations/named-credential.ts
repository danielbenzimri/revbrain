/**
 * NamedCredentialIR normalizer. Spec: §5.3, §7.8.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { IRNodeBase } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode } from '../base.ts';

export interface NamedCredentialIR extends IRNodeBase {
  nodeType: 'NamedCredential';
  endpointUrl: string;
  authProtocol: 'oauth2' | 'basic' | 'jwt' | 'aws-sig' | 'none' | 'unknown';
  isUsedByCpq: boolean;
}

function parseAuth(raw: string | null): NamedCredentialIR['authProtocol'] {
  if (!raw) return 'unknown';
  const l = raw.toLowerCase();
  if (l.includes('oauth')) return 'oauth2';
  if (l.includes('basic')) return 'basic';
  if (l.includes('jwt')) return 'jwt';
  if (l.includes('aws')) return 'aws-sig';
  if (l.includes('none')) return 'none';
  return 'unknown';
}

export const normalizeNamedCredential: NormalizerFn = (finding: AssessmentFindingInput) => {
  const developerName = finding.artifactName;
  const endpointUrl = finding.textValue ?? '';
  const authProtocol = parseAuth(finding.notes ?? null);

  const stableIdentity = { developerName };
  const semanticPayload = { ...stableIdentity, endpointUrl, authProtocol };

  const base = buildBaseNode({
    finding,
    nodeType: 'NamedCredential',
    stableIdentity,
    semanticPayload,
    developerName,
  });
  const node: NamedCredentialIR = {
    ...base,
    nodeType: 'NamedCredential',
    endpointUrl,
    authProtocol,
    isUsedByCpq: false,
  };
  return { nodes: [node] };
};
