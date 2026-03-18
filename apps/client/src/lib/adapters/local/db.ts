import type { DBAdapter, QueryOptions } from '@/types/services';

const STORAGE_PREFIX = 'geometrix_db_';
const SIMULATED_DELAY = 100;

/**
 * Local Database Adapter
 * Uses localStorage for persistence during development
 */
export class LocalDBAdapter implements DBAdapter {
  private getTableKey(table: string): string {
    return `${STORAGE_PREFIX}${table}`;
  }

  private getTableData(table: string): unknown[] {
    try {
      const data = localStorage.getItem(this.getTableKey(table));
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private setTableData(table: string, data: unknown[]): void {
    localStorage.setItem(this.getTableKey(table), JSON.stringify(data));
  }

  private async delay(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, SIMULATED_DELAY));
  }

  async query<T>(table: string, options?: QueryOptions): Promise<T[]> {
    await this.delay();
    let data = this.getTableData(table) as T[];

    // Apply filter
    if (options?.filter) {
      data = data.filter((item) => {
        return Object.entries(options.filter!).every(([key, value]) => {
          return (item as Record<string, unknown>)[key] === value;
        });
      });
    }

    // Apply ordering
    if (options?.orderBy) {
      const { column, ascending = true } = options.orderBy;
      data.sort((a, b) => {
        const aVal = (a as Record<string, unknown>)[column] as string | number;
        const bVal = (b as Record<string, unknown>)[column] as string | number;
        if (aVal < bVal) return ascending ? -1 : 1;
        if (aVal > bVal) return ascending ? 1 : -1;
        return 0;
      });
    }

    // Apply pagination
    if (options?.offset !== undefined) {
      data = data.slice(options.offset);
    }
    if (options?.limit !== undefined) {
      data = data.slice(0, options.limit);
    }

    console.log(`[LocalDB] query(${table})`, data.length, 'results');
    return data;
  }

  async queryOne<T>(table: string, id: string): Promise<T | null> {
    await this.delay();
    const data = this.getTableData(table);
    const item = data.find((item) => (item as { id: string }).id === id) || null;
    console.log(`[LocalDB] queryOne(${table}, ${id})`, item ? 'found' : 'not found');
    return item as T | null;
  }

  async insert<T>(table: string, data: Omit<T, 'id'>): Promise<T> {
    await this.delay();
    const tableData = this.getTableData(table);
    const newItem = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    tableData.push(newItem);
    this.setTableData(table, tableData);
    console.log(`[LocalDB] insert(${table})`, newItem);
    return newItem as T;
  }

  async update<T>(table: string, id: string, data: Partial<T>): Promise<T> {
    await this.delay();
    const tableData = this.getTableData(table);
    const index = tableData.findIndex((item) => (item as { id: string }).id === id);

    if (index === -1) {
      throw new Error(`Item not found: ${table}/${id}`);
    }

    const updated = {
      ...(tableData[index] as object),
      ...data,
      updatedAt: new Date().toISOString(),
    };

    tableData[index] = updated;
    this.setTableData(table, tableData);
    console.log(`[LocalDB] update(${table}, ${id})`, updated);
    return updated as T;
  }

  async upsert<T>(table: string, data: T): Promise<T> {
    await this.delay();
    const tableData = this.getTableData(table);
    const dataObj = data as { id: string };
    const index = tableData.findIndex((item) => (item as { id: string }).id === dataObj.id);

    const now = new Date().toISOString();
    const existing = tableData[index] as { createdAt?: string } | undefined;
    const item = {
      ...(data as object),
      updatedAt: now,
      createdAt: index === -1 ? now : existing?.createdAt || now,
    };

    if (index === -1) {
      tableData.push(item);
    } else {
      tableData[index] = item;
    }

    this.setTableData(table, tableData);
    console.log(`[LocalDB] upsert(${table})`, item);
    return item as T;
  }

  async delete(table: string, id: string): Promise<void> {
    await this.delay();
    const tableData = this.getTableData(table);
    const filtered = tableData.filter((item) => (item as { id: string }).id !== id);
    this.setTableData(table, filtered);
    console.log(`[LocalDB] delete(${table}, ${id})`);
  }

  async insertMany<T>(table: string, items: Omit<T, 'id'>[]): Promise<T[]> {
    await this.delay();
    const tableData = this.getTableData(table);
    const now = new Date().toISOString();

    const newItems = items.map((data) => ({
      id: crypto.randomUUID(),
      ...(data as object),
      createdAt: now,
      updatedAt: now,
    }));

    tableData.push(...newItems);
    this.setTableData(table, tableData);
    console.log(`[LocalDB] insertMany(${table})`, newItems.length, 'items');
    return newItems as T[];
  }

  async deleteMany(table: string, ids: string[]): Promise<void> {
    await this.delay();
    const tableData = this.getTableData(table);
    const idSet = new Set(ids);
    const filtered = tableData.filter((item) => !idSet.has((item as { id: string }).id));
    this.setTableData(table, filtered);
    console.log(`[LocalDB] deleteMany(${table})`, ids.length, 'items');
  }
}

// Helper to clear all local DB data
export function clearLocalDB(): void {
  Object.keys(localStorage)
    .filter((key) => key.startsWith(STORAGE_PREFIX))
    .forEach((key) => localStorage.removeItem(key));
  console.log('[LocalDB] Cleared all data');
}
