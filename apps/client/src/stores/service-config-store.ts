import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// =============================================================================
// Mode Types
// =============================================================================

/**
 * Top-Level Mode:
 * - 'offline': Everything uses localStorage (no backend needed)
 * - 'online': Uses backend services
 */
export type AppMode = 'offline' | 'online';

// =============================================================================
// Store
// =============================================================================

interface ServiceConfigState {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  resetToDefaults: () => void;
}

const isMockAuth = import.meta.env.VITE_AUTH_MODE === 'mock';
const DEFAULT_MODE: AppMode = isMockAuth ? 'offline' : 'online';

export const useServiceConfigStore = create<ServiceConfigState>()(
  persist(
    (set) => ({
      mode: DEFAULT_MODE,
      setMode: (mode) => set({ mode }),
      resetToDefaults: () => set({ mode: DEFAULT_MODE }),
    }),
    {
      name: 'revbrain-service-config',
      version: 5, // Bumped: removed granular targets, simplified to mode toggle
      migrate: () => ({ mode: DEFAULT_MODE }),
    }
  )
);

// =============================================================================
// Convenience Hooks
// =============================================================================

export const useAppMode = () => useServiceConfigStore((s) => s.mode);
export const useIsOffline = () => useServiceConfigStore((s) => s.mode === 'offline');
export const useIsOnline = () => useServiceConfigStore((s) => s.mode === 'online');
