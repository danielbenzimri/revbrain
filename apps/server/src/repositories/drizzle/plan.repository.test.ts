import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DrizzlePlanRepository } from './plan.repository.ts';

/**
 * Use vi.hoisted() to create mock functions that are available when vi.mock runs.
 * This is necessary because vi.mock is hoisted to the top of the file.
 */
const { mockFindFirst, mockFindMany, mockInsert, mockUpdate, mockDelete, mockSelect } = vi.hoisted(
  () => ({
    mockFindFirst: vi.fn(),
    mockFindMany: vi.fn(),
    mockInsert: vi.fn(),
    mockUpdate: vi.fn(),
    mockDelete: vi.fn(),
    mockSelect: vi.fn(),
  })
);

/**
 * Mock the database module
 * This allows us to test repository logic without a real database connection
 */
vi.mock('@revbrain/database', () => ({
  db: {
    query: {
      plans: {
        findFirst: mockFindFirst,
        findMany: mockFindMany,
      },
    },
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    select: mockSelect,
  },
  plans: {
    id: 'id',
    name: 'name',
    code: 'code',
    price: 'price',
    isActive: 'is_active',
    isPublic: 'is_public',
    createdAt: 'created_at',
  },
  // Re-export drizzle-orm utilities (mock versions)
  eq: vi.fn((a, b) => ({ op: 'eq', a, b })),
  ne: vi.fn((a, b) => ({ op: 'ne', a, b })),
  and: vi.fn((...args) => ({ op: 'and', args })),
  or: vi.fn((...args) => ({ op: 'or', args })),
  desc: vi.fn((col) => ({ op: 'desc', col })),
  asc: vi.fn((col) => ({ op: 'asc', col })),
  sql: vi.fn((strings, ...values) => ({ op: 'sql', strings, values })),
  inArray: vi.fn((col, arr) => ({ op: 'inArray', col, arr })),
  isNull: vi.fn((col) => ({ op: 'isNull', col })),
  isNotNull: vi.fn((col) => ({ op: 'isNotNull', col })),
  like: vi.fn((col, pattern) => ({ op: 'like', col, pattern })),
  ilike: vi.fn((col, pattern) => ({ op: 'ilike', col, pattern })),
  gt: vi.fn((a, b) => ({ op: 'gt', a, b })),
  gte: vi.fn((a, b) => ({ op: 'gte', a, b })),
  lt: vi.fn((a, b) => ({ op: 'lt', a, b })),
  lte: vi.fn((a, b) => ({ op: 'lte', a, b })),
  not: vi.fn((a) => ({ op: 'not', a })),
}));

describe('DrizzlePlanRepository', () => {
  let repository: DrizzlePlanRepository;

  // Sample plan data for testing
  const mockPlanRow = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Pro Plan',
    code: 'pro',
    description: 'Professional tier',
    price: 9900,
    currency: 'USD',
    interval: 'month',
    limits: { maxUsers: 10, maxProjects: 5, storageGB: 50 },
    features: {
      aiLevel: 'basic' as const,
      modules: ['core'],
      customBranding: false,
      sso: false,
    },
    isActive: true,
    isPublic: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new DrizzlePlanRepository();
  });

  describe('findById', () => {
    it('should return plan entity when found', async () => {
      mockFindFirst.mockResolvedValue(mockPlanRow);

      const result = await repository.findById(mockPlanRow.id);

      expect(mockFindFirst).toHaveBeenCalled();
      expect(result).toEqual({
        id: mockPlanRow.id,
        name: 'Pro Plan',
        code: 'pro',
        description: 'Professional tier',
        price: 9900,
        currency: 'USD',
        interval: 'month',
        limits: { maxUsers: 10, maxProjects: 5, storageGB: 50 },
        features: { aiLevel: 'basic', modules: ['core'], customBranding: false, sso: false },
        isActive: true,
        isPublic: true,
        createdAt: mockPlanRow.createdAt,
        updatedAt: mockPlanRow.updatedAt,
      });
    });

    it('should return null when plan not found', async () => {
      mockFindFirst.mockResolvedValue(undefined);

      const result = await repository.findById('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('findMany', () => {
    it('should return array of plan entities', async () => {
      mockFindMany.mockResolvedValue([mockPlanRow]);

      const result = await repository.findMany();

      expect(mockFindMany).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].code).toBe('pro');
    });

    it('should apply pagination options', async () => {
      mockFindMany.mockResolvedValue([]);

      await repository.findMany({ limit: 10, offset: 20 });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
          offset: 20,
        })
      );
    });
  });

  describe('findByCode', () => {
    it('should find plan by unique code', async () => {
      mockFindFirst.mockResolvedValue(mockPlanRow);

      const result = await repository.findByCode('pro');

      expect(mockFindFirst).toHaveBeenCalled();
      expect(result?.code).toBe('pro');
    });

    it('should return null for non-existent code', async () => {
      mockFindFirst.mockResolvedValue(undefined);

      const result = await repository.findByCode('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findActive', () => {
    it('should return only active plans', async () => {
      const activePlan = { ...mockPlanRow, isActive: true };
      mockFindMany.mockResolvedValue([activePlan]);

      const result = await repository.findActive();

      expect(mockFindMany).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].isActive).toBe(true);
    });
  });

  describe('findPublic', () => {
    it('should return only active and public plans', async () => {
      const publicPlan = { ...mockPlanRow, isActive: true, isPublic: true };
      mockFindMany.mockResolvedValue([publicPlan]);

      const result = await repository.findPublic();

      expect(mockFindMany).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].isActive).toBe(true);
      expect(result[0].isPublic).toBe(true);
    });
  });

  describe('create', () => {
    it('should create a new plan and return entity', async () => {
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockPlanRow]),
        }),
      });

      const result = await repository.create({
        name: 'Pro Plan',
        code: 'pro',
        price: 9900,
      });

      expect(mockInsert).toHaveBeenCalled();
      expect(result.name).toBe('Pro Plan');
      expect(result.code).toBe('pro');
    });
  });

  describe('update', () => {
    it('should update plan and return updated entity', async () => {
      const updatedPlan = { ...mockPlanRow, name: 'Updated Plan' };
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedPlan]),
          }),
        }),
      });

      const result = await repository.update(mockPlanRow.id, { name: 'Updated Plan' });

      expect(mockUpdate).toHaveBeenCalled();
      expect(result?.name).toBe('Updated Plan');
    });

    it('should return null when plan not found', async () => {
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await repository.update('non-existent', { name: 'Test' });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should return true when plan is deleted', async () => {
      mockDelete.mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: mockPlanRow.id }]),
        }),
      });

      const result = await repository.delete(mockPlanRow.id);

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when plan not found', async () => {
      mockDelete.mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await repository.delete('non-existent');

      expect(result).toBe(false);
    });
  });
});
