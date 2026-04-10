/**
 * Edge projection — turn inline `NodeRef[]` fields on IR nodes into
 * an explicit `IREdge[]` projection.
 *
 * Spec: §5.1a, §8.8.
 *
 * Inline `NodeRef[]` fields on nodes are the source of truth for
 * relationships; this projection exists so consumers that prefer an
 * edge-list view of the graph (topological sort, cycle detection,
 * visualization) do not have to re-walk every node.
 *
 * The projection is deterministic:
 *
 * - Nodes are visited in ID order.
 * - For each node, inline NodeRef fields are visited in a stable
 *   order (sorted field names from the `nodeRefFields` config).
 * - Only resolved refs become edges; unresolved refs are counted
 *   separately by the caller (they end up in
 *   `GraphMetadataIR.unresolvedRefCount`).
 * - The final edge list is sorted by `(sourceId, targetId, edgeType)`
 *   so the output is byte-identical across re-runs.
 */

import type { IREdge, IREdgeType, NodeRef } from '@revbrain/migration-ir-contract';

/**
 * Describes one inline NodeRef field on a node: the field name on
 * the node, the edge type to emit, and an optional metadata hook.
 */
export interface NodeRefFieldDescriptor {
  /** Property name on the node (e.g. `'conditions'`, `'dependencies'`). */
  fieldName: string;
  /** Edge type to emit for each resolved ref in this field. */
  edgeType: IREdgeType;
  /** Optional metadata factory invoked per edge. */
  metadata?: (sourceId: string, targetId: string) => IREdge['metadata'];
}

/**
 * A node-like value that carries inline NodeRef fields. We don't
 * take a specific IRNode type to keep the projection decoupled from
 * the growing node-type catalog — the caller passes a descriptor
 * list that names which fields to walk.
 */
export interface NodeWithRefs {
  id: string;
  [key: string]: unknown;
}

/** Duck-typed NodeRef check — used for both array and singleton fields. */
function isNodeRef(v: unknown): v is NodeRef {
  return typeof v === 'object' && v !== null && typeof (v as NodeRef).resolved === 'boolean';
}

/**
 * Extract `NodeRef[]` from a node field. Handles three shapes:
 *   - `NodeRef[]`       → returned filtered for NodeRef shape
 *   - `NodeRef | null`  → returned as a single-element array (or empty if null)
 *   - missing / other   → returned as `[]`
 *
 * The singleton case lets the descriptor table cover fields like
 * `Product.bundleStructure: NodeRef | null` and
 * `ContractedPrice.discountSchedule: NodeRef | null` without a
 * separate code path.
 */
function extractRefs(node: NodeWithRefs, fieldName: string): NodeRef[] {
  const v = node[fieldName];
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) return v.filter(isNodeRef);
  if (isNodeRef(v)) return [v];
  return [];
}

/**
 * Project inline NodeRef[] fields on a set of nodes into a sorted,
 * deterministic `IREdge[]`.
 *
 * @returns An object containing the projected edges and a count of
 *          unresolved refs that did NOT become edges. The caller
 *          stores the unresolved count on `GraphMetadataIR`.
 */
export function projectEdges(
  nodes: readonly NodeWithRefs[],
  descriptors: readonly NodeRefFieldDescriptor[]
): { edges: IREdge[]; unresolvedRefCount: number } {
  // Sort descriptors by field name for a stable traversal order.
  const sortedDescriptors = [...descriptors].sort((a, b) =>
    a.fieldName < b.fieldName ? -1 : a.fieldName > b.fieldName ? 1 : 0
  );

  // Sort nodes by id — the downstream IRGraph.nodes[] is sorted by
  // id, so we match that here for reproducibility.
  const sortedNodes = [...nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const edges: IREdge[] = [];
  let unresolvedRefCount = 0;

  for (const node of sortedNodes) {
    for (const desc of sortedDescriptors) {
      const refs = extractRefs(node, desc.fieldName);
      for (const ref of refs) {
        if (!ref.resolved) {
          unresolvedRefCount++;
          continue;
        }
        const edge: IREdge = {
          sourceId: node.id,
          targetId: ref.id,
          edgeType: desc.edgeType,
          sourceField: desc.fieldName,
        };
        if (desc.metadata) {
          const meta = desc.metadata(node.id, ref.id);
          if (meta !== undefined) edge.metadata = meta;
        }
        edges.push(edge);
      }
    }
  }

  // Final sort by (sourceId, targetId, edgeType) so the output is
  // byte-identical regardless of descriptor or node order.
  edges.sort((a, b) => {
    if (a.sourceId !== b.sourceId) return a.sourceId < b.sourceId ? -1 : 1;
    if (a.targetId !== b.targetId) return a.targetId < b.targetId ? -1 : 1;
    if (a.edgeType !== b.edgeType) return a.edgeType < b.edgeType ? -1 : 1;
    return 0;
  });

  return { edges, unresolvedRefCount };
}
