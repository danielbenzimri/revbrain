import { describe, expect, it } from 'vitest';
import { DEFAULT_APEX_PARSE_BUDGET, createGlobalBudgetState, parseApexClass } from './apex.ts';

describe('PH2.5 — parseApexClass', () => {
  it('parses a tiny class without hitting any budgets', async () => {
    const source = `public class Foo {
      public SBQQ__Quote__c q = new SBQQ__Quote__c();
      public Decimal amount = q.SBQQ__NetAmount__c;
    }`;
    const result = await parseApexClass(source, {
      globalState: createGlobalBudgetState(),
    });
    expect(result.parseStatus === 'parsed' || result.parseStatus === 'partial').toBe(true);
    expect(result.fieldRefs.length).toBeGreaterThan(0);
    expect(result.lineCount).toBeGreaterThan(0);
  });

  it('extracts dotted field references via the regex fallback', async () => {
    const source = `public class Foo {
      public void m() {
        SBQQ__Quote__c q = queryQuote();
        Decimal amt = q.SBQQ__NetAmount__c;
      }
    }`;
    const result = await parseApexClass(source, {
      globalState: createGlobalBudgetState(),
    });
    const hasNet = result.fieldRefs.some(
      (f) =>
        (f.kind === 'field' && f.field === 'SBQQ__NetAmount__c') ||
        (f.kind === 'path' && f.terminalField === 'SBQQ__NetAmount__c')
    );
    expect(hasNet).toBe(true);
  });

  it('extracts record.get("Field") as a resolved ref', async () => {
    const source = `public class Foo {
      public void m(SObject r) {
        Object v = r.get('Amount__c');
      }
    }`;
    const result = await parseApexClass(source, {
      globalState: createGlobalBudgetState(),
    });
    const hasAmt = result.fieldRefs.some((f) => f.kind === 'field' && f.field === 'Amount__c');
    expect(hasAmt).toBe(true);
  });

  it('flags hasDynamicFieldRef on record.get(variable)', async () => {
    const source = `public class Foo {
      public void m(SObject r, String fieldVar) {
        Object v = r.get(fieldVar);
      }
    }`;
    const result = await parseApexClass(source, {
      globalState: createGlobalBudgetState(),
    });
    expect(result.hasDynamicFieldRef).toBe(true);
  });

  it('detects the SBQQ.TriggerControl pattern', async () => {
    const source = `public class Foo {
      public void m() {
        SBQQ.TriggerControl.disable();
      }
    }`;
    const result = await parseApexClass(source, {
      globalState: createGlobalBudgetState(),
    });
    expect(result.hasTriggerControl).toBe(true);
  });

  it('counts HTTP callouts', async () => {
    const source = `public class Foo {
      public void m() {
        HttpRequest req = new HttpRequest();
        Http h = new Http();
        HttpResponse resp = h.send(req);
      }
    }`;
    const result = await parseApexClass(source, {
      globalState: createGlobalBudgetState(),
    });
    expect(result.calloutCount).toBeGreaterThanOrEqual(2);
  });

  it('detects @isTest annotation', async () => {
    const source = `@isTest
    public class FooTest {
      public static void t() {}
    }`;
    const result = await parseApexClass(source, {
      globalState: createGlobalBudgetState(),
    });
    expect(result.isTestClass).toBe(true);
  });

  it('extracts put-written fields into writtenFields', async () => {
    const source = `public class Foo {
      public void m(SObject q) {
        q.put('SBQQ__Discount__c', 10);
      }
    }`;
    const result = await parseApexClass(source, {
      globalState: createGlobalBudgetState(),
    });
    expect(result.writtenFields.length).toBeGreaterThanOrEqual(1);
  });

  describe('deterministic budgets (NO wall-clock timeouts)', () => {
    it('source > maxBytesPerClass returns size-limit-skipped', async () => {
      const big = 'x'.repeat(201_000);
      const state = createGlobalBudgetState();
      const result = await parseApexClass(big, { globalState: state });
      expect(result.parseStatus).toBe('size-limit-skipped');
      expect(state.bytesConsumed).toBe(201_000);
    });

    it('global budget exhausted returns budget-skipped', async () => {
      const state = createGlobalBudgetState();
      state.bytesConsumed = DEFAULT_APEX_PARSE_BUDGET.globalMaxBytes;
      const result = await parseApexClass('class Foo {}', { globalState: state });
      expect(result.parseStatus).toBe('budget-skipped');
    });

    it('custom per-class budget is respected', async () => {
      const state = createGlobalBudgetState();
      const result = await parseApexClass('x'.repeat(200), {
        globalState: state,
        budget: {
          maxBytesPerClass: 100,
          maxNodesPerClass: 1000,
          maxDepthPerClass: 50,
          globalMaxBytes: 1_000_000,
        },
      });
      expect(result.parseStatus).toBe('size-limit-skipped');
    });
  });

  it('never throws on garbage input', async () => {
    await expect(
      parseApexClass('@#$%^&*()', { globalState: createGlobalBudgetState() })
    ).resolves.toBeDefined();
  });

  it('deterministic: same input → same output across re-runs', async () => {
    const source = `public class Foo {
      public SBQQ__Quote__c q;
      public Decimal a = q.SBQQ__NetAmount__c;
    }`;
    const a = await parseApexClass(source, { globalState: createGlobalBudgetState() });
    const b = await parseApexClass(source, { globalState: createGlobalBudgetState() });
    // Strip parseStatus since tree-sitter availability affects it;
    // all the derived fields must match.
    expect(a.lineCount).toBe(b.lineCount);
    expect(a.calloutCount).toBe(b.calloutCount);
    expect(a.hasTriggerControl).toBe(b.hasTriggerControl);
    expect(a.hasDynamicFieldRef).toBe(b.hasDynamicFieldRef);
    expect(a.isTestClass).toBe(b.isTestClass);
    expect(a.fieldRefs.length).toBe(b.fieldRefs.length);
  });
});
