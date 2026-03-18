import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthHeaders } from '@/lib/auth-headers';
import { adminKeys } from './query-keys';
import type { Plan } from '@revbrain/contract';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

/**
 * Fetch all plans
 * Uses 5 minute stale time since plans rarely change
 */
export function usePlans() {
  return useQuery({
    queryKey: adminKeys.plansList(),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/plans`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch plans');
      }

      const result = await response.json();
      // Filter to active plans only (soft delete support)
      return (result.data as Plan[]).filter((p) => p.isActive);
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}

/**
 * Fetch all plans including inactive (for admin views)
 */
export function useAllPlans() {
  return useQuery({
    queryKey: [...adminKeys.plansList(), 'all'],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/plans`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch plans');
      }

      const result = await response.json();
      return result.data as Plan[];
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}

/**
 * Create a new plan
 */
export function useCreatePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (planData: Omit<Plan, 'id'>) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/plans`, {
        method: 'POST',
        headers,
        body: JSON.stringify(planData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to create plan');
      }

      const result = await response.json();
      return result.data as Plan;
    },
    onSuccess: () => {
      // Invalidate plans list to refetch
      queryClient.invalidateQueries({ queryKey: adminKeys.plans() });
    },
  });
}

/**
 * Update an existing plan
 */
export function useUpdatePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (planData: Plan) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/plans/${planData.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(planData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to update plan');
      }

      const result = await response.json();
      return result.data as Plan;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.plans() });
    },
  });
}

/**
 * Delete (soft-delete) a plan
 */
export function useDeletePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (planId: string) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/plans/${planId}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        throw new Error('Failed to delete plan');
      }

      return planId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.plans() });
    },
  });
}
