/**
 * Reference index builder.
 *
 * Spec: §5.5, §8.8, §6.1 Stage 7.
 *
 * Walks every IR node's `evidence.cpqFieldsRead`/`cpqFieldsWritten`
 * plus any per-node FieldRefIR arrays the caller declares, and
 * builds the inverted index that answers "what depends on field X?"
 * in O(1) for downstream consumers.
 *
 * v1.2 field-access split (§5.1a, §5.5): field references are
 * tracked in `ReferenceIndex.byField` / `byPath` / `byObject`.
 * They are NEVER turned into edges — `FieldRefIR` is not an IR
 * node. Dynamic and unresolved refs go into their own buckets so
 * V4 and V8 have a bounded workset.
 */

import type { FieldRefIR, IRNodeBase, ReferenceIndex } from '@revbrain/migration-ir-contract';

/**
 * Serialize a FieldRefIR to a stable byField/byPath key.
 * Direct refs → `"Object.Field"`; path refs → the full dotted path.
 */
function fieldRefKey(ref: FieldRefIR): { key: string; kind: 'field' | 'path' } {
  if (ref.kind === 'field') {
    return { key: `${ref.object}.${ref.field}`, kind: 'field' };
  }
  const joined = [ref.rootObject, ...ref.path, ref.terminalField].join('.');
  return { key: joined, kind: 'path' };
}

/**
 * Collect every FieldRefIR on a node. Subclasses add extra fields
 * (e.g. `PricingRuleIR.inputFields`), but the reference index only
 * needs the `cpqFieldsRead` / `cpqFieldsWritten` arrays on
 * `EvidenceBlock` — that's the minimum contract every normalizer
 * populates. Callers may pass `extraRefs` per node to widen the
 * pass as later normalizers come online.
 */
function collectRefs(node: IRNodeBase, extraRefs?: Map<string, FieldRefIR[]>): FieldRefIR[] {
  const refs: FieldRefIR[] = [];
  refs.push(...node.evidence.cpqFieldsRead);
  refs.push(...node.evidence.cpqFieldsWritten);
  const extra = extraRefs?.get(node.id);
  if (extra) refs.push(...extra);
  return refs;
}

/** Deterministic set addition: append id then sort+dedupe in finalize. */
function addTo(rec: Record<string, string[]>, key: string, nodeId: string): void {
  const list = rec[key];
  if (list) list.push(nodeId);
  else rec[key] = [nodeId];
}

/**
 * Build the `ReferenceIndex` from a (resolved, merged) list of
 * nodes. Every entry is sorted/deduped so the output is
 * deterministic regardless of input order.
 */
export function buildReferenceIndex(
  nodes: readonly IRNodeBase[],
  extraRefs?: Map<string, FieldRefIR[]>
): ReferenceIndex {
  const byObject: Record<string, string[]> = {};
  const byField: Record<string, string[]> = {};
  const byPath: Record<string, string[]> = {};
  const byNodeId: Record<string, { objects: string[]; fields: string[]; paths: string[] }> = {};
  const dynamicRefs: Array<{ nodeId: string; hint: string }> = [];
  const unresolvedRefs: Array<{ nodeId: string; reference: FieldRefIR; reason: string }> = [];

  // Process nodes in id order so the downstream byObject/byField
  // lists are accumulated in a stable sequence.
  const sortedNodes = [...nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const node of sortedNodes) {
    const refs = collectRefs(node, extraRefs);
    const nodeObjects = new Set<string>();
    const nodeFields = new Set<string>();
    const nodePaths = new Set<string>();

    for (const ref of refs) {
      // Dynamic refs: skip the byField/byObject indexing but record
      // the hint. dynamicRefs is the bounded workset for V8.
      if (ref.unresolvedReason === 'dynamic') {
        dynamicRefs.push({ nodeId: node.id, hint: ref.hint ?? '<no hint>' });
        continue;
      }

      // Unresolved (non-dynamic) refs: bucket for V4.
      if (!ref.isResolved) {
        unresolvedRefs.push({
          nodeId: node.id,
          reference: ref,
          reason: ref.unresolvedReason ?? 'unknown',
        });
        // Still add them to byField/byPath so consumers can find
        // the node — the resolution bucket exists separately.
      }

      const { key, kind } = fieldRefKey(ref);
      if (kind === 'field') {
        addTo(byField, key, node.id);
        nodeFields.add(key);
        // Also index by the bare object so consumers can ask
        // "what reads SBQQ__Quote__c?" without knowing field names.
        const objKey = (ref as { object: string }).object;
        addTo(byObject, objKey, node.id);
        nodeObjects.add(objKey);
      } else {
        addTo(byPath, key, node.id);
        nodePaths.add(key);
        const rootKey = (ref as { rootObject: string }).rootObject;
        addTo(byObject, rootKey, node.id);
        nodeObjects.add(rootKey);
      }
    }

    byNodeId[node.id] = {
      objects: [...nodeObjects].sort(),
      fields: [...nodeFields].sort(),
      paths: [...nodePaths].sort(),
    };
  }

  // Deduplicate + sort every inverted-index entry.
  const finalize = (rec: Record<string, string[]>): void => {
    for (const key of Object.keys(rec)) {
      rec[key] = [...new Set(rec[key])].sort();
    }
  };
  finalize(byObject);
  finalize(byField);
  finalize(byPath);

  dynamicRefs.sort((a, b) => {
    const ka = a.nodeId + '\0' + a.hint;
    const kb = b.nodeId + '\0' + b.hint;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  unresolvedRefs.sort((a, b) => {
    if (a.nodeId !== b.nodeId) return a.nodeId < b.nodeId ? -1 : 1;
    return a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0;
  });

  return { byObject, byField, byPath, byNodeId, dynamicRefs, unresolvedRefs };
}
