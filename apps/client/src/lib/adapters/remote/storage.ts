import type { StorageAdapter, StorageFile } from '@/types/services';

/**
 * Remote Storage Adapter — STUB
 *
 * Not yet implemented. File operations go through the server API
 * (project-files routes), not direct client-to-Supabase Storage.
 *
 * This adapter exists to satisfy the StorageAdapter interface.
 * All methods throw — callers should use the API endpoints instead.
 */
export class RemoteStorageAdapter implements StorageAdapter {
  async upload(bucket: string, path: string, file: File | Blob): Promise<string> {
    void bucket;
    void path;
    void file;
    throw new Error('Use server API for file operations (POST /v1/projects/:id/files)');
  }

  async download(bucket: string, path: string): Promise<Blob> {
    void bucket;
    void path;
    throw new Error(
      'Use server API for file operations (GET /v1/projects/:id/files/:fileId/download)'
    );
  }

  async delete(bucket: string, path: string): Promise<void> {
    void bucket;
    void path;
    throw new Error('Use server API for file operations (DELETE /v1/projects/:id/files/:fileId)');
  }

  getPublicUrl(bucket: string, path: string): string {
    void bucket;
    void path;
    return '';
  }

  async getSignedUrl(bucket: string, path: string, expiresIn = 3600): Promise<string> {
    void bucket;
    void path;
    void expiresIn;
    throw new Error('Use server API for file operations');
  }

  async list(bucket: string, prefix?: string): Promise<StorageFile[]> {
    void bucket;
    void prefix;
    throw new Error('Use server API for file operations');
  }
}
