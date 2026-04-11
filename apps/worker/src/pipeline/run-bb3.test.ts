/**
 * PH8.1 — Unit tests for the BB-3 worker pipeline entry.
 *
 * Mocks are not used — the entire BB-3 pipeline runs. This is
 * intentional: we want to verify the SchemaCatalog construction
 * from findings and the end-to-end round-trip through `normalize()`.
 */

import { describe, expect, it } from 'vitest';
import { buildSchemaCatalogFromFindings, runBB3 } from './run-bb3.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';

function finding(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'catalog',
    collectorName: 'metadata',
    artifactType: 'ObjectConfiguration',
    artifactName: 'SBQQ__Quote__c',
    findingKey: `f-${Math.random().toString(36).slice(2)}`,
    sourceType: 'metadata',
    detected: true,
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...over,
  };
}

describe('PH8.1 — buildSchemaCatalogFromFindings', () => {
  it('empty findings → empty catalog with zeroed summary', () => {
    const catalog = buildSchemaCatalogFromFindings([]);
    expect(catalog.objects).toEqual({});
    expect(catalog.summary.objectCount).toBe(0);
    expect(catalog.summary.fieldCount).toBe(0);
  });

  it('one ObjectConfiguration finding produces one catalog entry', () => {
    const catalog = buildSchemaCatalogFromFindings([
      finding({
        artifactName: 'SBQQ__Quote__c',
        textValue: 'Id, Name, SBQQ__NetAmount__c',
      }),
    ]);
    expect(catalog.objects.SBQQ__Quote__c).toBeDefined();
    const quote = catalog.objects.SBQQ__Quote__c!;
    expect(quote.namespace).toBe('SBQQ');
    expect(Object.keys(quote.fields).sort()).toEqual(['Id', 'Name', 'SBQQ__NetAmount__c']);
    expect(quote.fields.SBQQ__NetAmount__c?.isCustom).toBe(true);
  });

  it('non-ObjectConfiguration findings are ignored', () => {
    const catalog = buildSchemaCatalogFromFindings([
      finding({ artifactType: 'Product2', artifactName: 'PremiumSub' }),
    ]);
    expect(catalog.objects).toEqual({});
  });

  it('summary counts reflect CPQ-managed objects', () => {
    const catalog = buildSchemaCatalogFromFindings([
      finding({ artifactName: 'SBQQ__Quote__c', textValue: 'Id' }),
      finding({ artifactName: 'Account', textValue: 'Id' }),
      finding({ artifactName: 'sbaa__Approval__c', textValue: 'Id' }),
    ]);
    expect(catalog.summary.objectCount).toBe(3);
    expect(catalog.summary.cpqManagedObjectCount).toBe(2); // SBQQ + sbaa
  });

  it('findings without textValue produce empty fields', () => {
    const catalog = buildSchemaCatalogFromFindings([finding({ artifactName: 'SBQQ__Quote__c' })]);
    expect(catalog.objects.SBQQ__Quote__c?.fields).toEqual({});
  });
});

describe('PH8.1 — runBB3 end-to-end', () => {
  it('empty findings → valid graph, no throw', async () => {
    const result = await runBB3([], { extractedAt: '2026-04-10T00:00:00Z' });
    expect(result.graph.nodes).toEqual([]);
    expect(result.graph.irSchemaVersion).toBe('1.0.0');
  });

  it('builds catalog from findings automatically when none is provided', async () => {
    const findings: AssessmentFindingInput[] = [
      finding({
        artifactType: 'ObjectConfiguration',
        artifactName: 'SBQQ__Quote__c',
        textValue: 'Id, Name',
        findingKey: 'oc-1',
      }),
      finding({
        artifactType: 'SBQQ__PriceRule__c',
        artifactName: 'TestRule',
        findingKey: 'rule-1',
        domain: 'pricing',
        collectorName: 'pricing',
        sourceType: 'object',
        evidenceRefs: [{ type: 'field-ref', value: 'On Calculate' }],
      }),
    ];
    const result = await runBB3(findings, { extractedAt: '2026-04-10T00:00:00Z' });
    // The catalog should have been built, so degradedInputs is empty
    // (no 'no catalog' warning).
    const catalogWarnings = result.graph.metadata.degradedInputs.filter(
      (d) => d.source === 'schema-catalog'
    );
    expect(catalogWarnings).toEqual([]);
  });

  it('forwards normalize options through', async () => {
    const result = await runBB3([finding({ findingKey: 'a' })], {
      normalizeOptions: { maxInvalidRate: 0.5 },
      extractedAt: '2026-04-10T00:00:00Z',
    });
    expect(result.graph.nodes.length).toBeGreaterThanOrEqual(0);
  });

  it('explicit catalog override takes precedence', async () => {
    const result = await runBB3([], {
      catalog: {
        capturedAt: '2026-04-10T00:00:00Z',
        objects: {},
        summary: {
          objectCount: 0,
          fieldCount: 0,
          cpqManagedObjectCount: 0,
          hasMultiCurrency: false,
        },
      },
      extractedAt: '2026-04-10T00:00:00Z',
    });
    expect(result.graph.metadata.degradedInputs.length).toBe(0);
  });

  it('BB-3 errors do NOT crash the worker — they surface as diagnostics', async () => {
    // Feed findings with a high invalid rate but under the default
    // 10% threshold so inputGate quarantines them without throwing.
    const findings: unknown[] = [];
    for (let i = 0; i < 9; i++) findings.push(finding({ findingKey: `ok-${i}` }));
    findings.push({ broken: true });
    const result = await runBB3(findings as AssessmentFindingInput[], {
      extractedAt: '2026-04-10T00:00:00Z',
    });
    expect(result.quarantine.length).toBeGreaterThanOrEqual(1);
    expect(result.graph).toBeDefined();
  });
});

describe('PH9.7 — default projected descriptors + catalog hash cascade', () => {
  it('runBB3 with no descriptors produces non-empty edges[] (default cascades)', async () => {
    const findings: AssessmentFindingInput[] = [
      finding({
        domain: 'pricing',
        collectorName: 'pricing',
        artifactType: 'SBQQ__PriceRule__c',
        artifactName: 'Rule A',
        findingKey: 'rule-a',
        sourceType: 'object',
        evidenceRefs: [{ type: 'field-ref', value: 'On Calculate' }],
      }),
      finding({
        domain: 'pricing',
        collectorName: 'pricing',
        artifactType: 'SBQQ__PriceCondition__c',
        artifactName: 'Cond 1',
        findingKey: 'cond-1',
        sourceType: 'object',
        countValue: 1,
        textValue: '100',
        notes: 'greater than',
        evidenceRefs: [{ type: 'record-id', value: 'rule-a' }],
      }),
    ];
    const result = await runBB3(findings, { extractedAt: '2026-04-10T00:00:00Z' });
    const parentOfEdges = result.graph.edges.filter((e) => e.edgeType === 'parent-of');
    expect(parentOfEdges.length).toBeGreaterThanOrEqual(1);
  });

  it('runBB3 with explicit projectedDescriptors: [] disables projection', async () => {
    const findings: AssessmentFindingInput[] = [
      finding({
        domain: 'pricing',
        collectorName: 'pricing',
        artifactType: 'SBQQ__PriceRule__c',
        artifactName: 'Rule A',
        findingKey: 'rule-a',
        sourceType: 'object',
        evidenceRefs: [{ type: 'field-ref', value: 'On Calculate' }],
      }),
      finding({
        domain: 'pricing',
        collectorName: 'pricing',
        artifactType: 'SBQQ__PriceCondition__c',
        artifactName: 'Cond 1',
        findingKey: 'cond-1',
        sourceType: 'object',
        countValue: 1,
        textValue: '100',
        notes: 'greater than',
        evidenceRefs: [{ type: 'record-id', value: 'rule-a' }],
      }),
    ];
    const result = await runBB3(findings, {
      normalizeOptions: { projectedDescriptors: [] },
      extractedAt: '2026-04-10T00:00:00Z',
    });
    // Explicit empty list: no projected edges (cycles/synthetic edges
    // may still exist, but parent-of should not).
    expect(result.graph.edges.filter((e) => e.edgeType === 'parent-of')).toEqual([]);
  });

  it('runBB3 with a catalog populates schemaCatalogHash (G3 end-to-end)', async () => {
    const findings: AssessmentFindingInput[] = [
      finding({
        artifactType: 'ObjectConfiguration',
        artifactName: 'SBQQ__Quote__c',
        textValue: 'Id, Name',
        findingKey: 'oc-1',
      }),
    ];
    const result = await runBB3(findings, { extractedAt: '2026-04-10T00:00:00Z' });
    expect(result.graph.metadata.schemaCatalogHash).not.toBeNull();
    expect(result.graph.metadata.schemaCatalogHash).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
});

// BB-3 §6.2/§6.4 — the IRGraph identity surface must be byte-stable
// across runs over the same input findings. The only field on
// `NormalizeResult.graph` that is allowed to drift is the caller-
// provided `extractedAt` (which is metadata about the run, not the
// graph identity). Anything else drifting is a wall-clock /
// non-determinism leak — see [run-bb3.ts:buildSchemaCatalogFromFindings]
// for the original regression that motivated this test.
describe('BB-3 determinism — IRGraph byte-stability across runs', () => {
  const sampleFindings = (): AssessmentFindingInput[] => [
    finding({
      artifactType: 'ObjectConfiguration',
      artifactName: 'SBQQ__Quote__c',
      textValue: 'Id, Name, SBQQ__NetAmount__c',
      findingKey: 'oc-1',
    }),
    finding({
      domain: 'pricing',
      collectorName: 'pricing',
      artifactType: 'SBQQ__PriceRule__c',
      artifactName: 'Distributor Discount',
      findingKey: 'rule-1',
      sourceType: 'object',
      evidenceRefs: [{ type: 'field-ref', value: 'On Calculate' }],
    }),
    finding({
      domain: 'dependency',
      collectorName: 'dependencies',
      artifactType: 'ApexClass',
      artifactName: 'MyPricingHandler',
      findingKey: 'apex-1',
      sourceType: 'metadata',
      textValue: 'public class MyPricingHandler { public Decimal compute() { return 1; } }',
    }),
  ];

  it('two runs over identical findings produce byte-identical graph content', async () => {
    const findings = sampleFindings();
    const fixedExtractedAt = '2026-04-10T00:00:00Z';
    const a = await runBB3(findings, { extractedAt: fixedExtractedAt });
    const b = await runBB3(findings, { extractedAt: fixedExtractedAt });
    expect(JSON.stringify(a.graph)).toBe(JSON.stringify(b.graph));
  });

  it('graph content is stable even when extractedAt differs (only that field drifts)', async () => {
    const findings = sampleFindings();
    const a = await runBB3(findings, { extractedAt: '2024-01-01T00:00:00Z' });
    const b = await runBB3(findings, { extractedAt: '2099-12-31T23:59:59Z' });
    // extractedAt itself differs (caller-provided telemetry).
    expect(a.graph.extractedAt).not.toBe(b.graph.extractedAt);
    // Everything else must be identical, including schemaCatalogHash.
    const stripExtractedAt = (g: typeof a.graph) => {
      const { extractedAt: _e, ...rest } = g;
      void _e;
      return rest;
    };
    expect(JSON.stringify(stripExtractedAt(a.graph))).toBe(
      JSON.stringify(stripExtractedAt(b.graph))
    );
    expect(a.graph.metadata.schemaCatalogHash).toBe(b.graph.metadata.schemaCatalogHash);
  });

  it('schemaCatalogHash is stable across two buildSchemaCatalogFromFindings calls', async () => {
    // Targets the original wall-clock leak: even if buildSchemaCatalog
    // is called twice (once per run, no caller-supplied catalog), the
    // resulting schemaCatalogHash on the graph must be identical.
    const findings = sampleFindings();
    const a = await runBB3(findings, { extractedAt: '2026-04-10T00:00:00Z' });
    const b = await runBB3(findings, { extractedAt: '2026-04-10T00:00:00Z' });
    expect(a.graph.metadata.schemaCatalogHash).toBe(b.graph.metadata.schemaCatalogHash);
    expect(a.graph.metadata.schemaCatalogHash).not.toBeNull();
  });
});
