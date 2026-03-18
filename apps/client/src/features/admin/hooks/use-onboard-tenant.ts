import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthHeaders } from '@/lib/auth-headers';
import { adminKeys } from './query-keys';
import type { OnboardOrganizationInput } from '@revbrain/contract';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

/**
 * Onboard a new tenant (organization + admin user)
 * Invalidates both tenants and users caches on success
 */
export function useOnboardTenant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: OnboardOrganizationInput) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/admin/onboard`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to onboard tenant');
      }

      const result = await response.json();
      return result.data;
    },
    onSuccess: () => {
      // Invalidate both tenants and users since onboarding creates both
      queryClient.invalidateQueries({ queryKey: adminKeys.tenants() });
      queryClient.invalidateQueries({ queryKey: adminKeys.users() });
    },
  });
}
