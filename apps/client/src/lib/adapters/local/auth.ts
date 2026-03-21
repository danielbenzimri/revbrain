import type { AuthAdapter, AuthResult, Session, AuthUser } from '@/types/services';
import { MOCK_USERS } from '@/lib/mock-data';
import type { UserRole } from '@/types/auth';

const SESSION_KEY = 'revbrain_session';
const SIMULATED_DELAY = 300;

/**
 * Local Auth Adapter
 * Uses mock users and localStorage for session during development
 */
export class LocalAuthAdapter implements AuthAdapter {
  private async delay(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, SIMULATED_DELAY));
  }

  private getStoredSession(): { user: AuthUser; session: Session } | null {
    try {
      const data = localStorage.getItem(SESSION_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  private setStoredSession(user: AuthUser, session: Session): void {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ user, session }));
  }

  private clearStoredSession(): void {
    localStorage.removeItem(SESSION_KEY);
  }

  private listeners: ((event: string, session: Session | null) => void)[] = [];

  async login(email: string): Promise<AuthResult> {
    await this.delay();

    // Find mock user by email
    const mockUser = Object.values(MOCK_USERS).find((u) => u.email === email);

    if (!mockUser) {
      // Default to org_owner if email not found
      const defaultUser = MOCK_USERS.org_owner;
      return this.createSession(defaultUser);
    }

    return this.createSession(mockUser);
  }

  private createSession(mockUser: (typeof MOCK_USERS)[UserRole]): AuthResult {
    const user: AuthUser = {
      id: mockUser.id,
      email: mockUser.email,
      name: mockUser.name,
      avatar: mockUser.avatar,
      role: mockUser.role,
      metadata: {},
    };

    const session: Session = {
      accessToken: `mock_token_${user.id}`,
      refreshToken: `mock_refresh_${user.id}`,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    };

    this.setStoredSession(user, session);
    console.log(`[LocalAuth] login(${user.email})`, user.role);

    // Notify listeners
    this.notifyListeners('SIGNED_IN', session);

    return { user, session };
  }

  async logout(): Promise<void> {
    await this.delay();
    this.clearStoredSession();
    console.log('[LocalAuth] logout()');
    this.notifyListeners('SIGNED_OUT', null);
  }

  private notifyListeners(event: string, session: Session | null) {
    this.listeners.forEach((cb) => cb(event, session));
  }

  async getSession(): Promise<Session | null> {
    await this.delay();
    const stored = this.getStoredSession();

    if (stored && stored.session.expiresAt > Date.now()) {
      return stored.session;
    }

    return null;
  }

  async refreshSession(): Promise<Session | null> {
    await this.delay();
    const stored = this.getStoredSession();

    if (stored) {
      const newSession: Session = {
        ...stored.session,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };
      this.setStoredSession(stored.user, newSession);
      return newSession;
    }

    return null;
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    await this.delay();
    const stored = this.getStoredSession();
    return stored?.user || null;
  }

  async updateUser(data: Partial<AuthUser>): Promise<AuthUser> {
    await this.delay();
    const stored = this.getStoredSession();

    if (!stored) {
      throw new Error('Not authenticated');
    }

    const updatedUser = { ...stored.user, ...data };
    this.setStoredSession(updatedUser, stored.session);
    console.log('[LocalAuth] updateUser()', updatedUser);

    // Should we notify USER_UPDATED? Standard only handles SIGNED_IN/OUT usually, but update might be good
    const session = stored.session;
    this.notifyListeners('USER_UPDATED', session);

    return updatedUser;
  }

  async resetPassword(email: string): Promise<void> {
    await this.delay();
    console.log(`[LocalAuth] resetPassword(${email}) - simulated`);
  }

  async updatePassword(): Promise<void> {
    await this.delay();
    console.log('[LocalAuth] updatePassword() - simulated');
  }

  async setSession(accessToken: string, refreshToken: string): Promise<AuthResult> {
    await this.delay();
    const mockUser = MOCK_USERS.org_owner;
    console.log('[LocalAuth] setSession', {
      accessToken: accessToken.substring(0, 10),
      refreshToken: refreshToken.substring(0, 10),
    });
    return this.createSession(mockUser);
  }

  onAuthStateChange(callback: (event: string, session: Session | null) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }
}

// Helper to simulate a specific role
export function simulateRole(role: UserRole): AuthResult {
  const mockUser = MOCK_USERS[role];

  const user: AuthUser = {
    id: mockUser.id,
    email: mockUser.email,
    name: mockUser.name,
    avatar: mockUser.avatar,
    role: mockUser.role,
    metadata: {},
  };

  const session: Session = {
    accessToken: `mock_token_${user.id}`,
    refreshToken: `mock_refresh_${user.id}`,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  };

  localStorage.setItem(SESSION_KEY, JSON.stringify({ user, session }));
  console.log(`[LocalAuth] simulateRole(${role})`);

  return { user, session };
}
