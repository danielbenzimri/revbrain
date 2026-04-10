import { describe, expect, it } from 'vitest';
import { parseCode, type ParseableDraft } from './s5-parse-code.ts';
import { prepareCatalog } from './s2-5-schema-catalog.ts';

describe('PH3.6 — parseCode orchestrator', () => {
  it('routes an apex draft to parseApexClass', async () => {
    const drafts: ParseableDraft[] = [
      {
        nodeId: 'auto-1',
        kind: 'apex',
        source: 'public class Foo { public Decimal a; }',
        developerName: 'Foo',
      },
    ];
    const result = await parseCode(drafts, { catalog: prepareCatalog() });
    expect(result.outcomes.length).toBe(1);
    expect(result.outcomes[0]!.kind).toBe('apex');
  });

  it('routes a formula draft to parseFormula', async () => {
    const drafts: ParseableDraft[] = [
      {
        nodeId: 'formula-1',
        kind: 'formula',
        source: 'Amount__c + 10',
        developerName: 'Total__c',
      },
    ];
    const result = await parseCode(drafts, { catalog: prepareCatalog() });
    expect(result.outcomes[0]!.kind).toBe('formula');
    if (result.outcomes[0]!.kind === 'formula') {
      expect(result.outcomes[0]!.result.parseStatus).toBe('parsed');
    }
  });

  it('routes a soql draft to extractSoqlFieldRefs', async () => {
    const drafts: ParseableDraft[] = [
      {
        nodeId: 'lookup-1',
        kind: 'soql',
        source: 'SELECT Id, Name FROM Account',
        developerName: 'LookupA',
      },
    ];
    const result = await parseCode(drafts, { catalog: prepareCatalog() });
    expect(result.outcomes[0]!.kind).toBe('soql');
    if (result.outcomes[0]!.kind === 'soql') {
      expect(result.outcomes[0]!.result.fromObject).toBe('Account');
    }
  });

  it('marks QCP drafts as deferred and counts lines', async () => {
    const drafts: ParseableDraft[] = [
      {
        nodeId: 'qcp-1',
        kind: 'qcp',
        source: 'function foo() {\n  return 1;\n}',
        developerName: 'MyScript',
      },
    ];
    const result = await parseCode(drafts, { catalog: prepareCatalog() });
    expect(result.outcomes[0]!.kind).toBe('qcp');
    if (result.outcomes[0]!.kind === 'qcp') {
      expect(result.outcomes[0]!.deferred).toBe(true);
      expect(result.outcomes[0]!.lineCount).toBeGreaterThan(0);
    }
  });

  it('processes drafts in deterministic (kind, developerName) order', async () => {
    const drafts: ParseableDraft[] = [
      { nodeId: 'f-z', kind: 'formula', source: '1', developerName: 'Z' },
      { nodeId: 'a-a', kind: 'apex', source: 'class X {}', developerName: 'A' },
      { nodeId: 'f-a', kind: 'formula', source: '1', developerName: 'A' },
      { nodeId: 'a-m', kind: 'apex', source: 'class Y {}', developerName: 'M' },
    ];
    const result = await parseCode(drafts, { catalog: prepareCatalog() });
    expect(result.outcomes.map((o) => o.nodeId)).toEqual(['a-a', 'a-m', 'f-a', 'f-z']);
  });

  it('respects global byte budget across apex classes', async () => {
    // Each source is ~100 chars; globalMaxBytes is 99 so AFTER A's
    // 100 bytes land, bytesConsumed (100) >= globalMaxBytes (99)
    // and B gets budget-skipped on its turn.
    const drafts: ParseableDraft[] = [
      {
        nodeId: 'auto-a',
        kind: 'apex',
        source: 'public class A {' + ' '.repeat(80) + '}',
        developerName: 'A',
      },
      {
        nodeId: 'auto-b',
        kind: 'apex',
        source: 'public class B {' + ' '.repeat(80) + '}',
        developerName: 'B',
      },
    ];
    const result = await parseCode(drafts, {
      catalog: prepareCatalog(),
      budget: {
        maxBytesPerClass: 200_000,
        maxNodesPerClass: 50_000,
        maxDepthPerClass: 50,
        globalMaxBytes: 50,
      },
    });
    const statusA = result.outcomes.find((o) => o.nodeId === 'auto-a');
    const statusB = result.outcomes.find((o) => o.nodeId === 'auto-b');
    // A parses first (alphabetical); B gets budget-skipped because
    // A consumed ~100 bytes and the global budget is only 150.
    expect(statusB?.kind === 'apex' && statusB.result.parseStatus).toBe('budget-skipped');
    expect(statusA?.kind === 'apex' && statusA.result.parseStatus).not.toBe('budget-skipped');
  });

  it('deterministic: same input → same outcome ordering on repeat', async () => {
    const drafts: ParseableDraft[] = [
      { nodeId: 'f-1', kind: 'formula', source: 'A__c + 1', developerName: 'A' },
      { nodeId: 'f-2', kind: 'formula', source: 'B__c + 2', developerName: 'B' },
    ];
    const a = await parseCode(drafts, { catalog: prepareCatalog() });
    const b = await parseCode(drafts, { catalog: prepareCatalog() });
    expect(a.outcomes.map((o) => o.nodeId)).toEqual(b.outcomes.map((o) => o.nodeId));
  });
});
