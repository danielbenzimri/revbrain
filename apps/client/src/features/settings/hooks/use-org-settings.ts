import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAuthHeaders } from '@/lib/auth-headers';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

export interface OrgSettings {
  id: string;
  name: string;
  billingContactEmail: string | null;
}

export function useOrgSettings() {
  return useQuery<OrgSettings>({
    queryKey: ['org', 'settings'],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${apiUrl}/v1/org/settings`, { headers });
      if (!res.ok) throw new Error('Failed to fetch org settings');
      const json = await res.json();
      return json.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateOrgSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { billingContactEmail: string | null }) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${apiUrl}/v1/org/settings`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to update org settings');
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org', 'settings'] });
    },
  });
}
