/**
 * Tarjan's SCC algorithm — local implementation.
 *
 * Spec: docs/MIGRATION-SEGMENTER-DESIGN.md §5.2.
 * Task: SEG-1.3.
 *
 * Finds strongly connected components in a directed graph.
 * Local to this package — NOT imported from bb3-normalizer
 * (thin-dependency rule).
 *
 * Returns SCCs in reverse topological order (standard Tarjan
 * property): the first SCC in the output has no outgoing edges
 * to later SCCs.
 */

/**
 * Directed graph as adjacency list.
 * Keys = node IDs. Values = outgoing neighbor IDs.
 * Missing key = node with no outgoing edges.
 */
export type DirectedGraph = Map<string, string[]>;

/**
 * Find all strongly connected components using Tarjan's algorithm.
 *
 * @param nodes All node IDs (some may not appear in `graph` as keys).
 * @param graph Directed adjacency list.
 * @returns Array of SCCs, each a sorted array of node IDs.
 *          SCCs are in reverse topological order.
 */
export function tarjanSCC(nodes: ReadonlySet<string>, graph: DirectedGraph): string[][] {
  let index = 0;
  const nodeIndex = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];

  function strongConnect(v: string): void {
    nodeIndex.set(v, index);
    lowLink.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    const neighbors = graph.get(v);
    if (neighbors) {
      for (const w of neighbors) {
        if (!nodeIndex.has(w)) {
          strongConnect(w);
          lowLink.set(v, Math.min(lowLink.get(v)!, lowLink.get(w)!));
        } else if (onStack.has(w)) {
          lowLink.set(v, Math.min(lowLink.get(v)!, nodeIndex.get(w)!));
        }
      }
    }

    if (lowLink.get(v) === nodeIndex.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      // Sort for determinism
      scc.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      sccs.push(scc);
    }
  }

  // Process nodes in sorted order for determinism
  const sortedNodes = [...nodes].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const v of sortedNodes) {
    if (!nodeIndex.has(v)) {
      strongConnect(v);
    }
  }

  return sccs;
}
