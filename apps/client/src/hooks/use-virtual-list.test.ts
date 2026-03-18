import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useVirtualList } from './use-virtual-list';

describe('useVirtualList', () => {
  it('should return expected shape', () => {
    const { result } = renderHook(() =>
      useVirtualList({
        count: 100,
        estimateSize: () => 40,
      })
    );

    expect(result.current).toHaveProperty('parentRef');
    expect(result.current).toHaveProperty('virtualizer');
    expect(result.current).toHaveProperty('virtualItems');
    expect(result.current).toHaveProperty('totalSize');
    expect(result.current.parentRef).toHaveProperty('current');
  });

  it('should calculate correct totalSize', () => {
    const { result } = renderHook(() =>
      useVirtualList({
        count: 50,
        estimateSize: () => 40,
      })
    );

    expect(result.current.totalSize).toBe(50 * 40);
  });

  it('should respect overscan parameter', () => {
    const { result: withOverscan } = renderHook(() =>
      useVirtualList({
        count: 100,
        estimateSize: () => 40,
        overscan: 10,
      })
    );

    const { result: withoutOverscan } = renderHook(() =>
      useVirtualList({
        count: 100,
        estimateSize: () => 40,
        overscan: 0,
      })
    );

    // With higher overscan, more items should be rendered
    expect(withOverscan.current.virtualItems.length).toBeGreaterThanOrEqual(
      withoutOverscan.current.virtualItems.length
    );
  });

  it('should handle empty list without errors', () => {
    const { result } = renderHook(() =>
      useVirtualList({
        count: 0,
        estimateSize: () => 40,
      })
    );

    expect(result.current.virtualItems).toEqual([]);
    expect(result.current.totalSize).toBe(0);
  });

  it('should handle list size changes', () => {
    let count = 10;
    const { result, rerender } = renderHook(() =>
      useVirtualList({
        count,
        estimateSize: () => 40,
      })
    );

    expect(result.current.totalSize).toBe(10 * 40);

    count = 20;
    rerender();

    expect(result.current.totalSize).toBe(20 * 40);
  });

  it('should expose scrollToIndex via virtualizer', () => {
    const { result } = renderHook(() =>
      useVirtualList({
        count: 100,
        estimateSize: () => 40,
      })
    );

    expect(typeof result.current.virtualizer.scrollToIndex).toBe('function');
  });
});
