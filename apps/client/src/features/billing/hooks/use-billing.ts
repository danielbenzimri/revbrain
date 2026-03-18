/**
 * Billing Hooks
 *
 * React Query hooks for billing operations:
 * - Get subscription status
 * - Create checkout session
 * - Create portal session
 * - Get payment history
 */
import { useQuery, useMutation } from '@tanstack/react-query';
import { getAuthHeaders } from '@/lib/auth-headers';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

// Types
export interface Subscription {
  id: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete';
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialStart: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
}

export interface Plan {
  id: string;
  name: string;
  code: string;
  description: string | null;
  price: number; // Monthly price in cents
  currency: string;
  interval: string;
  yearlyDiscountPercent: number; // 0-100
  isActive: boolean;
  isPublic: boolean;
  features: {
    aiLevel: 'none' | 'basic' | 'advanced' | 'full';
    modules: string[];
    customBranding: boolean;
    sso: boolean;
  } | null;
  limits: {
    maxUsers: number;
    maxProjects: number;
    storageGB: number;
  } | null;
}

export interface Payment {
  id: string;
  stripeInvoiceId: string | null;
  amount: string;
  amountCents: number;
  currency: string;
  status: 'succeeded' | 'failed' | 'pending' | 'refunded';
  description: string | null;
  invoiceUrl: string | null;
  receiptUrl: string | null;
  createdAt: string;
}

// Query keys
export const billingKeys = {
  all: ['billing'] as const,
  subscription: () => [...billingKeys.all, 'subscription'] as const,
  payments: () => [...billingKeys.all, 'payments'] as const,
  plans: () => [...billingKeys.all, 'plans'] as const,
};

/**
 * Get available plans for subscription
 */
export function usePlans() {
  return useQuery({
    queryKey: billingKeys.plans(),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/plans`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch plans');
      }

      const result = await response.json();
      // Filter to active and public plans only
      return (result.data as Plan[]).filter((p) => p.isActive && p.isPublic);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - plans rarely change
  });
}

/**
 * Get current subscription status
 */
export function useSubscription() {
  return useQuery({
    queryKey: billingKeys.subscription(),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/billing/subscription`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch subscription');
      }

      const result = await response.json();
      return result.data as { subscription: Subscription | null; plan: Plan | null };
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Get payment history
 */
export function usePaymentHistory(limit = 10) {
  return useQuery({
    queryKey: [...billingKeys.payments(), limit],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/billing/payments?limit=${limit}`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch payments');
      }

      const result = await response.json();
      return result.data as Payment[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Create checkout session and redirect to Stripe
 */
export function useCheckout() {
  return useMutation({
    mutationFn: async (planId: string) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/billing/checkout`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ planId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData.error?.message || errorData.message || 'Failed to create checkout session';
        // Provide user-friendly message for common errors
        if (errorMessage.includes('not configured for billing')) {
          throw new Error('This plan is not available for purchase yet. Please contact support.');
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      return result.data as { checkoutUrl: string; sessionId: string };
    },
    onSuccess: (data) => {
      // Redirect to Stripe Checkout
      window.location.href = data.checkoutUrl;
    },
  });
}

/**
 * Create portal session and redirect to Stripe Customer Portal
 */
export function usePortal() {
  return useMutation({
    mutationFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/billing/portal`, {
        method: 'POST',
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to create portal session');
      }

      const result = await response.json();
      return result.data as { portalUrl: string };
    },
    onSuccess: (data) => {
      // Redirect to Stripe Customer Portal
      window.location.href = data.portalUrl;
    },
  });
}
