import { create } from 'zustand';

const STORAGE_KEY = 'revbrain_impersonation';

interface ImpersonatedUser {
  id: string;
  name: string;
  email: string;
  orgName: string;
}

interface ImpersonationState {
  isImpersonating: boolean;
  originalToken: string | null;
  impersonationToken: string | null;
  impersonatedUser: ImpersonatedUser | null;
  reason: string | null;
  mode: 'read_only' | null;
  expiresAt: string | null;

  startImpersonation(data: {
    token: string;
    expiresAt: string;
    user: ImpersonatedUser;
    reason: string;
    mode: string;
  }): void;
  endImpersonation(): void;
}

function loadFromStorage(): Partial<ImpersonationState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Check if expired
    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function saveToStorage(state: Partial<ImpersonationState>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable
  }
}

function clearStorage() {
  localStorage.removeItem(STORAGE_KEY);
}

let _expiryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAutoExpiry(expiresAt: string, endFn: () => void) {
  if (_expiryTimer) clearTimeout(_expiryTimer);
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) {
    endFn();
    return;
  }
  _expiryTimer = setTimeout(endFn, ms);
}

function clearExpiryTimer() {
  if (_expiryTimer) {
    clearTimeout(_expiryTimer);
    _expiryTimer = null;
  }
}

const persisted = loadFromStorage();

export const useImpersonationStore = create<ImpersonationState>()((set, get) => {
  // If we loaded persisted state, schedule auto-expiry
  if (persisted.isImpersonating && persisted.expiresAt) {
    // Defer scheduling to after store is created
    setTimeout(() => {
      scheduleAutoExpiry(persisted.expiresAt!, () => get().endImpersonation());
    }, 0);
  }

  return {
    isImpersonating: persisted.isImpersonating ?? false,
    originalToken: persisted.originalToken ?? null,
    impersonationToken: persisted.impersonationToken ?? null,
    impersonatedUser: persisted.impersonatedUser ?? null,
    reason: persisted.reason ?? null,
    mode: persisted.mode ?? null,
    expiresAt: persisted.expiresAt ?? null,

    startImpersonation(data) {
      const newState = {
        isImpersonating: true,
        originalToken: null as string | null, // We don't store the original token client-side for security
        impersonationToken: data.token,
        impersonatedUser: data.user,
        reason: data.reason,
        mode: data.mode as 'read_only',
        expiresAt: data.expiresAt,
      };

      set(newState);
      saveToStorage(newState);
      scheduleAutoExpiry(data.expiresAt, () => get().endImpersonation());
    },

    endImpersonation() {
      clearExpiryTimer();
      clearStorage();
      set({
        isImpersonating: false,
        originalToken: null,
        impersonationToken: null,
        impersonatedUser: null,
        reason: null,
        mode: null,
        expiresAt: null,
      });
    },
  };
});

// Multi-tab sync: listen for storage changes from other tabs
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;

    if (!event.newValue) {
      // Another tab cleared impersonation
      useImpersonationStore.getState().endImpersonation();
      return;
    }

    try {
      const data = JSON.parse(event.newValue);
      if (data.isImpersonating) {
        useImpersonationStore.setState({
          isImpersonating: data.isImpersonating,
          originalToken: data.originalToken,
          impersonationToken: data.impersonationToken,
          impersonatedUser: data.impersonatedUser,
          reason: data.reason,
          mode: data.mode,
          expiresAt: data.expiresAt,
        });
        if (data.expiresAt) {
          scheduleAutoExpiry(data.expiresAt, () =>
            useImpersonationStore.getState().endImpersonation()
          );
        }
      } else {
        useImpersonationStore.getState().endImpersonation();
      }
    } catch {
      // Ignore parse errors
    }
  });
}
