/**
 * Usage Hook
 *
 * Fetches organization usage statistics for billing display.
 */
import { useQuery } from '@tanstack/react-query';
import { getAuthHeaders } from '@/lib/auth-headers';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

export interface UsageStats {
  users: {
    used: number;
    limit: number;
    percentage: number;
  };
  projects: {
    used: number;
    limit: number;
    percentage: number;
  };
  storage: {
    usedGB: number;
    limitGB: number;
    percentage: number;
  };
  features: {
    aiLevel: 'none' | 'basic' | 'advanced' | 'full';
    modules: string[];
    customBranding: boolean;
    sso: boolean;
  } | null;
  subscription: {
    status: string;
    planName: string;
    planCode: string;
  } | null;
}

export const usageKeys = {
  all: ['usage'] as const,
  stats: () => [...usageKeys.all, 'stats'] as const,
};

/**
 * Get current organization usage statistics.
 */
export function useUsage() {
  return useQuery({
    queryKey: usageKeys.stats(),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/billing/usage`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch usage');
      }

      const result = await response.json();
      return result.data as UsageStats;
    },
    staleTime: 60 * 1000, // 1 minute
  });
}
