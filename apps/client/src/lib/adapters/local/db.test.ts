import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalDBAdapter } from './db';

// Mock crypto.randomUUID
vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => `test-uuid-${Math.random().toString(36).slice(2, 10)}`),
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    // Needed by clearLocalDB()
    ...Object.create(null, {
      [Symbol.iterator]: {
        value: function* () {
          yield* Object.keys(store);
        },
      },
    }),
  };
})();

// Add keys() method for Object.keys(localStorage) in clearLocalDB
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

interface TestItem {
  id: string;
  name: string;
  value: number;
  createdAt?: string;
  updatedAt?: string;
}

describe('LocalDBAdapter', () => {
  let db: LocalDBAdapter;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    db = new LocalDBAdapter();
  });

  describe('insert', () => {
    it('should insert an item with generated id and timestamps', async () => {
      const result = await db.insert<TestItem>('projects', {
        name: 'Test Project',
        value: 42,
      });

      expect(result.id).toBeDefined();
      expect(result.name).toBe('Test Project');
      expect(result.value).toBe(42);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('should persist to localStorage', async () => {
      await db.insert<TestItem>('projects', { name: 'Test', value: 1 });
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'revbrain_db_projects',
        expect.any(String)
      );
    });
  });

  describe('query', () => {
    it('should return all items in a table', async () => {
      await db.insert<TestItem>('tasks', { name: 'Task 1', value: 1 });
      await db.insert<TestItem>('tasks', { name: 'Task 2', value: 2 });

      const results = await db.query<TestItem>('tasks');
      expect(results).toHaveLength(2);
    });

    it('should return empty array for empty table', async () => {
      const results = await db.query<TestItem>('empty_table');
      expect(results).toEqual([]);
    });

    it('should filter by property', async () => {
      await db.insert<TestItem>('items', { name: 'A', value: 1 });
      await db.insert<TestItem>('items', { name: 'B', value: 2 });
      await db.insert<TestItem>('items', { name: 'A', value: 3 });

      const results = await db.query<TestItem>('items', {
        filter: { name: 'A' },
      });
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.name === 'A')).toBe(true);
    });

    it('should order results ascending', async () => {
      await db.insert<TestItem>('items', { name: 'C', value: 3 });
      await db.insert<TestItem>('items', { name: 'A', value: 1 });
      await db.insert<TestItem>('items', { name: 'B', value: 2 });

      const results = await db.query<TestItem>('items', {
        orderBy: { column: 'name', ascending: true },
      });
      expect(results.map((r) => r.name)).toEqual(['A', 'B', 'C']);
    });

    it('should order results descending', async () => {
      await db.insert<TestItem>('items', { name: 'A', value: 1 });
      await db.insert<TestItem>('items', { name: 'C', value: 3 });
      await db.insert<TestItem>('items', { name: 'B', value: 2 });

      const results = await db.query<TestItem>('items', {
        orderBy: { column: 'value', ascending: false },
      });
      expect(results.map((r) => r.value)).toEqual([3, 2, 1]);
    });

    it('should apply limit', async () => {
      for (let i = 0; i < 5; i++) {
        await db.insert<TestItem>('items', { name: `Item ${i}`, value: i });
      }

      const results = await db.query<TestItem>('items', { limit: 3 });
      expect(results).toHaveLength(3);
    });

    it('should apply offset', async () => {
      for (let i = 0; i < 5; i++) {
        await db.insert<TestItem>('items', { name: `Item ${i}`, value: i });
      }

      const results = await db.query<TestItem>('items', { offset: 3 });
      expect(results).toHaveLength(2);
    });

    it('should apply offset + limit together', async () => {
      for (let i = 0; i < 10; i++) {
        await db.insert<TestItem>('items', { name: `Item ${i}`, value: i });
      }

      const results = await db.query<TestItem>('items', {
        offset: 2,
        limit: 3,
      });
      expect(results).toHaveLength(3);
    });
  });

  describe('queryOne', () => {
    it('should find item by id', async () => {
      const inserted = await db.insert<TestItem>('projects', {
        name: 'Find Me',
        value: 99,
      });

      const found = await db.queryOne<TestItem>('projects', inserted.id);
      expect(found).not.toBeNull();
      expect(found?.name).toBe('Find Me');
    });

    it('should return null for non-existent id', async () => {
      const found = await db.queryOne<TestItem>('projects', 'non-existent-id');
      expect(found).toBeNull();
    });
  });

  describe('update', () => {
    it('should update existing item', async () => {
      const inserted = await db.insert<TestItem>('projects', {
        name: 'Original',
        value: 1,
      });

      const updated = await db.update<TestItem>('projects', inserted.id, {
        name: 'Updated',
      });

      expect(updated.name).toBe('Updated');
      expect(updated.value).toBe(1); // Unchanged field preserved
    });

    it('should throw for non-existent item', async () => {
      await expect(db.update<TestItem>('projects', 'fake-id', { name: 'test' })).rejects.toThrow(
        'Item not found'
      );
    });

    it('should set updatedAt timestamp', async () => {
      const inserted = await db.insert<TestItem>('projects', {
        name: 'Test',
        value: 1,
      });

      const updated = await db.update<TestItem>('projects', inserted.id, {
        name: 'Changed',
      });
      expect(updated.updatedAt).toBeDefined();
      expect(updated.updatedAt).not.toEqual(inserted.updatedAt);
    });
  });

  describe('upsert', () => {
    it('should insert when item does not exist', async () => {
      const result = await db.upsert<TestItem>('items', {
        id: 'new-id',
        name: 'New Item',
        value: 1,
      });

      expect(result.name).toBe('New Item');
      const all = await db.query<TestItem>('items');
      expect(all).toHaveLength(1);
    });

    it('should update when item exists', async () => {
      const inserted = await db.insert<TestItem>('items', {
        name: 'Original',
        value: 1,
      });

      await db.upsert<TestItem>('items', {
        id: inserted.id,
        name: 'Upserted',
        value: 99,
      });

      const all = await db.query<TestItem>('items');
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('Upserted');
      expect(all[0].value).toBe(99);
    });
  });

  describe('delete', () => {
    it('should remove item by id', async () => {
      const inserted = await db.insert<TestItem>('items', {
        name: 'Delete Me',
        value: 1,
      });

      await db.delete('items', inserted.id);
      const all = await db.query<TestItem>('items');
      expect(all).toHaveLength(0);
    });

    it('should not throw for non-existent id', async () => {
      await expect(db.delete('items', 'fake-id')).resolves.not.toThrow();
    });
  });

  describe('insertMany', () => {
    it('should insert multiple items', async () => {
      const results = await db.insertMany<TestItem>('items', [
        { name: 'A', value: 1 },
        { name: 'B', value: 2 },
        { name: 'C', value: 3 },
      ]);

      expect(results).toHaveLength(3);
      results.forEach((r) => {
        expect(r.id).toBeDefined();
        expect(r.createdAt).toBeDefined();
      });
    });
  });

  describe('deleteMany', () => {
    it('should delete multiple items by ids', async () => {
      const items = await db.insertMany<TestItem>('items', [
        { name: 'A', value: 1 },
        { name: 'B', value: 2 },
        { name: 'C', value: 3 },
      ]);

      await db.deleteMany(
        'items',
        items.slice(0, 2).map((i) => i.id)
      );

      const remaining = await db.query<TestItem>('items');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].name).toBe('C');
    });
  });

  describe('table isolation', () => {
    it('should keep data separate between tables', async () => {
      await db.insert<TestItem>('tableA', { name: 'A', value: 1 });
      await db.insert<TestItem>('tableB', { name: 'B', value: 2 });

      const aResults = await db.query<TestItem>('tableA');
      const bResults = await db.query<TestItem>('tableB');

      expect(aResults).toHaveLength(1);
      expect(bResults).toHaveLength(1);
      expect(aResults[0].name).toBe('A');
      expect(bResults[0].name).toBe('B');
    });
  });
});
