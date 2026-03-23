import type { DBAdapter, QueryOptions } from '@/types/services';

/**
 * Remote Database Adapter — STUB
 *
 * Not yet implemented. All data operations go through the server API,
 * not direct client-to-database access. This adapter exists to satisfy
 * the DBAdapter interface.
 *
 * All methods throw — callers should use API hooks (React Query) instead.
 */
export class RemoteDBAdapter implements DBAdapter {
  async query<T>(table: string, options?: QueryOptions): Promise<T[]> {
    void table;
    void options;
    throw new Error('Use API hooks for data access, not direct DB adapter');
  }

  async queryOne<T>(table: string, id: string): Promise<T | null> {
    void table;
    void id;
    throw new Error('Use API hooks for data access, not direct DB adapter');
  }

  async insert<T>(table: string, data: Omit<T, 'id'>): Promise<T> {
    void table;
    void data;
    throw new Error('Use API hooks for data access, not direct DB adapter');
  }

  async update<T>(table: string, id: string, data: Partial<T>): Promise<T> {
    void table;
    void id;
    void data;
    throw new Error('Use API hooks for data access, not direct DB adapter');
  }

  async upsert<T>(table: string, data: T): Promise<T> {
    void table;
    void data;
    throw new Error('Use API hooks for data access, not direct DB adapter');
  }

  async delete(table: string, id: string): Promise<void> {
    void table;
    void id;
    throw new Error('Use API hooks for data access, not direct DB adapter');
  }

  async insertMany<T>(table: string, items: Omit<T, 'id'>[]): Promise<T[]> {
    void table;
    void items;
    throw new Error('Use API hooks for data access, not direct DB adapter');
  }

  async deleteMany(table: string, ids: string[]): Promise<void> {
    void table;
    void ids;
    throw new Error('Use API hooks for data access, not direct DB adapter');
  }
}
