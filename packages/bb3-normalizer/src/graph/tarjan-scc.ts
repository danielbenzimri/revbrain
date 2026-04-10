/**
 * Tarjan's strongly-connected-components algorithm, ITERATIVE.
 *
 * Spec: §8.3 (cycle detection).
 *
 * Detects cycles in the IR dependency graph in O(V + E) time. The
 * implementation is iterative (not recursive) so it can handle the
 * 1000-node dependency chains real-world CPQ orgs produce without
 * blowing Node's recursion stack.
 *
 * The output is deterministic:
 *
 * - Components are sorted by their smallest member ID.
 * - Within each component, members are sorted lexicographically.
 * - Input order has no effect on the output — Tarjan's algorithm
 *   is input-order-sensitive in the naive form, so this
 *   implementation pre-sorts the node list before iterating.
 *
 * Self-loops (`A → A`) are detected as size-1 components with
 * `isSelfLoop: true`; all other components of size 1 are omitted
 * from the output (they are not cycles).
 */

/**
 * One strongly-connected component.
 *
 * `members.length >= 2` for proper cycles, or `members.length === 1`
 * with `isSelfLoop: true` for a node that depends on itself.
 */
export interface StronglyConnectedComponent {
  members: string[];
  isSelfLoop: boolean;
}

/**
 * Find every strongly-connected component (of size ≥ 2, OR of size
 * 1 with a self-loop) in the directed graph.
 *
 * @param nodeIds   Every node in the graph. Nodes with no outgoing
 *                  edges MUST still appear here.
 * @param outEdges  `nodeId → [targetNodeId, ...]`. Missing keys are
 *                  treated as "no outgoing edges".
 */
export function findStronglyConnectedComponents(
  nodeIds: readonly string[],
  outEdges: Map<string, readonly string[]>
): StronglyConnectedComponent[] {
  // Determinism: pre-sort node IDs so DFS roots are always visited
  // in the same order regardless of input ordering.
  const sortedNodeIds = [...nodeIds].sort();

  // Tarjan bookkeeping.
  const indexOf = new Map<string, number>();
  const lowlinkOf = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  let nextIndex = 0;

  const components: StronglyConnectedComponent[] = [];

  /**
   * Explicit work stack for the iterative DFS. Each entry describes
   * where we are in the traversal of a given node:
   *
   * - `nodeId`    — which node we are processing
   * - `succIdx`   — index into that node's successor list we should
   *                 visit next
   *
   * The top of `workStack` is the node we are currently exploring.
   */
  interface Frame {
    nodeId: string;
    successors: readonly string[];
    succIdx: number;
  }
  const workStack: Frame[] = [];

  /** Detect self-loops on a single node by scanning its successors. */
  function hasSelfLoop(nodeId: string): boolean {
    const succs = outEdges.get(nodeId) ?? [];
    for (const s of succs) {
      if (s === nodeId) return true;
    }
    return false;
  }

  /** Start Tarjan's DFS rooted at `start`. */
  function strongconnect(start: string): void {
    // Push initial frame.
    indexOf.set(start, nextIndex);
    lowlinkOf.set(start, nextIndex);
    nextIndex++;
    stack.push(start);
    onStack.add(start);
    workStack.push({
      nodeId: start,
      successors: outEdges.get(start) ?? [],
      succIdx: 0,
    });

    while (workStack.length > 0) {
      const frame = workStack[workStack.length - 1]!;
      const { nodeId } = frame;

      if (frame.succIdx < frame.successors.length) {
        const w = frame.successors[frame.succIdx]!;
        frame.succIdx++;

        if (!indexOf.has(w)) {
          // Unvisited successor — descend.
          indexOf.set(w, nextIndex);
          lowlinkOf.set(w, nextIndex);
          nextIndex++;
          stack.push(w);
          onStack.add(w);
          workStack.push({
            nodeId: w,
            successors: outEdges.get(w) ?? [],
            succIdx: 0,
          });
        } else if (onStack.has(w)) {
          // Already on the Tarjan stack: update lowlink.
          const current = lowlinkOf.get(nodeId)!;
          const wIndex = indexOf.get(w)!;
          if (wIndex < current) {
            lowlinkOf.set(nodeId, wIndex);
          }
        }
        // If w is visited but not on the stack, it belongs to a
        // different SCC that's already been emitted — ignore.
        continue;
      }

      // Finished exploring all successors of `nodeId`. Pop the frame.
      workStack.pop();

      // If lowlink === index, nodeId is the root of an SCC.
      if (lowlinkOf.get(nodeId) === indexOf.get(nodeId)) {
        const members: string[] = [];
        while (true) {
          const w = stack.pop()!;
          onStack.delete(w);
          members.push(w);
          if (w === nodeId) break;
        }
        // Emit components of size ≥ 2, or size 1 with a self-loop.
        if (members.length >= 2) {
          components.push({
            members: [...members].sort(),
            isSelfLoop: false,
          });
        } else if (members.length === 1 && hasSelfLoop(members[0]!)) {
          components.push({
            members: [members[0]!],
            isSelfLoop: true,
          });
        }
        // else: size-1 SCC with no self-loop — not a cycle, drop it.
      }

      // Propagate lowlink to the caller (if any).
      if (workStack.length > 0) {
        const parent = workStack[workStack.length - 1]!;
        const parentLow = lowlinkOf.get(parent.nodeId)!;
        const childLow = lowlinkOf.get(nodeId)!;
        if (childLow < parentLow) {
          lowlinkOf.set(parent.nodeId, childLow);
        }
      }
    }
  }

  for (const nodeId of sortedNodeIds) {
    if (!indexOf.has(nodeId)) {
      strongconnect(nodeId);
    }
  }

  // Final sort: by smallest member of each component.
  components.sort((a, b) => {
    const aMin = a.members[0]!;
    const bMin = b.members[0]!;
    return aMin < bMin ? -1 : aMin > bMin ? 1 : 0;
  });

  return components;
}
