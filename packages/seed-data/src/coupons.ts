/**
 * Seed Coupons
 *
 * 4 coupons in varied states: active, expired, scheduled, maxed-out.
 */
import { MOCK_IDS } from './constants.ts';
import { daysAgo } from './helpers.ts';

export interface SeedCoupon {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  currency: string;
  duration: 'once' | 'forever' | 'repeating';
  durationInMonths: number | null;
  maxUses: number | null;
  currentUses: number;
  maxUsesPerUser: number | null;
  validFrom: string; // ISO date string
  validUntil: string | null;
  applicablePlanIds: string[];
  minimumAmountCents: number;
  isActive: boolean;
  stripeCouponId: string | null;
  stripePromotionCodeId: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export const SEED_COUPONS: readonly SeedCoupon[] = [
  {
    id: MOCK_IDS.COUPON_ACTIVE_PERCENT,
    code: 'WELCOME20',
    name: 'Welcome Discount',
    description: '20% off for new customers',
    discountType: 'percent',
    discountValue: 20,
    currency: 'USD',
    duration: 'forever',
    durationInMonths: null,
    maxUses: 100,
    currentUses: 15,
    maxUsesPerUser: 1,
    validFrom: daysAgo(60).toISOString(),
    validUntil: null,
    applicablePlanIds: [],
    minimumAmountCents: 0,
    isActive: true,
    stripeCouponId: 'coup_welcome20',
    stripePromotionCodeId: 'promo_welcome20',
    createdBy: MOCK_IDS.USER_SYSTEM_ADMIN,
    createdAt: daysAgo(60),
    updatedAt: daysAgo(30),
  },
  {
    id: MOCK_IDS.COUPON_EXPIRED_FIXED,
    code: 'SUMMER50',
    name: 'Summer Special',
    description: '$50 off summer promotion',
    discountType: 'fixed',
    discountValue: 50,
    currency: 'USD',
    duration: 'once',
    durationInMonths: null,
    maxUses: 200,
    currentUses: 87,
    maxUsesPerUser: 1,
    validFrom: daysAgo(120).toISOString(),
    validUntil: daysAgo(30).toISOString(), // expired 30 days ago
    applicablePlanIds: [MOCK_IDS.PLAN_PRO, MOCK_IDS.PLAN_ENTERPRISE],
    minimumAmountCents: 5000, // $50 minimum
    isActive: true,
    stripeCouponId: 'coup_summer50',
    stripePromotionCodeId: null,
    createdBy: MOCK_IDS.USER_SYSTEM_ADMIN,
    createdAt: daysAgo(120),
    updatedAt: daysAgo(120),
  },
  {
    id: MOCK_IDS.COUPON_SCHEDULED,
    code: 'LAUNCH10',
    name: 'Product Launch',
    description: '10% off for product launch event',
    discountType: 'percent',
    discountValue: 10,
    currency: 'USD',
    duration: 'repeating',
    durationInMonths: 3,
    maxUses: 50,
    currentUses: 0,
    maxUsesPerUser: 1,
    validFrom: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days in future
    validUntil: new Date(Date.now() + 37 * 24 * 60 * 60 * 1000).toISOString(), // 37 days in future
    applicablePlanIds: [],
    minimumAmountCents: 0,
    isActive: true,
    stripeCouponId: null,
    stripePromotionCodeId: null,
    createdBy: MOCK_IDS.USER_SYSTEM_ADMIN,
    createdAt: daysAgo(2),
    updatedAt: daysAgo(2),
  },
  {
    id: MOCK_IDS.COUPON_MAXED_OUT,
    code: 'EARLYBIRD30',
    name: 'Early Bird',
    description: '30% off for early adopters — all codes used',
    discountType: 'percent',
    discountValue: 30,
    currency: 'USD',
    duration: 'once',
    durationInMonths: null,
    maxUses: 10,
    currentUses: 10, // maxed out
    maxUsesPerUser: 1,
    validFrom: daysAgo(90).toISOString(),
    validUntil: null,
    applicablePlanIds: [MOCK_IDS.PLAN_PRO],
    minimumAmountCents: 0,
    isActive: true,
    stripeCouponId: 'coup_earlybird30',
    stripePromotionCodeId: 'promo_earlybird30',
    createdBy: MOCK_IDS.USER_SYSTEM_ADMIN,
    createdAt: daysAgo(90),
    updatedAt: daysAgo(14),
  },
] as const;
