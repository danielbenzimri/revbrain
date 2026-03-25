import { describe, it, expect } from 'vitest';
import { SnapshotUploader, type RawSnapshotMode } from '../../src/storage/snapshots.ts';

describe('SnapshotUploader', () => {
  function createUploader(mode: RawSnapshotMode = 'errors_only') {
    return new SnapshotUploader({
      storageUrl: 'http://localhost:54321/storage/v1',
      serviceRoleKey: 'test-key',
      runId: 'run-123',
      mode,
      workerVersion: 'test',
    });
  }

  describe('shouldUpload', () => {
    it('none mode → never uploads', () => {
      const uploader = createUploader('none');
      expect(uploader.shouldUpload('error')).toBe(false);
      expect(uploader.shouldUpload('transactional')).toBe(false);
      expect(uploader.shouldUpload('config')).toBe(false);
    });

    it('errors_only mode → only errors', () => {
      const uploader = createUploader('errors_only');
      expect(uploader.shouldUpload('error')).toBe(true);
      expect(uploader.shouldUpload('transactional')).toBe(false);
      expect(uploader.shouldUpload('config')).toBe(false);
    });

    it('transactional mode → errors + transactional, not config', () => {
      const uploader = createUploader('transactional');
      expect(uploader.shouldUpload('error')).toBe(true);
      expect(uploader.shouldUpload('transactional')).toBe(true);
      expect(uploader.shouldUpload('config')).toBe(false);
    });

    it('all mode → everything', () => {
      const uploader = createUploader('all');
      expect(uploader.shouldUpload('error')).toBe(true);
      expect(uploader.shouldUpload('transactional')).toBe(true);
      expect(uploader.shouldUpload('config')).toBe(true);
    });
  });

  describe('upload', () => {
    it('should skip upload when mode is none', async () => {
      const uploader = createUploader('none');
      const result = await uploader.upload('catalog', 'test.json', '{"test": true}', {
        sourceApi: 'rest',
        category: 'config',
      });
      expect(result).toBe(false);
    });

    it('should skip non-error uploads in errors_only mode', async () => {
      const uploader = createUploader('errors_only');
      const result = await uploader.upload('catalog', 'products.json', '{"data": []}', {
        sourceApi: 'rest',
        category: 'config',
      });
      expect(result).toBe(false);
    });
  });

  describe('manifest', () => {
    it('should return manifest with correct structure', () => {
      const uploader = createUploader('errors_only');
      const manifest = uploader.getManifest();

      expect(manifest.run_id).toBe('run-123');
      expect(manifest.mode).toBe('errors_only');
      expect(manifest.files).toEqual([]);
      expect(manifest.worker_version).toBe('test');
      expect(manifest.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
