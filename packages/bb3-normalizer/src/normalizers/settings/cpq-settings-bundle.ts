/**
 * CPQSettingsBundleIR normalizer. Spec: §5.3, §7.5.
 *
 * Aggregates CPQSettingValue findings into one bundle node. The
 * disposition-relevant subset flagged per BB-5's needs.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { IRNodeBase, NodeNamespace } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode, detectNamespace } from '../base.ts';

const DISPOSITION_RELEVANT = new Set([
  'CalculateImmediately',
  'CustomScriptPluginClassName',
  'TriggerOnSalesDocuments',
  'PriceCalculationEngineApexClass',
  'UseInactivePrices',
  'CreateConfigSnapshots',
  'EnableQuoteTemplateEditing',
  'AllowApprovalRejection',
  'UseProductDescription',
  'UseDetailAsPrimary',
]);

export interface CPQSettingsBundleIR extends IRNodeBase {
  nodeType: 'CPQSettingsBundle';
  settings: Array<{
    apiName: string;
    displayName: string;
    value: string;
    namespace: 'SBQQ' | 'sbaa' | 'blng' | null;
    isDispositionRelevant: boolean;
  }>;
  activeQcpPluginClass: string | null;
  docGenProvider: 'DocuSign' | 'Conga' | 'Adobe' | 'None' | 'unknown';
}

function parseDocGenProvider(raw: string | null): CPQSettingsBundleIR['docGenProvider'] {
  if (!raw) return 'unknown';
  const l = raw.toLowerCase();
  if (l.includes('docusign')) return 'DocuSign';
  if (l.includes('conga')) return 'Conga';
  if (l.includes('adobe')) return 'Adobe';
  if (l.includes('none')) return 'None';
  return 'unknown';
}

export const normalizeCPQSettingsBundle: NormalizerFn = (finding: AssessmentFindingInput) => {
  const apiName = finding.artifactName;
  const value = finding.textValue ?? '';
  const ns = detectNamespace(apiName);
  const bundleNamespace: 'SBQQ' | 'sbaa' | 'blng' | null =
    ns === 'SBQQ' || ns === 'sbaa' || ns === 'blng' ? ns : null;

  const stableIdentity = { bundle: 'singleton' };
  const semanticPayload = { ...stableIdentity, apiName, value };

  const base = buildBaseNode({
    finding,
    nodeType: 'CPQSettingsBundle',
    stableIdentity,
    semanticPayload,
  });

  const node: CPQSettingsBundleIR = {
    ...base,
    nodeType: 'CPQSettingsBundle',
    settings: [
      {
        apiName,
        displayName: apiName,
        value,
        namespace: bundleNamespace,
        isDispositionRelevant: DISPOSITION_RELEVANT.has(apiName),
      },
    ],
    activeQcpPluginClass: apiName === 'CustomScriptPluginClassName' ? value : null,
    docGenProvider: parseDocGenProvider(finding.notes ?? null),
  };
  return { nodes: [node] };
};

export { DISPOSITION_RELEVANT };
