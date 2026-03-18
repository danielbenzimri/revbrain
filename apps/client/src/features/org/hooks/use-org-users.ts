/**
 * Organization Users Hook
 *
 * React Query hook for fetching organization team members.
 */
import { useQuery } from '@tanstack/react-query';
import { getAuthHeaders } from '@/lib/auth-headers';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

// ============================================================================
// TYPES
// ============================================================================

export interface OrgUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isOrgAdmin: boolean;
  isActive: boolean;
  createdAt: string;
  activatedAt: string | null;
  lastLoginAt: string | null;
}

// ============================================================================
// QUERY KEYS
// ============================================================================

export const orgUserKeys = {
  all: ['org-users'] as const,
  list: () => [...orgUserKeys.all, 'list'] as const,
};

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Fetch all users in the current user's organization.
 */
export function useOrgUsers() {
  return useQuery({
    queryKey: orgUserKeys.list(),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/org/users`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch organization users');
      }

      const result = await response.json();
      return result.data as OrgUser[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Helper to get team members formatted for components.
 * Returns { id, name } format.
 */
export function useTeamMembers() {
  const { data: users, ...rest } = useOrgUsers();

  const teamMembers = (users || [])
    .filter((user) => user.isActive)
    .map((user) => ({
      id: user.id,
      name: user.fullName || user.email,
    }));

  return { data: teamMembers, ...rest };
}
