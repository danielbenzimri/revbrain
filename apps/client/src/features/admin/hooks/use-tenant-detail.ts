import { useQuery } from '@tanstack/react-query';
import { getAuthHeaders } from '@/lib/auth-headers';
import { adminKeys } from './query-keys';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

export interface TenantDetailPlan {
  id: string;
  name: string;
  code: string;
  price: number;
  currency: string;
  limits: {
    maxUsers: number;
    maxProjects: number;
    storageGB: number;
  } | null;
  features: {
    aiLevel: string;
    modules: string[];
    customBranding: boolean;
    sso: boolean;
  } | null;
}

export interface TenantDetailActivity {
  id: string;
  action: string;
  actorId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface TenantDetailOverride {
  id: string;
  feature: string;
  value: unknown;
  reason: string;
  expiresAt: string | null;
}

export interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  type: string;
  seatLimit: number;
  seatUsed: number;
  storageUsedBytes: number;
  isActive: boolean;
  lifecycleState: 'active' | 'trial' | 'suspended' | 'deactivated';
  createdAt: string;
  updatedAt?: string;
  plan: TenantDetailPlan | null;
  projectCount: number;
  userCount: number;
  recentActivity: TenantDetailActivity[];
  overrides: TenantDetailOverride[];
}

/**
 * Fetch full tenant detail by org ID
 * Uses 30s stale time, enabled when orgId is provided
 */
export function useTenantDetail(orgId: string | undefined) {
  return useQuery({
    queryKey: adminKeys.tenantDetail(orgId ?? ''),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/admin/tenants/${orgId}`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch tenant details');
      }

      const result = await response.json();
      return result.data as TenantDetail;
    },
    enabled: !!orgId,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}
