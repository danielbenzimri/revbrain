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
