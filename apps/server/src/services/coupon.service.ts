/**
 * Coupon Service
 *
 * Handles coupon CRUD, Stripe sync, and validation.
 * Coupons are synced to Stripe as Coupon + Promotion Code pairs.
 */
import type { DrizzleDB } from '@revbrain/database';
import { coupons, couponUsages, plans, auditLogs } from '@revbrain/database';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { getStripe, isStripeConfigured } from '../lib/stripe.ts';
import { logger } from '../lib/logger.ts';
import type Stripe from 'stripe';

// Lazy database accessor — prevents postgres.js from loading on Edge Functions (Deno)
let _db: DrizzleDB | null = null;
async function getDb(): Promise<DrizzleDB> {
  if (!_db) {
    const { db } = await import('@revbrain/database/client');
    _db = db;
  }
  return _db;
}

export interface CreateCouponInput {
  code: string;
  name: string;
  description?: string | null;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  currency?: string;
  maxUses?: number | null;
  maxUsesPerUser?: number | null;
  validFrom?: Date;
  validUntil?: Date | null;
  applicablePlanIds?: string[];
  minimumAmountCents?: number;
  duration?: 'once' | 'forever' | 'repeating';
  durationInMonths?: number | null;
  isActive?: boolean;
  createdBy?: string | null;
}

export interface UpdateCouponInput {
  name?: string;
  description?: string | null;
  maxUses?: number | null;
  maxUsesPerUser?: number | null;
  validFrom?: Date;
  validUntil?: Date | null;
  applicablePlanIds?: string[];
  minimumAmountCents?: number;
  isActive?: boolean;
}

export interface ValidateCouponResult {
  valid: boolean;
  coupon?: {
    id: string;
    code: string;
    discountType: 'percent' | 'fixed';
    discountValue: number;
    currency: string | null;
  };
  error?: string;
  discountAmountCents?: number;
}

export class CouponService {
  /**
   * Create a new coupon and optionally sync to Stripe.
   */
  async createCoupon(input: CreateCouponInput) {
    // Normalize code to uppercase
    const code = input.code.toUpperCase().trim();

    // Check for existing code
    const existing = await (
      await getDb()
    ).query.coupons.findFirst({
      where: eq(coupons.code, code),
    });

    if (existing) {
      throw new Error('A coupon with this code already exists');
    }

    // Validate discount value
    if (
      input.discountType === 'percent' &&
      (input.discountValue < 1 || input.discountValue > 100)
    ) {
      throw new Error('Percentage discount must be between 1 and 100');
    }

    if (input.discountType === 'fixed' && input.discountValue < 1) {
      throw new Error('Fixed discount must be at least 1 cent');
    }

    // Create in database first
    const [newCoupon] = await (
      await getDb()
    )
      .insert(coupons)
      .values({
        code,
        name: input.name,
        description: input.description,
        discountType: input.discountType,
        discountValue: input.discountValue,
        currency: input.currency || 'USD',
        maxUses: input.maxUses,
        maxUsesPerUser: input.maxUsesPerUser ?? 1,
        validFrom: input.validFrom || new Date(),
        validUntil: input.validUntil,
        applicablePlanIds: input.applicablePlanIds || [],
        minimumAmountCents: input.minimumAmountCents || 0,
        duration: input.duration || 'once',
        durationInMonths: input.durationInMonths,
        isActive: input.isActive ?? true,
        createdBy: input.createdBy,
      })
      .returning();

    logger.info('Coupon created', { couponId: newCoupon.id, code: newCoupon.code });

    // Audit log the creation
    await (await getDb()).insert(auditLogs).values({
      userId: input.createdBy || null,
      organizationId: null, // System-level operation
      action: 'coupon.created',
      metadata: {
        couponId: newCoupon.id,
        code: newCoupon.code,
        name: newCoupon.name,
        discountType: newCoupon.discountType,
        discountValue: newCoupon.discountValue,
        duration: newCoupon.duration,
        maxUses: newCoupon.maxUses,
      },
    });

    // Auto-sync to Stripe if active
    if (newCoupon.isActive && isStripeConfigured()) {
      try {
        await this.syncCouponToStripe(newCoupon.id);
      } catch (err) {
        logger.error('Failed to sync coupon to Stripe', { couponId: newCoupon.id }, err as Error);
        // Don't fail the creation, just log the error
      }
    }

    // Fetch fresh data with Stripe IDs
    const result = await (
      await getDb()
    ).query.coupons.findFirst({
      where: eq(coupons.id, newCoupon.id),
    });

    return result!;
  }

  /**
   * Sync coupon to Stripe (create Coupon + Promotion Code).
   */
  async syncCouponToStripe(couponId: string): Promise<void> {
    if (!isStripeConfigured()) {
      logger.info('Stripe not configured, skipping coupon sync');
      return;
    }

    const stripe = getStripe();
    const coupon = await (
      await getDb()
    ).query.coupons.findFirst({
      where: eq(coupons.id, couponId),
    });

    if (!coupon) {
      throw new Error('Coupon not found');
    }

    // Skip if already synced
    if (coupon.stripeCouponId && coupon.stripePromotionCodeId) {
      logger.info('Coupon already synced to Stripe', { couponId });
      return;
    }

    // Create Stripe Coupon (discount definition)
    const stripeCouponParams: Stripe.CouponCreateParams = {
      name: coupon.name,
      duration: coupon.duration as 'once' | 'forever' | 'repeating',
      metadata: {
        app_coupon_id: coupon.id,
        app_coupon_code: coupon.code,
      },
    };

    if (coupon.discountType === 'percent') {
      stripeCouponParams.percent_off = coupon.discountValue;
    } else {
      stripeCouponParams.amount_off = coupon.discountValue;
      stripeCouponParams.currency = (coupon.currency || 'USD').toLowerCase();
    }

    if (coupon.duration === 'repeating' && coupon.durationInMonths) {
      stripeCouponParams.duration_in_months = coupon.durationInMonths;
    }

    // Restrict to specific products if applicable plans specified
    const planIds = coupon.applicablePlanIds as string[] | null;
    if (planIds && planIds.length > 0) {
      const applicablePlans = await (
        await getDb()
      ).query.plans.findMany({
        where: inArray(plans.id, planIds),
      });

      const productIds = applicablePlans
        .filter((p) => p.stripeProductId)
        .map((p) => p.stripeProductId!);

      if (productIds.length > 0) {
        stripeCouponParams.applies_to = { products: productIds };
      }
    }

    const stripeCoupon = await stripe.coupons.create(stripeCouponParams);

    // Create Stripe Promotion Code (user-facing code)
    // Note: Type assertion needed due to Stripe SDK type definition issue
    // The 'coupon' property is valid per Stripe API but missing from TS types
    const promoParams = {
      coupon: stripeCoupon.id,
      code: coupon.code,
      active: coupon.isActive,
      metadata: {
        app_coupon_id: coupon.id,
      },
      ...(coupon.maxUses && { max_redemptions: coupon.maxUses }),
      ...(coupon.validUntil && {
        expires_at: Math.floor(coupon.validUntil.getTime() / 1000),
      }),
      ...(coupon.minimumAmountCents &&
        coupon.minimumAmountCents > 0 && {
          restrictions: {
            minimum_amount: coupon.minimumAmountCents,
            minimum_amount_currency: (coupon.currency || 'USD').toLowerCase(),
            first_time_transaction: false,
          },
        }),
    } as unknown as Stripe.PromotionCodeCreateParams;
    const stripePromoCode = await stripe.promotionCodes.create(promoParams);

    // Update database with Stripe IDs
    await (
      await getDb()
    )
      .update(coupons)
      .set({
        stripeCouponId: stripeCoupon.id,
        stripePromotionCodeId: stripePromoCode.id,
        updatedAt: new Date(),
      })
      .where(eq(coupons.id, couponId));

    logger.info('Coupon synced to Stripe', {
      couponId,
      stripeCouponId: stripeCoupon.id,
      stripePromoCodeId: stripePromoCode.id,
    });
  }

  /**
   * Update a coupon.
   * Note: Some fields cannot be updated in Stripe after creation (code, discount).
   */
  async updateCoupon(couponId: string, updates: UpdateCouponInput, actorId?: string) {
    const existing = await (
      await getDb()
    ).query.coupons.findFirst({
      where: eq(coupons.id, couponId),
    });

    if (!existing) {
      throw new Error('Coupon not found');
    }

    const [updated] = await (
      await getDb()
    )
      .update(coupons)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(coupons.id, couponId))
      .returning();

    // Audit log the update
    await (await getDb()).insert(auditLogs).values({
      userId: actorId || null,
      organizationId: null, // System-level operation
      action: 'coupon.updated',
      metadata: {
        couponId,
        code: existing.code,
        changes: updates,
        previousValues: {
          name: existing.name,
          maxUses: existing.maxUses,
          isActive: existing.isActive,
          validUntil: existing.validUntil?.toISOString() || null,
        },
      },
    });

    // Update Stripe promotion code active status if changed
    if (updates.isActive !== undefined && existing.stripePromotionCodeId && isStripeConfigured()) {
      try {
        const stripe = getStripe();
        await stripe.promotionCodes.update(existing.stripePromotionCodeId, {
          active: updates.isActive,
        });
        logger.info('Updated Stripe promotion code status', {
          couponId,
          promoCodeId: existing.stripePromotionCodeId,
          isActive: updates.isActive,
        });
      } catch (err) {
        logger.error('Failed to update Stripe promotion code', { couponId }, err as Error);
      }
    }

    return updated;
  }

  /**
   * Deactivate a coupon (soft delete).
   */
  async deleteCoupon(couponId: string, actorId?: string): Promise<void> {
    const coupon = await (
      await getDb()
    ).query.coupons.findFirst({
      where: eq(coupons.id, couponId),
    });

    if (!coupon) {
      throw new Error('Coupon not found');
    }

    // Deactivate in Stripe
    if (coupon.stripePromotionCodeId && isStripeConfigured()) {
      try {
        const stripe = getStripe();
        await stripe.promotionCodes.update(coupon.stripePromotionCodeId, {
          active: false,
        });
      } catch (err) {
        logger.error('Failed to deactivate Stripe promotion code', { couponId }, err as Error);
      }
    }

    // Soft delete in database
    await (
      await getDb()
    )
      .update(coupons)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(coupons.id, couponId));

    // Audit log the deletion
    await (await getDb()).insert(auditLogs).values({
      userId: actorId || null,
      organizationId: null, // System-level operation
      action: 'coupon.deleted',
      metadata: {
        couponId,
        code: coupon.code,
        name: coupon.name,
        usageCount: coupon.currentUses,
      },
    });

    logger.info('Coupon deactivated', { couponId });
  }

  /**
   * Validate a coupon code for checkout.
   */
  async validateCoupon(
    code: string,
    organizationId: string,
    planId: string,
    amountCents: number
  ): Promise<ValidateCouponResult> {
    const normalizedCode = code.toUpperCase().trim();
    const now = new Date();

    const coupon = await (
      await getDb()
    ).query.coupons.findFirst({
      where: and(eq(coupons.code, normalizedCode), eq(coupons.isActive, true)),
    });

    if (!coupon) {
      return { valid: false, error: 'Invalid coupon code' };
    }

    // Check validity period
    if (coupon.validFrom > now) {
      return { valid: false, error: 'Coupon is not yet active' };
    }

    if (coupon.validUntil && coupon.validUntil < now) {
      return { valid: false, error: 'Coupon has expired' };
    }

    // Check max uses
    if (coupon.maxUses && coupon.currentUses >= coupon.maxUses) {
      return { valid: false, error: 'Coupon usage limit reached' };
    }

    // Check per-user limit
    if (coupon.maxUsesPerUser) {
      const userUsages = await (
        await getDb()
      ).query.couponUsages.findMany({
        where: and(
          eq(couponUsages.couponId, coupon.id),
          eq(couponUsages.organizationId, organizationId)
        ),
      });

      if (userUsages.length >= coupon.maxUsesPerUser) {
        return { valid: false, error: 'You have already used this coupon' };
      }
    }

    // Check plan restriction
    const planIds = coupon.applicablePlanIds as string[] | null;
    if (planIds && planIds.length > 0) {
      if (!planIds.includes(planId)) {
        return { valid: false, error: 'Coupon is not valid for this plan' };
      }
    }

    // Check minimum amount
    if (coupon.minimumAmountCents && amountCents < coupon.minimumAmountCents) {
      return {
        valid: false,
        error: `Minimum purchase amount is $${(coupon.minimumAmountCents / 100).toFixed(2)}`,
      };
    }

    // Calculate discount
    let discountAmountCents: number;
    if (coupon.discountType === 'percent') {
      discountAmountCents = Math.round(amountCents * (coupon.discountValue / 100));
    } else {
      discountAmountCents = Math.min(coupon.discountValue, amountCents);
    }

    return {
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        discountType: coupon.discountType as 'percent' | 'fixed',
        discountValue: coupon.discountValue,
        currency: coupon.currency,
      },
      discountAmountCents,
    };
  }

  /**
   * Record coupon usage after successful payment.
   */
  async recordUsage(
    couponId: string,
    organizationId: string,
    userId: string | null,
    discountAmountCents: number,
    stripeInvoiceId?: string,
    stripeSubscriptionId?: string
  ): Promise<void> {
    await (
      await getDb()
    ).transaction(async (tx) => {
      // Insert usage record
      await tx.insert(couponUsages).values({
        couponId,
        organizationId,
        userId,
        discountAmountCents,
        stripeInvoiceId,
        stripeSubscriptionId,
      });

      // Increment usage count
      await tx
        .update(coupons)
        .set({
          currentUses: sql`${coupons.currentUses} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(coupons.id, couponId));
    });

    logger.info('Coupon usage recorded', { couponId, organizationId, discountAmountCents });
  }

  /**
   * Get coupons with pagination and optional filtering.
   * Pagination is applied at the database level for efficiency.
   */
  async listCoupons(options?: {
    includeInactive?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ coupons: (typeof coupons.$inferSelect)[]; total: number }> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const includeInactive = options?.includeInactive ?? false;

    // Build where clause
    const whereClause = includeInactive ? undefined : eq(coupons.isActive, true);

    // Get total count (for pagination metadata)
    const countResult = await (
      await getDb()
    )
      .select({ count: sql<number>`count(*)::int` })
      .from(coupons)
      .where(whereClause);
    const total = countResult[0]?.count ?? 0;

    // Get paginated results at database level
    const results = await (
      await getDb()
    ).query.coupons.findMany({
      where: whereClause,
      orderBy: (c, { desc }) => [desc(c.createdAt)],
      limit,
      offset,
    });

    return { coupons: results, total };
  }

  /**
   * Get a single coupon by ID.
   */
  async getCouponById(couponId: string) {
    return (await getDb()).query.coupons.findFirst({
      where: eq(coupons.id, couponId),
    });
  }

  /**
   * Get coupon usage history.
   */
  async getCouponUsages(couponId: string) {
    return (await getDb()).query.couponUsages.findMany({
      where: eq(couponUsages.couponId, couponId),
      with: {
        organization: true,
        user: true,
      },
      orderBy: (u, { desc }) => [desc(u.usedAt)],
    });
  }
}
