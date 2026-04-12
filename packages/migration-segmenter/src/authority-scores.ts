/**
 * Root-selection authority model.
 *
 * Spec: docs/MIGRATION-SEGMENTER-DESIGN.md §5.6.
 * Task: SEG-2.1.
 *
 * Selects the single "most authoritative" node in a segment as
 * the segment root. The root anchors the `persistentId` and the
 * display `label`.
 */

import type { IRNodeBase, IREdge } from '@revbrain/migration-ir-contract';
import {
  DEFAULT_AUTHORITY_SCORES,
  DEFAULT_AUTHORITY_FALLBACK,
} from '@revbrain/migration-ir-contract';
import { STRONG_EDGE_TYPES } from './edge-classification.ts';

/**
 * Select the root node for a segment.
 *
 * Heuristic (first match wins):
 * 1. Highest authority score by node type.
 * 2. Among tied: most outgoing `parent-of` edges.
 * 3. Among tied: zero incoming `parent-of` edges (structural root).
 * 4. Final tiebreaker: lexicographic node `id`.
 *
 * @param members Segment member nodes (at least 1).
 * @param edges All resolved edges in the graph (used to count parent-of).
 * @param memberSet Set of member node IDs for fast lookup.
 * @param authorityOverrides Optional score overrides.
 * @returns The root node.
 */
export function selectRoot(
  members: readonly IRNodeBase[],
  edges: readonly IREdge[],
  memberSet: ReadonlySet<string>,
  authorityOverrides?: Partial<Record<string, number>>
): IRNodeBase {
  if (members.length === 1) return members[0]!;

  const scores = { ...DEFAULT_AUTHORITY_SCORES, ...authorityOverrides };

  // Count outgoing and incoming parent-of edges for members
  const outParentOf = new Map<string, number>();
  const inParentOf = new Map<string, number>();
  for (const m of members) {
    outParentOf.set(m.id, 0);
    inParentOf.set(m.id, 0);
  }

  for (const edge of edges) {
    if (edge.edgeType !== 'parent-of') continue;
    if (memberSet.has(edge.sourceId) && memberSet.has(edge.targetId)) {
      outParentOf.set(edge.sourceId, (outParentOf.get(edge.sourceId) ?? 0) + 1);
      inParentOf.set(edge.targetId, (inParentOf.get(edge.targetId) ?? 0) + 1);
    }
  }

  // Score and sort
  const scored = members.map((m) => ({
    node: m,
    authority: scores[m.nodeType] ?? DEFAULT_AUTHORITY_FALLBACK,
    outCount: outParentOf.get(m.id) ?? 0,
    inCount: inParentOf.get(m.id) ?? 0,
  }));

  scored.sort((a, b) => {
    // 1. Higher authority first
    if (a.authority !== b.authority) return b.authority - a.authority;
    // 2. More outgoing parent-of first
    if (a.outCount !== b.outCount) return b.outCount - a.outCount;
    // 3. Zero incoming parent-of preferred (true structural root)
    if (a.inCount !== b.inCount) return a.inCount - b.inCount;
    // 4. Lexicographic ID tiebreaker
    return a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0;
  });

  return scored[0]!.node;
}
