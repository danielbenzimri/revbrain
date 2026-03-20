/**
 * Admin Test Helpers
 *
 * Shared utilities for admin Playwright tests.
 * Supports both mock mode (no Supabase) and real mode (Supabase test account).
 */
import { type Page, type APIRequestContext, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Mock IDs (mirrors apps/server/src/mocks/constants.ts)
// ---------------------------------------------------------------------------
export const MOCK_IDS = {
  // Plans
  PLAN_STARTER: '00000000-0000-4000-a000-000000000101',
  PLAN_PRO: '00000000-0000-4000-a000-000000000102',
  PLAN_ENTERPRISE: '00000000-0000-4000-a000-000000000103',

  // Organizations
  ORG_ACME: '00000000-0000-4000-a000-000000000201',
  ORG_BETA: '00000000-0000-4000-a000-000000000202',

  // Users
  USER_SYSTEM_ADMIN: '00000000-0000-4000-a000-000000000301',
  USER_ACME_OWNER: '00000000-0000-4000-a000-000000000302',
  USER_ACME_ADMIN: '00000000-0000-4000-a000-000000000303',
  USER_ACME_OPERATOR: '00000000-0000-4000-a000-000000000304',
  USER_ACME_REVIEWER: '00000000-0000-4000-a000-000000000305',
  USER_BETA_OWNER: '00000000-0000-4000-a000-000000000306',
  USER_BETA_OPERATOR: '00000000-0000-4000-a000-000000000307',
  USER_ACME_PENDING: '00000000-0000-4000-a000-000000000308',

  // Tickets
  TICKET_1: '00000000-0000-4000-a000-000000000601',
  TICKET_2: '00000000-0000-4000-a000-000000000602',
  TICKET_3: '00000000-0000-4000-a000-000000000603',
  TICKET_4: '00000000-0000-4000-a000-000000000604',
  TICKET_5: '00000000-0000-4000-a000-000000000605',
  TICKET_6: '00000000-0000-4000-a000-000000000606',

  // Coupons
  COUPON_ACTIVE_PERCENT: '00000000-0000-4000-a000-000000000701',
  COUPON_EXPIRED_FIXED: '00000000-0000-4000-a000-000000000702',
  COUPON_SCHEDULED: '00000000-0000-4000-a000-000000000703',
  COUPON_MAXED_OUT: '00000000-0000-4000-a000-000000000704',

  // Overrides
  OVERRIDE_1: '00000000-0000-4000-a000-000000000801',
  OVERRIDE_2: '00000000-0000-4000-a000-000000000802',
} as const;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
export const API_URL = process.env.VITE_API_URL || 'http://localhost:3000';
const CLEANUP_KEY = process.env.TEST_CLEANUP_KEY || 'test-cleanup-secret';

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/** Build a mock token for the given user ID */
export function mockToken(userId: string): string {
  return `mock_token_${userId}`;
}

/**
 * Login by writing a valid mock session to localStorage, then navigating.
 *
 * Auth flow:
 * 1. Auth store reads `revbrain_user` → sets user immediately (no spinner)
 * 2. LocalAuthAdapter.getSession() reads `revbrain_session` → finds valid session → keeps user
 * 3. LocalAuthAdapter.getCurrentUser() reads `revbrain_session` → returns user → confirms
 *
 * Both keys must be set BEFORE the app initializes. We do this by:
 * 1. Going to a page on the app origin (login, which loads fast)
 * 2. Setting localStorage via page.evaluate
 * 3. Then navigating to the desired page (which re-initializes the app with session in place)
 */
async function injectAuth(
  page: Page,
  user: { id: string; name: string; email: string; role: string },
) {
  // Step 1: Navigate to the app origin to get localStorage access
  await page.goto('/login', { waitUntil: 'domcontentloaded' });

  // Step 2: Set localStorage — service config (offline mode) + auth session
  await page.evaluate(({ user }) => {
    // Force offline mode so the app uses LocalAuthAdapter (not RemoteAuthAdapter/Supabase)
    localStorage.setItem(
      'revbrain-service-config',
      JSON.stringify({
        state: {
          mode: 'offline',
          targets: { server: 'local', database: 'local', storage: 'local' },
        },
        version: 3,
      }),
    );

    const userObj = { id: user.id, name: user.name, email: user.email, role: user.role, avatar: null };
    const authUser = { ...userObj, metadata: { group: 'default' } };
    const session = {
      accessToken: `mock_token_${user.id}`,
      refreshToken: `mock_refresh_${user.id}`,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };

    // revbrain_user: auth store reads this on init for fast display
    localStorage.setItem('revbrain_user', JSON.stringify(userObj));
    // revbrain_session: LocalAuthAdapter.getSession() and getCurrentUser() read this
    localStorage.setItem('revbrain_session', JSON.stringify({ user: authUser, session }));
  }, { user });

  // Step 3: Reload so the app initializes with the session in place
  // (The login page may have already started initializing without auth)
}

/** Login as system_admin */
export async function loginAsAdmin(page: Page) {
  await injectAuth(page, {
    id: MOCK_IDS.USER_SYSTEM_ADMIN,
    name: 'System Admin',
    email: 'admin@revbrain.io',
    role: 'system_admin',
  });
}

/** Login as operator (non-admin) */
export async function loginAsOperator(page: Page) {
  await injectAuth(page, {
    id: MOCK_IDS.USER_ACME_OPERATOR,
    name: 'Mike Johnson',
    email: 'mike@acme.com',
    role: 'operator',
  });
}

// ---------------------------------------------------------------------------
// API helpers (for API-level tests — bypass UI)
// ---------------------------------------------------------------------------

export function adminHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${mockToken(MOCK_IDS.USER_SYSTEM_ADMIN)}`,
    'Content-Type': 'application/json',
  };
}

export function operatorHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${mockToken(MOCK_IDS.USER_ACME_OPERATOR)}`,
    'Content-Type': 'application/json',
  };
}

/** Direct fetch against the API with automatic retry on 429 (rate limit) */
export async function apiFetch(
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
) {
  const { method = 'GET', headers = adminHeaders(), body } = options;
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 429 && attempt < MAX_RETRIES) {
      // Back off and retry
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }

    const json = await res.json().catch(() => null);
    return { status: res.status, headers: res.headers, json };
  }

  // Should not reach here, but just in case
  throw new Error(`apiFetch failed after ${MAX_RETRIES} retries: ${path}`);
}

/** Reset mock data to seed state (mock mode only) */
export async function resetMockData() {
  await fetch(`${API_URL}/v1/dev/reset-mock-data`, {
    method: 'POST',
    headers: { 'X-Test-Cleanup-Key': CLEANUP_KEY },
  });
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

export async function navigateAdmin(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('domcontentloaded');
}

// ---------------------------------------------------------------------------
// Waiters
// ---------------------------------------------------------------------------

/** Wait for an API response matching a URL pattern */
export async function waitForApiResponse(page: Page, urlPattern: string | RegExp) {
  return page.waitForResponse(
    (r) =>
      (typeof urlPattern === 'string'
        ? r.url().includes(urlPattern)
        : urlPattern.test(r.url())) && r.status() < 400,
  );
}

/** Wait for an audit entry with the given action to appear */
export async function waitForAudit(action: string, timeoutMs = 5000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { json } = await apiFetch(`/v1/admin/audit?action=${action}&limit=1`);
    if (json?.data?.length > 0) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Unique identifiers for test isolation
// ---------------------------------------------------------------------------

const RUN_ID = Date.now().toString(36);
let counter = 0;

export function uniqueCode(prefix = 'TEST'): string {
  return `${prefix}_${RUN_ID}_${(++counter).toString(36)}`.toUpperCase();
}

export function uniqueEmail(prefix = 'test'): string {
  return `${prefix}.${RUN_ID}.${(++counter).toString(36)}@example.com`;
}

export function uniqueSlug(prefix = 'test'): string {
  return `${prefix}-${RUN_ID}-${(++counter).toString(36)}`;
}

// ---------------------------------------------------------------------------
// Common selectors (bilingual EN/HE)
// ---------------------------------------------------------------------------

export const sel = {
  // Buttons
  save: /save changes|שמור שינויים/i,
  cancel: /cancel|ביטול/i,
  create: /create|יצירת|צור/i,
  delete: /delete|מחק/i,
  edit: /edit|עריכה/i,
  deactivate: /deactivate|השבת/i,
  close: /close|סגור/i,
  done: /done|בוצע/i,
  invite: /invite|הזמנ/i,
  export: /export csv|ייצוא csv/i,
  refresh: /refresh|רענון/i,
  sendReply: /send reply|שלח תשובה/i,

  // Status
  active: /active|פעיל/i,
  inactive: /inactive|לא פעיל/i,

  // Drawer / dialog
  drawer: '[role="dialog"]',
} as const;
