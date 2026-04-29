/**
 * SI Partner Billing Hooks
 *
 * React Query hooks for the SI billing page and project billing tab.
 * Replaces the old subscription-based billing hooks.
 *
 * Task: P4.4, P5.3
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthHeaders } from '@/lib/auth-headers';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

export interface PartnerStatus {
  id: string;
  organizationId: string;
  tier: string;
  cumulativeFeesPaid: number;
  completedProjectCount: number;
  tierOverride: string | null;
}

export interface BillingAgreement {
  id: string;
  projectId: string;
  version: number;
  status: string;
  assessmentFee: number;
  declaredProjectValue: number | null;
  calculatedTotalFee: number | null;
  calculatedRemainingFee: number | null;
  paymentTerms: string;
  acceptedAt: string | null;
  migrationAcceptedAt: string | null;
}

export interface BillingMilestone {
  id: string;
  feeAgreementId: string;
  name: string;
  phase: string;
  amount: number;
  status: string;
  paidVia: string;
  invoicedAt: string | null;
  paidAt: string | null;
  sortOrder: number;
}

const billingKeys = {
  partnerStatus: ['billing', 'partner-status'] as const,
  agreements: ['billing', 'agreements'] as const,
  agreementDetail: (id: string) => ['billing', 'agreements', id] as const,
  invoices: ['billing', 'invoices'] as const,
};

export function usePartnerStatus() {
  return useQuery({
    queryKey: billingKeys.partnerStatus,
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${apiUrl}/v1/billing/partner-status`, { headers });
      const json = await res.json();
      return json.data as PartnerStatus | null;
    },
  });
}

export function useBillingAgreements() {
  return useQuery({
    queryKey: billingKeys.agreements,
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${apiUrl}/v1/billing/agreements`, { headers });
      const json = await res.json();
      return (json.data ?? []) as BillingAgreement[];
    },
  });
}

export function useBillingAgreementDetail(id: string) {
  return useQuery({
    queryKey: billingKeys.agreementDetail(id),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${apiUrl}/v1/billing/agreements/${id}`, { headers });
      const json = await res.json();
      return json.data as {
        agreement: BillingAgreement;
        milestones: BillingMilestone[];
        tiers: unknown[];
      };
    },
    enabled: !!id,
  });
}

export function useBillingInvoices() {
  return useQuery({
    queryKey: billingKeys.invoices,
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${apiUrl}/v1/billing/invoices`, { headers });
      const json = await res.json();
      return (json.data ?? []) as BillingMilestone[];
    },
  });
}

export function useAcceptAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (agreementId: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${apiUrl}/v1/billing/agreements/${agreementId}/accept-assessment`, {
        method: 'POST',
        headers,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: billingKeys.agreements });
    },
  });
}

export function useCloseAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason, notes }: { id: string; reason: string; notes?: string }) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${apiUrl}/v1/billing/agreements/${id}/close-assessment`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, notes }),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: billingKeys.agreements });
    },
  });
}

export function useRequestMilestoneComplete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${apiUrl}/v1/billing/milestones/${id}/request-complete`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: billingKeys.agreements });
    },
  });
}

export function useProceedToMigration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      declaredProjectValue,
      sowFileId,
    }: {
      id: string;
      declaredProjectValue: number;
      sowFileId?: string;
    }) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${apiUrl}/v1/billing/agreements/${id}/proceed-migration`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ declaredProjectValue, sowFileId }),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: billingKeys.agreements });
    },
  });
}

export function useAcceptMigration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      declaredProjectValue,
      sowFileId,
    }: {
      id: string;
      declaredProjectValue: number;
      sowFileId?: string;
    }) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${apiUrl}/v1/billing/agreements/${id}/accept-migration`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ declaredProjectValue, sowFileId }),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: billingKeys.agreements });
    },
  });
}

// Utility functions
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function getTierProgress(cumulativeFeesPaid: number): {
  currentTier: string;
  nextTier: string | null;
  nextThreshold: number;
  progress: number;
} {
  const thresholds = [
    { tier: 'standard', min: 0 },
    { tier: 'silver', min: 25_000_000 },
    { tier: 'gold', min: 75_000_000 },
    { tier: 'platinum', min: 200_000_000 },
  ];

  let currentIdx = 0;
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (cumulativeFeesPaid >= thresholds[i].min) {
      currentIdx = i;
      break;
    }
  }

  const current = thresholds[currentIdx];
  const next = currentIdx < thresholds.length - 1 ? thresholds[currentIdx + 1] : null;

  return {
    currentTier: current.tier,
    nextTier: next?.tier ?? null,
    nextThreshold: next?.min ?? current.min,
    progress: next ? Math.min((cumulativeFeesPaid / next.min) * 100, 100) : 100,
  };
}
