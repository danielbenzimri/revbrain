import { getAuthAdapter } from '@/lib/services';
import { dedupFetch } from '@/lib/request-dedup';

/**
 * Custom error for authentication failures
 */
export class AuthenticationError extends Error {
  constructor(message = 'Not authenticated') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

// ── In-memory session cache ──────────────────────────────
// Avoids calling adapter.getSession() (localStorage read) on every API request.
// Invalidated on SIGNED_OUT and logout. See speedup_tasks.md Task 1.3.

let _cachedSession: { accessToken: string; expiresAt: number } | null = null;
let _refreshPromise: Promise<void> | null = null;

// Invalidate cache 30s before actual expiry to avoid using a nearly-expired token
const CACHE_EXPIRY_BUFFER_MS = 30_000;

// Refresh if token expires within this buffer (5 minutes)
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * Invalidate the cached auth session.
 * Call on SIGNED_OUT event or explicit logout.
 */
export function invalidateAuthCache(): void {
  _cachedSession = null;
  _refreshPromise = null;
}

/**
 * Get authentication headers for API requests.
 * Uses in-memory cache to avoid repeated localStorage reads.
 * Proactively refreshes the session if the token is expired or about to expire.
 *
 * @throws {AuthenticationError} if no valid session exists
 */
export async function getAuthHeaders(): Promise<HeadersInit> {
  const now = Date.now();

  // Check cache first — if valid and not within buffer of expiry, use it
  if (
    _cachedSession &&
    _cachedSession.accessToken &&
    _cachedSession.expiresAt - now > CACHE_EXPIRY_BUFFER_MS
  ) {
    return {
      Authorization: `Bearer ${_cachedSession.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  const adapter = getAuthAdapter();

  // Get current session
  let session = await adapter.getSession();

  // Check if token is missing, expired, or about to expire (within buffer)
  const tokenExpiresAt = session?.expiresAt ?? 0;
  const shouldRefresh =
    !session?.accessToken || tokenExpiresAt < now || tokenExpiresAt - now < TOKEN_REFRESH_BUFFER_MS;

  if (shouldRefresh) {
    // Deduplicate concurrent refresh calls
    if (!_refreshPromise) {
      _refreshPromise = (async () => {
        try {
          console.log('[Auth] Token expired or expiring soon, refreshing...');
          session = await adapter.refreshSession();
          console.log('[Auth] Session refreshed successfully');
        } catch (error) {
          console.error('[Auth] Failed to refresh session:', error);
          _cachedSession = null;
          throw new AuthenticationError('Session expired. Please log in again.');
        } finally {
          _refreshPromise = null;
        }
      })();
    }
    await _refreshPromise;

    // Re-read session after refresh
    session = await adapter.getSession();
  }

  // If still no valid session after refresh attempt
  if (!session?.accessToken) {
    _cachedSession = null;
    throw new AuthenticationError('No valid session. Please log in.');
  }

  // Populate cache
  _cachedSession = {
    accessToken: session.accessToken,
    expiresAt: session.expiresAt ?? 0,
  };

  return {
    Authorization: `Bearer ${session.accessToken}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Wrapper for fetch that handles auth errors and refreshes tokens.
 * Redirects to login if authentication fails.
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = await getAuthHeaders();

  const response = await dedupFetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  // If we get a 401, the token might have been revoked server-side
  if (response.status === 401) {
    invalidateAuthCache();
    // Clear the session and let the auth state handler redirect
    try {
      await getAuthAdapter().logout();
    } catch {
      // Ignore logout errors
    }
    throw new AuthenticationError('Session invalid. Please log in again.');
  }

  return response;
}
