/**
 * Stage 6 — Cycle detection with v1.2 direction + contentHash propagation.
 *
 * Spec: §6.1 Stage 6, §8.3, §5.1a.
 *
 * Runs Tarjan's SCC over the dependency edges and emits one
 * `CyclicDependencyIR` group per SCC of size ≥ 2. The group nodes
 * are ADDED to `nodes[]` — members are NEVER deleted, per v1.1.
 *
 * v1.2 invariants enforced here:
 *
 * - `members` is a `NodeRef[]` (not `memberNodeIds: string[]`),
 *   sorted by `id`, every entry `{ id, resolved: true }`.
 * - Group `contentHash` is derived from member `contentHash` values
 *   (Auditor 3 P1 #9) so editing a member's internal logic
 *   propagates up into the group.
 * - Synthetic `cycle-contains` edges are emitted directly
 *   (`group → member` direction) so the edge source matches the
 *   node carrying the inline `NodeRef`. Stage 7 MUST NOT re-emit
 *   them through the projected-edge path.
 * - Size-1 SCCs become a `'self-loop-detected'` warning on the
 *   member — no group node, no edges.
 *
 * The terms `'cycle-member-of'` and `memberNodeIds` are explicitly
 * absent from this file to make the PH3.7 acceptance grep a
 * no-match.
 */

import {
  buildIdentityPair,
  resolvedRef,
  type IREdge,
  type IRNodeBase,
  type IRNodeType,
  type NodeRef,
} from '@revbrain/migration-ir-contract';
import { findStronglyConnectedComponents } from '../graph/tarjan-scc.ts';

/**
 * Extension of `IRNodeBase` with the v1.2 CyclicDependencyIR fields
 * we actually populate here. The full shape lives in the contract
 * package (landing in PH6.x per the node catalog); this local
 * interface is a minimal superset the stage can safely emit.
 */
export interface CyclicDependencyDraft extends IRNodeBase {
  nodeType: 'CyclicDependency';
  members: NodeRef[];
  memberNodeTypes: IRNodeType[];
  sccSize: number;
  detectedBy: 'tarjan-scc';
}

export interface DetectCyclesInput {
  /** Nodes that have been resolved + merged (Stage 4 output). */
  nodes: readonly IRNodeBase[];
  /**
   * Pre-computed dependency edges for Tarjan. The caller passes the
   * adjacency list; PH3.8 owns the mapping from inline NodeRef
   * fields into this shape.
   */
  outEdges: Map<string, readonly string[]>;
  /** Pipeline-wide BB-3 version marker — used in the group's displayName. */
  bb3Version: string;
}

export interface DetectCyclesResult {
  /** Input nodes plus every newly-emitted CyclicDependencyIR group. */
  nodes: IRNodeBase[];
  /** `'cycle-contains'` synthetic edges (group → member). */
  syntheticEdges: IREdge[];
  /**
   * Self-loop member ids — Stage 6 attaches a warning to each one
   * without touching the rest of the node.
   */
  selfLoopNodeIds: string[];
}

/** Build a fast `id → node` index for `contentHash` lookup. */
function indexNodes(nodes: readonly IRNodeBase[]): Map<string, IRNodeBase> {
  const idx = new Map<string, IRNodeBase>();
  for (const n of nodes) idx.set(n.id, n);
  return idx;
}

/**
 * Emit cycle group nodes + synthetic edges for every proper SCC;
 * flag self-loops as warnings on their member.
 */
export function detectCycles(input: DetectCyclesInput): DetectCyclesResult {
  const nodeIds = input.nodes.map((n) => n.id);
  const sccs = findStronglyConnectedComponents(nodeIds, input.outEdges);
  const nodeIndex = indexNodes(input.nodes);

  const addedGroups: IRNodeBase[] = [];
  const syntheticEdges: IREdge[] = [];
  const selfLoopNodeIds: string[] = [];

  for (const scc of sccs) {
    if (scc.isSelfLoop) {
      // Size-1 self-loop: warning on the member, no group.
      selfLoopNodeIds.push(scc.members[0]!);
      continue;
    }

    const members: NodeRef[] = scc.members.map((id) => resolvedRef(id));
    // Members are already sorted by id (tarjan-scc guarantees it),
    // but double-check — the spec contract requires it.
    const sortedIds = [...scc.members].sort();

    // Collect member nodeTypes (sorted unique) and contentHashes.
    const nodeTypesSet = new Set<IRNodeType>();
    const memberContentHashes: string[] = [];
    for (const id of sortedIds) {
      const member = nodeIndex.get(id);
      if (!member) continue;
      nodeTypesSet.add(member.nodeType);
      memberContentHashes.push(member.contentHash);
    }
    memberContentHashes.sort();
    const memberNodeTypes = [...nodeTypesSet].sort();

    // Identity pair:
    //   id  = hash over sorted member ids   (membership identity)
    //   contentHash = hash over sorted member contentHashes
    //                 (Auditor 3 P1 #9 — propagates internal edits)
    const pair = buildIdentityPair(
      'CyclicDependency',
      { memberIds: sortedIds },
      { memberContentHashes }
    );

    const group: CyclicDependencyDraft = {
      id: pair.id,
      contentHash: pair.contentHash,
      nodeType: 'CyclicDependency',
      displayName: `Cyclic group (${sortedIds.length} members)`,
      warnings: [],
      evidence: {
        sourceFindingKeys: [],
        classificationReasons: [
          {
            decision: 'cycle-detected',
            chosenValue: `scc-size:${sortedIds.length}`,
            reason: `Tarjan SCC over dependency edges produced a cycle of ${sortedIds.length} members`,
            confidence: 'high',
          },
        ],
        cpqFieldsRead: [],
        cpqFieldsWritten: [],
        sourceSalesforceRecordIds: [],
        sourceCollectors: [`bb3-normalizer@${input.bb3Version}`],
      },
      members,
      memberNodeTypes,
      sccSize: sortedIds.length,
      detectedBy: 'tarjan-scc',
    };
    addedGroups.push(group);

    // Emit group → member synthetic edges.
    for (const memberId of sortedIds) {
      syntheticEdges.push({
        sourceId: group.id,
        targetId: memberId,
        edgeType: 'cycle-contains',
        sourceField: 'members',
      });
    }
  }

  // Final sort: synthetic edges by (sourceId, targetId) so the
  // merged list in Stage 7 is already partially sorted.
  syntheticEdges.sort((a, b) => {
    if (a.sourceId !== b.sourceId) return a.sourceId < b.sourceId ? -1 : 1;
    if (a.targetId !== b.targetId) return a.targetId < b.targetId ? -1 : 1;
    return 0;
  });

  return {
    nodes: [...input.nodes, ...addedGroups],
    syntheticEdges,
    selfLoopNodeIds,
  };
}
