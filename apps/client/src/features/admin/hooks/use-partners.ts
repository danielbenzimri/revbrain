/**
 * Admin Partner React Query Hooks (SI Billing)
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthHeaders } from '@/lib/auth-headers';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

export interface PartnerProfile {
  id: string;
  organizationId: string;
  tier: string;
  cumulativeFeesPaid: number;
  completedProjectCount: number;
  tierOverride: string | null;
  tierOverrideReason: string | null;
  tierOverrideSetBy: string | null;
  tierOverrideSetAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const partnerKeys = {
  all: ['admin', 'partners'] as const,
  detail: (id: string) => ['admin', 'partners', id] as const,
};

export function usePartners() {
  return useQuery({
    queryKey: partnerKeys.all,
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${apiUrl}/v1/admin/partners`, { headers });
      const json = await res.json();
      return (json.data ?? []) as PartnerProfile[];
    },
  });
}

export function usePartnerDetail(id: string) {
  return useQuery({
    queryKey: partnerKeys.detail(id),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${apiUrl}/v1/admin/partners/${id}`, { headers });
      const json = await res.json();
      return json.data as {
        profile: PartnerProfile;
        agreements: unknown[];
        billingContactEmail: string | null;
      };
    },
    enabled: !!id,
  });
}

export function useUpdatePartner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${apiUrl}/v1/admin/partners/${id}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: partnerKeys.all });
    },
  });
}

export function useReconcile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${apiUrl}/v1/admin/partners/reconcile`, {
        method: 'POST',
        headers,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: partnerKeys.all });
    },
  });
}
