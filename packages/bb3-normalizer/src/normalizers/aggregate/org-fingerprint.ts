/**
 * OrgFingerprintIR normalizer (singleton + envelope).
 *
 * Spec: §5.3, §7.1.
 *
 * Emits ONE node per run. Salesforce org ID is STORED on the node
 * but NEVER used in identity — per G5 the node must survive
 * sandbox refreshes (which assign new IDs).
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { IRNodeBase } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode, findEvidenceRef } from '../base.ts';

export interface OrgFingerprintNode extends IRNodeBase {
  nodeType: 'OrgFingerprint';
  orgId: string;
  orgName: string;
  instanceUrl: string;
  edition: string;
  apiVersion: string;
  cpqPackageVersion: string;
  sbaaVersion: string | null;
  blngVersion: string | null;
  isSandbox: boolean;
  multiCurrencyEnabled: boolean;
  isoCodes: string[];
  language: string;
  locale: string;
  timezone: string;
  country: string;
  trialExpiration: string | null;
}

export const normalizeOrgFingerprint: NormalizerFn = (finding: AssessmentFindingInput) => {
  const orgId = findEvidenceRef(finding, 'record-id') ?? '<unknown>';
  const orgName = finding.artifactName;

  // Identity: use orgName + edition (not orgId per G5).
  const edition = finding.notes ?? 'unknown';
  const stableIdentity = { orgName, edition };
  const semanticPayload = { ...stableIdentity, orgId };

  const base = buildBaseNode({
    finding,
    nodeType: 'OrgFingerprint',
    stableIdentity,
    semanticPayload,
    displayName: orgName,
  });

  const node: OrgFingerprintNode = {
    ...base,
    nodeType: 'OrgFingerprint',
    orgId,
    orgName,
    instanceUrl: finding.sourceRef ?? '',
    edition,
    apiVersion: '62.0',
    cpqPackageVersion: 'unknown',
    sbaaVersion: null,
    blngVersion: null,
    isSandbox: /sandbox/i.test(orgName),
    multiCurrencyEnabled: false,
    isoCodes: [],
    language: 'en_US',
    locale: 'en_US',
    timezone: 'UTC',
    country: 'US',
    trialExpiration: null,
  };
  return { nodes: [node] };
};
