/**
 * LookupQueryIR normalizer.
 *
 * Spec: §5.3 LookupQueryIR, §7.2.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { FieldRefIR, IRNodeBase } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode } from '../base.ts';
import { extractSoqlFieldRefs } from '../../parsers/soql.ts';

export interface LookupQueryIR extends IRNodeBase {
  nodeType: 'LookupQuery';
  targetObject: string;
  rawSoql: string;
  referencedFields: FieldRefIR[];
  outputFields: FieldRefIR[];
}

export const normalizeLookupQuery: NormalizerFn = (finding: AssessmentFindingInput, context) => {
  const developerName = finding.artifactName;
  const rawSoql = finding.textValue ?? '';
  const extract = extractSoqlFieldRefs(rawSoql, {
    ...(context.catalog.catalog !== null && { catalog: context.catalog.catalog }),
  });
  const targetObject = extract.fromObject ?? 'Unknown';
  const referencedFields = [...extract.selectFields, ...extract.whereFields];

  const stableIdentity = { developerName };
  const semanticPayload = { ...stableIdentity, targetObject, rawSoql };

  const base = buildBaseNode({
    finding,
    nodeType: 'LookupQuery',
    stableIdentity,
    semanticPayload,
    developerName,
  });

  const node: LookupQueryIR = {
    ...base,
    nodeType: 'LookupQuery',
    targetObject,
    rawSoql,
    referencedFields,
    outputFields: extract.selectFields,
  };
  return { nodes: [node] };
};
