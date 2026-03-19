import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthHeaders } from '@/lib/auth-headers';
import { adminKeys } from './query-keys';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

export interface TenantOverride {
  id: string;
  organizationId: string;
  feature: string;
  value: boolean | number;
  expiresAt: string | null;
  grantedBy: string;
  reason: string;
  revokedAt: string | null;
  createdAt: string;
}

/**
 * Fetch overrides for a specific tenant
 */
export function useTenantOverrides(orgId: string | null) {
  return useQuery({
    queryKey: adminKeys.overrides(orgId || ''),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/admin/tenants/${orgId}/overrides`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch tenant overrides');
      }

      const result = await response.json();
      return result.data as TenantOverride[];
    },
    enabled: !!orgId,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

interface GrantOverrideInput {
  orgId: string;
  feature: string;
  value: boolean | number;
  expiresAt?: string;
  reason: string;
}

/**
 * Grant a feature override for a tenant
 */
export function useGrantOverride() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orgId, ...data }: GrantOverrideInput) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/admin/tenants/${orgId}/overrides`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to grant override');
      }

      const result = await response.json();
      return result.data as TenantOverride;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: adminKeys.overrides(variables.orgId) });
    },
  });
}

/**
 * Revoke a feature override
 */
export function useRevokeOverride() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, orgId }: { id: string; orgId: string }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/admin/overrides/${id}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        throw new Error('Failed to revoke override');
      }

      return { id, orgId };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: adminKeys.overrides(variables.orgId) });
    },
  });
}
