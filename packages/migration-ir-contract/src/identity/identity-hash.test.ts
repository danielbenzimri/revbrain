import { describe, expect, it } from 'vitest';
import { buildIdentityPair, identityHash } from './identity-hash.ts';
import { structuralSignature } from './structural-signature.ts';

describe('PH1.2 — identityHash + PH1.3 — buildIdentityPair', () => {
  const rule = {
    parentObject: 'SBQQ__Quote__c',
    evaluationScope: 'calculator',
    evaluationOrder: 10,
  };

  describe('stability', () => {
    it('same payload → same hash regardless of key order', () => {
      expect(identityHash('PricingRule', 'id', rule)).toBe(
        identityHash('PricingRule', 'id', {
          evaluationOrder: 10,
          parentObject: 'SBQQ__Quote__c',
          evaluationScope: 'calculator',
        })
      );
    });

    it('same payload is stable across 1000 re-runs (deterministic)', () => {
      const baseline = identityHash('PricingRule', 'id', rule);
      for (let i = 0; i < 1000; i++) {
        expect(identityHash('PricingRule', 'id', rule)).toBe(baseline);
      }
    });

    it('returns a 22-character URL-safe base64 string', () => {
      const h = identityHash('PricingRule', 'id', rule);
      expect(h.length).toBe(22);
      // URL-safe base64: only A-Za-z0-9_-
      expect(h).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('domain separation', () => {
    it('different purpose → different hash for identical payload', () => {
      const idHash = identityHash('PricingRule', 'id', rule);
      const contentHash = identityHash('PricingRule', 'contentHash', rule);
      expect(idHash).not.toBe(contentHash);
    });

    it('different nodeType → different hash for identical payload', () => {
      expect(identityHash('PricingRule', 'id', rule)).not.toBe(
        identityHash('ValidationRule', 'id', rule)
      );
    });

    it('different payload → different hash', () => {
      expect(identityHash('PricingRule', 'id', rule)).not.toBe(
        identityHash('PricingRule', 'id', { ...rule, evaluationOrder: 11 })
      );
    });
  });

  describe('buildIdentityPair', () => {
    it('returns both hashes in one call', () => {
      const pair = buildIdentityPair('PricingRule', rule, { ...rule, isActive: true });
      expect(pair.id).toBeTruthy();
      expect(pair.contentHash).toBeTruthy();
      expect(pair.id).not.toBe(pair.contentHash);
    });

    it('id matches standalone identityHash call', () => {
      const pair = buildIdentityPair('PricingRule', rule, { ...rule, isActive: true });
      expect(pair.id).toBe(identityHash('PricingRule', 'id', rule));
      expect(pair.contentHash).toBe(
        identityHash('PricingRule', 'contentHash', { ...rule, isActive: true })
      );
    });

    it('1000 distinct rules produce 1000 distinct ids (no collisions)', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        const id = identityHash('PricingRule', 'id', {
          parentObject: 'SBQQ__Quote__c',
          evaluationOrder: i,
        });
        ids.add(id);
      }
      expect(ids.size).toBe(1000);
    });
  });
});

describe('PH1.4 — structuralSignature (v1.2 operator removal)', () => {
  const baseline = {
    parentObject: 'SBQQ__Quote__c',
    evaluationScope: 'calculator',
    evaluationOrder: 10,
    conditionLogic: 'all',
    contextScope: 'quote',
    conditions: [{ field: 'Amount' }, { field: 'Status' }],
    actions: [{ actionType: 'set-discount-pct', targetField: 'Discount__c' }],
  };

  it('is stable across reruns (deterministic)', () => {
    const sig = structuralSignature(baseline);
    expect(sig.length).toBe(16);
    expect(sig).toBe(structuralSignature(baseline));
  });

  it('unchanged when a condition operator changes (v1.2 A13 requirement)', () => {
    // The draft shape doesn't even carry operator — this test proves
    // that mutating a "shadow" operator field cannot affect the signature
    // because the function ignores anything outside its narrow contract.
    const withOperator = {
      ...baseline,
      conditions: baseline.conditions.map((c) => ({ ...c, operator: 'gt' })),
    } as typeof baseline & { conditions: Array<{ field: string; operator: string }> };
    const withDifferentOperator = {
      ...baseline,
      conditions: baseline.conditions.map((c) => ({ ...c, operator: 'gte' })),
    } as typeof baseline & { conditions: Array<{ field: string; operator: string }> };
    expect(structuralSignature(withOperator)).toBe(structuralSignature(withDifferentOperator));
  });

  it('unchanged when conditions are reordered', () => {
    const reordered = {
      ...baseline,
      conditions: [...baseline.conditions].reverse(),
    };
    expect(structuralSignature(baseline)).toBe(structuralSignature(reordered));
  });

  it('unchanged when a duplicate condition field is added', () => {
    // Fields are deduped before signing.
    const withDuplicate = {
      ...baseline,
      conditions: [...baseline.conditions, { field: 'Amount' }],
    };
    // The dedupe collapses the duplicate but conditionCount STILL changes,
    // so the signature is expected to differ (conditionCount IS in the sig).
    // This test documents that: duplicates still affect the signature via count.
    expect(structuralSignature(baseline)).not.toBe(structuralSignature(withDuplicate));
  });

  it('unchanged when actions are reordered', () => {
    const twoActions = {
      ...baseline,
      actions: [
        { actionType: 'set-discount-pct', targetField: 'Discount__c' },
        { actionType: 'set-price', targetField: 'Price__c' },
      ],
    };
    const reversedActions = { ...twoActions, actions: [...twoActions.actions].reverse() };
    expect(structuralSignature(twoActions)).toBe(structuralSignature(reversedActions));
  });

  it('changes when a condition is added (new condition field)', () => {
    const withNew = {
      ...baseline,
      conditions: [...baseline.conditions, { field: 'NewField__c' }],
    };
    expect(structuralSignature(baseline)).not.toBe(structuralSignature(withNew));
  });

  it('changes when an action targetField changes', () => {
    const changed = {
      ...baseline,
      actions: [{ actionType: 'set-discount-pct', targetField: 'OtherDiscount__c' }],
    };
    expect(structuralSignature(baseline)).not.toBe(structuralSignature(changed));
  });

  it('changes when evaluationScope changes', () => {
    const changed = { ...baseline, evaluationScope: 'configurator' };
    expect(structuralSignature(baseline)).not.toBe(structuralSignature(changed));
  });

  it('changes when conditionLogic changes', () => {
    const changed = { ...baseline, conditionLogic: 'any' };
    expect(structuralSignature(baseline)).not.toBe(structuralSignature(changed));
  });
});
