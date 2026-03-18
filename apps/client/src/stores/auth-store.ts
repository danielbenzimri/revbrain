import { create } from 'zustand';
import type { User, UserRole } from '@/types/auth';
import { MOCK_USERS } from '@/lib/mock-data';
import { getAuthAdapter } from '@/lib/services';
import { invalidateAuthCache } from '@/lib/auth-headers';

const USER_CACHE_KEY = 'revbrain_user';

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
          const user = await adapter.getCurrentUser();
          if (user) {
            const appUser: User = {
              id: user.id,
              name: user.name || '',
              email: user.email,
              role: (user.role as UserRole) || 'admin',
              avatar: user.avatar,
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
        // Reload user details to get role/metadata
        try {
          const user = await adapter.getCurrentUser();
          if (user) {
            const appUser: User = {
              id: user.id,
              name: user.name || '',
              email: user.email,
              role: (user.role as UserRole) || 'admin',
              avatar: user.avatar,
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

  // Role simulation
  simulateRole: (role: UserRole) => {
    const mockUser = MOCK_USERS[role];
    if (mockUser) {
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
