/**
 * Mock Coupon Repository
 *
 * In-memory CRUD for coupons.
 */
import { mockCoupons, type SeedCoupon } from '../../mocks/index.ts';
import { generateId, applyPagination, applySorting } from './helpers.ts';

export class MockCouponRepository {
  async findMany(options?: {
    includeInactive?: boolean;
    limit?: number;
    offset?: number;
    orderBy?: { field: string; direction: 'asc' | 'desc' };
  }) {
    let items = [...mockCoupons];

    // By default, only return active coupons
    if (!options?.includeInactive) {
      items = items.filter((c) => c.isActive);
    }

    const field = (options?.orderBy?.field as keyof SeedCoupon) || 'createdAt';
    items = applySorting(items, field, options?.orderBy?.direction || 'desc');

    return applyPagination(items, options);
  }

  async findById(id: string): Promise<SeedCoupon | null> {
    return mockCoupons.find((c) => c.id === id) ?? null;
  }

  async findByCode(code: string): Promise<SeedCoupon | null> {
    return mockCoupons.find((c) => c.code === code) ?? null;
  }

  async create(data: Partial<SeedCoupon>): Promise<SeedCoupon> {
    const now = new Date();
    const entity: SeedCoupon = {
      id: generateId(),
      code: data.code || '',
      name: data.name || '',
      description: data.description ?? null,
      discountType: data.discountType || 'percent',
      discountValue: data.discountValue || 0,
      currency: data.currency || 'USD',
      duration: data.duration || 'once',
      durationInMonths: data.durationInMonths ?? null,
      maxUses: data.maxUses ?? null,
      currentUses: 0,
      maxUsesPerUser: data.maxUsesPerUser ?? null,
      validFrom: data.validFrom || now.toISOString(),
      validUntil: data.validUntil ?? null,
      applicablePlanIds: data.applicablePlanIds || [],
      minimumAmountCents: data.minimumAmountCents || 0,
      isActive: data.isActive ?? true,
      stripeCouponId: data.stripeCouponId ?? null,
      stripePromotionCodeId: data.stripePromotionCodeId ?? null,
      createdBy: data.createdBy || '',
      createdAt: now,
      updatedAt: now,
    };
    mockCoupons.push(entity);
    return entity;
  }

  async update(id: string, data: Partial<SeedCoupon>): Promise<SeedCoupon | null> {
    const idx = mockCoupons.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    const updated = { ...mockCoupons[idx], ...data, updatedAt: new Date() };
    mockCoupons[idx] = updated;
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const idx = mockCoupons.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    // Soft delete
    mockCoupons[idx] = { ...mockCoupons[idx], isActive: false, updatedAt: new Date() };
    return true;
  }

  async getUsageHistory(_couponId: string) {
    // Mock: return empty usage history
    return [] as Array<{
      id: string;
      couponId: string;
      organizationId: string;
      userId: string;
      discountAmountCents: number;
      usedAt: Date;
    }>;
  }
}
