// Service Factory
// Returns the appropriate adapter based on current service config

import type { APIAdapter, DBAdapter, StorageAdapter, AuthAdapter } from '@/types/services';
import { useServiceConfigStore } from '@/stores/service-config-store';

// Local Adapters (localStorage - for offline mode)
import { LocalAPIAdapter } from '@/lib/adapters/local/api';
import { LocalDBAdapter } from '@/lib/adapters/local/db';
import { LocalStorageAdapter } from '@/lib/adapters/local/storage';
import { LocalAuthAdapter } from '@/lib/adapters/local/auth';

// Remote Adapters (backend services - for online mode)
import { RemoteAPIAdapter } from '@/lib/adapters/remote/api';
import { RemoteDBAdapter } from '@/lib/adapters/remote/db';
import { RemoteStorageAdapter } from '@/lib/adapters/remote/storage';
import { RemoteAuthAdapter } from '@/lib/adapters/remote/auth';

// Singleton instances
let localAPIAdapter: LocalAPIAdapter | null = null;
let localDBAdapter: LocalDBAdapter | null = null;
let localStorageAdapter: LocalStorageAdapter | null = null;
let localAuthAdapter: LocalAuthAdapter | null = null;

let remoteAPIAdapter: RemoteAPIAdapter | null = null;
let remoteAPIAdapterBaseUrl: string | null = null; // Track URL to detect changes
let remoteDBAdapter: RemoteDBAdapter | null = null;
let remoteStorageAdapter: RemoteStorageAdapter | null = null;
let remoteAuthAdapter: RemoteAuthAdapter | null = null;

/**
 * Get API adapter based on current config
 * - Offline mode: LocalAPIAdapter (mock)
 * - Online mode: RemoteAPIAdapter (Hono local or Supabase Edge based on target)
 */
export function getAPIAdapter(): APIAdapter {
  const { mode, targets } = useServiceConfigStore.getState();

  if (mode === 'offline') {
    if (!localAPIAdapter) localAPIAdapter = new LocalAPIAdapter();
    return localAPIAdapter;
  } else {
    // Online mode - use remote adapter with configured URL
    const envUrl = import.meta.env.VITE_API_URL;

    // If we have an explicit remote URL in environment, prioritize it for dev account testing
    const baseUrl =
      envUrl && envUrl.startsWith('https')
        ? envUrl
        : targets.server === 'local'
          ? 'http://localhost:3000'
          : envUrl || 'https://YOUR_PROJECT.supabase.co/functions/v1';

    // Create new instance if base URL changed
    if (!remoteAPIAdapter || remoteAPIAdapterBaseUrl !== baseUrl) {
      remoteAPIAdapter = new RemoteAPIAdapter(baseUrl);
      remoteAPIAdapterBaseUrl = baseUrl;
    }
    return remoteAPIAdapter;
  }
}

/**
 * Get Database adapter based on current config
 * - Offline mode: LocalDBAdapter (localStorage)
 * - Online mode: RemoteDBAdapter (Docker Postgres or Supabase based on target)
 */
export function getDBAdapter(): DBAdapter {
  const { mode } = useServiceConfigStore.getState();

  if (mode === 'offline') {
    if (!localDBAdapter) localDBAdapter = new LocalDBAdapter();
    return localDBAdapter;
  } else {
    // Online mode - currently uses RemoteDBAdapter stub
    // TODO: Configure connection string based on targets.database
    if (!remoteDBAdapter) remoteDBAdapter = new RemoteDBAdapter();
    return remoteDBAdapter;
  }
}

/**
 * Get Storage adapter based on current config
 * - Offline mode: LocalStorageAdapter (localStorage data URLs)
 * - Online mode: RemoteStorageAdapter (local filesystem or Supabase Storage based on target)
 */
export function getStorageAdapter(): StorageAdapter {
  const { mode } = useServiceConfigStore.getState();

  if (mode === 'offline') {
    if (!localStorageAdapter) localStorageAdapter = new LocalStorageAdapter();
    return localStorageAdapter;
  } else {
    // Online mode - currently uses RemoteStorageAdapter stub
    if (!remoteStorageAdapter) remoteStorageAdapter = new RemoteStorageAdapter();
    return remoteStorageAdapter;
  }
}

/**
 * Get Auth adapter based on current config
 * - Offline mode: LocalAuthAdapter (mock users)
 * - Online mode: RemoteAuthAdapter (Supabase Auth) or HonoAuthAdapter
 */
export function getAuthAdapter(): AuthAdapter {
  const { mode } = useServiceConfigStore.getState();

  if (mode === 'offline') {
    if (!localAuthAdapter) localAuthAdapter = new LocalAuthAdapter();
    return localAuthAdapter;
  } else {
    // Online mode: Always use Supabase Auth for the Dev Account
    if (!remoteAuthAdapter) remoteAuthAdapter = new RemoteAuthAdapter();
    return remoteAuthAdapter;
  }
}

// Re-export types for convenience
export type { APIAdapter, DBAdapter, StorageAdapter, AuthAdapter };
