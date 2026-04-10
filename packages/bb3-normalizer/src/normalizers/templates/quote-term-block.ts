/**
 * QuoteTermBlockIR normalizer. Spec: §5.3, §7.7.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import { createHash } from 'node:crypto';
import type { FieldRefIR, IRNodeBase } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode } from '../base.ts';

export interface QuoteTermBlockIR extends IRNodeBase {
  nodeType: 'QuoteTermBlock';
  textContentHash: string;
  lengthBytes: number;
  conditionField: FieldRefIR | null;
}

function hashText(text: string): string {
  // Collapse whitespace before hashing so cosmetic whitespace edits
  // do not change the content hash of the block.
  const normalized = text.replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 16);
}

export const normalizeQuoteTermBlock: NormalizerFn = (finding: AssessmentFindingInput) => {
  const developerName = finding.artifactName;
  const rawText = finding.textValue ?? '';
  const textContentHash = hashText(rawText);
  const lengthBytes = Buffer.byteLength(rawText, 'utf8');

  const stableIdentity = { developerName };
  const semanticPayload = { ...stableIdentity, textContentHash, lengthBytes };

  const base = buildBaseNode({
    finding,
    nodeType: 'QuoteTermBlock',
    stableIdentity,
    semanticPayload,
    developerName,
  });
  const node: QuoteTermBlockIR = {
    ...base,
    nodeType: 'QuoteTermBlock',
    textContentHash,
    lengthBytes,
    conditionField: null,
  };
  return { nodes: [node] };
};
