import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthHeaders } from '@/lib/auth-headers';
import { adminKeys } from './query-keys';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

interface TenantPlan {
  id: string;
  name: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  type: string;
  plan?: TenantPlan;
  seatUsed: number;
  seatLimit: number;
  storageUsedBytes: number;
  isActive: boolean;
  lifecycleState: 'active' | 'trial' | 'suspended' | 'deactivated';
}

export interface TenantForEdit {
  id: string;
  name: string;
  type: string;
  planId: string | null;
  seatLimit: number;
  seatUsed: number;
  isActive: boolean;
}

/**
 * Fetch all tenants (organizations)
 * Uses 1 minute stale time
 */
export function useTenants() {
  return useQuery({
    queryKey: adminKeys.tenantsList(),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/admin/tenants`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch tenants');
      }

      const result = await response.json();
      return result.data as Tenant[];
    },
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Update a tenant
 */
export function useUpdateTenant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<TenantForEdit>) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/admin/tenants/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to update tenant');
      }

      const result = await response.json();
      return result.data as Tenant;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.tenants() });
    },
  });
}

/**
 * Deactivate (soft-delete) a tenant
 */
export function useDeactivateTenant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/admin/tenants/${id}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        throw new Error('Failed to deactivate tenant');
      }

      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.tenants() });
    },
  });
}
