/**
 * Articulation-point analysis for large segments.
 *
 * Spec: docs/MIGRATION-SEGMENTER-DESIGN.md §5.5.
 * Task: SEG-3.2.
 *
 * Finds structural bottleneck nodes whose removal would split
 * the segment into disconnected parts. Ranked by separation
 * power (size of the largest resulting component). Capped at
 * maxHints. Uses iterative DFS (not recursive) to avoid stack
 * overflow on deep graphs.
 */

import type { IREdge, ArticulationHint, IRNodeBase } from '@revbrain/migration-ir-contract';
import { STRONG_EDGE_TYPES } from './edge-classification.ts';

/**
 * Find articulation points and rank by separation power.
 *
 * @param memberIds Sorted member node IDs.
 * @param memberNodes Corresponding node objects (for nodeType).
 * @param edges All resolved edges (filtered to intra-segment + strong internally).
 * @param maxHints Max results to return.
 * @returns Ranked articulation hints, capped at maxHints.
 */
export function findArticulationHints(
  memberIds: readonly string[],
  memberNodes: ReadonlyMap<string, IRNodeBase>,
  edges: readonly IREdge[],
  maxHints: number
): ArticulationHint[] {
  if (memberIds.length <= 2) return []; // Trivial — no useful articulation points

  const memberSet = new Set(memberIds);

  // Build undirected adjacency list from strong intra-segment edges
  const adj = new Map<string, string[]>();
  for (const id of memberIds) adj.set(id, []);

  for (const edge of edges) {
    if (!STRONG_EDGE_TYPES.has(edge.edgeType)) continue;
    if (!memberSet.has(edge.sourceId) || !memberSet.has(edge.targetId)) continue;
    if (edge.sourceId === edge.targetId) continue; // self-loop
    adj.get(edge.sourceId)!.push(edge.targetId);
    adj.get(edge.targetId)!.push(edge.sourceId);
  }

  // Iterative Hopcroft-Tarjan for articulation points
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const articulationSet = new Set<string>();
  let timer = 0;

  // Iterative DFS using explicit stack
  type StackFrame = {
    node: string;
    parentNode: string | null;
    childIdx: number;
    children: number;
  };

  for (const startNode of memberIds) {
    if (disc.has(startNode)) continue;

    const stack: StackFrame[] = [{ node: startNode, parentNode: null, childIdx: 0, children: 0 }];
    disc.set(startNode, timer);
    low.set(startNode, timer);
    parent.set(startNode, null);
    timer++;

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const neighbors = adj.get(frame.node)!;

      if (frame.childIdx < neighbors.length) {
        const neighbor = neighbors[frame.childIdx]!;
        frame.childIdx++;

        if (!disc.has(neighbor)) {
          disc.set(neighbor, timer);
          low.set(neighbor, timer);
          parent.set(neighbor, frame.node);
          timer++;
          frame.children++;

          stack.push({
            node: neighbor,
            parentNode: frame.node,
            childIdx: 0,
            children: 0,
          });
        } else if (neighbor !== frame.parentNode) {
          low.set(frame.node, Math.min(low.get(frame.node)!, disc.get(neighbor)!));
        }
      } else {
        // All neighbors processed — pop and update parent
        stack.pop();

        if (stack.length > 0) {
          const parentFrame = stack[stack.length - 1]!;
          low.set(parentFrame.node, Math.min(low.get(parentFrame.node)!, low.get(frame.node)!));

          // Articulation point check
          if (parent.get(parentFrame.node) !== null) {
            // Non-root: articulation if low[child] >= disc[parent]
            if (low.get(frame.node)! >= disc.get(parentFrame.node)!) {
              articulationSet.add(parentFrame.node);
            }
          }
        } else {
          // Root: articulation if >1 DFS children
          if (frame.children > 1) {
            articulationSet.add(frame.node);
          }
        }
      }
    }
  }

  if (articulationSet.size === 0) return [];

  // Rank by separation power: size of largest component when removed
  const hints: ArticulationHint[] = [];
  for (const apId of articulationSet) {
    const largestComponent = computeLargestComponentWithout(memberIds, adj, apId);
    const node = memberNodes.get(apId);
    hints.push({
      nodeId: apId,
      nodeType: node?.nodeType ?? 'unknown',
      largestComponentSize: largestComponent,
    });
  }

  // Sort: largest component DESC, nodeId ASC
  hints.sort((a, b) => {
    if (a.largestComponentSize !== b.largestComponentSize)
      return b.largestComponentSize - a.largestComponentSize;
    return a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0;
  });

  return hints.slice(0, maxHints);
}

/**
 * Compute the size of the largest connected component when a node
 * is removed from the undirected graph.
 */
function computeLargestComponentWithout(
  memberIds: readonly string[],
  adj: ReadonlyMap<string, readonly string[]>,
  removedId: string
): number {
  const visited = new Set<string>();
  visited.add(removedId); // Treat as already visited (removed)
  let largest = 0;

  for (const startId of memberIds) {
    if (visited.has(startId)) continue;

    // BFS to find component size
    let size = 0;
    const queue = [startId];
    visited.add(startId);
    while (queue.length > 0) {
      const current = queue.shift()!;
      size++;
      for (const neighbor of adj.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    if (size > largest) largest = size;
  }

  return largest;
}
