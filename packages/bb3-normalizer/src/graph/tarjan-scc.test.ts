import { describe, expect, it } from 'vitest';
import { findStronglyConnectedComponents } from './tarjan-scc.ts';

function edges(map: Record<string, string[]>): Map<string, string[]> {
  return new Map(Object.entries(map));
}

describe('PH2.1 — Tarjan SCC (iterative)', () => {
  it('empty input returns no components', () => {
    expect(findStronglyConnectedComponents([], new Map())).toEqual([]);
  });

  it('DAG input returns zero SCCs', () => {
    // A → B → C
    const result = findStronglyConnectedComponents(['A', 'B', 'C'], edges({ A: ['B'], B: ['C'] }));
    expect(result).toEqual([]);
  });

  it('simple 2-cycle returns one SCC sorted', () => {
    // A → B → A
    const result = findStronglyConnectedComponents(['A', 'B'], edges({ A: ['B'], B: ['A'] }));
    expect(result).toEqual([{ members: ['A', 'B'], isSelfLoop: false }]);
  });

  it('self-loop is detected and flagged', () => {
    // A → A
    const result = findStronglyConnectedComponents(['A'], edges({ A: ['A'] }));
    expect(result).toEqual([{ members: ['A'], isSelfLoop: true }]);
  });

  it('isolated node is not reported as a cycle', () => {
    const result = findStronglyConnectedComponents(['A'], new Map());
    expect(result).toEqual([]);
  });

  it('3-node SCC sorted by member id', () => {
    // A → B → C → A
    const result = findStronglyConnectedComponents(
      ['A', 'B', 'C'],
      edges({ A: ['B'], B: ['C'], C: ['A'] })
    );
    expect(result).toEqual([{ members: ['A', 'B', 'C'], isSelfLoop: false }]);
  });

  it('multiple SCCs returned in deterministic order (sorted by min member)', () => {
    // Two disjoint cycles: {X, Y} and {A, B}. A/B should come first.
    const result = findStronglyConnectedComponents(
      ['X', 'Y', 'A', 'B'],
      edges({ X: ['Y'], Y: ['X'], A: ['B'], B: ['A'] })
    );
    expect(result).toEqual([
      { members: ['A', 'B'], isSelfLoop: false },
      { members: ['X', 'Y'], isSelfLoop: false },
    ]);
  });

  it('SCC with tail does not pull the tail into the cycle', () => {
    // A → B → C → A, plus D → A (D is outside the cycle)
    const result = findStronglyConnectedComponents(
      ['A', 'B', 'C', 'D'],
      edges({ A: ['B'], B: ['C'], C: ['A'], D: ['A'] })
    );
    expect(result).toEqual([{ members: ['A', 'B', 'C'], isSelfLoop: false }]);
  });

  it('input order has no effect on output ordering', () => {
    const a = findStronglyConnectedComponents(
      ['A', 'B', 'C'],
      edges({ A: ['B'], B: ['C'], C: ['A'] })
    );
    const b = findStronglyConnectedComponents(
      ['C', 'A', 'B'],
      edges({ C: ['A'], A: ['B'], B: ['C'] })
    );
    expect(a).toEqual(b);
  });

  it('1000-node chain does not stack-overflow and returns 0 SCCs', () => {
    const nodeIds: string[] = [];
    const map: Record<string, string[]> = {};
    for (let i = 0; i < 1000; i++) {
      const id = `n${i}`;
      nodeIds.push(id);
      if (i < 999) map[id] = [`n${i + 1}`];
    }
    const result = findStronglyConnectedComponents(nodeIds, edges(map));
    expect(result).toEqual([]);
  });

  it('1000-node cycle does not stack-overflow and returns one SCC', () => {
    const nodeIds: string[] = [];
    const map: Record<string, string[]> = {};
    for (let i = 0; i < 1000; i++) {
      const id = `n${i.toString().padStart(4, '0')}`;
      nodeIds.push(id);
      map[id] = [`n${((i + 1) % 1000).toString().padStart(4, '0')}`];
    }
    const result = findStronglyConnectedComponents(nodeIds, edges(map));
    expect(result.length).toBe(1);
    expect(result[0]!.members.length).toBe(1000);
    expect(result[0]!.isSelfLoop).toBe(false);
  });

  it('nested SCCs: figure-8 produces a single enclosing SCC', () => {
    // A→B→A + B→C→B (shared node B) — Tarjan collapses into one SCC {A,B,C}
    const result = findStronglyConnectedComponents(
      ['A', 'B', 'C'],
      edges({ A: ['B'], B: ['A', 'C'], C: ['B'] })
    );
    expect(result).toEqual([{ members: ['A', 'B', 'C'], isSelfLoop: false }]);
  });

  it('combined: a proper SCC and a self-loop node', () => {
    // Two-cycle {A,B} and self-loop on X
    const result = findStronglyConnectedComponents(
      ['A', 'B', 'X'],
      edges({ A: ['B'], B: ['A'], X: ['X'] })
    );
    expect(result).toEqual([
      { members: ['A', 'B'], isSelfLoop: false },
      { members: ['X'], isSelfLoop: true },
    ]);
  });
});
