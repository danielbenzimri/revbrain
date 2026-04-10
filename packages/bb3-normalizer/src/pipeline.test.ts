import { describe, expect, it } from 'vitest';
import { normalize } from './pipeline.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';

function validFinding(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'catalog',
    collectorName: 'catalog',
    artifactType: 'Product2',
    artifactName: 'Prod',
    findingKey: `f-${Math.random().toString(36).slice(2)}`,
    sourceType: 'object',
    detected: true,
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...over,
  };
}

describe('PH3.11 — normalize() entry point', () => {
  it('empty findings → empty graph, no throw, valid envelope (E26)', async () => {
    const result = await normalize([]);
    expect(result.graph.nodes).toEqual([]);
    expect(result.graph.edges).toEqual([]);
    expect(result.graph.quarantine).toEqual([]);
    expect(result.graph.irSchemaVersion).toBe('1.0.0');
  });

  it('extractedAt is set when not provided', async () => {
    const result = await normalize([]);
    expect(result.graph.extractedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('extractedAt passthrough when provided', async () => {
    const result = await normalize([], { extractedAt: '2025-01-01T00:00:00.000Z' });
    expect(result.graph.extractedAt).toBe('2025-01-01T00:00:00.000Z');
  });

  it('runtimeStats populated with stageDurations', async () => {
    const result = await normalize([]);
    expect(result.runtimeStats.stageDurations.length).toBeGreaterThanOrEqual(9);
    expect(result.runtimeStats.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.runtimeStats.totalFindingsIn).toBe(0);
    expect(result.runtimeStats.totalNodesOut).toBeGreaterThanOrEqual(0);
  });

  it('runtimeStats contains the 9 canonical stage names', async () => {
    const result = await normalize([]);
    const stageNames = new Set(result.runtimeStats.stageDurations.map((s) => s.stage));
    expect(stageNames.has('input-gate')).toBe(true);
    expect(stageNames.has('group-index')).toBe(true);
    expect(stageNames.has('normalize')).toBe(true);
    expect(stageNames.has('resolve-refs')).toBe(true);
    expect(stageNames.has('parse-code')).toBe(true);
    expect(stageNames.has('detect-cycles')).toBe(true);
    expect(stageNames.has('build-index')).toBe(true);
    expect(stageNames.has('validate')).toBe(true);
    expect(stageNames.has('assemble')).toBe(true);
  });

  it('unknown artifactType routes to the UnknownArtifact fallback node', async () => {
    // Per PH6.16, unregistered artifactTypes emit an UnknownArtifactIR
    // node (a first-class fallback node), not a quarantine entry.
    const result = await normalize([validFinding({ artifactType: 'TotallyMadeUpType' })]);
    const unknownNodes = result.graph.nodes.filter((n) => n.nodeType === 'UnknownArtifact');
    expect(unknownNodes.length).toBe(1);
    expect(unknownNodes[0]?.warnings).toContain('unknown-artifact-type');
  });

  it('not-modeled-v1 artifactType routes to quarantine', async () => {
    // Per PH6.17, artifactTypes on the NOT_MODELED_V1_TYPES list
    // route to quarantine with reason 'not-modeled-v1' instead of
    // becoming UnknownArtifactIR nodes.
    const result = await normalize([validFinding({ artifactType: 'SharingRule' })]);
    expect(result.quarantine.length).toBe(1);
    expect(result.quarantine[0]?.reason).toBe('not-modeled-v1');
  });

  it('malformed finding quarantines, pipeline continues', async () => {
    // Mix 9 valid findings + 1 malformed to stay below the default
    // 10% invalid-rate threshold.
    const findings: unknown[] = [];
    for (let i = 0; i < 9; i++) findings.push(validFinding({ findingKey: `v-${i}` }));
    findings.push({ broken: true });
    const result = await normalize(findings);
    expect(result.quarantine.length).toBeGreaterThanOrEqual(1);
    expect(result.graph.quarantine.length).toBeGreaterThanOrEqual(1);
  });

  it('non-array input throws BB3InputError', async () => {
    await expect(normalize('not an array' as unknown)).rejects.toThrow();
  });

  it('deterministic: identical inputs → byte-identical serialized output modulo extractedAt', async () => {
    const findings = [
      validFinding({ findingKey: 'a', artifactName: 'A' }),
      validFinding({ findingKey: 'b', artifactName: 'B' }),
    ];
    const a = await normalize(findings, { extractedAt: '2026-04-10T00:00:00Z' });
    const b = await normalize(findings, { extractedAt: '2026-04-10T00:00:00Z' });
    expect(a.serialized).toBe(b.serialized);
  });

  it('degraded catalog mode: warning recorded in metadata.degradedInputs', async () => {
    const result = await normalize([]);
    expect(result.graph.metadata.degradedInputs.length).toBe(1);
    expect(result.graph.metadata.degradedInputs[0]?.source).toBe('schema-catalog');
  });
});
