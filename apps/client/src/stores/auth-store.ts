import { create } from 'zustand';
import type { User, UserRole } from '@/types/auth';
import { MOCK_USERS } from '@/lib/mock-data';
import { getAuthAdapter } from '@/lib/services';
import { invalidateAuthCache } from '@/lib/auth-headers';
import { simulateRole as simulateRoleSession } from '@/lib/adapters/local/auth';

const USER_CACHE_KEY = 'revbrain_user';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

/**
 * Fetch the user profile from our DB via the API.
 * This is the single source of truth for role, name, etc.
 * Falls back to null if the API is unreachable (offline, edge cold start).
 */
async function fetchDbUserProfile(accessToken: string): Promise<{
  id: string;
  email: string;
  fullName: string;
  role: string;
  avatarUrl?: string;
} | null> {
  try {
    const res = await fetch(`${apiUrl}/v1/users/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}

interface AuthState {
  // State
  user: User | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  initialize: () => () => void; // Returns cleanup function
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  simulateRole: (role: UserRole) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  // Initial state
  user: null,
  isLoading: true,
  error: null,

  // Initialize subscription
  initialize: () => {
    const adapter = getAuthAdapter();

    // 1. Show cached user immediately (no spinner for returning users)
    let hasCachedUser = false;
    try {
      const cached = localStorage.getItem(USER_CACHE_KEY);
      if (cached) {
        const cachedUser = JSON.parse(cached) as User;
        set({ user: cachedUser, isLoading: false });
        hasCachedUser = true;
      }
    } catch {
      // Corrupted cache — ignore
    }

    // If no cached user, show loading spinner while validating
    if (!hasCachedUser) {
      set({ isLoading: true });
    }

    // 2. Validate session in background and update if needed
    adapter
      .getSession()
      .then(async (session) => {
        if (session) {
          const authUser = await adapter.getCurrentUser();
          if (authUser) {
            // Fetch the real user profile from our DB — single source of truth for role
            const dbProfile = await fetchDbUserProfile(session.accessToken);

            const appUser: User = {
              id: dbProfile?.id || authUser.id,
              name: dbProfile?.fullName || authUser.name || '',
              email: dbProfile?.email || authUser.email,
              role: (dbProfile?.role as UserRole) || (authUser.role as UserRole) || 'admin',
              avatar: dbProfile?.avatarUrl || authUser.avatar,
            };
            localStorage.setItem(USER_CACHE_KEY, JSON.stringify(appUser));
            set({ user: appUser, isLoading: false });
            return;
          }
        }
        localStorage.removeItem(USER_CACHE_KEY);
        set({ user: null, isLoading: false });
      })
      .catch((err) => {
        console.error('[Auth] Init error:', err);
        localStorage.removeItem(USER_CACHE_KEY);
        set({ user: null, isLoading: false });
      });

    // 2. Subscribe to changes
    return adapter.onAuthStateChange(async (event, session) => {
      console.log(`[AuthStore] Auth Change: ${event}`);

      if (event === 'SIGNED_OUT') {
        invalidateAuthCache();
        localStorage.removeItem(USER_CACHE_KEY);
        set({ user: null, isLoading: false });
        return;
      }

      if (session) {
        // Reload user details — DB profile is the source of truth for role
        try {
          const authUser = await adapter.getCurrentUser();
          if (authUser) {
            const dbProfile = await fetchDbUserProfile(session.accessToken);

            const appUser: User = {
              id: dbProfile?.id || authUser.id,
              name: dbProfile?.fullName || authUser.name || '',
              email: dbProfile?.email || authUser.email,
              role: (dbProfile?.role as UserRole) || (authUser.role as UserRole) || 'admin',
              avatar: dbProfile?.avatarUrl || authUser.avatar,
            };
            localStorage.setItem(USER_CACHE_KEY, JSON.stringify(appUser));
            set({ user: appUser, isLoading: false });
          }
        } catch (err) {
          console.error('[AuthStore] Failed to load user details:', err);
          set({ isLoading: false });
        }
      } else {
        set({ isLoading: false });
      }
    });
  },

  // Login action
  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });

    try {
      const adapter = getAuthAdapter();
      // Login call only triggers side effect in adapter
      // The onAuthStateChange listener will actually update the store
      await adapter.login(email, password);
      set({ isLoading: false });
    } catch (error) {
      console.error('[Auth] Login error:', error);
      set({
        error: error instanceof Error ? error.message : 'שגיאה בהתחברות',
        isLoading: false,
      });
    }
  },

  // Logout action
  logout: async () => {
    invalidateAuthCache();
    localStorage.removeItem(USER_CACHE_KEY);
    try {
      const adapter = getAuthAdapter();
      await adapter.logout();
      // Listener handles state update
    } catch (e) {
      console.error('[Auth] Logout error:', e);
      set({ error: null });
    }
  },

  // Role simulation — creates a real session so API calls use the correct mock token
  simulateRole: (role: UserRole) => {
    const mockUser = MOCK_USERS[role];
    if (mockUser) {
      invalidateAuthCache();
      simulateRoleSession(role);
      set({ user: mockUser });
    }
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },
}));

// Selector hooks for convenience
export const useUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () => useAuthStore((state) => !!state.user);
