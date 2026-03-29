/**
 * Route Chunk & Data Prefetch System
 *
 * Preloads route chunks during idle time and on hover/focus to eliminate
 * navigation wait times. Uses requestIdleCallback for cooperative scheduling.
 *
 * Also provides a centralized registry for React Query data prefetching,
 * so sidebar hover handlers can prefetch both chunks AND data in one call.
 */
import { routeLazyImports } from '@/app/route-imports';
import type { QueryClient } from '@tanstack/react-query';
import { getAuthHeaders } from '@/lib/auth-headers';

const prefetched = new Set<string>();

function shouldPrefetch(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conn = (navigator as any).connection;
  if (conn?.saveData) return false;
  if (conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g') return false;
  return true;
}

/**
 * Prefetch a single route chunk. Silent on failure (allows retry next time).
 */
export async function prefetchRoute(path: string): Promise<void> {
  if (prefetched.has(path) || !routeLazyImports[path]) return;
  prefetched.add(path);
  try {
    await routeLazyImports[path]();
  } catch {
    prefetched.delete(path); // Allow retry on next attempt
  }
}

/**
 * Cooperatively preload all route chunks during idle time.
 * Uses requestIdleCallback with 1000ms fallback timeout.
 */
export function startBackgroundPreload(): void {
  if (!shouldPrefetch()) return;

  const routes = Object.keys(routeLazyImports);
  let index = 0;

  function prefetchNext(deadline?: IdleDeadline) {
    while (index < routes.length && (!deadline || deadline.timeRemaining() > 5)) {
      prefetchRoute(routes[index]);
      index++;
    }
    if (index < routes.length) {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(prefetchNext, { timeout: 1000 });
      } else {
        setTimeout(() => prefetchNext(), 1000);
      }
    }
  }

  if ('requestIdleCallback' in window) {
    requestIdleCallback(prefetchNext, { timeout: 1000 });
  } else {
    setTimeout(() => prefetchNext(), 1000);
  }
}

// ---------------------------------------------------------------------------
// Route Data Prefetch Registry
// ---------------------------------------------------------------------------

const apiUrl = import.meta.env.VITE_API_URL || '/api';

const PREFETCH_STALE_TIME = 30 * 1000; // 30s — same as use-prefetch.ts

type DataPrefetcher = (qc: QueryClient) => void;

/**
 * Centralized registry mapping routes to their data prefetch functions.
 * Each entry prefetches the primary query for that route so the data
 * is already cached in React Query when the user navigates.
 */
export const routeDataPrefetchMap: Record<string, DataPrefetcher> = {
  '/projects': (qc) =>
    qc.prefetchQuery({
      queryKey: ['projects', 'list', undefined],
      queryFn: async () => {
        const headers = await getAuthHeaders();
        const res = await fetch(`${apiUrl}/v1/projects`, { headers });
        if (!res.ok) return null;
        const result = await res.json();
        return { projects: result.data, count: result.meta?.count || 0 };
      },
      staleTime: PREFETCH_STALE_TIME,
    }),

  '/billing': (qc) =>
    qc.prefetchQuery({
      queryKey: ['billing', 'subscription'],
      queryFn: async () => {
        const headers = await getAuthHeaders();
        const res = await fetch(`${apiUrl}/v1/billing/subscription`, { headers });
        if (!res.ok) return null;
        const result = await res.json();
        return result.data;
      },
      staleTime: 5 * 60 * 1000,
    }),

  '/users': (qc) =>
    qc.prefetchQuery({
      queryKey: ['org-users', 'list'],
      queryFn: async () => {
        const headers = await getAuthHeaders();
        const res = await fetch(`${apiUrl}/v1/org/users`, { headers });
        if (!res.ok) return null;
        const result = await res.json();
        return result.data;
      },
      staleTime: 5 * 60 * 1000,
    }),

  '/admin': (qc) =>
    qc.prefetchQuery({
      queryKey: ['admin', 'stats'],
      queryFn: async () => {
        const headers = await getAuthHeaders();
        const res = await fetch(`${apiUrl}/v1/admin/stats`, { headers });
        if (!res.ok) return null;
        const result = await res.json();
        return result.data;
      },
      staleTime: PREFETCH_STALE_TIME,
    }),

  '/admin/tenants': (qc) =>
    qc.prefetchQuery({
      queryKey: ['admin', 'tenants', 'list'],
      queryFn: async () => {
        const headers = await getAuthHeaders();
        const res = await fetch(`${apiUrl}/v1/admin/tenants?limit=50`, { headers });
        if (!res.ok) return null;
        const result = await res.json();
        return result.data;
      },
      staleTime: PREFETCH_STALE_TIME,
    }),

  '/admin/users': (qc) =>
    qc.prefetchQuery({
      queryKey: ['admin', 'users', 'list'],
      queryFn: async () => {
        const headers = await getAuthHeaders();
        const res = await fetch(`${apiUrl}/v1/admin/users?limit=50`, { headers });
        if (!res.ok) return null;
        const result = await res.json();
        return result.data;
      },
      staleTime: PREFETCH_STALE_TIME,
    }),

  '/admin/pricing': (qc) =>
    qc.prefetchQuery({
      queryKey: ['admin', 'plans', 'list'],
      queryFn: async () => {
        const headers = await getAuthHeaders();
        const res = await fetch(`${apiUrl}/v1/plans`, { headers });
        if (!res.ok) return null;
        const result = await res.json();
        return result.data;
      },
      staleTime: 60_000,
    }),

  '/admin/audit': (qc) =>
    qc.prefetchQuery({
      queryKey: ['admin', 'audit', 'list'],
      queryFn: async () => {
        const headers = await getAuthHeaders();
        const res = await fetch(`${apiUrl}/v1/admin/audit?limit=50`, { headers });
        if (!res.ok) return null;
        const result = await res.json();
        return result.data;
      },
      staleTime: PREFETCH_STALE_TIME,
    }),

  '/admin/support': (qc) =>
    qc.prefetchQuery({
      queryKey: ['admin', 'support', 'tickets', 'list'],
      queryFn: async () => {
        const headers = await getAuthHeaders();
        const res = await fetch(`${apiUrl}/v1/admin/support/tickets?limit=50`, { headers });
        if (!res.ok) return null;
        const result = await res.json();
        return result.data;
      },
      staleTime: PREFETCH_STALE_TIME,
    }),

  '/admin/coupons': (qc) =>
    qc.prefetchQuery({
      queryKey: ['admin', 'coupons', 'list'],
      queryFn: async () => {
        const headers = await getAuthHeaders();
        const res = await fetch(`${apiUrl}/v1/admin/coupons`, { headers });
        if (!res.ok) return null;
        const result = await res.json();
        return result.data;
      },
      staleTime: PREFETCH_STALE_TIME,
    }),
};

/**
 * Prefetch React Query data for a route. Silently skips unknown routes.
 */
export function prefetchRouteData(path: string, queryClient: QueryClient): void {
  routeDataPrefetchMap[path]?.(queryClient);
}

/**
 * Fire all route data prefetches in parallel (skipping the current route).
 * Data fetching is async I/O — doesn't block the main thread.
 * Called once after first paint in MainLayout.
 */
export function startBackgroundDataPreload(queryClient: QueryClient, currentPath: string): void {
  if (!shouldPrefetch()) return;
  const routes = Object.keys(routeDataPrefetchMap).filter((r) => r !== currentPath);
  for (const path of routes) {
    routeDataPrefetchMap[path]?.(queryClient);
  }
}
