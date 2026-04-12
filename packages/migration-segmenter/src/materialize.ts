/**
 * Segment materialization — convert union-find components into
 * typed Segment objects with dual-key IDs.
 *
 * Spec: docs/MIGRATION-SEGMENTER-DESIGN.md §5.4, §6.2.
 * Task: SEG-2.1.
 */

import { createHash } from 'node:crypto';
import type { IRNodeBase, IREdge, Segment } from '@revbrain/migration-ir-contract';
import { DEFAULT_COMPLEXITY_WEIGHTS, type SegmenterOptions } from '@revbrain/migration-ir-contract';
import { UnionFind } from './union-find.ts';
import { selectRoot } from './authority-scores.ts';

/**
 * Compute a length-prefixed streaming hash of sorted member IDs.
 * Format: `seg:<base64url(sha256)>`.
 *
 * Length-prefix prevents collision-by-concatenation:
 * `["ab","c"]` and `["a","bc"]` produce different hashes because
 * each ID is preceded by its byte-length as a 4-byte big-endian uint.
 */
export function computeSegmentId(sortedMemberIds: readonly string[]): string {
  const hash = createHash('sha256');
  const lenBuf = Buffer.alloc(4);
  for (const id of sortedMemberIds) {
    const idBytes = Buffer.from(id, 'utf8');
    lenBuf.writeUInt32BE(idBytes.byteLength, 0);
    hash.update(lenBuf);
    hash.update(idBytes);
  }
  return `seg:${hash.digest('base64url')}`;
}

/**
 * Compute the persistent ID from the root node.
 * Format: `pseg:<rootNodeId>` (full ID, never truncated).
 */
export function computePersistentId(rootNodeId: string): string {
  return `pseg:${rootNodeId}`;
}

/**
 * Compute complexity estimate from member nodes.
 * Formula: base = max(member weights), bump = floor(log2(nodeCount)),
 * score = base + bump. Bucket: 1-3 = simple, 4-6 = moderate, 7+ = complex.
 */
export function computeComplexity(
  members: readonly IRNodeBase[],
  weightOverrides?: Partial<Record<string, number>>
): { estimate: Segment['complexityEstimate']; weight: number } {
  const weights = { ...DEFAULT_COMPLEXITY_WEIGHTS, ...weightOverrides };

  let maxWeight = 0;
  let totalWeight = 0;
  for (const m of members) {
    const w = weights[m.complexitySignal ?? 'unknown'] ?? weights['unknown'] ?? 1;
    if (w > maxWeight) maxWeight = w;
    totalWeight += w;
  }

  const bump = members.length > 1 ? Math.floor(Math.log2(members.length)) : 0;
  const score = maxWeight + bump;

  let estimate: Segment['complexityEstimate'];
  if (score <= 3) estimate = 'simple';
  else if (score <= 6) estimate = 'moderate';
  else estimate = 'complex';

  return { estimate, weight: totalWeight };
}

/**
 * Materialize segments from union-find components.
 *
 * @param uf Union-find with final membership.
 * @param nodes All graph nodes.
 * @param edges All resolved edges (for root selection).
 * @param waveAssignment Map from representative → wave number.
 * @param options Segmenter options.
 * @returns Array of materialized segments + nodeToSegment map.
 */
export function materializeSegments(
  uf: UnionFind,
  nodes: readonly IRNodeBase[],
  edges: readonly IREdge[],
  waveAssignment: Map<string, number>,
  options: SegmenterOptions = {}
): {
  segments: Segment[];
  nodeToSegment: Record<string, string>;
} {
  // Build node lookup
  const nodeById = new Map<string, IRNodeBase>();
  for (const n of nodes) nodeById.set(n.id, n);

  // Enumerate components
  const components = uf.components();
  const segments: Segment[] = [];
  const nodeToSegment: Record<string, string> = {};

  for (const [rep, memberIds] of components) {
    const members = memberIds.map((id) => nodeById.get(id)!);
    const memberSet = new Set(memberIds);

    // Root selection
    const root = selectRoot(members, edges, memberSet, options.authorityScores);

    // Dual-key IDs
    const id = computeSegmentId(memberIds); // already sorted by components()
    const persistentId = computePersistentId(root.id);

    // Complexity
    const { estimate, weight } = computeComplexity(members, options.weights);

    // Node types (sorted unique)
    const nodeTypes = [...new Set(members.map((m) => m.nodeType))].sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0
    );

    // Wave
    const migrationOrder = waveAssignment.get(rep) ?? 0;

    const segment: Segment = {
      id,
      persistentId,
      label: `${root.nodeType}: ${root.displayName}`,
      rootNodeId: root.id,
      nodeCount: members.length,
      nodeTypes,
      memberNodeIds: memberIds,
      complexityEstimate: estimate,
      weight,
      migrationOrder,
      dependsOn: [], // Populated in SEG-2.2
      dependedOnBy: [], // Populated in SEG-2.2
      isIsland: true, // Recalculated in SEG-2.2 after deps are wired
      isVirtual: false,
      validationConstraints: [], // Populated in SEG-2.2
      internalOrderingHints: [], // Populated in SEG-3.2
    };

    segments.push(segment);

    // Build nodeToSegment
    for (const memberId of memberIds) {
      nodeToSegment[memberId] = id;
    }
  }

  // Sort segments by (migrationOrder ASC, id ASC) — spec §6.4
  segments.sort((a, b) => {
    if (a.migrationOrder !== b.migrationOrder) return a.migrationOrder - b.migrationOrder;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return { segments, nodeToSegment };
}
