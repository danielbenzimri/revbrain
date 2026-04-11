/**
 * BlobRef — content-addressable reference to large source blobs.
 *
 * Spec: §8.2 sensitivity policy.
 *
 * BB-3 normalizes Apex / QCP / formula source code into IR nodes.
 * Most nodes carry small inline source. A handful of customer
 * orgs have unusually large QCP scripts (10-100+ KB each) that
 * would bloat the persisted `IRGraph` JSONB row and slow every
 * BB-17 re-assessment comparison.
 *
 * The blob-split mechanism extracts these large strings into a
 * separate object-storage layer keyed by the SHA-256 of their
 * content. The IRGraph then carries a `BlobRef` instead of the
 * raw string. The reference is content-addressable so:
 *
 * - **BB-17 comparison is cheap.** Two graphs with the same
 *   source produce the same `contentHash` — equality is a string
 *   compare, no fetch needed.
 * - **De-duplication is automatic.** Two CustomComputation nodes
 *   with identical scripts share one blob.
 * - **The split is deterministic.** Same content always produces
 *   the same hash, so re-runs of BB-3 are byte-identical.
 *
 * The split is OPT-IN at the worker level. The normalizer always
 * emits inline blobs; a separate post-normalize transform decides
 * whether to externalize based on a size threshold and the
 * presence of a `BlobStore`.
 */

/**
 * Discriminated union: a source blob that is either inline (the
 * full content is in the IRGraph) or externalized (only a
 * content-addressed reference is in the IRGraph; the body lives
 * in object storage).
 */
export type BlobRef = InlineBlobRef | ExternalBlobRef;

/**
 * Inline source — the full content is in the graph. Used by
 * default for small blobs and always by tests that don't supply
 * a BlobStore.
 */
export interface InlineBlobRef {
  kind: 'inline';
  /** The raw source content. */
  content: string;
  /** Length in bytes (UTF-8). */
  size: number;
}

/**
 * External source — only the content hash is in the graph. The
 * body must be fetched from a BlobStore using the hash as a key.
 */
export interface ExternalBlobRef {
  kind: 'external';
  /**
   * SHA-256 of the source content, URL-safe base64 (no padding).
   * Same format as `identityHash` for cross-BB consistency, but
   * uses the FULL 256-bit digest (43 chars) rather than the
   * truncated 128-bit identity hash (22 chars), because BB-17
   * uses this as a primary cache key and 128 bits feels tight
   * for content-addressed storage.
   */
  contentHash: string;
  /** Length in bytes of the original content. */
  size: number;
}

// TextEncoder is available in Node, browsers, and Deno — keeps the
// contract package free of node:* native imports per spec §6.3.
const utf8Encoder = /* @__PURE__ */ new TextEncoder();

/** Compute the UTF-8 byte length of a string deterministically. */
export function utf8ByteLength(content: string): number {
  return utf8Encoder.encode(content).length;
}

/** Construct an inline BlobRef from a string. */
export function inlineBlob(content: string): InlineBlobRef {
  return { kind: 'inline', content, size: utf8ByteLength(content) };
}

/** Type guard: is this BlobRef inline? */
export function isInlineBlob(ref: BlobRef): ref is InlineBlobRef {
  return ref.kind === 'inline';
}

/** Type guard: is this BlobRef external? */
export function isExternalBlob(ref: BlobRef): ref is ExternalBlobRef {
  return ref.kind === 'external';
}

/**
 * Extract the inline content if available, else return null.
 * Convenience for callers that don't want to handle the union.
 */
export function blobContentOrNull(ref: BlobRef): string | null {
  return ref.kind === 'inline' ? ref.content : null;
}
