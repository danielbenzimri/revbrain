import type {
  AuthAdapter,
  AuthResult,
  Session,
  AuthUser,
  MFAFactor,
  MFAEnrollment,
} from '@/types/services';
import type { User, Session as SupabaseSession } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/**
 * Remote Auth Adapter (Supabase Auth)
 * Connects to the configured Supabase project
 */
export class RemoteAuthAdapter implements AuthAdapter {
  private supabase = supabase;

  constructor() {
    // Client is now singleton imported from @/lib/supabase
  }

  private mapUser(user: User): AuthUser {
    return {
      id: user.id,
      email: user.email || '',
      // Prefer metadata name, then email prefix
      name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0],
      avatar: user.user_metadata?.avatar_url,
      // Prefer custom role in metadata, else default to 'user', else Supabase role
      role: user.user_metadata?.role || 'user',
      metadata: user.user_metadata,
    };
  }

  private mapSession(session: SupabaseSession): Session {
    return {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      // session.expires_at is in seconds (unix timestamp)
      expiresAt: session.expires_at ? session.expires_at * 1000 : Date.now() + 3600 * 1000,
    };
  }

  async login(email: string, password: string): Promise<AuthResult> {
    console.log(`[RemoteAuth] login(${email})`);
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    if (!data.user || !data.session)
      throw new Error('Login successful but no user/session returned');

    return {
      user: this.mapUser(data.user),
      session: this.mapSession(data.session),
    };
  }

  async logout(): Promise<void> {
    console.log('[RemoteAuth] logout()');
    const { error } = await this.supabase.auth.signOut();
    if (error) throw error;
  }

  async getSession(): Promise<Session | null> {
    const { data } = await this.supabase.auth.getSession();
    return data.session ? this.mapSession(data.session) : null;
  }

  async refreshSession(): Promise<Session | null> {
    const { data } = await this.supabase.auth.refreshSession();
    return data.session ? this.mapSession(data.session) : null;
  }

  /**
   * Set session from magic link tokens
   * Used when user lands on /set-password from invite email
   */
  async setSession(accessToken: string, refreshToken: string): Promise<AuthResult> {
    console.log('[RemoteAuth] setSession()');
    const { data, error } = await this.supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) throw error;
    if (!data.user || !data.session) throw new Error('Session setup failed');

    return {
      user: this.mapUser(data.user),
      session: this.mapSession(data.session),
    };
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    // Prefer cached session user (localStorage, no network call)
    const {
      data: { session },
    } = await this.supabase.auth.getSession();
    if (session?.user) return this.mapUser(session.user);

    // Fallback to network call only if no cached session
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    return user ? this.mapUser(user) : null;
  }

  async updateUser(data: Partial<AuthUser>): Promise<AuthUser> {
    const { data: result, error } = await this.supabase.auth.updateUser({
      data: {
        full_name: data.name,
        avatar_url: data.avatar,
        ...data.metadata,
      },
    });

    if (error) throw error;
    if (!result.user) throw new Error('Update failed');

    return this.mapUser(result.user);
  }

  async resetPassword(email: string): Promise<void> {
    console.log(`[RemoteAuth] resetPassword(${email})`);
    const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password', // Ensure this route exists
    });
    if (error) throw error;
  }

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await this.supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }

  async getMFAFactors(): Promise<MFAFactor[]> {
    const { data, error } = await this.supabase.auth.mfa.listFactors();
    if (error) throw error;
    return (data.totp || []).map((f) => ({
      id: f.id,
      friendlyName: f.friendly_name ?? undefined,
      factorType: 'totp' as const,
      status: f.status as 'verified' | 'unverified',
      createdAt: f.created_at,
    }));
  }

  async enrollMFA(): Promise<MFAEnrollment> {
    const { data, error } = await this.supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Authenticator App',
    });
    if (error) throw error;
    return {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri,
    };
  }

  async challengeAndVerifyMFA(factorId: string, code: string): Promise<void> {
    const { data: challenge, error: challengeError } = await this.supabase.auth.mfa.challenge({
      factorId,
    });
    if (challengeError) throw challengeError;

    const { error: verifyError } = await this.supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });
    if (verifyError) throw verifyError;
  }

  async unenrollMFA(factorId: string): Promise<void> {
    const { error } = await this.supabase.auth.mfa.unenroll({ factorId });
    if (error) throw error;
  }

  onAuthStateChange(callback: (event: string, session: Session | null) => void): () => void {
    const {
      data: { subscription },
    } = this.supabase.auth.onAuthStateChange((event, session) => {
      console.log(`[RemoteAuth] onAuthStateChange: ${event}`);
      const mappedSession = session ? this.mapSession(session) : null;
      callback(event, mappedSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }
}
