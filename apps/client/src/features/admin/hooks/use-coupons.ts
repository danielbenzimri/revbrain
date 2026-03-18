import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthHeaders } from '@/lib/auth-headers';
import { adminKeys } from './query-keys';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

/**
 * Coupon type matching the database schema
 */
export interface Coupon {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  currency: string;
  maxUses?: number | null;
  currentUses: number;
  maxUsesPerUser?: number | null;
  validFrom: string;
  validUntil?: string | null;
  applicablePlanIds: string[];
  minimumAmountCents: number;
  duration: 'once' | 'forever' | 'repeating';
  durationInMonths?: number | null;
  isActive: boolean;
  stripeCouponId?: string | null;
  stripePromotionCodeId?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CouponUsage {
  id: string;
  couponId: string;
  organizationId: string;
  userId?: string | null;
  discountAmountCents: number;
  stripeInvoiceId?: string | null;
  usedAt: string;
}

export interface CouponCreateInput {
  code: string;
  name: string;
  description?: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  currency?: string;
  maxUses?: number | null;
  maxUsesPerUser?: number | null;
  validFrom?: string;
  validUntil?: string | null;
  applicablePlanIds?: string[];
  minimumAmountCents?: number;
  duration?: 'once' | 'forever' | 'repeating';
  durationInMonths?: number | null;
  isActive?: boolean;
}

export interface CouponUpdateInput {
  name?: string;
  description?: string | null;
  maxUses?: number | null;
  maxUsesPerUser?: number | null;
  validFrom?: string;
  validUntil?: string | null;
  applicablePlanIds?: string[];
  minimumAmountCents?: number;
  isActive?: boolean;
}

/**
 * Fetch all coupons with optional pagination
 */
export function useCoupons(options?: { includeInactive?: boolean }) {
  return useQuery({
    queryKey: [...adminKeys.couponsList(), options],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams();
      if (options?.includeInactive) {
        params.set('includeInactive', 'true');
      }
      const url = `${apiUrl}/v1/admin/coupons${params.toString() ? `?${params}` : ''}`;
      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch coupons');
      }

      const result = await response.json();
      return result.data as Coupon[];
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch a single coupon with usage history
 */
export function useCouponDetail(couponId: string | null) {
  return useQuery({
    queryKey: adminKeys.couponDetail(couponId || ''),
    queryFn: async () => {
      if (!couponId) return null;
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/admin/coupons/${couponId}`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch coupon');
      }

      const result = await response.json();
      return result.data as { coupon: Coupon; usages: CouponUsage[] };
    },
    enabled: !!couponId,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Create a new coupon
 */
export function useCreateCoupon() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CouponCreateInput) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/admin/coupons`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to create coupon');
      }

      const result = await response.json();
      return result.data as Coupon;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.coupons() });
    },
  });
}

/**
 * Update an existing coupon
 */
export function useUpdateCoupon() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CouponUpdateInput }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/admin/coupons/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to update coupon');
      }

      const result = await response.json();
      return result.data as Coupon;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.coupons() });
    },
  });
}

/**
 * Deactivate (soft delete) a coupon
 */
export function useDeleteCoupon() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (couponId: string) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/admin/coupons/${couponId}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to delete coupon');
      }

      return couponId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.coupons() });
    },
  });
}

/**
 * Force sync a coupon to Stripe
 */
export function useSyncCouponToStripe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (couponId: string) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/admin/coupons/${couponId}/sync`, {
        method: 'POST',
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to sync coupon to Stripe');
      }

      return response.json();
    },
    onSuccess: (_, couponId) => {
      queryClient.invalidateQueries({ queryKey: adminKeys.couponDetail(couponId) });
      queryClient.invalidateQueries({ queryKey: adminKeys.couponsList() });
    },
  });
}
