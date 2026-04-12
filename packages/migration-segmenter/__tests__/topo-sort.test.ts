import { describe, expect, it } from 'vitest';
import { assignWaves } from '../src/topo-sort.ts';
import type { DirectedGraph } from '../src/scc.ts';
import { SegmenterInvariantError } from '../src/errors.ts';

describe('SEG-1.4 — topological sort + wave assignment', () => {
  it('empty graph → empty map', () => {
    const waves = assignWaves(new Map());
    expect(waves.size).toBe(0);
  });

  it('single node, no edges → wave 0', () => {
    const dag: DirectedGraph = new Map([['a', []]]);
    const waves = assignWaves(dag);
    expect(waves.get('a')).toBe(0);
  });

  it('linear chain A→B→C → waves 0, 1, 2', () => {
    const dag: DirectedGraph = new Map([
      ['a', ['b']],
      ['b', ['c']],
      ['c', []],
    ]);
    const waves = assignWaves(dag);
    expect(waves.get('a')).toBe(0);
    expect(waves.get('b')).toBe(1);
    expect(waves.get('c')).toBe(2);
  });

  it('diamond: A→B, A→C, B→D, C→D → A=0, B=C=1, D=2', () => {
    const dag: DirectedGraph = new Map([
      ['a', ['b', 'c']],
      ['b', ['d']],
      ['c', ['d']],
      ['d', []],
    ]);
    const waves = assignWaves(dag);
    expect(waves.get('a')).toBe(0);
    expect(waves.get('b')).toBe(1);
    expect(waves.get('c')).toBe(1);
    expect(waves.get('d')).toBe(2);
  });

  it('two independent chains → both start at wave 0', () => {
    const dag: DirectedGraph = new Map([
      ['a', ['b']],
      ['b', []],
      ['x', ['y']],
      ['y', []],
    ]);
    const waves = assignWaves(dag);
    expect(waves.get('a')).toBe(0);
    expect(waves.get('x')).toBe(0);
    expect(waves.get('b')).toBe(1);
    expect(waves.get('y')).toBe(1);
  });

  it('islands (no edges) are wave 0', () => {
    const dag: DirectedGraph = new Map([
      ['island1', []],
      ['island2', []],
      ['a', ['b']],
      ['b', []],
    ]);
    const waves = assignWaves(dag);
    expect(waves.get('island1')).toBe(0);
    expect(waves.get('island2')).toBe(0);
    expect(waves.get('a')).toBe(0);
    expect(waves.get('b')).toBe(1);
  });

  it('throws on cyclic input (defensive)', () => {
    const dag: DirectedGraph = new Map([
      ['a', ['b']],
      ['b', ['a']],
    ]);
    expect(() => assignWaves(dag)).toThrow(SegmenterInvariantError);
  });

  it('deterministic: same input → same output', () => {
    const dag: DirectedGraph = new Map([
      ['z', ['y']],
      ['y', ['x']],
      ['x', []],
      ['w', ['v']],
      ['v', []],
    ]);
    const r1 = JSON.stringify([...assignWaves(dag).entries()].sort());
    const r2 = JSON.stringify([...assignWaves(dag).entries()].sort());
    expect(r1).toBe(r2);
  });

  it('wave count = max wave + 1', () => {
    const dag: DirectedGraph = new Map([
      ['a', ['b']],
      ['b', ['c']],
      ['c', ['d']],
      ['d', []],
    ]);
    const waves = assignWaves(dag);
    const maxWave = Math.max(...waves.values());
    expect(maxWave).toBe(3); // 4 waves (0,1,2,3)
  });

  it('wide fan: A→B1,B2,...,B10 → A=0, all Bi=1', () => {
    const dag: DirectedGraph = new Map<string, string[]>();
    const targets = Array.from({ length: 10 }, (_, i) => `b${i}`);
    dag.set('a', targets);
    for (const t of targets) dag.set(t, []);
    const waves = assignWaves(dag);
    expect(waves.get('a')).toBe(0);
    for (const t of targets) expect(waves.get(t)).toBe(1);
  });
});
