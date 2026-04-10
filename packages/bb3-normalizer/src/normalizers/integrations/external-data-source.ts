/**
 * ExternalDataSourceIR normalizer. Spec: §5.3, §7.8.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { IRNodeBase } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode } from '../base.ts';

export interface ExternalDataSourceIR extends IRNodeBase {
  nodeType: 'ExternalDataSource';
  endpointUrl: string;
  dataSourceType: 'odata-2' | 'odata-4' | 'salesforce-connect' | 'custom' | 'unknown';
  isCertified: boolean;
}

function parseType(raw: string | null): ExternalDataSourceIR['dataSourceType'] {
  if (!raw) return 'unknown';
  const l = raw.toLowerCase();
  if (l.includes('odata 4') || l.includes('odata4')) return 'odata-4';
  if (l.includes('odata')) return 'odata-2';
  if (l.includes('salesforce connect')) return 'salesforce-connect';
  if (l.includes('custom')) return 'custom';
  return 'unknown';
}

export const normalizeExternalDataSource: NormalizerFn = (finding: AssessmentFindingInput) => {
  const developerName = finding.artifactName;
  const endpointUrl = finding.textValue ?? '';
  const dataSourceType = parseType(finding.notes ?? null);

  const stableIdentity = { developerName };
  const semanticPayload = { ...stableIdentity, endpointUrl, dataSourceType };

  const base = buildBaseNode({
    finding,
    nodeType: 'ExternalDataSource',
    stableIdentity,
    semanticPayload,
    developerName,
  });
  const node: ExternalDataSourceIR = {
    ...base,
    nodeType: 'ExternalDataSource',
    endpointUrl,
    dataSourceType,
    isCertified: false,
  };
  return { nodes: [node] };
};
