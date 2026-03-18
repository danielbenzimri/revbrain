/**
 * Unit tests for sidebar-store
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSidebarStore } from './sidebar-store';

describe('useSidebarStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    const { result } = renderHook(() => useSidebarStore());
    act(() => {
      result.current.setSidebarCollapsed(false);
    });
  });

  describe('initial state', () => {
    it('should start with sidebar not collapsed', () => {
      const { result } = renderHook(() => useSidebarStore());
      expect(result.current.isCollapsed).toBe(false);
    });
  });

  describe('toggleSidebar', () => {
    it('should toggle from false to true', () => {
      const { result } = renderHook(() => useSidebarStore());

      act(() => {
        result.current.toggleSidebar();
      });

      expect(result.current.isCollapsed).toBe(true);
    });

    it('should toggle from true to false', () => {
      const { result } = renderHook(() => useSidebarStore());

      act(() => {
        result.current.setSidebarCollapsed(true);
      });

      act(() => {
        result.current.toggleSidebar();
      });

      expect(result.current.isCollapsed).toBe(false);
    });

    it('should toggle multiple times', () => {
      const { result } = renderHook(() => useSidebarStore());

      act(() => {
        result.current.toggleSidebar();
      });
      expect(result.current.isCollapsed).toBe(true);

      act(() => {
        result.current.toggleSidebar();
      });
      expect(result.current.isCollapsed).toBe(false);

      act(() => {
        result.current.toggleSidebar();
      });
      expect(result.current.isCollapsed).toBe(true);
    });
  });

  describe('setSidebarCollapsed', () => {
    it('should set collapsed to true', () => {
      const { result } = renderHook(() => useSidebarStore());

      act(() => {
        result.current.setSidebarCollapsed(true);
      });

      expect(result.current.isCollapsed).toBe(true);
    });

    it('should set collapsed to false', () => {
      const { result } = renderHook(() => useSidebarStore());

      act(() => {
        result.current.setSidebarCollapsed(true);
      });

      act(() => {
        result.current.setSidebarCollapsed(false);
      });

      expect(result.current.isCollapsed).toBe(false);
    });

    it('should not change state when setting same value', () => {
      const { result } = renderHook(() => useSidebarStore());

      act(() => {
        result.current.setSidebarCollapsed(false);
      });

      expect(result.current.isCollapsed).toBe(false);
    });
  });
});
