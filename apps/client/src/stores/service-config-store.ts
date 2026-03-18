import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// =============================================================================
// Mode Types
// =============================================================================

/**
 * Top-Level Mode:
 * - 'offline': Everything uses localStorage (no backend needed)
 * - 'online': Uses backend services (with granular control)
 */
export type AppMode = 'offline' | 'online';

/**
 * In "online" mode, each service can be local or remote:
 * - 'local': Uses local dev server (Hono on localhost, Docker Postgres, local filesystem)
 * - 'remote': Uses cloud services (Supabase Edge Functions, Supabase Postgres, Supabase Storage)
 */
export type ServiceTarget = 'local' | 'remote';

export interface ServiceTargets {
  server: ServiceTarget; // Hono localhost OR Supabase Edge Functions
  database: ServiceTarget; // Docker Postgres OR Supabase Postgres
  storage: ServiceTarget; // Local filesystem OR Supabase Storage
}

// =============================================================================
// Store
// =============================================================================

interface ServiceConfigState {
  // Top-level mode
  mode: AppMode;

  // Granular targets (only relevant when mode === 'online')
  targets: ServiceTargets;

  // Actions
  setMode: (mode: AppMode) => void;
  setServerTarget: (target: ServiceTarget) => void;
  setDatabaseTarget: (target: ServiceTarget) => void;
  setStorageTarget: (target: ServiceTarget) => void;
  setAllTargets: (target: ServiceTarget) => void;
  resetToDefaults: () => void;
}

// Smart defaults based on environment
const isRemote = import.meta.env.MODE === 'dev'; // "dev:remote" runs "vite --mode dev"
const DEFAULT_MODE: AppMode = 'online';
const DEFAULT_TARGETS: ServiceTargets = {
  server: isRemote ? 'remote' : 'local',
  database: isRemote ? 'remote' : 'local',
  storage: isRemote ? 'remote' : 'local',
};

export const useServiceConfigStore = create<ServiceConfigState>()(
  persist(
    (set) => ({
      mode: DEFAULT_MODE,
      targets: DEFAULT_TARGETS,

      setMode: (mode) => set({ mode }),

      setServerTarget: (target) =>
        set((state) => ({
          targets: { ...state.targets, server: target },
        })),

      setDatabaseTarget: (target) =>
        set((state) => ({
          targets: { ...state.targets, database: target },
        })),

      setStorageTarget: (target) =>
        set((state) => ({
          targets: { ...state.targets, storage: target },
        })),

      setAllTargets: (target) =>
        set({
          targets: { server: target, database: target, storage: target },
        }),

      resetToDefaults: () =>
        set({
          mode: DEFAULT_MODE,
          targets: DEFAULT_TARGETS,
        }),
    }),
    {
      name: 'geometrix-service-config',
      version: 3, // Bump version to force reset and use correct targets
      migrate: () => {
        // Always return fresh defaults based on current MODE
        // This ensures dev:remote always uses 'remote' targets
        return {
          mode: DEFAULT_MODE,
          targets: DEFAULT_TARGETS,
        };
      },
    }
  )
);

// =============================================================================
// Convenience Hooks
// =============================================================================

export const useAppMode = () => useServiceConfigStore((s) => s.mode);
export const useIsOffline = () => useServiceConfigStore((s) => s.mode === 'offline');
export const useIsOnline = () => useServiceConfigStore((s) => s.mode === 'online');
export const useServiceTargets = () => useServiceConfigStore((s) => s.targets);
