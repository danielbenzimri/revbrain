import type { StorageAdapter, StorageFile } from '@/types/services';

/**
 * Remote Storage Adapter (Supabase Storage)
 * Stub implementation - will be connected to Supabase Storage
 */
export class RemoteStorageAdapter implements StorageAdapter {
  // TODO: Initialize with Supabase client
  // private supabase: SupabaseClient

  constructor() {
    console.log('[RemoteStorage] Initialized - Supabase integration pending');
  }

  async upload(bucket: string, path: string, file: File | Blob): Promise<string> {
    console.log(`[RemoteStorage] upload(${bucket}/${path})`, file.size);
    // TODO: Implement with Supabase
    // const { data, error } = await this.supabase.storage.from(bucket).upload(path, file)
    throw new Error('RemoteStorage not yet implemented - use Local mode');
  }

  async download(bucket: string, path: string): Promise<Blob> {
    console.log(`[RemoteStorage] download(${bucket}/${path})`);
    // TODO: Implement with Supabase
    // const { data, error } = await this.supabase.storage.from(bucket).download(path)
    throw new Error('RemoteStorage not yet implemented - use Local mode');
  }

  async delete(bucket: string, path: string): Promise<void> {
    console.log(`[RemoteStorage] delete(${bucket}/${path})`);
    // TODO: Implement with Supabase
    // const { error } = await this.supabase.storage.from(bucket).remove([path])
    throw new Error('RemoteStorage not yet implemented - use Local mode');
  }

  getPublicUrl(bucket: string, path: string): string {
    console.log(`[RemoteStorage] getPublicUrl(${bucket}/${path})`);
    // TODO: Implement with Supabase
    // return this.supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
    return '';
  }

  async getSignedUrl(bucket: string, path: string, expiresIn = 3600): Promise<string> {
    console.log(`[RemoteStorage] getSignedUrl(${bucket}/${path}, ${expiresIn}s)`);
    // TODO: Implement with Supabase
    // const { data, error } = await this.supabase.storage.from(bucket).createSignedUrl(path, expiresIn)
    throw new Error('RemoteStorage not yet implemented - use Local mode');
  }

  async list(bucket: string, prefix?: string): Promise<StorageFile[]> {
    console.log(`[RemoteStorage] list(${bucket}/${prefix || ''})`);
    // TODO: Implement with Supabase
    // const { data, error } = await this.supabase.storage.from(bucket).list(prefix)
    throw new Error('RemoteStorage not yet implemented - use Local mode');
  }
}
