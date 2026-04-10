/**
 * Cross-collector merge — unions the evidence of identity-collided
 * draft nodes and resolves scalar disagreements using the domain
 * authority table (`./domain-authority.ts`).
 *
 * Spec: §5.2 collision policy, §8.2.2.
 *
 * When two normalizers produce drafts with the same `id` from
 * different collectors, that is the EXPECTED case — the cross-
 * collector observation. This module merges them into one node,
 * unions their evidence blocks, and records a warning for any
 * scalar disagreement.
 */

import type { EvidenceBlock, IRNodeBase } from '@revbrain/migration-ir-contract';
import { DEFAULT_AUTHORITY, getAuthority, type AuthorityTable } from './domain-authority.ts';

export interface MergeWarning {
  nodeId: string;
  field: string;
  loser: string;
  winner: string;
  losingValue: unknown;
  winningValue: unknown;
}

export interface MergeResult {
  merged: IRNodeBase;
  warnings: MergeWarning[];
}

/** Union two EvidenceBlocks, de-duping by value. */
function mergeEvidence(a: EvidenceBlock, b: EvidenceBlock): EvidenceBlock {
  const union = <T>(xs: readonly T[], ys: readonly T[], key: (t: T) => string): T[] => {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const t of [...xs, ...ys]) {
      const k = key(t);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(t);
      }
    }
    return out;
  };
  return {
    sourceFindingKeys: [...new Set([...a.sourceFindingKeys, ...b.sourceFindingKeys])].sort(),
    classificationReasons: [...a.classificationReasons, ...b.classificationReasons],
    cpqFieldsRead: union(a.cpqFieldsRead, b.cpqFieldsRead, (r) => JSON.stringify(r)),
    cpqFieldsWritten: union(a.cpqFieldsWritten, b.cpqFieldsWritten, (r) => JSON.stringify(r)),
    sourceSalesforceRecordIds: [
      ...new Set([...a.sourceSalesforceRecordIds, ...b.sourceSalesforceRecordIds]),
    ].sort(),
    sourceCollectors: [...new Set([...a.sourceCollectors, ...b.sourceCollectors])].sort(),
  };
}

/** Shallow-union two arrays of primitives. */
function unionArray<T>(a: readonly T[] | undefined, b: readonly T[] | undefined): T[] {
  return [...new Set([...(a ?? []), ...(b ?? [])])];
}

/**
 * Merge two drafts that resolved to the same `id`. Neither draft is
 * mutated; the return value is a fresh object.
 *
 * The merge algorithm:
 *
 * 1. Base: take `a` as the starting point.
 * 2. For each field present in `b` but not `a` → copy over.
 * 3. For each field present in both where values differ:
 *    a. If the field is in the authority table, pick the
 *       higher-authority source.
 *    b. Otherwise prefer `a` (lexicographic collector order applied
 *       by the caller before handing us the pair).
 *    Record a warning either way.
 * 4. Always union `evidence`, `warnings` (the per-node warnings
 *    array), `cpqFieldsRead`/`Written` (via mergeEvidence).
 *
 * The caller is responsible for providing `aCollector` and
 * `bCollector` — typically pulled from the drafts' `evidence.sourceCollectors[0]`.
 */
export function mergeDrafts(
  a: IRNodeBase,
  b: IRNodeBase,
  aCollector: string,
  bCollector: string,
  authority: AuthorityTable = DEFAULT_AUTHORITY
): MergeResult {
  if (a.id !== b.id) {
    throw new Error(`mergeDrafts called with non-matching ids: ${a.id} !== ${b.id}`);
  }

  const warnings: MergeWarning[] = [];
  const aRec = a as unknown as Record<string, unknown>;
  const bRec = b as unknown as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...aRec };

  const allKeys = new Set<string>([...Object.keys(aRec), ...Object.keys(bRec)]);

  for (const key of allKeys) {
    if (key === 'evidence' || key === 'warnings') continue;

    const av = aRec[key];
    const bv = bRec[key];

    if (av === undefined && bv !== undefined) {
      merged[key] = bv;
      continue;
    }
    if (bv === undefined || av === bv) continue;

    // Arrays → union for primitives; otherwise prefer the
    // higher-authority source.
    if (Array.isArray(av) && Array.isArray(bv)) {
      const isPrimArray = av.every((x) => typeof x !== 'object' || x === null);
      if (isPrimArray) {
        merged[key] = unionArray(av, bv);
        continue;
      }
    }

    const aAuth = getAuthority(a.nodeType, key, aCollector, authority);
    const bAuth = getAuthority(b.nodeType, key, bCollector, authority);

    if (aAuth >= bAuth) {
      // a wins (keep merged[key] === av)
      warnings.push({
        nodeId: a.id,
        field: key,
        winner: aCollector,
        loser: bCollector,
        winningValue: av,
        losingValue: bv,
      });
    } else {
      merged[key] = bv;
      warnings.push({
        nodeId: a.id,
        field: key,
        winner: bCollector,
        loser: aCollector,
        winningValue: bv,
        losingValue: av,
      });
    }
  }

  merged.evidence = mergeEvidence(a.evidence, b.evidence);
  merged.warnings = [...new Set([...(a.warnings ?? []), ...(b.warnings ?? [])])];

  return { merged: merged as unknown as IRNodeBase, warnings };
}
