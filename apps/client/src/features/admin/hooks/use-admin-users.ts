import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthHeaders } from '@/lib/auth-headers';
import { adminKeys } from './query-keys';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  org?: string;
  status: 'active' | 'pending';
  createdAt: string;
  jobTitle?: string;
  phoneNumber?: string;
  mobileNumber?: string;
  address?: string;
  age?: number;
  bio?: string;
  avatarUrl?: string;
  lastLoginAt?: string;
}

/**
 * Fetch all users (admin view)
 * Uses 1 minute stale time
 */
export function useAdminUsers() {
  return useQuery({
    queryKey: adminKeys.usersList(),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/admin/users`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }

      const result = await response.json();
      return result.data as AdminUser[];
    },
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Create a new user (system admin)
 */
export function useCreateAdminUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userData: { email: string; name: string; role: string; orgId?: string }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/admin/users`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: userData.email,
          fullName: userData.name,
          role: userData.role,
          ...(userData.orgId ? { organizationId: userData.orgId } : {}),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to create user');
      }

      const result = await response.json();
      return result.data as AdminUser;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.users() });
    },
  });
}

/**
 * Delete a user
 */
export function useDeleteAdminUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to delete user');
      }

      return userId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.users() });
    },
  });
}

/**
 * Update a user
 */
export function useUpdateAdminUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vars: { userId: string; data: Partial<AdminUser> }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/admin/users/${vars.userId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(vars.data),
      });

      if (!response.ok) {
        throw new Error('Failed to update user');
      }

      const result = await response.json();
      return result.data as AdminUser;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.users() });
    },
  });
}
