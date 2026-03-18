import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { getAuthHeaders } from '@/lib/auth-headers';
import { adminKeys } from './query-keys';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

/**
 * Support Ticket types matching the database schema
 */
export interface SupportTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  description?: string | null;
  status: 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
  user?: {
    id: string;
    fullName: string;
    email: string;
  } | null;
  organization?: {
    id: string;
    name: string;
    slug?: string;
  } | null;
  assignedTo?: {
    id: string;
    fullName: string;
  } | null;
  createdAt: string;
  updatedAt: string;
  firstResponseAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
}

export interface TicketMessage {
  id: string;
  content: string;
  senderType: 'user' | 'admin' | 'system';
  senderName: string;
  isInternal: boolean;
  createdAt: string;
  attachments?: string[];
}

export interface TicketDetail extends SupportTicket {
  messages: TicketMessage[];
}

export interface TicketStats {
  total: number;
  open: number;
  inProgress: number;
  waitingCustomer: number;
  resolved: number;
  closed: number;
  highPriority: number;
}

export interface TicketFilters {
  status?: string;
  priority?: string;
  category?: string;
  assignedTo?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface TicketUpdateInput {
  status?: 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  category?: string;
  assignedTo?: string | null;
}

export interface AddMessageInput {
  content: string;
  isInternal?: boolean;
  attachments?: string[];
}

/**
 * Fetch support ticket statistics
 */
export function useTicketStats() {
  return useQuery({
    queryKey: adminKeys.supportStats(),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/admin/support/stats`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch ticket stats');
      }

      const result = await response.json();
      return result.data as TicketStats;
    },
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000,
  });
}

/**
 * Fetch all support tickets with filters and pagination
 */
export function useSupportTickets(filters?: TicketFilters) {
  return useQuery({
    queryKey: [...adminKeys.supportTicketsList(), filters],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams();

      if (filters?.status) params.set('status', filters.status);
      if (filters?.priority) params.set('priority', filters.priority);
      if (filters?.category) params.set('category', filters.category);
      if (filters?.assignedTo) params.set('assignedTo', filters.assignedTo);
      if (filters?.search) params.set('search', filters.search);
      if (filters?.limit) params.set('limit', String(filters.limit));
      if (filters?.offset) params.set('offset', String(filters.offset));

      const url = `${apiUrl}/v1/admin/support/tickets${params.toString() ? `?${params}` : ''}`;
      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch tickets');
      }

      const result = await response.json();
      return {
        tickets: result.data as SupportTicket[],
        pagination: result.pagination as {
          limit: number;
          offset: number;
          total: number;
          hasMore: boolean;
        },
      };
    },
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Fetch a single ticket with messages
 */
export function useTicketDetail(ticketId: string | null) {
  return useQuery({
    queryKey: adminKeys.supportTicketDetail(ticketId || ''),
    queryFn: async () => {
      if (!ticketId) return null;
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/admin/support/tickets/${ticketId}`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch ticket');
      }

      const result = await response.json();
      return result.data as TicketDetail;
    },
    enabled: !!ticketId,
    staleTime: 30 * 1000,
  });
}

/**
 * Update a ticket (status, priority, category, assignment)
 */
export function useUpdateTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TicketUpdateInput }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/admin/support/tickets/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to update ticket');
      }

      const result = await response.json();
      return result.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: adminKeys.supportTickets() });
      queryClient.invalidateQueries({ queryKey: adminKeys.supportTicketDetail(id) });
      queryClient.invalidateQueries({ queryKey: adminKeys.supportStats() });
    },
  });
}

/**
 * Add a message/reply to a ticket
 */
export function useAddTicketMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ticketId, data }: { ticketId: string; data: AddMessageInput }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/admin/support/tickets/${ticketId}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to add message');
      }

      const result = await response.json();
      return result.data;
    },
    onSuccess: (_, { ticketId }) => {
      queryClient.invalidateQueries({ queryKey: adminKeys.supportTicketDetail(ticketId) });
      queryClient.invalidateQueries({ queryKey: adminKeys.supportTickets() });
    },
  });
}

/**
 * Assign a ticket to an admin
 */
export function useAssignTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ticketId,
      assignedTo,
    }: {
      ticketId: string;
      assignedTo: string | null;
    }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/admin/support/tickets/${ticketId}/assign`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ assignedTo }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to assign ticket');
      }

      const result = await response.json();
      return result;
    },
    onSuccess: (_, { ticketId }) => {
      queryClient.invalidateQueries({ queryKey: adminKeys.supportTicketDetail(ticketId) });
      queryClient.invalidateQueries({ queryKey: adminKeys.supportTickets() });
    },
  });
}
