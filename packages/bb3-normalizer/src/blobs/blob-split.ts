/**
 * splitLargeBlobs / hydrateLargeBlobs — content-addressable
 * externalization of large source blobs in an IRGraph.
 *
 * Spec: §8.2 sensitivity policy.
 *
 * The transform walks every node in the graph, finds inline
 * `BlobRef` fields whose `size` exceeds a threshold, computes the
 * content hash, writes the body to a `BlobStore`, and rewrites
 * the field to an external reference. The companion `hydrate`
 * transform reverses the process for read-side consumers that
 * want the inline form.
 *
 * Determinism notes:
 *
 * - The hash is full SHA-256 (256 bits, 43-char URL-safe base64).
 *   Content-addressable: same content → same hash → same external
 *   ref → same canonicalJson bytes → same overall graph hash.
 * - The transform is pure: a no-op if no blobs exceed the threshold.
 * - Order is independent of input — every node is visited in
 *   the order the caller passes it. The graph is sorted by id at
 *   assembly time, so re-runs land on identical bytes.
 * - The `size` field on the resulting external ref equals the
 *   original UTF-8 byte length, not the JSON-string length.
 *
 * Today's only target field is `CustomComputationIR.rawSource`.
 * Future big-source IR types (a hypothetical large `FlowMetadata`)
 * can plug in by adding a new entry to `BLOB_FIELD_RULES`.
 */

import { createHash } from 'node:crypto';
import {
  inlineBlob,
  isExternalBlob,
  isInlineBlob,
  utf8ByteLength,
  type BlobRef,
  type ExternalBlobRef,
  type IRGraph,
  type IRNodeBase,
} from '@revbrain/migration-ir-contract';
import type { BlobStore } from './blob-store.ts';

/**
 * Default split threshold: 100 KiB. Typical Apex classes are
 * 1–10 KB; QCP scripts can hit 50–200 KB; the largest customer
 * scripts in the wild are several MB. 100 KiB extracts the
 * outliers without churning on small inline source.
 */
export const DEFAULT_BLOB_SPLIT_THRESHOLD_BYTES = 100 * 1024;

/**
 * Per-nodeType configuration: which BlobRef field on which node
 * to split. Add new entries here for future big-blob nodes.
 */
const BLOB_FIELD_RULES: ReadonlyArray<{
  nodeType: string;
  fieldName: string;
}> = Object.freeze([{ nodeType: 'CustomComputation', fieldName: 'rawSource' }]);

export interface SplitOptions {
  /** Default: {@link DEFAULT_BLOB_SPLIT_THRESHOLD_BYTES}. */
  thresholdBytes?: number;
}

export interface SplitResult {
  /**
   * The transformed graph. New object — the input is not
   * mutated. Nodes that did not change are referentially equal
   * to the input nodes (so canonical-JSON byte equality is cheap).
   */
  graph: IRGraph;
  /** Number of blobs that were externalized. */
  splitCount: number;
  /** Total bytes externalized (sum of original `size`). */
  bytesExternalized: number;
}

/**
 * Compute the content hash for a blob. Uses full SHA-256 (256 bits)
 * encoded as URL-safe base64 without padding. Returns a 43-char
 * string. Cross-runtime via node:crypto (bb3-normalizer is Node-only).
 */
export function blobContentHash(content: string): string {
  const digest = createHash('sha256').update(content, 'utf8').digest();
  return digest.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Walk the graph, externalize every inline BlobRef whose size
 * exceeds the threshold, return the modified graph + counters.
 *
 * Each blob write is awaited sequentially so the BlobStore can
 * deduplicate idempotently without contention.
 */
export async function splitLargeBlobs(
  graph: IRGraph,
  store: BlobStore,
  options: SplitOptions = {}
): Promise<SplitResult> {
  const threshold = options.thresholdBytes ?? DEFAULT_BLOB_SPLIT_THRESHOLD_BYTES;
  let splitCount = 0;
  let bytesExternalized = 0;

  const transformedNodes: IRNodeBase[] = [];
  for (const node of graph.nodes) {
    let nextNode: IRNodeBase | null = null;
    for (const rule of BLOB_FIELD_RULES) {
      if (node.nodeType !== rule.nodeType) continue;
      const rec = (nextNode ?? node) as unknown as Record<string, unknown>;
      const ref = rec[rule.fieldName];
      if (!isBlobRef(ref) || !isInlineBlob(ref)) continue;
      if (ref.size < threshold) continue;

      const contentHash = blobContentHash(ref.content);
      // Idempotent: BlobStore.put on existing key is a no-op.
      // eslint-disable-next-line no-await-in-loop
      await store.put(contentHash, ref.content);

      const externalRef: ExternalBlobRef = {
        kind: 'external',
        contentHash,
        size: ref.size,
      };
      nextNode = { ...(nextNode ?? node), [rule.fieldName]: externalRef } as IRNodeBase;
      splitCount++;
      bytesExternalized += ref.size;
    }
    transformedNodes.push(nextNode ?? node);
  }

  return {
    graph: { ...graph, nodes: transformedNodes },
    splitCount,
    bytesExternalized,
  };
}

export interface HydrateResult {
  graph: IRGraph;
  hydratedCount: number;
  /**
   * External refs whose content could not be fetched from the
   * store. Caller decides whether to fail or warn.
   */
  missingHashes: string[];
}

/**
 * Walk the graph, replace every external BlobRef with an inline
 * one by fetching its content from the store. Useful for
 * downstream consumers that need the source body in memory.
 */
export async function hydrateLargeBlobs(graph: IRGraph, store: BlobStore): Promise<HydrateResult> {
  let hydratedCount = 0;
  const missingHashes: string[] = [];

  const transformedNodes: IRNodeBase[] = [];
  for (const node of graph.nodes) {
    let nextNode: IRNodeBase | null = null;
    for (const rule of BLOB_FIELD_RULES) {
      if (node.nodeType !== rule.nodeType) continue;
      const rec = (nextNode ?? node) as unknown as Record<string, unknown>;
      const ref = rec[rule.fieldName];
      if (!isBlobRef(ref) || !isExternalBlob(ref)) continue;

      // eslint-disable-next-line no-await-in-loop
      const content = await store.get(ref.contentHash);
      if (content === null) {
        missingHashes.push(ref.contentHash);
        continue;
      }
      const hydrated = inlineBlob(content);
      nextNode = { ...(nextNode ?? node), [rule.fieldName]: hydrated } as IRNodeBase;
      hydratedCount++;
    }
    transformedNodes.push(nextNode ?? node);
  }

  return {
    graph: { ...graph, nodes: transformedNodes },
    hydratedCount,
    missingHashes,
  };
}

/** Duck-typed BlobRef check (`kind` is the discriminator). */
function isBlobRef(v: unknown): v is BlobRef {
  if (typeof v !== 'object' || v === null) return false;
  const kind = (v as { kind?: unknown }).kind;
  return kind === 'inline' || kind === 'external';
}

/**
 * Helper for callers that have a raw string today and want to
 * upgrade to a BlobRef without computing the size manually.
 */
export function asInlineBlob(content: string | undefined | null): BlobRef {
  if (content === undefined || content === null) {
    return { kind: 'inline', content: '', size: 0 };
  }
  return { kind: 'inline', content, size: utf8ByteLength(content) };
}
