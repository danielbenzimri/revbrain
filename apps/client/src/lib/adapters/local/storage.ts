import type { StorageAdapter, StorageFile } from '@/types/services';

const STORAGE_PREFIX = 'revbrain_files_';

/**
 * Local Storage Adapter
 * Uses localStorage/data URLs for file storage during development
 */
export class LocalStorageAdapter implements StorageAdapter {
  private getKey(bucket: string, path: string): string {
    return `${STORAGE_PREFIX}${bucket}/${path}`;
  }

  private getMetaKey(bucket: string, path: string): string {
    return `${this.getKey(bucket, path)}_meta`;
  }

  async upload(bucket: string, path: string, file: File | Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const dataUrl = reader.result as string;
        const key = this.getKey(bucket, path);
        const metaKey = this.getMetaKey(bucket, path);

        // Store file data
        localStorage.setItem(key, dataUrl);

        // Store metadata
        const meta: StorageFile = {
          name: file instanceof File ? file.name : path.split('/').pop() || 'file',
          path,
          size: file.size,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem(metaKey, JSON.stringify(meta));

        console.log(`[LocalStorage] upload(${bucket}/${path})`, meta.size, 'bytes');
        resolve(path);
      };

      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async download(bucket: string, path: string): Promise<Blob> {
    const key = this.getKey(bucket, path);
    const dataUrl = localStorage.getItem(key);

    if (!dataUrl) {
      throw new Error(`File not found: ${bucket}/${path}`);
    }

    // Convert data URL to Blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    console.log(`[LocalStorage] download(${bucket}/${path})`, blob.size, 'bytes');
    return blob;
  }

  async delete(bucket: string, path: string): Promise<void> {
    const key = this.getKey(bucket, path);
    const metaKey = this.getMetaKey(bucket, path);

    localStorage.removeItem(key);
    localStorage.removeItem(metaKey);

    console.log(`[LocalStorage] delete(${bucket}/${path})`);
  }

  getPublicUrl(bucket: string, path: string): string {
    const key = this.getKey(bucket, path);
    const dataUrl = localStorage.getItem(key);

    // Return data URL directly (works in <img> tags, etc.)
    return dataUrl || '';
  }

  async getSignedUrl(bucket: string, path: string): Promise<string> {
    // For local storage, signed URL is same as public URL
    return this.getPublicUrl(bucket, path);
  }

  async list(bucket: string, prefix?: string): Promise<StorageFile[]> {
    const searchPrefix = `${STORAGE_PREFIX}${bucket}/${prefix || ''}`;
    const files: StorageFile[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(searchPrefix) && key.endsWith('_meta')) {
        try {
          const meta = JSON.parse(localStorage.getItem(key) || '{}');
          files.push(meta);
        } catch {
          // Skip invalid entries
        }
      }
    }

    console.log(`[LocalStorage] list(${bucket}/${prefix || ''})`, files.length, 'files');
    return files;
  }
}

// Helper to clear all local storage files
export function clearLocalStorage(): void {
  Object.keys(localStorage)
    .filter((key) => key.startsWith(STORAGE_PREFIX))
    .forEach((key) => localStorage.removeItem(key));
  console.log('[LocalStorage] Cleared all files');
}
