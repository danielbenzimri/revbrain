import { useMutation, useQuery } from '@tanstack/react-query';
import { getAuthHeaders } from '@/lib/auth-headers';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string | null;
  phoneNumber: string | null;
  mobileNumber: string | null;
  jobTitle: string | null;
  address: string | null;
  bio: string | null;
  avatarUrl: string | null;
  age: number | null;
  role: string;
}

/**
 * Fetch the current user's profile from the backend
 */
export function useProfile() {
  return useQuery<UserProfile>({
    queryKey: ['profile', 'me'],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/users/me`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch profile');
      }

      const json = await response.json();
      return json.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Update user profile (fullName, phone, etc.)
 */
export function useUpdateProfile() {
  return useMutation({
    mutationFn: async (data: {
      fullName?: string;
      phoneNumber?: string;
      mobileNumber?: string;
      jobTitle?: string;
      address?: string;
      bio?: string;
      avatarUrl?: string;
    }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/users/me`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to update profile');
      }

      return response.json();
    },
  });
}

/**
 * Change password via backend (uses admin API to update Supabase)
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: async (newPassword: string) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/users/me/change-password`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ newPassword }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to change password');
      }

      return response.json();
    },
  });
}

/**
 * Delete (deactivate) own account
 */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/users/me`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to delete account');
      }

      return response.json();
    },
  });
}
