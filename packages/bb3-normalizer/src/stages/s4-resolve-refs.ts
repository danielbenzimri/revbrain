/**
 * Stage 4 — Reference resolution + cross-collector merge.
 *
 * Spec: §6.1 Stage 4, §8.2.
 *
 * Two responsibilities:
 *
 * 1. **Merge by identity.** Two draft nodes with the same `id` from
 *    different collectors are the SAME artifact observed twice —
 *    merge their evidence blocks, resolve scalar disagreements via
 *    the domain authority table, and produce one node.
 *
 * 2. **Detect orphaned children.** Draft nodes whose parent `NodeRef`
 *    points at a missing target are quarantined with reason
 *    `'orphaned-reference'`. Parent lookup uses a priority order
 *    documented here so it's reproducible.
 *
 * This stage does NOT yet walk `NodeRef[]` fields to resolve child
 * arrays — that logic is per-normalizer and handled in PH4+ as each
 * normalizer is implemented.
 */

import type { Diagnostic, IRNodeBase, QuarantineEntry } from '@revbrain/migration-ir-contract';
import { mergeDrafts, type MergeWarning } from '../merge/cross-collector.ts';
import type { FindingIndex } from './s2-group-index.ts';
import { wireParentChildRefs, type OrphanedChild } from './parent-lookup.ts';

export interface ResolveReferencesInput {
  drafts: IRNodeBase[];
  /**
   * PH9.2 — Finding index from Stage 2. Optional so existing
   * tests that only exercise identity merging can omit it. PH9.3
   * uses it for parent-child wiring.
   */
  findingIndex?: FindingIndex;
}

export interface ResolveReferencesResult {
  nodes: IRNodeBase[];
  quarantine: QuarantineEntry[];
  diagnostics: Diagnostic[];
  mergeWarnings: MergeWarning[];
}

/**
 * Deterministic collector ordering for tie-breaking. Lexicographic
 * on `collectorName`. The cross-collector merge receives the sorted
 * pair so its per-field authority decisions are independent of
 * input order.
 */
function firstCollector(node: IRNodeBase): string {
  return node.evidence.sourceCollectors[0] ?? '<unknown>';
}

/**
 * Resolve references and merge identity-collided drafts.
 */
export function resolveReferences(input: ResolveReferencesInput): ResolveReferencesResult {
  const byId = new Map<string, IRNodeBase>();
  const mergeWarnings: MergeWarning[] = [];
  const diagnostics: Diagnostic[] = [];

  // Process drafts in a deterministic order — sort by id so merge
  // chains are reproducible.
  const sorted = [...input.drafts].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const draft of sorted) {
    const existing = byId.get(draft.id);
    if (!existing) {
      byId.set(draft.id, draft);
      continue;
    }

    // Merge. Order matters for warning provenance: the first-seen
    // draft's collector is `aCollector`; the arriving draft is `b`.
    const aCol = firstCollector(existing);
    const bCol = firstCollector(draft);
    const { merged, warnings } = mergeDrafts(existing, draft, aCol, bCol);
    byId.set(draft.id, merged);
    mergeWarnings.push(...warnings);

    if (warnings.length > 0) {
      diagnostics.push({
        severity: 'warning',
        stage: 'resolve-refs',
        code: 'BB3_R002',
        message: `cross-collector scalar disagreement on ${warnings.map((w) => w.field).join(', ')}`,
        nodeId: merged.id,
      });
    }
  }

  // Emit the merged list in id order so downstream stages see a
  // deterministic sequence regardless of input order.
  const mergedNodes = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // PH9.3 — Parent-child wiring. Walks PARENT_WIRING_RULES,
  // rewrites child back-pointer ids to the parent's real
  // identity-hash id, and appends resolved children into the
  // parent's children array (e.g. PricingRule.conditions).
  // Children whose parent is missing become orphaned-reference
  // quarantine entries.
  const { nodes: wiredNodes, orphans } = wireParentChildRefs(mergedNodes);

  const orphanQuarantine: QuarantineEntry[] = orphans.map((o) => orphanToQuarantine(o));
  for (const orphan of orphans) {
    diagnostics.push({
      severity: 'warning',
      stage: 'resolve-refs',
      code: 'BB3_R003',
      message: `orphaned reference: ${orphan.childNodeType}.${orphan.backPointerField}=${orphan.lookupKey} (${orphan.reason})`,
      nodeId: orphan.childId,
    });
  }

  // Spec §6.1 Stage 4: orphaned children are preserved in the
  // graph (not deleted) — the wiring pass already flipped their
  // back-pointer to `resolved: false`. The quarantine entry is
  // a sidecar record for traceability, not a deletion.
  return {
    nodes: wiredNodes,
    quarantine: orphanQuarantine,
    diagnostics,
    mergeWarnings,
  };
}

/** Convert a parent-lookup orphan into a pipeline QuarantineEntry. */
function orphanToQuarantine(orphan: OrphanedChild): QuarantineEntry {
  return {
    findingKey: orphan.childFindingKey,
    artifactType: orphan.childNodeType,
    reason: 'orphaned-reference',
    detail: orphan.reason,
    raw: {
      childId: orphan.childId,
      backPointerField: orphan.backPointerField,
      lookupKey: orphan.lookupKey,
    },
  };
}
