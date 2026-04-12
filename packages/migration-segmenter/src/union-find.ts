/**
 * Union-Find (Disjoint-Set) with path compression + union-by-rank.
 *
 * Spec: docs/MIGRATION-SEGMENTER-DESIGN.md §5.1.
 * Task: SEG-1.2.
 *
 * Used by Phase 1 (strong-edge grouping) and Phase 2 (SCC merge).
 * The representative of a component is an implementation detail —
 * final segment IDs are computed in Phase 4 (SEG-2.1).
 */

export class UnionFind {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  /** Register an element. Idempotent. */
  add(x: string): void {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
  }

  /**
   * Find the representative of x's component.
   * Uses path compression for amortized near-O(1).
   */
  find(x: string): string {
    let root = x;
    // Walk to root
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    // Path compression: point all nodes on the path to root
    let current = x;
    while (current !== root) {
      const next = this.parent.get(current)!;
      this.parent.set(current, root);
      current = next;
    }
    return root;
  }

  /**
   * Merge x's and y's components. Returns the new representative.
   * Uses union-by-rank for balanced trees.
   */
  union(x: string, y: string): string {
    const rx = this.find(x);
    const ry = this.find(y);
    if (rx === ry) return rx;

    const rankX = this.rank.get(rx)!;
    const rankY = this.rank.get(ry)!;

    if (rankX < rankY) {
      this.parent.set(rx, ry);
      return ry;
    } else if (rankX > rankY) {
      this.parent.set(ry, rx);
      return rx;
    } else {
      this.parent.set(ry, rx);
      this.rank.set(rx, rankX + 1);
      return rx;
    }
  }

  /** Check if x and y are in the same component. */
  connected(x: string, y: string): boolean {
    return this.find(x) === this.find(y);
  }

  /**
   * Enumerate all components. Returns a map from representative →
   * sorted member list. Deterministic: members sorted by ID.
   */
  components(): Map<string, string[]> {
    const result = new Map<string, string[]>();
    for (const id of this.parent.keys()) {
      const rep = this.find(id);
      let list = result.get(rep);
      if (!list) {
        list = [];
        result.set(rep, list);
      }
      list.push(id);
    }
    // Sort each member list for determinism
    for (const list of result.values()) {
      list.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    }
    return result;
  }

  /** Number of registered elements. */
  get size(): number {
    return this.parent.size;
  }
}
