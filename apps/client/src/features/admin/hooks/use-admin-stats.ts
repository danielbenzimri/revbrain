import { useQuery } from '@tanstack/react-query';
import { getAuthHeaders } from '@/lib/auth-headers';
import { adminKeys } from './query-keys';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

export interface ActivityEntry {
  id: string;
  action: string;
  userId: string | null;
  organizationId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminStats {
  tenantCount: number | null;
  activeUserCount: number | null;
  activeProjectCount: number | null;
  mrr: number | null;
  recentActivity: ActivityEntry[] | null;
}

/**
 * Fetch admin dashboard statistics.
 * Refreshes every 30 seconds (staleTime).
 */
export function useAdminStats() {
  return useQuery({
    queryKey: adminKeys.stats(),
    queryFn: async (): Promise<AdminStats> => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/admin/stats`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch admin stats');
      }

      const result = await response.json();
      return result.data as AdminStats;
    },
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}
