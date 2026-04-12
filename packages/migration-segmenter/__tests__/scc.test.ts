import { describe, expect, it } from 'vitest';
import { tarjanSCC, type DirectedGraph } from '../src/scc.ts';

describe('SEG-1.3 — Tarjan SCC (local implementation)', () => {
  it('empty graph → no SCCs', () => {
    const sccs = tarjanSCC(new Set(), new Map());
    expect(sccs).toEqual([]);
  });

  it('single node, no edges → one singleton SCC', () => {
    const sccs = tarjanSCC(new Set(['a']), new Map());
    expect(sccs).toEqual([['a']]);
  });

  it('linear chain A→B→C → 3 singleton SCCs', () => {
    const g: DirectedGraph = new Map([
      ['a', ['b']],
      ['b', ['c']],
    ]);
    const sccs = tarjanSCC(new Set(['a', 'b', 'c']), g);
    expect(sccs).toHaveLength(3);
    // Each SCC has exactly 1 member
    for (const scc of sccs) expect(scc).toHaveLength(1);
  });

  it('cycle A→B→A → one SCC with 2 members', () => {
    const g: DirectedGraph = new Map([
      ['a', ['b']],
      ['b', ['a']],
    ]);
    const sccs = tarjanSCC(new Set(['a', 'b']), g);
    const big = sccs.find((s) => s.length > 1);
    expect(big).toBeDefined();
    expect(big!.sort()).toEqual(['a', 'b']);
  });

  it('triangle cycle A→B→C→A → one SCC with 3 members', () => {
    const g: DirectedGraph = new Map([
      ['a', ['b']],
      ['b', ['c']],
      ['c', ['a']],
    ]);
    const sccs = tarjanSCC(new Set(['a', 'b', 'c']), g);
    expect(sccs).toHaveLength(1);
    expect(sccs[0]!.sort()).toEqual(['a', 'b', 'c']);
  });

  it('two separate cycles', () => {
    const g: DirectedGraph = new Map([
      ['a', ['b']],
      ['b', ['a']],
      ['c', ['d']],
      ['d', ['c']],
    ]);
    const sccs = tarjanSCC(new Set(['a', 'b', 'c', 'd']), g);
    expect(sccs).toHaveLength(2);
    const sorted = sccs.map((s) => s.sort().join(',')).sort();
    expect(sorted).toEqual(['a,b', 'c,d']);
  });

  it('deterministic: same input → same output', () => {
    const g: DirectedGraph = new Map([
      ['x', ['y']],
      ['y', ['z']],
      ['z', ['x']],
    ]);
    const nodes = new Set(['x', 'y', 'z']);
    const r1 = JSON.stringify(tarjanSCC(nodes, g));
    const r2 = JSON.stringify(tarjanSCC(nodes, g));
    expect(r1).toBe(r2);
  });

  it('nodes with no edges but registered → singleton SCCs', () => {
    const g: DirectedGraph = new Map([['a', ['b']]]);
    const sccs = tarjanSCC(new Set(['a', 'b', 'orphan']), g);
    expect(sccs).toHaveLength(3);
    expect(sccs.find((s) => s.includes('orphan'))).toEqual(['orphan']);
  });
});
