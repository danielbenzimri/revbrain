import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthHeaders } from '@/lib/auth-headers';
import { adminKeys } from './query-keys';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

/**
 * Admin notification type matching the database schema
 */
export interface AdminNotification {
  id: string;
  adminUserId: string;
  type: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

/**
 * Poll unread notification count every 30 seconds
 */
export function useNotificationCount() {
  return useQuery({
    queryKey: adminKeys.notificationsCount(),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/admin/notifications/count`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch notification count');
      }

      const result = await response.json();
      return result.unreadCount as number;
    },
    refetchInterval: 30 * 1000, // Poll every 30 seconds
    staleTime: 15 * 1000,
    gcTime: 2 * 60 * 1000,
  });
}

/**
 * Fetch notification list
 */
export function useNotifications() {
  return useQuery({
    queryKey: adminKeys.notificationsList(),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/admin/notifications`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch notifications');
      }

      const result = await response.json();
      return result.data as AdminNotification[];
    },
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
  });
}

/**
 * Mark a single notification as read
 */
export function useMarkRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/admin/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers,
      });

      if (!response.ok) {
        throw new Error('Failed to mark notification as read');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.notifications() });
    },
  });
}

/**
 * Mark all notifications as read
 */
export function useMarkAllRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/admin/notifications/read-all`, {
        method: 'POST',
        headers,
      });

      if (!response.ok) {
        throw new Error('Failed to mark all notifications as read');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.notifications() });
    },
  });
}
