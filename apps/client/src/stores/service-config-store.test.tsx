/**
 * Unit tests for service-config-store
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// In mock auth mode (.env.mock), default is 'offline'. In jwt mode, default is 'online'.
const expectedDefaultMode = import.meta.env.VITE_AUTH_MODE === 'mock' ? 'offline' : 'online';
import {
  useServiceConfigStore,
  useAppMode,
  useIsOffline,
  useIsOnline,
} from './service-config-store';

describe('useServiceConfigStore', () => {
  beforeEach(() => {
    // Reset store to defaults before each test
    const { result } = renderHook(() => useServiceConfigStore());
    act(() => {
      result.current.resetToDefaults();
    });
  });

  describe('initial state', () => {
    it('should start with the expected default mode based on env', () => {
      const { result } = renderHook(() => useServiceConfigStore());
      expect(result.current.mode).toBe(expectedDefaultMode);
    });
  });

  describe('setMode', () => {
    it('should set mode to offline', () => {
      const { result } = renderHook(() => useServiceConfigStore());

      act(() => {
        result.current.setMode('offline');
      });

      expect(result.current.mode).toBe('offline');
    });

    it('should set mode to online', () => {
      const { result } = renderHook(() => useServiceConfigStore());

      act(() => {
        result.current.setMode('offline');
      });

      act(() => {
        result.current.setMode('online');
      });

      expect(result.current.mode).toBe('online');
    });
  });

  describe('resetToDefaults', () => {
    it('should reset mode to default', () => {
      const { result } = renderHook(() => useServiceConfigStore());

      act(() => {
        result.current.setMode('offline');
      });

      act(() => {
        result.current.resetToDefaults();
      });

      expect(result.current.mode).toBe(expectedDefaultMode);
    });
  });
});

describe('convenience hooks', () => {
  beforeEach(() => {
    const { result } = renderHook(() => useServiceConfigStore());
    act(() => {
      result.current.resetToDefaults();
    });
  });

  describe('useAppMode', () => {
    it('should return the current mode', () => {
      const { result } = renderHook(() => useAppMode());
      expect(result.current).toBe(expectedDefaultMode);
    });
  });

  describe('useIsOffline', () => {
    it('should reflect the default mode', () => {
      const { result } = renderHook(() => useIsOffline());
      expect(result.current).toBe(expectedDefaultMode === 'offline');
    });

    it('should return true when offline', () => {
      const store = renderHook(() => useServiceConfigStore());
      act(() => {
        store.result.current.setMode('offline');
      });

      const { result } = renderHook(() => useIsOffline());
      expect(result.current).toBe(true);
    });
  });

  describe('useIsOnline', () => {
    it('should reflect the default mode', () => {
      const { result } = renderHook(() => useIsOnline());
      expect(result.current).toBe(expectedDefaultMode === 'online');
    });

    it('should return false when offline', () => {
      const store = renderHook(() => useServiceConfigStore());
      act(() => {
        store.result.current.setMode('offline');
      });

      const { result } = renderHook(() => useIsOnline());
      expect(result.current).toBe(false);
    });
  });
});
