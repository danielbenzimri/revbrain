import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useInfiniteScroll } from './use-infinite-scroll';

// Mock IntersectionObserver
let mockObserverInstances: Array<{
  callback: IntersectionObserverCallback;
  disconnect: ReturnType<typeof vi.fn>;
  observe: ReturnType<typeof vi.fn>;
}> = [];

class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];

  callback: IntersectionObserverCallback;
  disconnect = vi.fn();
  observe = vi.fn();
  unobserve = vi.fn();
  takeRecords = vi.fn().mockReturnValue([]);

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    mockObserverInstances.push({
      callback,
      disconnect: this.disconnect,
      observe: this.observe,
    });
  }
}

describe('useInfiniteScroll', () => {
  beforeEach(() => {
    mockObserverInstances = [];
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fire callback when isIntersecting=true and hasNextPage=true', () => {
    const onLoadMore = vi.fn();
    const { result } = renderHook(() =>
      useInfiniteScroll({
        hasNextPage: true,
        isLoading: false,
        onLoadMore,
      })
    );

    // Call the callback ref with a DOM element to set up the observer
    const div = document.createElement('div');
    act(() => {
      result.current(div);
    });

    expect(mockObserverInstances.length).toBeGreaterThan(0);

    // Simulate intersection
    const lastInstance = mockObserverInstances[mockObserverInstances.length - 1];
    lastInstance.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver
    );

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('should NOT fire callback when isLoading=true', () => {
    const onLoadMore = vi.fn();
    const { result } = renderHook(() =>
      useInfiniteScroll({
        hasNextPage: true,
        isLoading: true,
        onLoadMore,
      })
    );

    const div = document.createElement('div');
    act(() => {
      result.current(div);
    });

    if (mockObserverInstances.length > 0) {
      const lastInstance = mockObserverInstances[mockObserverInstances.length - 1];
      lastInstance.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    }

    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('should NOT fire callback when hasNextPage=false', () => {
    const onLoadMore = vi.fn();
    const { result } = renderHook(() =>
      useInfiniteScroll({
        hasNextPage: false,
        isLoading: false,
        onLoadMore,
      })
    );

    const div = document.createElement('div');
    act(() => {
      result.current(div);
    });

    if (mockObserverInstances.length > 0) {
      const lastInstance = mockObserverInstances[mockObserverInstances.length - 1];
      lastInstance.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    }

    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('should disconnect observer on cleanup (null ref)', () => {
    const onLoadMore = vi.fn();
    const { result } = renderHook(() =>
      useInfiniteScroll({
        hasNextPage: true,
        isLoading: false,
        onLoadMore,
      })
    );

    // Set up the observer
    const div = document.createElement('div');
    act(() => {
      result.current(div);
    });

    const instanceCount = mockObserverInstances.length;
    expect(instanceCount).toBeGreaterThan(0);

    // Call ref with null to disconnect (simulates unmount)
    act(() => {
      result.current(null);
    });

    const lastInstance = mockObserverInstances[instanceCount - 1];
    expect(lastInstance.disconnect).toHaveBeenCalled();
  });
});
