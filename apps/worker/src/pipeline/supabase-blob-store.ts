/**
 * PH9 §8.2 — Supabase Storage backend for the BB-3 BlobStore.
 *
 * Maps the BB-3 `BlobStore` interface onto a Supabase storage
 * bucket via the raw Storage REST API. Avoids pulling in
 * `@supabase/supabase-js` as a worker dependency — the worker
 * already uses raw `postgres` for DB access and `fetch` for the
 * Salesforce REST API, so a thin REST wrapper here is consistent
 * with the existing pattern.
 *
 * Bucket: `bb3-blobs` (created by migration 0045). Service-role-only.
 *
 * Object keys: `${prefix}/${contentHash}.txt` — content-addressed
 * so two writes with the same hash collapse onto the same object.
 */

import type { BlobStore } from '@revbrain/bb3-normalizer';
import { logger } from '../lib/logger.ts';

const DEFAULT_BUCKET = 'bb3-blobs';
const CONTENT_TYPE = 'text/plain; charset=utf-8';

export interface SupabaseBlobStoreOptions {
  /** Supabase project URL (no trailing slash). */
  url: string;
  /** Service-role key (server-side only). */
  serviceRoleKey: string;
  /**
   * Per-tenant key prefix. Required so blobs from different
   * organizations are isolated under separate "folders" inside
   * the same bucket.
   */
  prefix: string;
  /** Override the bucket name. Default: `bb3-blobs`. */
  bucket?: string;
}

export class SupabaseBlobStore implements BlobStore {
  private readonly url: string;
  private readonly serviceRoleKey: string;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(options: SupabaseBlobStoreOptions) {
    // Accept either the project base URL ("https://xxx.supabase.co")
    // or the storage endpoint ("https://xxx.supabase.co/storage/v1")
    // — strip the storage suffix so we always own URL construction.
    this.url = options.url.replace(/\/+$/, '').replace(/\/storage\/v1$/, '');
    this.serviceRoleKey = options.serviceRoleKey;
    this.bucket = options.bucket ?? DEFAULT_BUCKET;
    this.prefix = options.prefix.replace(/\/+$/, '');
  }

  private keyFor(contentHash: string): string {
    return `${this.prefix}/${contentHash}.txt`;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `Bearer ${this.serviceRoleKey}`,
      apikey: this.serviceRoleKey,
      ...extra,
    };
  }

  async put(contentHash: string, content: string): Promise<void> {
    const key = this.keyFor(contentHash);
    const url = `${this.url}/storage/v1/object/${this.bucket}/${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers({
        'Content-Type': CONTENT_TYPE,
        'x-upsert': 'true', // idempotent on duplicate writes
      }),
      body: content,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '<no body>');
      logger.warn(
        { bucket: this.bucket, key, status: res.status, body },
        'supabase_blob_store_put_failed'
      );
      throw new Error(`SupabaseBlobStore.put failed for ${key}: ${res.status} ${body}`);
    }
  }

  async get(contentHash: string): Promise<string | null> {
    const key = this.keyFor(contentHash);
    const url = `${this.url}/storage/v1/object/${this.bucket}/${encodeURIComponent(key)}`;
    const res = await fetch(url, { headers: this.headers() });
    if (res.status === 404) return null;
    if (!res.ok) {
      logger.warn(
        { bucket: this.bucket, key, status: res.status },
        'supabase_blob_store_get_failed'
      );
      return null;
    }
    return res.text();
  }

  async has(contentHash: string): Promise<boolean> {
    const key = this.keyFor(contentHash);
    const url = `${this.url}/storage/v1/object/${this.bucket}/${encodeURIComponent(key)}`;
    // HEAD is the cheap existence check.
    const res = await fetch(url, { method: 'HEAD', headers: this.headers() });
    return res.ok;
  }
}
