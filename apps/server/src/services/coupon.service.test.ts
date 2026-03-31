import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CouponService } from './coupon.service.ts';

/**
 * Use vi.hoisted() to create mock functions that are available when vi.mock runs.
 */
const {
  mockCouponsFindFirst,
  mockCouponsFindMany,
  mockCouponUsagesFindMany,
  mockInsert,
  mockUpdate,
  mockTransaction,
  mockSelect,
} = vi.hoisted(() => ({
  mockCouponsFindFirst: vi.fn(),
  mockCouponsFindMany: vi.fn(),
  mockCouponUsagesFindMany: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockTransaction: vi.fn(),
  mockSelect: vi.fn(),
}));

const mockStripe = vi.hoisted(() => ({
  coupons: {
    create: vi.fn(),
  },
  promotionCodes: {
    create: vi.fn(),
    update: vi.fn(),
  },
}));

/**
 * Mock database - split across @revbrain/database/client, @revbrain/database, and drizzle-orm
 */
vi.mock('@revbrain/database/client', () => ({
  initDB: vi.fn().mockResolvedValue({}),
  db: {
    query: {
      coupons: {
        findFirst: mockCouponsFindFirst,
        findMany: mockCouponsFindMany,
      },
      couponUsages: {
        findMany: mockCouponUsagesFindMany,
      },
      plans: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
    insert: mockInsert,
    update: mockUpdate,
    transaction: mockTransaction,
    select: mockSelect,
  },
}));

vi.mock('@revbrain/database', () => ({
  // Schema tables
  coupons: { id: 'id', code: 'code', isActive: 'is_active', currentUses: 'current_uses' },
  couponUsages: { couponId: 'coupon_id', organizationId: 'organization_id' },
  plans: { id: 'id' },
  auditLogs: { id: 'id', userId: 'user_id', organizationId: 'organization_id', action: 'action' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args) => ({ type: 'eq', args })),
  and: vi.fn((...args) => ({ type: 'and', args })),
  sql: vi.fn((strings, ...values) => ({ type: 'sql', strings, values })),
  inArray: vi.fn((col, arr) => ({ type: 'inArray', col, arr })),
}));

vi.mock('../lib/stripe.ts', () => ({
  isStripeConfigured: vi.fn(() => false),
  getStripe: vi.fn(() => mockStripe),
}));

vi.mock('../lib/logger.ts', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('CouponService', () => {
  let service: CouponService;

  // Use dates far in the future to avoid expiration issues
  const mockCoupon = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    code: 'SAVE20',
    name: 'Save 20%',
    description: 'Get 20% off',
    discountType: 'percent',
    discountValue: 20,
    currency: 'USD',
    maxUses: 100,
    currentUses: 5,
    maxUsesPerUser: 1,
    validFrom: new Date('2020-01-01'),
    validUntil: new Date('2030-12-31'), // Far future
    applicablePlanIds: [],
    minimumAmountCents: 0,
    duration: 'once',
    durationInMonths: null,
    isActive: true,
    stripeCouponId: null,
    stripePromotionCodeId: null,
    createdBy: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CouponService();
  });

  describe('createCoupon', () => {
    it('should create a new coupon with normalized code', async () => {
      mockCouponsFindFirst.mockResolvedValueOnce(null); // No existing coupon
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockCoupon]),
        }),
      });
      mockCouponsFindFirst.mockResolvedValueOnce(mockCoupon); // Return created coupon

      const result = await service.createCoupon({
        code: 'save20',
        name: 'Save 20%',
        discountType: 'percent',
        discountValue: 20,
      });

      expect(result).toEqual(mockCoupon);
      expect(mockInsert).toHaveBeenCalled();
    });

    it('should throw error if coupon code already exists', async () => {
      mockCouponsFindFirst.mockResolvedValueOnce(mockCoupon);

      await expect(
        service.createCoupon({
          code: 'SAVE20',
          name: 'Duplicate',
          discountType: 'percent',
          discountValue: 20,
        })
      ).rejects.toThrow('A coupon with this code already exists');
    });

    it('should throw error for invalid percent discount', async () => {
      mockCouponsFindFirst.mockResolvedValueOnce(null);

      await expect(
        service.createCoupon({
          code: 'INVALID',
          name: 'Invalid',
          discountType: 'percent',
          discountValue: 150,
        })
      ).rejects.toThrow('Percentage discount must be between 1 and 100');
    });

    it('should throw error for invalid fixed discount', async () => {
      mockCouponsFindFirst.mockResolvedValueOnce(null);

      await expect(
        service.createCoupon({
          code: 'INVALID',
          name: 'Invalid',
          discountType: 'fixed',
          discountValue: 0,
        })
      ).rejects.toThrow('Fixed discount must be at least 1 cent');
    });
  });

  describe('validateCoupon', () => {
    it('should return valid result for active coupon', async () => {
      mockCouponsFindFirst.mockResolvedValueOnce(mockCoupon);
      mockCouponUsagesFindMany.mockResolvedValueOnce([]); // No prior usages

      const result = await service.validateCoupon('SAVE20', 'org-123', 'plan-123', 10000);

      expect(result.valid).toBe(true);
      expect(result.coupon?.code).toBe('SAVE20');
      expect(result.discountAmountCents).toBe(2000); // 20% of 10000
    });

    it('should return invalid for non-existent coupon', async () => {
      mockCouponsFindFirst.mockResolvedValueOnce(null);

      const result = await service.validateCoupon('INVALID', 'org-123', 'plan-123', 10000);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid coupon code');
    });

    it('should return invalid for expired coupon', async () => {
      const expiredCoupon = {
        ...mockCoupon,
        validUntil: new Date('2020-12-31'), // In the past
      };
      mockCouponsFindFirst.mockResolvedValueOnce(expiredCoupon);

      const result = await service.validateCoupon('SAVE20', 'org-123', 'plan-123', 10000);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Coupon has expired');
    });

    it('should return invalid when max uses reached', async () => {
      const maxedCoupon = { ...mockCoupon, maxUses: 5, currentUses: 5 };
      mockCouponsFindFirst.mockResolvedValueOnce(maxedCoupon);

      const result = await service.validateCoupon('SAVE20', 'org-123', 'plan-123', 10000);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Coupon usage limit reached');
    });

    it('should return invalid when user already used coupon', async () => {
      mockCouponsFindFirst.mockResolvedValueOnce(mockCoupon);
      mockCouponUsagesFindMany.mockResolvedValueOnce([{ id: 'usage-1' }]); // Prior usage exists

      const result = await service.validateCoupon('SAVE20', 'org-123', 'plan-123', 10000);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('You have already used this coupon');
    });

    it('should return invalid when plan not applicable', async () => {
      const restrictedCoupon = {
        ...mockCoupon,
        applicablePlanIds: ['plan-other'],
      };
      mockCouponsFindFirst.mockResolvedValueOnce(restrictedCoupon);
      mockCouponUsagesFindMany.mockResolvedValueOnce([]);

      const result = await service.validateCoupon('SAVE20', 'org-123', 'plan-123', 10000);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Coupon is not valid for this plan');
    });

    it('should return invalid when minimum amount not met', async () => {
      const minAmountCoupon = {
        ...mockCoupon,
        minimumAmountCents: 5000,
      };
      mockCouponsFindFirst.mockResolvedValueOnce(minAmountCoupon);
      mockCouponUsagesFindMany.mockResolvedValueOnce([]);

      const result = await service.validateCoupon('SAVE20', 'org-123', 'plan-123', 3000);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Minimum purchase amount is $50.00');
    });

    it('should calculate fixed discount correctly', async () => {
      const fixedCoupon = {
        ...mockCoupon,
        discountType: 'fixed',
        discountValue: 500,
      };
      mockCouponsFindFirst.mockResolvedValueOnce(fixedCoupon);
      mockCouponUsagesFindMany.mockResolvedValueOnce([]);

      const result = await service.validateCoupon('SAVE20', 'org-123', 'plan-123', 10000);

      expect(result.valid).toBe(true);
      expect(result.discountAmountCents).toBe(500);
    });

    it('should cap fixed discount at purchase amount', async () => {
      const fixedCoupon = {
        ...mockCoupon,
        discountType: 'fixed',
        discountValue: 5000,
      };
      mockCouponsFindFirst.mockResolvedValueOnce(fixedCoupon);
      mockCouponUsagesFindMany.mockResolvedValueOnce([]);

      const result = await service.validateCoupon('SAVE20', 'org-123', 'plan-123', 3000);

      expect(result.valid).toBe(true);
      expect(result.discountAmountCents).toBe(3000); // Capped at purchase amount
    });
  });

  describe('updateCoupon', () => {
    it('should update coupon and return updated data', async () => {
      const updatedCoupon = { ...mockCoupon, name: 'Updated Name' };
      mockCouponsFindFirst.mockResolvedValueOnce(mockCoupon);
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedCoupon]),
          }),
        }),
      });

      const result = await service.updateCoupon(mockCoupon.id, { name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
    });

    it('should throw error when coupon not found', async () => {
      mockCouponsFindFirst.mockResolvedValueOnce(null);

      await expect(service.updateCoupon('non-existent', { name: 'Test' })).rejects.toThrow(
        'Coupon not found'
      );
    });
  });

  describe('deleteCoupon', () => {
    it('should soft delete coupon by setting isActive to false', async () => {
      mockCouponsFindFirst.mockResolvedValueOnce(mockCoupon);
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      await service.deleteCoupon(mockCoupon.id);

      expect(mockUpdate).toHaveBeenCalled();
    });

    it('should throw error when coupon not found', async () => {
      mockCouponsFindFirst.mockResolvedValueOnce(null);

      await expect(service.deleteCoupon('non-existent')).rejects.toThrow('Coupon not found');
    });
  });

  describe('listCoupons', () => {
    beforeEach(() => {
      // Mock the select().from().where() chain for count query
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        }),
      });
    });

    it('should return only active coupons by default with pagination', async () => {
      mockCouponsFindMany.mockResolvedValueOnce([mockCoupon]);

      const result = await service.listCoupons();

      expect(result.coupons).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockCouponsFindMany).toHaveBeenCalled();
    });

    it('should return all coupons when includeInactive is true', async () => {
      const inactiveCoupon = { ...mockCoupon, isActive: false };
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 2 }]),
        }),
      });
      mockCouponsFindMany.mockResolvedValueOnce([mockCoupon, inactiveCoupon]);

      const result = await service.listCoupons({ includeInactive: true });

      expect(result.coupons).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should apply limit and offset for pagination', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 100 }]),
        }),
      });
      mockCouponsFindMany.mockResolvedValueOnce([mockCoupon]);

      const result = await service.listCoupons({ limit: 10, offset: 20 });

      expect(result.total).toBe(100);
      expect(mockCouponsFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
          offset: 20,
        })
      );
    });
  });

  describe('getCouponById', () => {
    it('should return coupon when found', async () => {
      mockCouponsFindFirst.mockResolvedValueOnce(mockCoupon);

      const result = await service.getCouponById(mockCoupon.id);

      expect(result).toEqual(mockCoupon);
    });

    it('should return undefined when not found', async () => {
      mockCouponsFindFirst.mockResolvedValueOnce(undefined);

      const result = await service.getCouponById('non-existent');

      expect(result).toBeUndefined();
    });
  });
});
