/**
 * useInfiniteScroll Hook
 *
 * Uses IntersectionObserver to trigger loading more data when a sentinel
 * element enters the viewport. Designed to compose with TanStack Query's
 * useInfiniteQuery and useVirtualList.
 *
 * Uses a callback ref pattern so the observer is set up immediately
 * when the sentinel element mounts.
 */
import { useRef, useCallback } from 'react';

interface UseInfiniteScrollOptions {
  hasNextPage: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  rootMargin?: string;
  threshold?: number;
}

/**
 * Returns a callback ref to attach to a sentinel element. When the sentinel
 * enters the viewport (with optional rootMargin), onLoadMore fires.
 *
 * Usage:
 * ```tsx
 * const sentinelRef = useInfiniteScroll({ hasNextPage, isLoading, onLoadMore });
 * return <div ref={sentinelRef} />;
 * ```
 */
export function useInfiniteScroll({
  hasNextPage,
  isLoading,
  onLoadMore,
  rootMargin = '200px',
  threshold = 0,
}: UseInfiniteScrollOptions) {
  const observerRef = useRef<IntersectionObserver | null>(null);

  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      // Disconnect previous observer
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      if (!node) return;

      const observer = new IntersectionObserver(
        (entries) => {
          const [entry] = entries;
          if (entry?.isIntersecting && hasNextPage && !isLoading) {
            onLoadMore();
          }
        },
        { rootMargin, threshold }
      );
      observer.observe(node);
      observerRef.current = observer;
    },
    [hasNextPage, isLoading, onLoadMore, rootMargin, threshold]
  );

  return sentinelRef;
}
