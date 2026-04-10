import { describe, expect, it } from 'vitest';
import { resolvedRef, unresolvedRef, type NodeRef, type UnresolvedReason } from './node-ref.ts';

describe('PH0.4 — NodeRef', () => {
  describe('resolvedRef()', () => {
    it('returns resolved: true with the given id', () => {
      const ref = resolvedRef('node-abc');
      expect(ref.resolved).toBe(true);
      expect(ref.id).toBe('node-abc');
    });

    it('narrows correctly in an `if (ref.resolved)` branch', () => {
      const ref: NodeRef = resolvedRef('node-xyz');
      if (ref.resolved) {
        // In this branch, `ref.id` is typed as `string`, not `string | null`.
        const id: string = ref.id;
        expect(id).toBe('node-xyz');
      } else {
        throw new Error('branch should not execute');
      }
    });
  });

  describe('unresolvedRef()', () => {
    it('returns resolved: false with id: null and the reason', () => {
      const ref = unresolvedRef('orphaned');
      expect(ref.resolved).toBe(false);
      expect(ref.id).toBeNull();
      if (!ref.resolved) {
        expect(ref.reason).toBe('orphaned');
      }
    });

    it('includes hint when provided', () => {
      const ref = unresolvedRef('unknown-target', 'parent rule a0V3 not in findings');
      if (!ref.resolved) {
        expect(ref.hint).toBe('parent rule a0V3 not in findings');
      }
    });

    it('includes sourceField when provided', () => {
      const ref = unresolvedRef('out-of-scope', undefined, 'SBQQ__ParentRule__c');
      if (!ref.resolved) {
        expect(ref.sourceField).toBe('SBQQ__ParentRule__c');
        expect(ref.hint).toBeUndefined();
      }
    });

    it.each<UnresolvedReason>([
      'orphaned',
      'out-of-scope',
      'parse-failure',
      'dynamic',
      'unknown-target',
    ])('accepts reason %s', (reason) => {
      const ref = unresolvedRef(reason);
      if (!ref.resolved) {
        expect(ref.reason).toBe(reason);
      }
    });

    it('does not set hint/sourceField keys when undefined (undefined policy)', () => {
      // canonicalJson (PH1.1) silently omits undefined properties. Still, the
      // helper should avoid emitting literal `undefined` keys so downstream
      // tools doing Object.keys() see exactly what was intended.
      const ref = unresolvedRef('dynamic');
      if (!ref.resolved) {
        expect('hint' in ref).toBe(false);
        expect('sourceField' in ref).toBe(false);
      }
    });
  });

  describe('narrowing proof', () => {
    it('type-level: unresolved branch sees `reason` and `id: null`', () => {
      const refs: NodeRef[] = [resolvedRef('a'), unresolvedRef('dynamic', 'fieldVar')];
      const resolvedIds: string[] = [];
      const unresolvedReasons: UnresolvedReason[] = [];
      for (const ref of refs) {
        if (ref.resolved) {
          resolvedIds.push(ref.id);
        } else {
          unresolvedReasons.push(ref.reason);
        }
      }
      expect(resolvedIds).toEqual(['a']);
      expect(unresolvedReasons).toEqual(['dynamic']);
    });
  });
});
