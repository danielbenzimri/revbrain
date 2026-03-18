import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

interface UseVirtualListOptions {
  count: number;
  estimateSize: (index: number) => number;
  overscan?: number;
  getScrollElement?: () => HTMLElement | null;
}

export function useVirtualList({
  count,
  estimateSize,
  overscan = 5,
  getScrollElement,
}: UseVirtualListOptions) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: getScrollElement ?? (() => parentRef.current),
    estimateSize,
    overscan,
  });

  return {
    parentRef,
    virtualizer,
    virtualItems: virtualizer.getVirtualItems(),
    totalSize: virtualizer.getTotalSize(),
  };
}
