/**
 * Salesforce Connection Hooks
 *
 * React Query hooks for Salesforce OAuth connection management:
 * - Query connection status (source/target)
 * - Initiate OAuth flow (opens popup)
 * - Disconnect
 * - Test connection health
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { getAuthHeaders } from '@/lib/auth-headers';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SalesforceConnectionStatus {
  id: string;
  connectionRole: string;
  salesforceOrgId: string;
  salesforceInstanceUrl: string;
  salesforceUsername: string | null;
  instanceType: string;
  apiVersion: string | null;
  status: string;
  connectionMetadata: Record<string, unknown> | null;
  lastUsedAt: string | null;
  lastSuccessfulApiCallAt: string | null;
  lastError: string | null;
  connectedBy: string | null;
  createdAt: string;
}

export interface ConnectionsResponse {
  source: SalesforceConnectionStatus | null;
  target: SalesforceConnectionStatus | null;
}

export interface ConnectInput {
  instanceType: 'production' | 'sandbox';
  connectionRole: 'source' | 'target';
  loginUrl?: string;
}

export interface TestResult {
  healthy: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const salesforceKeys = {
  all: ['salesforce'] as const,
  connections: (projectId: string) => [...salesforceKeys.all, projectId, 'connections'] as const,
};

// ---------------------------------------------------------------------------
// Query: Get connection status
// ---------------------------------------------------------------------------

export function useSalesforceConnections(projectId: string | undefined) {
  return useQuery({
    queryKey: salesforceKeys.connections(projectId || ''),
    queryFn: async (): Promise<ConnectionsResponse> => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/projects/${projectId}/salesforce/connections`, {
        headers,
      });

      if (!response.ok) {
        if (response.status === 404) {
          return { source: null, target: null };
        }
        throw new Error(`Failed to fetch connections: ${response.status}`);
      }

      const result = await response.json();
      return result.data as ConnectionsResponse;
    },
    enabled: !!projectId,
    staleTime: 30_000, // 30 seconds
    refetchInterval: 5 * 60_000, // 5 minutes health polling (B.4)
  });
}

// ---------------------------------------------------------------------------
// Mutation: Initiate OAuth flow
// ---------------------------------------------------------------------------

export function useConnectSalesforce(projectId: string | undefined) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: ConnectInput): Promise<string> => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/projects/${projectId}/salesforce/connect`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `Connect failed: ${response.status}`);
      }

      const result = await response.json();
      return result.data.redirectUrl as string;
    },
    onSuccess: () => {
      // Invalidate after connection flow completes (via postMessage handler)
    },
  });

  /**
   * Opens the Salesforce OAuth popup and handles the postMessage callback.
   * Returns a promise that resolves when the connection is complete.
   */
  const connect = useCallback(
    (input: ConnectInput): Promise<void> => {
      return new Promise((resolve, reject) => {
        mutation.mutate(input, {
          onSuccess: (redirectUrl) => {
            // Open OAuth in popup
            const popup = window.open(
              redirectUrl,
              'salesforce-oauth',
              'width=600,height=700,scrollbars=yes'
            );

            if (!popup) {
              reject(new Error('Popup blocked. Please allow popups for this site.'));
              return;
            }

            // Listen for postMessage from callback page
            const handleMessage = (event: MessageEvent) => {
              // Validate origin
              const appOrigin = window.location.origin;
              if (event.origin !== appOrigin) return;

              if (event.data?.type === 'sf_connected') {
                window.removeEventListener('message', handleMessage);
                clearInterval(pollTimer);
                // Invalidate connection cache
                queryClient.invalidateQueries({
                  queryKey: salesforceKeys.connections(projectId || ''),
                });
                resolve();
              }

              if (event.data?.type === 'sf_error') {
                window.removeEventListener('message', handleMessage);
                clearInterval(pollTimer);
                reject(new Error(event.data.error || 'Connection failed'));
              }
            };

            window.addEventListener('message', handleMessage);

            // Poll for popup close (user closed it manually)
            const pollTimer = setInterval(() => {
              if (popup.closed) {
                clearInterval(pollTimer);
                window.removeEventListener('message', handleMessage);
                // Refresh connections in case it succeeded before close
                queryClient.invalidateQueries({
                  queryKey: salesforceKeys.connections(projectId || ''),
                });
                resolve();
              }
            }, 500);
          },
          onError: (error) => {
            reject(error);
          },
        });
      });
    },
    [mutation, projectId, queryClient]
  );

  return {
    connect,
    isConnecting: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset, // Allow caller to reset stuck state
  };
}

// ---------------------------------------------------------------------------
// Mutation: Disconnect
// ---------------------------------------------------------------------------

export function useDisconnectSalesforce(projectId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (connectionRole: 'source' | 'target'): Promise<void> => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/projects/${projectId}/salesforce/disconnect`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionRole }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `Disconnect failed: ${response.status}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: salesforceKeys.connections(projectId || ''),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation: Test connection
// ---------------------------------------------------------------------------

export function useTestConnection(projectId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (connectionRole: 'source' | 'target'): Promise<TestResult> => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/projects/${projectId}/salesforce/test`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionRole }),
      });

      if (!response.ok) {
        throw new Error(`Test failed: ${response.status}`);
      }

      const result = await response.json();
      return result.data as TestResult;
    },
    onSuccess: () => {
      // Refresh connection status after test
      queryClient.invalidateQueries({
        queryKey: salesforceKeys.connections(projectId || ''),
      });
    },
  });
}
