import { describe, expect, it } from 'vitest';
import { normalizeUnknownArtifact, type UnknownArtifactIR } from './unknown.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';
import { prepareCatalog } from '../../stages/s2-5-schema-catalog.ts';

function validUnknown(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'customization',
    collectorName: 'misc',
    artifactType: 'SomeNewArtifact',
    artifactName: 'Instance_1',
    findingKey: 'unk-1',
    sourceType: 'metadata',
    detected: true,
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeUnknownArtifact,
  taskId: 'PH6.16',
  nodeType: 'UnknownArtifact',
  validFinding: validUnknown,
  malformedFinding: null,
  renameMutation: (f) => ({ ...f, artifactId: 'a0V3x00000newid' }),
  // UnknownArtifactIR's semantic payload equals its stable identity
  // per spec §5.2 ("unknown artifacts have no semantic structure BB-3
  // can inspect") — so id and contentHash move together by design.
  // Skip the content-change assertion.
  contentChangeMutation: null,
});

describe('PH6.16 — UnknownArtifact fallback', () => {
  it('attaches unknown-artifact-type warning', () => {
    const ctx = { catalog: prepareCatalog(), diagnostics: [] };
    const result = normalizeUnknownArtifact(validUnknown(), ctx);
    expect(result.nodes[0]!.warnings).toContain('unknown-artifact-type');
  });

  it('preserves the raw finding in rawFinding', () => {
    const ctx = { catalog: prepareCatalog(), diagnostics: [] };
    const finding = validUnknown({ notes: 'some extra detail' });
    const result = normalizeUnknownArtifact(finding, ctx);
    const node = result.nodes[0]! as UnknownArtifactIR;
    expect((node.rawFinding as { notes: string }).notes).toBe('some extra detail');
  });
});
