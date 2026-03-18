import { useMemo } from 'react';
import { useShallow } from 'zustand/shallow';
import {
  useServiceConfigStore,
  useAppMode,
  useServiceTargets,
} from '@/stores/service-config-store';
import { getAPIAdapter, getDBAdapter, getStorageAdapter, getAuthAdapter } from '@/lib/services';
import type { APIAdapter, DBAdapter, StorageAdapter, AuthAdapter } from '@/types/services';

/**
 * Hook to get API adapter
 * Re-creates adapter when mode or target changes
 */
export function useAPI(): APIAdapter {
  const mode = useAppMode();
  const targets = useServiceTargets();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getAPIAdapter(), [mode, targets.server]);
}

/**
 * Hook to get Database adapter
 * Re-creates adapter when mode or target changes
 */
export function useDB(): DBAdapter {
  const mode = useAppMode();
  const targets = useServiceTargets();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getDBAdapter(), [mode, targets.database]);
}

/**
 * Hook to get Storage adapter
 * Re-creates adapter when mode or target changes
 */
export function useStorage(): StorageAdapter {
  const mode = useAppMode();
  const targets = useServiceTargets();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getStorageAdapter(), [mode, targets.storage]);
}

/**
 * Hook to get Auth adapter
 * Re-creates adapter when mode changes
 */
export function useAuth(): AuthAdapter {
  const mode = useAppMode();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getAuthAdapter(), [mode]);
}

/**
 * Hook to check if app is in offline mode
 */
export function useIsOfflineMode(): boolean {
  return useServiceConfigStore((s) => s.mode === 'offline');
}

/**
 * Hook to get full service config for debugging
 */
export function useServiceConfig() {
  return useServiceConfigStore(
    useShallow((s) => ({
      mode: s.mode,
      targets: s.targets,
    }))
  );
}
