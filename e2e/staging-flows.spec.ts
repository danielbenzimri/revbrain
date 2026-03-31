import { test, expect, type Page } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env.e2e') });

/**
 * Staging Health Check — Comprehensive E2E Flows
 *
 * The single test file that tells us "staging is healthy." Tests ALL user
 * flows against real staging (stg.revbrain.ai) with real Supabase auth.
 * Verifies zero console errors, proper API responses, and correct page
 * rendering for both system_admin and org_owner roles.
 *
 * Run: npx playwright test staging-flows --project=chromium
 */

// ---------------------------------------------------------------------------
// Environment & Credentials
// ---------------------------------------------------------------------------

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL!; // daniel@revbrain.ai (system_admin)
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD!;
const USER_EMAIL = process.env.E2E_NONADMIN_EMAIL!; // david@acme.com (org_owner)
const USER_PASSWORD = process.env.E2E_NONADMIN_PASSWORD!;
const BASE_URL = process.env.E2E_BASE_URL ?? 'https://stg.revbrain.ai';
const API_URL =
  process.env.E2E_API_URL ??
  'https://qutuivleheybnkbhpdbn.supabase.co/functions/v1/api';
const ANON_KEY =
  process.env.E2E_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1dHVpdmxlaGV5Ym5rYmhwZGJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTQxMzgsImV4cCI6MjA4OTY3MDEzOH0.Arjxw1r7DhD1LLGQBiNkPkqo1ycsQVBQqXPEjugPsPA';
const SUPABASE_AUTH_URL =
  'https://qutuivleheybnkbhpdbn.supabase.co/auth/v1/token?grant_type=password';

// Skip the entire file when credentials are not configured
test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'E2E credentials not configured');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Obtain a Supabase access token via password grant. */
async function getToken(email: string, password: string): Promise<string> {
  const res = await fetch(SUPABASE_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`Auth failed for ${email}: ${res.status} ${res.statusText}`);
  }
  const { access_token } = await res.json();
  if (!access_token) {
    throw new Error(`No access_token returned for ${email}`);
  }
  return access_token;
}

/** Authenticated API call. Returns status and parsed body. */
async function api(
  token: string,
  apiPath: string,
  options?: RequestInit,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${API_URL}${apiPath}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/** Login via the browser UI and wait for navigation. */
async function loginViaUI(page: Page, email: string, password: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /sign in|התחבר/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 });
  await page.waitForTimeout(2_000);
}

// Known noisy console messages to ignore
const IGNORED_CONSOLE_PATTERNS = [
  'favicon',
  'Download the React DevTools',
  'React does not recognize',
  'findDOMNode is deprecated',
  '[HMR]',
  '[vite]',
  'Lit is in dev mode',
  'Source map',
  'DevTools',
  'The resource',
  'Failed to load resource: net::ERR',
  'Refused to apply style',
  'AuthRetryableFetchError',
  'status of 403',  // expected: org_owner prefetch hits admin endpoints
  'status of 401',  // expected: token refresh race conditions
  'supabase',
  'MOCK',
  '[LocalAPI]',
  'AxeBuilder',
  'Not implemented',
];

function isIgnoredConsoleMessage(text: string): boolean {
  return IGNORED_CONSOLE_PATTERNS.some((p) => text.includes(p));
}

/** Attach console/pageerror/response listeners to a page and return collectors. */
function attachPageMonitors(page: Page) {
  const consoleErrors: string[] = [];
  const serverErrors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(err.message);
  });
  page.on('response', (res) => {
    if (res.status() >= 500) {
      serverErrors.push(`${res.status()} ${res.url()}`);
    }
  });

  return {
    consoleErrors,
    serverErrors,
    /** Assert zero real console errors and zero 500s. */
    assertClean(label: string) {
      const realErrors = consoleErrors.filter((e) => !isIgnoredConsoleMessage(e));
      if (realErrors.length > 0) {
        console.log(`  [${label}] Console errors:`, realErrors);
      }
      if (serverErrors.length > 0) {
        console.log(`  [${label}] Server 500s:`, serverErrors);
      }
      expect(serverErrors, `${label}: unexpected 500 responses`).toEqual([]);
      expect(realErrors, `${label}: unexpected console errors`).toEqual([]);
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. SYSTEM ADMIN FLOWS
// ═══════════════════════════════════════════════════════════════════════════

test.describe('System Admin Flows', () => {
  test.describe.configure({ mode: 'serial' });

  // --- Dashboard ---

  test('Admin Dashboard — loads with stats cards', async ({ page }) => {
    const m = attachPageMonitors(page);
    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`${BASE_URL}/admin`);
    await page.waitForTimeout(3_000);

    await expect(
      page.locator('text=/Total Tenants|סה"כ ארגונים/i').first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator('text=/Active Users|משתמשים פעילים/i').first(),
    ).toBeVisible();
    await expect(
      page.locator('text=/Recent Activity|פעילות אחרונה/i').first(),
    ).toBeVisible();

    m.assertClean('Admin Dashboard');
  });

  // --- Tenants ---

  test('Admin Tenants — table has rows, can drill into detail', async ({ page }) => {
    const m = attachPageMonitors(page);
    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`${BASE_URL}/admin/tenants`);
    await page.waitForTimeout(3_000);

    // Table rows visible
    await expect(page.locator('text=Acme Corp')).toBeVisible({ timeout: 10_000 });

    // Click first tenant row to open detail
    await page.locator('tr').filter({ hasText: /Acme Corp/ }).first().click();
    await page.waitForTimeout(2_000);

    // Detail panel or page should show tenant info
    await expect(
      page.locator('text=/Acme Corp/').first(),
    ).toBeVisible({ timeout: 10_000 });

    m.assertClean('Admin Tenants');
  });

  // --- Users ---

  test('Admin Users — table has rows', async ({ page }) => {
    const m = attachPageMonitors(page);
    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`${BASE_URL}/admin/users`);
    await page.waitForTimeout(3_000);

    await expect(
      page.locator('text=daniel@revbrain.ai'),
    ).toBeVisible({ timeout: 10_000 });

    // Verify multiple users present
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(3);

    m.assertClean('Admin Users');
  });

  // --- Audit ---

  test('Admin Audit — log entries visible', async ({ page }) => {
    const m = attachPageMonitors(page);
    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`${BASE_URL}/admin/audit`);
    await page.waitForTimeout(3_000);

    const rows = page.locator('table tbody tr, [data-testid*="audit"]');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });

    m.assertClean('Admin Audit');
  });

  // --- Support ---

  test('Admin Support — page loads', async ({ page }) => {
    const m = attachPageMonitors(page);
    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`${BASE_URL}/admin/support`);
    await page.waitForTimeout(3_000);

    // Page should render without being blank
    const bodyText = await page.textContent('body');
    expect(bodyText?.length).toBeGreaterThan(50);

    m.assertClean('Admin Support');
  });

  // --- Coupons ---

  test('Admin Coupons — page loads', async ({ page }) => {
    const m = attachPageMonitors(page);
    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`${BASE_URL}/admin/coupons`);
    await page.waitForTimeout(3_000);

    const bodyText = await page.textContent('body');
    expect(bodyText?.length).toBeGreaterThan(50);

    m.assertClean('Admin Coupons');
  });

  // --- Pricing ---

  test('Admin Pricing — plans visible', async ({ page }) => {
    const m = attachPageMonitors(page);
    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`${BASE_URL}/admin/pricing`);
    await page.waitForTimeout(3_000);

    // Should show plan names
    const hasStarter = (await page.locator('text=Starter').count()) > 0;
    const hasPro = (await page.locator('text=Pro').count()) > 0;
    const hasEnterprise = (await page.locator('text=Enterprise').count()) > 0;
    expect(hasStarter || hasPro || hasEnterprise).toBe(true);

    m.assertClean('Admin Pricing');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. ORG OWNER FLOWS
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Org Owner Flows', () => {
  test.describe.configure({ mode: 'serial' });

  // Track a project created during this suite for cleanup
  let testProjectId: string | null = null;

  // --- Dashboard ---

  test('Dashboard — loads with sidebar nav (not admin)', async ({ page }) => {
    const m = attachPageMonitors(page);
    await loginViaUI(page, USER_EMAIL, USER_PASSWORD);

    // Should land on main app, not admin
    await page.waitForTimeout(3_000);

    // Sidebar should have user-facing nav, not admin nav
    const sidebar = page.locator('nav, aside');
    await expect(
      sidebar.locator('text=/Projects|פרויקטים/i').first(),
    ).toBeVisible({ timeout: 10_000 });

    // Should NOT see admin-only nav items
    const adminNav = sidebar.locator('text=/Tenants|ארגונים/i');
    const adminNavCount = await adminNav.count();
    expect(adminNavCount).toBe(0);

    m.assertClean('Org Owner Dashboard');
  });

  // --- Projects list ---

  test('Projects — list page loads', async ({ page }) => {
    const m = attachPageMonitors(page);
    await loginViaUI(page, USER_EMAIL, USER_PASSWORD);
    await page.goto(`${BASE_URL}/projects`);
    await page.waitForTimeout(3_000);

    await expect(
      page.locator('text=/Projects|פרויקטים/i').first(),
    ).toBeVisible({ timeout: 10_000 });

    m.assertClean('Org Owner Projects');
  });

  // --- Create project via API ---

  test('Create project via API — appears in list', async ({ page }) => {
    const m = attachPageMonitors(page);
    const token = await getToken(USER_EMAIL, USER_PASSWORD);

    // Create a test project
    const projectName = `E2E Test ${Date.now()}`;
    const { status, body } = await api(token, '/v1/projects', {
      method: 'POST',
      body: JSON.stringify({ name: projectName }),
    });
    expect(status).toBe(201);
    expect((body as { success: boolean }).success).toBe(true);
    testProjectId = ((body as { data: { id: string } }).data).id;
    expect(testProjectId).toBeTruthy();

    // Navigate to projects page and verify it appears
    await loginViaUI(page, USER_EMAIL, USER_PASSWORD);
    await page.goto(`${BASE_URL}/projects`);
    await page.waitForTimeout(3_000);

    await expect(
      page.locator(`text=${projectName}`).first(),
    ).toBeVisible({ timeout: 10_000 });

    m.assertClean('Create Project');
  });

  // --- Project overview ---

  test('Project Overview — page loads', async ({ page }) => {
    test.skip(!testProjectId, 'No test project created');
    const m = attachPageMonitors(page);
    await loginViaUI(page, USER_EMAIL, USER_PASSWORD);
    await page.goto(`${BASE_URL}/project/${testProjectId}`);
    await page.waitForTimeout(3_000);

    // Page should render content (not blank, not error)
    const bodyText = await page.textContent('body');
    expect(bodyText?.length).toBeGreaterThan(50);

    m.assertClean('Project Overview');
  });

  // --- Project Sub-Pages ---

  test('Project CPQ Explorer — page loads', async ({ page }) => {
    test.skip(!testProjectId, 'No test project created');
    const m = attachPageMonitors(page);
    await loginViaUI(page, USER_EMAIL, USER_PASSWORD);
    await page.goto(`${BASE_URL}/project/${testProjectId}/cpq-explorer`);
    await page.waitForTimeout(3_000);

    const bodyText = await page.textContent('body');
    expect(bodyText?.length).toBeGreaterThan(50);

    m.assertClean('Project CPQ Explorer');
  });

  // --- Project Assessment ---

  test('Project Assessment — page loads', async ({ page }) => {
    test.skip(!testProjectId, 'No test project created');
    const m = attachPageMonitors(page);
    await loginViaUI(page, USER_EMAIL, USER_PASSWORD);
    await page.goto(`${BASE_URL}/project/${testProjectId}/assessment`);
    await page.waitForTimeout(3_000);

    const bodyText = await page.textContent('body');
    expect(bodyText?.length).toBeGreaterThan(50);

    m.assertClean('Project Assessment');
  });

  // --- Billing ---

  test('Billing — page loads with subscription info or empty state', async ({ page }) => {
    const m = attachPageMonitors(page);
    await loginViaUI(page, USER_EMAIL, USER_PASSWORD);
    await page.goto(`${BASE_URL}/billing`);
    await page.waitForTimeout(3_000);

    const bodyText = await page.textContent('body');
    expect(bodyText?.length).toBeGreaterThan(50);

    m.assertClean('Billing');
  });

  // --- Settings ---

  test('Settings — profile form visible', async ({ page }) => {
    const m = attachPageMonitors(page);
    await loginViaUI(page, USER_EMAIL, USER_PASSWORD);
    await page.goto(`${BASE_URL}/settings`);
    await page.waitForTimeout(3_000);

    // Should have profile-related form inputs
    const inputs = page.locator('input');
    const inputCount = await inputs.count();
    expect(inputCount).toBeGreaterThanOrEqual(1);

    m.assertClean('Settings');
  });

  // --- Help / Support ---

  test('Help — page loads', async ({ page }) => {
    const m = attachPageMonitors(page);
    await loginViaUI(page, USER_EMAIL, USER_PASSWORD);
    await page.goto(`${BASE_URL}/help`);
    await page.waitForTimeout(3_000);

    const bodyText = await page.textContent('body');
    expect(bodyText?.length).toBeGreaterThan(50);

    m.assertClean('Help');
  });

  // --- Cleanup ---

  test('Cleanup — delete test project via API', async () => {
    test.skip(!testProjectId, 'No test project to clean up');
    const token = await getToken(USER_EMAIL, USER_PASSWORD);
    const { status } = await api(token, `/v1/projects/${testProjectId}`, {
      method: 'DELETE',
    });
    // Accept 200 or 204 (success) or 404 (already gone)
    expect([200, 204, 404]).toContain(status);
    testProjectId = null;
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. API HEALTH CHECKS (no UI)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('API Health Checks', () => {
  let adminToken: string;
  let userToken: string;

  test.beforeAll(async () => {
    [adminToken, userToken] = await Promise.all([
      getToken(ADMIN_EMAIL, ADMIN_PASSWORD),
      getToken(USER_EMAIL, USER_PASSWORD),
    ]);
  });

  // --- Public ---

  test('GET /v1/health — 200', async () => {
    const res = await fetch(`${API_URL}/v1/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  // --- Org Owner endpoints ---

  test('GET /v1/projects — 200 (org_owner)', async () => {
    const { status, body } = await api(userToken, '/v1/projects');
    expect(status).toBe(200);
    expect((body as { success: boolean }).success).toBe(true);
    expect(Array.isArray((body as { data: unknown[] }).data)).toBe(true);
  });

  test('GET /v1/billing/subscription — 200 (org_owner)', async () => {
    const { status, body } = await api(userToken, '/v1/billing/subscription');
    expect(status).toBe(200);
    expect((body as { success: boolean }).success).toBe(true);
  });

  test('GET /v1/billing/usage — 200 (org_owner)', async () => {
    const { status, body } = await api(userToken, '/v1/billing/usage');
    expect(status).toBe(200);
    expect((body as { success: boolean }).success).toBe(true);
  });

  test('GET /v1/org/users — 200 (org_owner)', async () => {
    const { status, body } = await api(userToken, '/v1/org/users');
    expect(status).toBe(200);
    expect((body as { success: boolean }).success).toBe(true);
  });

  // --- Admin endpoints (admin token) ---

  test('GET /v1/admin/stats — 200 (admin)', async () => {
    const { status, body } = await api(adminToken, '/v1/admin/stats');
    expect(status).toBe(200);
    expect((body as { success: boolean }).success).toBe(true);
    const data = (body as { data: Record<string, number> }).data;
    expect(data.tenantCount).toBeGreaterThanOrEqual(1);
    expect(data.activeUserCount).toBeGreaterThanOrEqual(1);
  });

  test('GET /v1/admin/tenants — 200 (admin)', async () => {
    const { status, body } = await api(adminToken, '/v1/admin/tenants');
    expect(status).toBe(200);
    expect((body as { success: boolean }).success).toBe(true);
  });

  // --- Admin endpoints denied for org_owner ---

  test('GET /v1/admin/stats — 403 (org_owner)', async () => {
    const { status } = await api(userToken, '/v1/admin/stats');
    expect(status).toBe(403);
  });

  test('GET /v1/admin/tenants — 403 (org_owner)', async () => {
    const { status } = await api(userToken, '/v1/admin/tenants');
    expect(status).toBe(403);
  });

  // --- Invalid token ---

  test('Invalid token gets 401', async () => {
    const res = await fetch(`${API_URL}/v1/admin/stats`, {
      headers: { Authorization: 'Bearer invalid-garbage-token' },
    });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. CROSS-ROLE ISOLATION
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Cross-Role Isolation', () => {
  let userToken: string;

  test.beforeAll(async () => {
    userToken = await getToken(USER_EMAIL, USER_PASSWORD);
  });

  const ADMIN_ONLY_ENDPOINTS = [
    '/v1/admin/stats',
    '/v1/admin/tenants',
    '/v1/admin/users',
    '/v1/admin/audit',
  ];

  for (const endpoint of ADMIN_ONLY_ENDPOINTS) {
    test(`org_owner CANNOT access ${endpoint} — 403`, async () => {
      const { status } = await api(userToken, endpoint);
      expect(status).toBe(403);
    });
  }

  test('org_owner projects are org-scoped', async () => {
    const { status, body } = await api(userToken, '/v1/projects');
    expect(status).toBe(200);
    const data = (body as { data: Array<{ organizationId: string }> }).data;
    if (data.length > 1) {
      // All projects should belong to the same organization
      const orgIds = new Set(data.map((p) => p.organizationId));
      expect(orgIds.size).toBe(1);
    }
  });

  test('org_owner org users are org-scoped', async () => {
    const { status, body } = await api(userToken, '/v1/org/users');
    expect(status).toBe(200);
    const data = (body as { data: Array<{ organizationId: string }> }).data;
    if (data.length > 1) {
      const orgIds = new Set(data.map((u) => u.organizationId));
      expect(orgIds.size).toBe(1);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. NO 500 ERRORS ANYWHERE — Full Page Sweep
// ═══════════════════════════════════════════════════════════════════════════

test.describe('No 500 Errors — Full Page Sweep', () => {
  const ADMIN_PAGES = [
    { name: 'Admin Dashboard', path: '/admin' },
    { name: 'Admin Tenants', path: '/admin/tenants' },
    { name: 'Admin Users', path: '/admin/users' },
    { name: 'Admin Audit', path: '/admin/audit' },
    { name: 'Admin Support', path: '/admin/support' },
    { name: 'Admin Coupons', path: '/admin/coupons' },
    { name: 'Admin Pricing', path: '/admin/pricing' },
  ];

  const USER_PAGES = [
    { name: 'Dashboard', path: '/' },
    { name: 'Projects', path: '/projects' },
    { name: 'Billing', path: '/billing' },
    { name: 'Settings', path: '/settings' },
    { name: 'Help', path: '/help' },
  ];

  for (const pg of ADMIN_PAGES) {
    test(`${pg.name} — zero 500 responses`, async ({ page }) => {
      const m = attachPageMonitors(page);
      await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.goto(`${BASE_URL}${pg.path}`);
      await page.waitForTimeout(3_000);

      expect(
        m.serverErrors,
        `${pg.name}: 500 responses found: ${m.serverErrors.join(', ')}`,
      ).toEqual([]);
    });
  }

  for (const pg of USER_PAGES) {
    test(`${pg.name} (org_owner) — zero 500 responses`, async ({ page }) => {
      const m = attachPageMonitors(page);
      await loginViaUI(page, USER_EMAIL, USER_PASSWORD);
      await page.goto(`${BASE_URL}${pg.path}`);
      await page.waitForTimeout(3_000);

      expect(
        m.serverErrors,
        `${pg.name}: 500 responses found: ${m.serverErrors.join(', ')}`,
      ).toEqual([]);
    });
  }
});
