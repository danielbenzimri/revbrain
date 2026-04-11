/**
 * BlobStore — abstract interface for content-addressable storage
 * of large source blobs extracted from the IRGraph.
 *
 * Spec: §8.2 sensitivity policy.
 *
 * The split / hydrate transforms in this directory call the store
 * via this interface so the same code works against:
 *
 * - In-memory Maps for unit tests (deterministic, no I/O)
 * - Supabase Storage for production (one bucket per tenant)
 * - Local filesystem for the CLI smoke script
 * - Any future backend (S3, R2, etc.) without touching BB-3
 *
 * Keys are SHA-256 content hashes from `BlobRef.contentHash`.
 * Values are arbitrary UTF-8 strings (typically Apex / QCP source).
 *
 * The interface is intentionally minimal: put + get + has. No
 * delete (BB-17 needs the history), no list (we always know the
 * key), no metadata (the IRGraph already carries `size`).
 */

export interface BlobStore {
  /**
   * Write a blob keyed by its content hash. Idempotent: writing
   * the same content twice is a no-op (the second call MAY skip
   * the underlying I/O for efficiency, but MUST NOT throw).
   */
  put(contentHash: string, content: string): Promise<void>;

  /**
   * Read a blob by content hash. Returns `null` if not found —
   * the caller decides whether that's a hard error.
   */
  get(contentHash: string): Promise<string | null>;

  /** Cheap existence check that avoids transferring the body. */
  has(contentHash: string): Promise<boolean>;
}

/**
 * In-memory `BlobStore` implementation. Used by unit tests and the
 * CLI smoke script. Map is the canonical Node-portable backing.
 *
 * Not thread-safe (Node is single-threaded so this is fine for the
 * worker). Does not enforce a size limit — the caller controls
 * the threshold via `splitLargeBlobs`.
 */
export class InMemoryBlobStore implements BlobStore {
  private readonly blobs = new Map<string, string>();

  async put(contentHash: string, content: string): Promise<void> {
    this.blobs.set(contentHash, content);
  }

  async get(contentHash: string): Promise<string | null> {
    return this.blobs.get(contentHash) ?? null;
  }

  async has(contentHash: string): Promise<boolean> {
    return this.blobs.has(contentHash);
  }

  /** Test-only: number of blobs currently held. */
  size(): number {
    return this.blobs.size;
  }

  /** Test-only: clear the store. */
  clear(): void {
    this.blobs.clear();
  }
}
