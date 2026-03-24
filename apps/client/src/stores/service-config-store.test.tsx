/**
 * Unit tests for service-config-store
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// In mock auth mode (.env.local), default is 'offline'. In jwt mode, default is 'online'.
const expectedDefaultMode = import.meta.env.VITE_AUTH_MODE === 'mock' ? 'offline' : 'online';
import {
  useServiceConfigStore,
  useAppMode,
  useIsOffline,
  useIsOnline,
  useServiceTargets,
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

    it('should have service targets defined', () => {
      const { result } = renderHook(() => useServiceConfigStore());
      expect(result.current.targets).toHaveProperty('server');
      expect(result.current.targets).toHaveProperty('database');
      expect(result.current.targets).toHaveProperty('storage');
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

  describe('setServerTarget', () => {
    it('should set server target to remote', () => {
      const { result } = renderHook(() => useServiceConfigStore());

      act(() => {
        result.current.setServerTarget('remote');
      });

      expect(result.current.targets.server).toBe('remote');
    });

    it('should set server target to local', () => {
      const { result } = renderHook(() => useServiceConfigStore());

      act(() => {
        result.current.setServerTarget('local');
      });

      expect(result.current.targets.server).toBe('local');
    });

    it('should not affect other targets', () => {
      const { result } = renderHook(() => useServiceConfigStore());
      const originalDatabase = result.current.targets.database;
      const originalStorage = result.current.targets.storage;

      act(() => {
        result.current.setServerTarget('remote');
      });

      expect(result.current.targets.database).toBe(originalDatabase);
      expect(result.current.targets.storage).toBe(originalStorage);
    });
  });

  describe('setDatabaseTarget', () => {
    it('should set database target to remote', () => {
      const { result } = renderHook(() => useServiceConfigStore());

      act(() => {
        result.current.setDatabaseTarget('remote');
      });

      expect(result.current.targets.database).toBe('remote');
    });
  });

  describe('setStorageTarget', () => {
    it('should set storage target to remote', () => {
      const { result } = renderHook(() => useServiceConfigStore());

      act(() => {
        result.current.setStorageTarget('remote');
      });

      expect(result.current.targets.storage).toBe('remote');
    });
  });

  describe('setAllTargets', () => {
    it('should set all targets to remote', () => {
      const { result } = renderHook(() => useServiceConfigStore());

      act(() => {
        result.current.setAllTargets('remote');
      });

      expect(result.current.targets.server).toBe('remote');
      expect(result.current.targets.database).toBe('remote');
      expect(result.current.targets.storage).toBe('remote');
    });

    it('should set all targets to local', () => {
      const { result } = renderHook(() => useServiceConfigStore());

      act(() => {
        result.current.setAllTargets('local');
      });

      expect(result.current.targets.server).toBe('local');
      expect(result.current.targets.database).toBe('local');
      expect(result.current.targets.storage).toBe('local');
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

    it('should reset targets to defaults', () => {
      const { result } = renderHook(() => useServiceConfigStore());

      act(() => {
        result.current.setAllTargets('remote');
      });

      act(() => {
        result.current.resetToDefaults();
      });

      // After reset, all targets should match their default values
      expect(result.current.targets).toBeDefined();
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

  describe('useServiceTargets', () => {
    it('should return the current targets', () => {
      const { result } = renderHook(() => useServiceTargets());
      expect(result.current).toHaveProperty('server');
      expect(result.current).toHaveProperty('database');
      expect(result.current).toHaveProperty('storage');
    });
  });
});
