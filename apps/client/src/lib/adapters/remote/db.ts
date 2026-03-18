import type { DBAdapter, QueryOptions } from '@/types/services';

/**
 * Remote Database Adapter (Supabase)
 * Stub implementation - will be connected to Supabase client
 */
export class RemoteDBAdapter implements DBAdapter {
  // TODO: Initialize with Supabase client
  // private supabase: SupabaseClient

  constructor() {
    console.log('[RemoteDB] Initialized - Supabase integration pending');
  }

  async query<T>(table: string, options?: QueryOptions): Promise<T[]> {
    console.log(`[RemoteDB] query(${table})`, options);
    // TODO: Implement with Supabase
    // let query = this.supabase.from(table).select('*')
    // if (options?.filter) query = query.match(options.filter)
    // if (options?.orderBy) query = query.order(options.orderBy.column, { ascending: options.orderBy.ascending })
    // if (options?.limit) query = query.limit(options.limit)
    // if (options?.offset) query = query.range(options.offset, options.offset + (options.limit || 100))
    // const { data, error } = await query
    throw new Error('RemoteDB not yet implemented - use Local mode');
  }

  async queryOne<T>(table: string, id: string): Promise<T | null> {
    console.log(`[RemoteDB] queryOne(${table}, ${id})`);
    // TODO: Implement with Supabase
    // const { data, error } = await this.supabase.from(table).select('*').eq('id', id).single()
    throw new Error('RemoteDB not yet implemented - use Local mode');
  }

  async insert<T>(table: string, data: Omit<T, 'id'>): Promise<T> {
    console.log(`[RemoteDB] insert(${table})`, data);
    // TODO: Implement with Supabase
    // const { data: result, error } = await this.supabase.from(table).insert(data).select().single()
    throw new Error('RemoteDB not yet implemented - use Local mode');
  }

  async update<T>(table: string, id: string, data: Partial<T>): Promise<T> {
    console.log(`[RemoteDB] update(${table}, ${id})`, data);
    throw new Error('RemoteDB not yet implemented - use Local mode');
  }

  async upsert<T>(table: string, data: T): Promise<T> {
    console.log(`[RemoteDB] upsert(${table})`, data);
    throw new Error('RemoteDB not yet implemented - use Local mode');
  }

  async delete(table: string, id: string): Promise<void> {
    console.log(`[RemoteDB] delete(${table}, ${id})`);
    throw new Error('RemoteDB not yet implemented - use Local mode');
  }

  async insertMany<T>(table: string, items: Omit<T, 'id'>[]): Promise<T[]> {
    console.log(`[RemoteDB] insertMany(${table})`, items.length);
    throw new Error('RemoteDB not yet implemented - use Local mode');
  }

  async deleteMany(table: string, ids: string[]): Promise<void> {
    console.log(`[RemoteDB] deleteMany(${table})`, ids.length);
    throw new Error('RemoteDB not yet implemented - use Local mode');
  }
}
