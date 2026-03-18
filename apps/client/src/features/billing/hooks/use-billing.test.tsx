/**
 * Unit tests for use-billing hooks
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  usePlans,
  useSubscription,
  usePaymentHistory,
  useCheckout,
  usePortal,
  type Plan,
  type Subscription,
  type Payment,
} from './use-billing';
import * as authHeaders from '@/lib/auth-headers';

// Mock auth headers
vi.mock('@/lib/auth-headers', () => ({
  getAuthHeaders: vi.fn(),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock window.location
const originalLocation = window.location;
beforeAll(() => {
  Object.defineProperty(window, 'location', {
    value: { href: '' },
    writable: true,
  });
});
afterAll(() => {
  Object.defineProperty(window, 'location', { value: originalLocation });
});

// Create wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const mockPlan: Plan = {
  id: 'plan-123',
  name: 'Pro',
  code: 'pro',
  description: 'Pro plan for teams',
  price: 2900,
  currency: 'USD',
  interval: 'month',
  yearlyDiscountPercent: 20,
  isActive: true,
  isPublic: true,
  features: {
    aiLevel: 'advanced',
    modules: ['tasks', 'billing', 'reports'],
    customBranding: true,
    sso: false,
  },
  limits: {
    maxUsers: 25,
    maxProjects: 50,
    storageGB: 100,
  },
};

const mockSubscription: Subscription = {
  id: 'sub-123',
  status: 'active',
  currentPeriodStart: '2026-01-15T00:00:00Z',
  currentPeriodEnd: '2026-02-15T00:00:00Z',
  trialStart: null,
  trialEnd: null,
  cancelAtPeriodEnd: false,
  canceledAt: null,
};

const mockPayment: Payment = {
  id: 'pay-123',
  stripeInvoiceId: 'in_123',
  amount: '$29.00',
  amountCents: 2900,
  currency: 'USD',
  status: 'succeeded',
  description: 'Pro plan - monthly',
  invoiceUrl: 'https://stripe.com/invoice/123',
  receiptUrl: 'https://stripe.com/receipt/123',
  createdAt: '2026-02-01T00:00:00Z',
};

describe('use-billing hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authHeaders.getAuthHeaders).mockResolvedValue({
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-token',
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('usePlans', () => {
    it('should fetch plans successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [mockPlan] }),
      });

      const { result } = renderHook(() => usePlans(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toHaveLength(1);
      expect(result.current.data?.[0].name).toBe('Pro');
    });

    it('should filter out inactive and non-public plans', async () => {
      const inactivePlan = { ...mockPlan, id: 'plan-2', isActive: false };
      const privatePlan = { ...mockPlan, id: 'plan-3', isPublic: false };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [mockPlan, inactivePlan, privatePlan] }),
      });

      const { result } = renderHook(() => usePlans(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toHaveLength(1);
      expect(result.current.data?.[0].id).toBe('plan-123');
    });

    it('should handle fetch error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const { result } = renderHook(() => usePlans(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Failed to fetch plans');
    });
  });

  describe('useSubscription', () => {
    it('should fetch subscription successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { subscription: mockSubscription, plan: mockPlan } }),
      });

      const { result } = renderHook(() => useSubscription(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.subscription?.status).toBe('active');
      expect(result.current.data?.plan?.name).toBe('Pro');
    });

    it('should handle no subscription', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { subscription: null, plan: null } }),
      });

      const { result } = renderHook(() => useSubscription(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.subscription).toBeNull();
    });
  });

  describe('usePaymentHistory', () => {
    it('should fetch payment history successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [mockPayment] }),
      });

      const { result } = renderHook(() => usePaymentHistory(10), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toHaveLength(1);
      expect(result.current.data?.[0].status).toBe('succeeded');
    });

    it('should pass limit parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      renderHook(() => usePaymentHistory(5), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('limit=5'),
          expect.any(Object)
        );
      });
    });
  });

  describe('useCheckout', () => {
    it('should create checkout session and redirect', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { checkoutUrl: 'https://stripe.com/checkout/123', sessionId: 'cs_123' },
        }),
      });

      const { result } = renderHook(() => useCheckout(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate('plan-123');
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(window.location.href).toBe('https://stripe.com/checkout/123');
    });

    it('should handle billing not configured error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Plan not configured for billing' }),
      });

      const { result } = renderHook(() => useCheckout(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate('plan-123');
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toContain('not available for purchase');
    });
  });

  describe('usePortal', () => {
    it('should create portal session and redirect', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { portalUrl: 'https://stripe.com/portal/123' },
        }),
      });

      const { result } = renderHook(() => usePortal(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate();
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(window.location.href).toBe('https://stripe.com/portal/123');
    });

    it('should handle portal error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: 'No active subscription' } }),
      });

      const { result } = renderHook(() => usePortal(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate();
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe('No active subscription');
    });
  });
});
