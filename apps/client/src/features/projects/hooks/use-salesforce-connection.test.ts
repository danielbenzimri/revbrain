/**
 * Unit tests for Salesforce connection hooks
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import {
  useSalesforceConnections,
  useDisconnectSalesforce,
  useTestConnection,
  salesforceKeys,
} from './use-salesforce-connection';

// Mock auth headers
vi.mock('@/lib/auth-headers', () => ({
  getAuthHeaders: vi.fn().mockResolvedValue({
    Authorization: 'Bearer mock-token',
    'Content-Type': 'application/json',
  }),
}));

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock import.meta.env
vi.stubGlobal('import', { meta: { env: { VITE_API_URL: 'http://localhost:3000' } } });

const PROJECT_ID = '00000000-0000-4000-a000-000000000401';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('Salesforce connection hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('salesforceKeys', () => {
    it('generates correct query keys', () => {
      expect(salesforceKeys.all).toEqual(['salesforce']);
      expect(salesforceKeys.connections(PROJECT_ID)).toEqual([
        'salesforce',
        PROJECT_ID,
        'connections',
      ]);
    });
  });

  describe('useSalesforceConnections', () => {
    it('fetches connection status', async () => {
      const mockData = {
        data: {
          source: {
            id: 'conn-1',
            connectionRole: 'source',
            salesforceOrgId: '00D123',
            salesforceInstanceUrl: 'https://test.salesforce.com',
            status: 'active',
          },
          target: null,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const { result } = renderHook(() => useSalesforceConnections(PROJECT_ID), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.source?.salesforceOrgId).toBe('00D123');
      expect(result.current.data?.target).toBeNull();
    });

    it('returns null connections on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({}),
      });

      const { result } = renderHook(() => useSalesforceConnections(PROJECT_ID), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.source).toBeNull();
      expect(result.current.data?.target).toBeNull();
    });

    it('does not fetch when projectId is undefined', () => {
      renderHook(() => useSalesforceConnections(undefined), { wrapper: createWrapper() });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('useDisconnectSalesforce', () => {
    it('calls disconnect endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const { result } = renderHook(() => useDisconnectSalesforce(PROJECT_ID), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate('source');
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/salesforce/disconnect'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('useTestConnection', () => {
    it('calls test endpoint and returns result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { healthy: true } }),
      });

      const { result } = renderHook(() => useTestConnection(PROJECT_ID), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate('source');
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.healthy).toBe(true);
    });

    it('returns unhealthy result on connection error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { healthy: false, error: 'Token refresh failed' },
          }),
      });

      const { result } = renderHook(() => useTestConnection(PROJECT_ID), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate('source');
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.healthy).toBe(false);
      expect(result.current.data?.error).toBe('Token refresh failed');
    });
  });
});
