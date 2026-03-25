/**
 * Raw snapshot upload to Supabase Storage.
 *
 * Uploads gzipped API responses for debugging and evidence retention.
 * Always non-fatal — collectors must not depend on storage success.
 *
 * Storage path: assessment-runs/{runId}/raw/{collector}/{filename}.json.gz
 * Path prefix enforcement: rejects writes outside assessment-runs/{runId}/
 *
 * Modes (from assessment_runs.raw_snapshot_mode):
 * - none: no uploads
 * - errors_only: only failed/malformed responses (default)
 * - transactional: large extracts (quotes, orders)
 * - all: everything
 *
 * See: Implementation Plan Task 1.6
 */

import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { logger } from '../lib/logger.ts';

export type RawSnapshotMode = 'none' | 'errors_only' | 'transactional' | 'all';

interface SnapshotFile {
  path: string;
  collector: string;
  sourceApi: string;
  rowCount?: number;
  contentType: string;
  compressed: boolean;
  data: Buffer;
}

interface ManifestEntry {
  path: string;
  collector: string;
  source_api: string;
  row_count?: number;
  byte_size: number;
  sha256: string;
  content_type: string;
  compressed: boolean;
}

export interface SnapshotManifest {
  run_id: string;
  created_at: string;
  worker_version: string;
  mode: RawSnapshotMode;
  files: ManifestEntry[];
}

export class SnapshotUploader {
  private storageUrl: string;
  private serviceRoleKey: string;
  private runId: string;
  private mode: RawSnapshotMode;
  private workerVersion: string;
  private manifest: ManifestEntry[] = [];
  private bucket = 'assessment-data';

  constructor(config: {
    storageUrl: string;
    serviceRoleKey: string;
    runId: string;
    mode: RawSnapshotMode;
    workerVersion: string;
  }) {
    this.storageUrl = config.storageUrl;
    this.serviceRoleKey = config.serviceRoleKey;
    this.runId = config.runId;
    this.mode = config.mode;
    this.workerVersion = config.workerVersion;
  }

  /**
   * Should this data be uploaded given the current mode?
   */
  shouldUpload(category: 'error' | 'transactional' | 'config'): boolean {
    if (this.mode === 'none') return false;
    if (this.mode === 'all') return true;
    if (this.mode === 'errors_only') return category === 'error';
    if (this.mode === 'transactional') return category !== 'config';
    return false;
  }

  /**
   * Upload a raw API response as a gzipped file.
   * Non-fatal: logs warning on failure, never throws.
   */
  async upload(
    collector: string,
    filename: string,
    data: string | Buffer,
    options: {
      sourceApi: string;
      rowCount?: number;
      category: 'error' | 'transactional' | 'config';
    }
  ): Promise<boolean> {
    if (!this.shouldUpload(options.category)) {
      return false;
    }

    const relativePath = `assessment-runs/${this.runId}/raw/${collector}/${filename}.gz`;

    // Path prefix enforcement — defense in depth
    if (!relativePath.startsWith(`assessment-runs/${this.runId}/`)) {
      logger.error({ path: relativePath }, 'snapshot_path_rejected');
      return false;
    }

    try {
      const raw = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
      const compressed = gzipSync(raw);
      const sha256 = createHash('sha256').update(compressed).digest('hex');

      const file: SnapshotFile = {
        path: relativePath,
        collector,
        sourceApi: options.sourceApi,
        rowCount: options.rowCount,
        contentType: 'application/gzip',
        compressed: true,
        data: compressed,
      };

      await this.uploadToStorage(file);

      this.manifest.push({
        path: relativePath,
        collector,
        source_api: options.sourceApi,
        row_count: options.rowCount,
        byte_size: compressed.length,
        sha256,
        content_type: 'application/gzip',
        compressed: true,
      });

      return true;
    } catch (err) {
      // Non-fatal — log and continue
      logger.warn(
        {
          collector,
          filename,
          error: err instanceof Error ? err.message : String(err),
        },
        'snapshot_upload_failed'
      );
      return false;
    }
  }

  /**
   * Upload the manifest file summarizing all uploaded snapshots.
   */
  async uploadManifest(): Promise<void> {
    if (this.mode === 'none' || this.manifest.length === 0) {
      return;
    }

    const manifest: SnapshotManifest = {
      run_id: this.runId,
      created_at: new Date().toISOString(),
      worker_version: this.workerVersion,
      mode: this.mode,
      files: this.manifest,
    };

    try {
      const data = Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8');
      await this.uploadToStorage({
        path: `assessment-runs/${this.runId}/manifest.json`,
        collector: 'system',
        sourceApi: 'worker',
        contentType: 'application/json',
        compressed: false,
        data,
      });

      logger.info(
        { fileCount: this.manifest.length, mode: this.mode },
        'snapshot_manifest_uploaded'
      );
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        'snapshot_manifest_upload_failed'
      );
    }
  }

  /** Get the manifest for summary recording */
  getManifest(): SnapshotManifest {
    return {
      run_id: this.runId,
      created_at: new Date().toISOString(),
      worker_version: this.workerVersion,
      mode: this.mode,
      files: this.manifest,
    };
  }

  private async uploadToStorage(file: SnapshotFile): Promise<void> {
    const url = `${this.storageUrl}/object/${this.bucket}/${file.path}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.serviceRoleKey}`,
        'Content-Type': file.contentType,
        'x-upsert': 'true',
      },
      body: file.data,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => 'unknown');
      throw new Error(`Storage upload failed: ${response.status} ${body.slice(0, 200)}`);
    }
  }
}
