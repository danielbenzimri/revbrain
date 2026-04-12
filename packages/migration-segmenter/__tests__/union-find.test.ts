import { describe, expect, it } from 'vitest';
import { UnionFind } from '../src/union-find.ts';

describe('SEG-1.2 — UnionFind', () => {
  it('find returns self for isolated elements', () => {
    const uf = new UnionFind();
    uf.add('a');
    uf.add('b');
    expect(uf.find('a')).toBe('a');
    expect(uf.find('b')).toBe('b');
  });

  it('union merges two elements', () => {
    const uf = new UnionFind();
    uf.add('a');
    uf.add('b');
    uf.union('a', 'b');
    expect(uf.find('a')).toBe(uf.find('b'));
  });

  it('connected returns true after union', () => {
    const uf = new UnionFind();
    uf.add('x');
    uf.add('y');
    expect(uf.connected('x', 'y')).toBe(false);
    uf.union('x', 'y');
    expect(uf.connected('x', 'y')).toBe(true);
  });

  it('transitive union: a-b + b-c → a connected to c', () => {
    const uf = new UnionFind();
    uf.add('a');
    uf.add('b');
    uf.add('c');
    uf.union('a', 'b');
    uf.union('b', 'c');
    expect(uf.connected('a', 'c')).toBe(true);
  });

  it('components returns sorted member lists', () => {
    const uf = new UnionFind();
    ['d', 'b', 'a', 'c'].forEach((x) => uf.add(x));
    uf.union('a', 'c');
    uf.union('b', 'd');
    const comps = uf.components();
    expect(comps.size).toBe(2);
    // Each component's members are sorted
    for (const members of comps.values()) {
      const sorted = [...members].sort();
      expect(members).toEqual(sorted);
    }
    // Check correct grouping
    const memberSets = [...comps.values()].map((m) => m.join(','));
    expect(memberSets.sort()).toEqual(['a,c', 'b,d']);
  });

  it('singleton components are correct', () => {
    const uf = new UnionFind();
    uf.add('x');
    uf.add('y');
    const comps = uf.components();
    expect(comps.size).toBe(2);
    expect(comps.get(uf.find('x'))).toEqual(['x']);
    expect(comps.get(uf.find('y'))).toEqual(['y']);
  });

  it('handles 10,000 elements without stack overflow', () => {
    const uf = new UnionFind();
    for (let i = 0; i < 10_000; i++) {
      uf.add(`n-${String(i).padStart(5, '0')}`);
    }
    // Chain union: 0→1→2→...→9999
    for (let i = 1; i < 10_000; i++) {
      uf.union(`n-${String(i - 1).padStart(5, '0')}`, `n-${String(i).padStart(5, '0')}`);
    }
    // All should be in one component
    const comps = uf.components();
    expect(comps.size).toBe(1);
    const members = [...comps.values()][0]!;
    expect(members.length).toBe(10_000);
  });

  it('deterministic: same operations in same order → same components', () => {
    const build = () => {
      const uf = new UnionFind();
      ['e', 'a', 'c', 'b', 'd'].forEach((x) => uf.add(x));
      uf.union('a', 'b');
      uf.union('c', 'd');
      uf.union('a', 'c');
      return JSON.stringify([...uf.components().entries()].sort());
    };
    expect(build()).toBe(build());
  });

  it('add is idempotent', () => {
    const uf = new UnionFind();
    uf.add('x');
    uf.add('x');
    expect(uf.size).toBe(1);
  });

  it('union of self is no-op', () => {
    const uf = new UnionFind();
    uf.add('x');
    uf.union('x', 'x');
    expect(uf.find('x')).toBe('x');
    expect(uf.components().size).toBe(1);
  });
});
