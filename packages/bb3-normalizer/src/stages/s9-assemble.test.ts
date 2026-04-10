import { describe, expect, it } from 'vitest';
import { assembleEnvelope } from './s9-assemble.ts';
import type {
  GraphMetadataIR,
  IREdge,
  IRNodeBase,
  ReferenceIndex,
} from '@revbrain/migration-ir-contract';

function emptyMetadata(): GraphMetadataIR {
  return {
    collectorCoverage: {},
    collectorWarnings: {},
    degradedInputs: [],
    quarantineCount: 0,
    totalFindingsConsumed: 0,
    totalIRNodesEmitted: 0,
    cycleCount: 0,
    unknownArtifactCount: 0,
    unresolvedRefCount: 0,
    schemaCatalogHash: null,
  };
}

function emptyRefIndex(): ReferenceIndex {
  return {
    byObject: {},
    byField: {},
    byPath: {},
    byNodeId: {},
    dynamicRefs: [],
    unresolvedRefs: [],
  };
}

function node(id: string): IRNodeBase {
  return {
    id,
    contentHash: 'h-' + id,
    nodeType: 'PricingRule',
    displayName: id,
    warnings: [],
    evidence: {
      sourceFindingKeys: ['f-' + id],
      classificationReasons: [],
      cpqFieldsRead: [],
      cpqFieldsWritten: [],
      sourceSalesforceRecordIds: [],
      sourceCollectors: ['pricing'],
    },
  };
}

describe('PH3.10 — assembleEnvelope', () => {
  it('sorts nodes by id', () => {
    const result = assembleEnvelope({
      bb3Version: '0.0.0-test',
      extractedAt: '2026-04-10T00:00:00Z',
      nodes: [node('z'), node('a'), node('m')],
      edges: [],
      referenceIndex: emptyRefIndex(),
      metadata: emptyMetadata(),
      quarantine: [],
    });
    expect(result.graph.nodes.map((n) => n.id)).toEqual(['a', 'm', 'z']);
  });

  it('sorts edges by (sourceId, targetId, edgeType)', () => {
    const edges: IREdge[] = [
      { sourceId: 'b', targetId: 'y', edgeType: 'parent-of', sourceField: 'conditions' },
      { sourceId: 'a', targetId: 'x', edgeType: 'parent-of', sourceField: 'conditions' },
      { sourceId: 'a', targetId: 'x', edgeType: 'depends-on', sourceField: 'dependencies' },
    ];
    const result = assembleEnvelope({
      bb3Version: '0.0.0',
      extractedAt: '2026-04-10T00:00:00Z',
      nodes: [],
      edges,
      referenceIndex: emptyRefIndex(),
      metadata: emptyMetadata(),
      quarantine: [],
    });
    expect(result.graph.edges.map((e) => `${e.sourceId}-${e.targetId}-${e.edgeType}`)).toEqual([
      'a-x-depends-on',
      'a-x-parent-of',
      'b-y-parent-of',
    ]);
  });

  it('sets irSchemaVersion to 1.0.0', () => {
    const result = assembleEnvelope({
      bb3Version: '0.0.0',
      extractedAt: '2026-04-10T00:00:00Z',
      nodes: [],
      edges: [],
      referenceIndex: emptyRefIndex(),
      metadata: emptyMetadata(),
      quarantine: [],
    });
    expect(result.graph.irSchemaVersion).toBe('1.0.0');
  });

  it('canonicalJson serialization is byte-identical across re-runs on identical input', () => {
    const base = {
      bb3Version: '0.0.0',
      extractedAt: '2026-04-10T00:00:00Z',
      nodes: [node('a'), node('b')],
      edges: [],
      referenceIndex: emptyRefIndex(),
      metadata: emptyMetadata(),
      quarantine: [],
    } as const;
    const a = assembleEnvelope(base);
    const b = assembleEnvelope(base);
    expect(a.serialized).toBe(b.serialized);
  });

  it('input order of nodes/edges does not affect serialization (modulo extractedAt)', () => {
    const forward = assembleEnvelope({
      bb3Version: '0.0.0',
      extractedAt: '2026-04-10T00:00:00Z',
      nodes: [node('a'), node('b'), node('c')],
      edges: [],
      referenceIndex: emptyRefIndex(),
      metadata: emptyMetadata(),
      quarantine: [],
    });
    const reverse = assembleEnvelope({
      bb3Version: '0.0.0',
      extractedAt: '2026-04-10T00:00:00Z',
      nodes: [node('c'), node('b'), node('a')],
      edges: [],
      referenceIndex: emptyRefIndex(),
      metadata: emptyMetadata(),
      quarantine: [],
    });
    expect(forward.serialized).toBe(reverse.serialized);
  });
});
