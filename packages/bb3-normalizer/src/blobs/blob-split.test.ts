/**
 * splitLargeBlobs / hydrateLargeBlobs unit tests.
 *
 * Spec: §8.2 sensitivity policy.
 */
import { describe, expect, it } from 'vitest';
import {
  inlineBlob,
  type BlobRef,
  type IRGraph,
  type IRNodeBase,
} from '@revbrain/migration-ir-contract';
import {
  blobContentHash,
  DEFAULT_BLOB_SPLIT_THRESHOLD_BYTES,
  hydrateLargeBlobs,
  splitLargeBlobs,
} from './blob-split.ts';
import { InMemoryBlobStore } from './blob-store.ts';

function customComputation(id: string, rawSource: string): IRNodeBase & { rawSource: BlobRef } {
  return {
    id,
    contentHash: `c-${id}`,
    nodeType: 'CustomComputation',
    displayName: id,
    warnings: [],
    evidence: {
      sourceFindingKeys: [`f-${id}`],
      classificationReasons: [],
      cpqFieldsRead: [],
      cpqFieldsWritten: [],
      sourceSalesforceRecordIds: [],
      sourceCollectors: ['pricing'],
    },
    rawSource: inlineBlob(rawSource),
  } as IRNodeBase & { rawSource: BlobRef };
}

function makeGraph(nodes: IRNodeBase[]): IRGraph {
  return {
    irSchemaVersion: '1.0.0',
    bb3Version: '0.0.0-test',
    orgFingerprint: customComputation('org', 'placeholder') as unknown as IRGraph['orgFingerprint'],
    extractedAt: '2026-04-11T00:00:00Z',
    nodes,
    edges: [],
    referenceIndex: {
      byObject: {},
      byField: {},
      byPath: {},
      byNodeId: {},
      dynamicRefs: [],
      unresolvedRefs: [],
    },
    metadata: {
      collectorCoverage: {},
      collectorWarnings: {},
      degradedInputs: [],
      quarantineCount: 0,
      totalFindingsConsumed: 0,
      totalIRNodesEmitted: nodes.length,
      cycleCount: 0,
      unknownArtifactCount: 0,
      unresolvedRefCount: 0,
      schemaCatalogHash: null,
    },
    quarantine: [],
  } as unknown as IRGraph;
}

describe('PH9 §8.2 — blobContentHash', () => {
  it('produces a 43-char URL-safe base64 string', () => {
    expect(blobContentHash('hello')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('determinism: same content → same hash', () => {
    const a = blobContentHash('public class Foo {}');
    const b = blobContentHash('public class Foo {}');
    expect(a).toBe(b);
  });

  it('sensitivity: different content → different hash', () => {
    const a = blobContentHash('public class Foo {}');
    const b = blobContentHash('public class Bar {}');
    expect(a).not.toBe(b);
  });
});

describe('PH9 §8.2 — splitLargeBlobs', () => {
  it('no-op when no node exceeds threshold', async () => {
    const graph = makeGraph([customComputation('cc-1', 'small')]);
    const store = new InMemoryBlobStore();
    const result = await splitLargeBlobs(graph, store, { thresholdBytes: 1024 });
    expect(result.splitCount).toBe(0);
    expect(result.bytesExternalized).toBe(0);
    expect(store.size()).toBe(0);
    // Original node returned by reference (no allocation).
    expect(result.graph.nodes[0]).toBe(graph.nodes[0]);
  });

  it('splits a node whose rawSource exceeds the threshold', async () => {
    const big = 'x'.repeat(2000);
    const graph = makeGraph([customComputation('cc-1', big)]);
    const store = new InMemoryBlobStore();
    const result = await splitLargeBlobs(graph, store, { thresholdBytes: 1024 });
    expect(result.splitCount).toBe(1);
    expect(result.bytesExternalized).toBe(2000);
    expect(store.size()).toBe(1);

    const transformed = result.graph.nodes[0] as IRNodeBase & { rawSource: BlobRef };
    expect(transformed.rawSource.kind).toBe('external');
    if (transformed.rawSource.kind === 'external') {
      expect(transformed.rawSource.size).toBe(2000);
      expect(transformed.rawSource.contentHash).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const stored = await store.get(transformed.rawSource.contentHash);
      expect(stored).toBe(big);
    }
  });

  it('determinism: same input → same output bytes (content-addressed)', async () => {
    const big = 'public class Big {}\n'.repeat(200);
    const graph = makeGraph([customComputation('cc-1', big)]);
    const storeA = new InMemoryBlobStore();
    const storeB = new InMemoryBlobStore();
    const a = await splitLargeBlobs(graph, storeA, { thresholdBytes: 1024 });
    const b = await splitLargeBlobs(graph, storeB, { thresholdBytes: 1024 });

    const refA = (a.graph.nodes[0] as unknown as { rawSource: BlobRef }).rawSource;
    const refB = (b.graph.nodes[0] as unknown as { rawSource: BlobRef }).rawSource;
    expect(refA).toEqual(refB);
  });

  it('deduplicates: two nodes with identical content share one blob', async () => {
    const same = 'y'.repeat(2000);
    const graph = makeGraph([customComputation('cc-1', same), customComputation('cc-2', same)]);
    const store = new InMemoryBlobStore();
    const result = await splitLargeBlobs(graph, store, { thresholdBytes: 1024 });
    expect(result.splitCount).toBe(2);
    expect(store.size()).toBe(1); // dedupe by content hash
  });

  it('does not touch nodes whose nodeType is not in the rule list', async () => {
    const big = 'z'.repeat(2000);
    // PricingRule does not have a rawSource BlobRef field.
    const rule: IRNodeBase = {
      id: 'rule-1',
      contentHash: 'h',
      nodeType: 'PricingRule',
      displayName: 'r',
      warnings: [],
      evidence: {
        sourceFindingKeys: ['f'],
        classificationReasons: [],
        cpqFieldsRead: [],
        cpqFieldsWritten: [],
        sourceSalesforceRecordIds: [],
        sourceCollectors: ['pricing'],
      },
    };
    (rule as unknown as { rawSource: string }).rawSource = big;
    const graph = makeGraph([rule]);
    const store = new InMemoryBlobStore();
    const result = await splitLargeBlobs(graph, store, { thresholdBytes: 1024 });
    expect(result.splitCount).toBe(0);
    expect(store.size()).toBe(0);
  });

  it('default threshold is 100 KiB', () => {
    expect(DEFAULT_BLOB_SPLIT_THRESHOLD_BYTES).toBe(100 * 1024);
  });
});

describe('PH9 §8.2 — hydrateLargeBlobs', () => {
  it('round-trips a split graph back to the inline form', async () => {
    const big = 'a'.repeat(2000);
    const graph = makeGraph([customComputation('cc-1', big)]);
    const store = new InMemoryBlobStore();
    const split = await splitLargeBlobs(graph, store, { thresholdBytes: 1024 });
    const hydrated = await hydrateLargeBlobs(split.graph, store);

    expect(hydrated.hydratedCount).toBe(1);
    expect(hydrated.missingHashes).toEqual([]);
    const ref = (hydrated.graph.nodes[0] as unknown as { rawSource: BlobRef }).rawSource;
    expect(ref.kind).toBe('inline');
    if (ref.kind === 'inline') {
      expect(ref.content).toBe(big);
      expect(ref.size).toBe(2000);
    }
  });

  it('reports missing hashes without throwing', async () => {
    const graph = makeGraph([customComputation('cc-1', 'small')]);
    // Manually point at a non-existent blob.
    const node = graph.nodes[0] as unknown as { rawSource: BlobRef };
    node.rawSource = { kind: 'external', contentHash: 'doesnotexist', size: 100 };

    const store = new InMemoryBlobStore();
    const result = await hydrateLargeBlobs(graph, store);
    expect(result.hydratedCount).toBe(0);
    expect(result.missingHashes).toEqual(['doesnotexist']);
    // The node is left untouched (still external) so the caller
    // can decide whether to fail or warn.
    const ref = (result.graph.nodes[0] as unknown as { rawSource: BlobRef }).rawSource;
    expect(ref.kind).toBe('external');
  });

  it('inline blobs are passed through unchanged', async () => {
    const graph = makeGraph([customComputation('cc-1', 'small')]);
    const store = new InMemoryBlobStore();
    const result = await hydrateLargeBlobs(graph, store);
    expect(result.hydratedCount).toBe(0);
    // Same node reference returned (no allocation).
    expect(result.graph.nodes[0]).toBe(graph.nodes[0]);
  });
});

describe('PH9 §8.2 — InMemoryBlobStore', () => {
  it('put + get round-trip', async () => {
    const store = new InMemoryBlobStore();
    await store.put('h1', 'content-1');
    expect(await store.get('h1')).toBe('content-1');
    expect(await store.has('h1')).toBe(true);
  });

  it('get returns null for missing keys', async () => {
    const store = new InMemoryBlobStore();
    expect(await store.get('missing')).toBeNull();
    expect(await store.has('missing')).toBe(false);
  });

  it('put is idempotent (same key twice → no error)', async () => {
    const store = new InMemoryBlobStore();
    await store.put('h1', 'a');
    await store.put('h1', 'a');
    expect(store.size()).toBe(1);
  });
});
