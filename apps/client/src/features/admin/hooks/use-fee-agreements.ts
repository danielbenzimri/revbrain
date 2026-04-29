/**
 * Admin Fee Agreement React Query Hooks (SI Billing)
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthHeaders } from '@/lib/auth-headers';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

export interface FeeAgreement {
  id: string;
  projectId: string;
  version: number;
  status: string;
  assessmentFee: number;
  declaredProjectValue: number | null;
  capAmount: number | null;
  calculatedTotalFee: number | null;
  calculatedRemainingFee: number | null;
  paymentTerms: string;
  acceptedAt: string | null;
  migrationAcceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FeeMilestone {
  id: string;
  feeAgreementId: string;
  name: string;
  phase: string;
  amount: number;
  status: string;
  paidVia: string;
  sortOrder: number;
}

export interface FeeAgreementTier {
  id: string;
  bracketCeiling: number | null;
  rateBps: number;
  sortOrder: number;
}

const agreementKeys = {
  all: ['admin', 'fee-agreements'] as const,
  detail: (id: string) => ['admin', 'fee-agreements', id] as const,
};

export function useFeeAgreementDetail(id: string) {
  return useQuery({
    queryKey: agreementKeys.detail(id),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${apiUrl}/v1/admin/fee-agreements/${id}`, { headers });
      const json = await res.json();
      return json.data as {
        agreement: FeeAgreement;
        milestones: FeeMilestone[];
        tiers: FeeAgreementTier[];
      };
    },
    enabled: !!id,
  });
}

export function useCreateFeeAgreement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      projectId: string;
      assessmentFee?: number;
      paymentTerms?: string;
      capAmount?: number | null;
    }) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${apiUrl}/v1/admin/fee-agreements`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agreementKeys.all });
    },
  });
}

export function useApproveMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${apiUrl}/v1/admin/milestones/${id}/approve`, {
        method: 'POST',
        headers,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agreementKeys.all });
    },
  });
}

export function useRejectMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${apiUrl}/v1/admin/milestones/${id}/reject`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agreementKeys.all });
    },
  });
}

export function useCancelAgreement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${apiUrl}/v1/admin/fee-agreements/${id}/cancel`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agreementKeys.all });
    },
  });
}
