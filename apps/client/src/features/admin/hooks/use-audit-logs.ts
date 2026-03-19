import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { getAuthHeaders } from '@/lib/auth-headers';
import { adminKeys } from './query-keys';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

/**
 * Audit log entry matching the server response shape
 */
export interface AuditLogEntry {
  id: string;
  userId: string | null;
  organizationId: string | null;
  action: string;
  targetUserId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditLogFilters {
  action?: string;
  actorId?: string;
  organizationId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Fetch audit log entries with filters and pagination
 */
export function useAuditLogs(filters?: AuditLogFilters) {
  return useQuery({
    queryKey: [...adminKeys.auditList(), filters],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams();

      if (filters?.action) params.set('action', filters.action);
      if (filters?.actorId) params.set('actorId', filters.actorId);
      if (filters?.organizationId) params.set('organizationId', filters.organizationId);
      if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters?.dateTo) params.set('dateTo', filters.dateTo);
      if (filters?.search) params.set('search', filters.search);
      if (filters?.limit) params.set('limit', String(filters.limit));
      if (filters?.offset) params.set('offset', String(filters.offset));

      const url = `${apiUrl}/v1/admin/audit${params.toString() ? `?${params}` : ''}`;
      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch audit logs');
      }

      const result = await response.json();
      return {
        entries: result.data as AuditLogEntry[],
        pagination: result.pagination as {
          total: number;
          limit: number;
          offset: number;
          hasMore: boolean;
        },
      };
    },
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
