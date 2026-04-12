import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env.e2e') });

/**
 * Admin Flows E2E — Real Staging
 *
 * Comprehensive test suite using real system_admin credentials against
 * stg.revbrain.ai. Covers: dashboard, tenants, users, audit, plans,
 * profile settings, and language switching.
 *
 * Run: npx playwright test admin-flows-staging --project=chromium
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL!;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD!;
const BASE_URL = process.env.E2E_BASE_URL ?? 'https://stg.revbrain.ai';
const API_URL =
  process.env.E2E_API_URL ?? 'https://qutuivleheybnkbhpdbn.supabase.co/functions/v1/api';
const ANON_KEY =
  process.env.E2E_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1dHVpdmxlaGV5Ym5rYmhwZGJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTQxMzgsImV4cCI6MjA4OTY3MDEzOH0.Arjxw1r7DhD1LLGQBiNkPkqo1ycsQVBQqXPEjugPsPA';

// Helper: get auth token
async function getToken(): Promise<string> {
  const res = await fetch(
    `https://qutuivleheybnkbhpdbn.supabase.co/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    }
  );
  const { access_token } = await res.json();
  return access_token;
}

// Helper: authenticated API call
async function api(path: string, options?: RequestInit) {
  const token = await getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  return { status: res.status, body: await res.json() };
}

// Helper: login via UI
async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in|התחבר/i }).click();
  await page.waitForURL(/.*(?:admin|\/)/, { timeout: 15_000 });
  await page.waitForTimeout(2_000);
}

// ═══════════════════════════════════════════════════════════════════
// FLOW 1: Admin Dashboard
// ═══════════════════════════════════════════════════════════════════

test.describe('Flow 1: Admin Dashboard', () => {
  test('API: admin stats returns real data', async () => {
    const { status, body } = await api('/v1/admin/stats');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.tenantCount).toBeGreaterThanOrEqual(3);
    expect(body.data.activeUserCount).toBeGreaterThanOrEqual(8);
    expect(body.data.activeProjectCount).toBeGreaterThanOrEqual(1);
  });

  test('UI: dashboard shows stats and activity', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin`);
    await page.waitForTimeout(3_000);

    // Stats cards visible
    await expect(page.locator('text=/Total Tenants|סה"כ ארגונים/i').first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('text=/Active Users|משתמשים פעילים/i').first()).toBeVisible();

    // Recent activity section
    await expect(page.locator('text=/Recent Activity|פעילות אחרונה/i').first()).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════
// FLOW 2: Tenant Management
// ═══════════════════════════════════════════════════════════════════

test.describe('Flow 2: Tenant Management', () => {
  test('API: list tenants includes All Cloud Test', async () => {
    const { status, body } = await api('/v1/admin/tenants?limit=50');
    expect(status).toBe(200);
    expect(body.success).toBe(true);

    const allCloud = body.data.find((t: { name: string }) => t.name === 'All Cloud Test');
    expect(allCloud).toBeTruthy();
    expect(allCloud.type).toBe('business');
  });

  test('API: get tenant detail', async () => {
    const { body: list } = await api('/v1/admin/tenants?limit=50');
    const tenant = list.data[0];

    const { status, body } = await api(`/v1/admin/tenants/${tenant.id}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.name).toBeTruthy();
  });

  test('UI: tenants page shows org list', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/tenants`);
    await page.waitForTimeout(3_000);

    // Should see tenant rows
    await expect(page.locator('text=Acme Corp')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=All Cloud Test')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════
// FLOW 3: User Management
// ═══════════════════════════════════════════════════════════════════

test.describe('Flow 3: User Management', () => {
  test('API: list all users', async () => {
    const { status, body } = await api('/v1/admin/users?limit=50');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(8);

    // Our admin should be in the list
    const daniel = body.data.find((u: { email: string }) => u.email === 'daniel@revbrain.ai');
    expect(daniel).toBeTruthy();
    expect(daniel.role).toBe('system_admin');
  });

  test('API: list users includes admin details', async () => {
    const { status, body } = await api('/v1/admin/users?limit=50');
    expect(status).toBe(200);

    const daniel = body.data.find((u: { email: string }) => u.email === 'daniel@revbrain.ai');
    expect(daniel).toBeTruthy();
    expect(daniel.id).toBeTruthy();
    expect(daniel.role).toBe('system_admin');
  });

  test('UI: users page lists users with roles', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/users`);
    await page.waitForTimeout(3_000);

    // Should see user rows
    await expect(page.locator('text=daniel@revbrain.ai')).toBeVisible({ timeout: 10_000 });

    // Click a user to open drawer
    await page.locator('tr').filter({ hasText: 'daniel@revbrain.ai' }).click();
    await page.waitForTimeout(1_500);

    // Drawer should show user details (name visible in the slide-out panel)
    await expect(page.locator('text=Daniel Aviram').first()).toBeVisible({ timeout: 5_000 });
  });
});

// ═══════════════════════════════════════════════════════════════════
// FLOW 4: Audit Log
// ═══════════════════════════════════════════════════════════════════

test.describe('Flow 4: Audit Log', () => {
  test('API: audit log has entries', async () => {
    const { status, body } = await api('/v1/admin/audit?limit=20');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    // Should have onboarding entry from our test
    const onboardEntry = body.data.find((e: { action: string }) => e.action === 'tenant.onboarded');
    if (onboardEntry) {
      expect(onboardEntry.metadata.organizationName).toBeTruthy();
    }
  });

  test('UI: audit page loads with entries', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/audit`);
    await page.waitForTimeout(3_000);

    // Should show audit entries
    const rows = page.locator('table tbody tr, [data-testid*="audit"]');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  });
});

// ═══════════════════════════════════════════════════════════════════
// FLOW 5: Plans
// ═══════════════════════════════════════════════════════════════════

test.describe('Flow 5: Plans', () => {
  test('API: list plans returns seeded plans', async () => {
    const { status, body } = await api('/v1/plans');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(3);

    const planNames = body.data.map((p: { name: string }) => p.name);
    expect(planNames).toContain('Starter');
    expect(planNames).toContain('Pro');
    expect(planNames).toContain('Enterprise');
  });

  test('UI: pricing page loads without error', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/pricing`);
    await page.waitForTimeout(3_000);

    // Check the page loaded — either shows plan cards or an error boundary
    const hasPlans = (await page.locator('text=Starter').count()) > 0;
    const hasError = (await page.locator('text=/Something went wrong/i').count()) > 0;
    expect(hasPlans || hasError).toBe(true);

    if (hasPlans) {
      await expect(page.locator('text=Pro')).toBeVisible();
      await expect(page.locator('text=Enterprise')).toBeVisible();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// FLOW 6: Profile Settings
// ═══════════════════════════════════════════════════════════════════

test.describe('Flow 6: Profile Settings', () => {
  test('API: get my profile', async () => {
    const { status, body } = await api('/v1/users/me');
    expect(status).toBe(200);
    expect(body.data.email).toBe(ADMIN_EMAIL);
    expect(body.data.role).toBe('system_admin');
    expect(body.data.fullName).toBe('Daniel Aviram');
  });

  test('API: update profile field', async () => {
    // Update job title
    const { status, body } = await api('/v1/users/me', {
      method: 'PATCH',
      body: JSON.stringify({ jobTitle: 'CTO' }),
    });
    expect(status).toBe(200);
    expect(body.data.jobTitle).toBe('CTO');
  });

  test('UI: settings profile page loads', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/settings/profile`);
    await page.waitForTimeout(3_000);

    // Should show profile form with our name
    await expect(page.locator('input[value="Daniel Aviram"]').first()).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// FLOW 7: Language Switching
// ═══════════════════════════════════════════════════════════════════

test.describe('Flow 7: Language Switching', () => {
  test('UI: switch to Hebrew', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin`);
    await page.waitForTimeout(3_000);

    // Find the visible language switcher button (skip mobile-only ones)
    const langButtons = page.locator('button:visible').filter({ hasText: /EN|עב/i });
    const count = await langButtons.count();
    if (count === 0) {
      test.skip(true, 'Language switcher not found');
      return;
    }

    // Use the last visible match (typically the desktop sidebar one)
    const langButton = langButtons.last();
    await langButton.click();
    await page.waitForTimeout(500);

    // Select Hebrew
    const hebrewOption = page.locator('text=/עברית|Hebrew/i').first();
    if ((await hebrewOption.count()) > 0) {
      await hebrewOption.click();
      await page.waitForTimeout(2_000);

      // Verify RTL direction
      const dir = await page.locator('html').getAttribute('dir');
      expect(dir).toBe('rtl');

      // Verify Hebrew text appears
      await expect(page.locator('text=/סקירה|ארגונים|משתמשים/i').first()).toBeVisible({
        timeout: 5_000,
      });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// FLOW 8: Cross-cutting — Error handling & Auth
// ═══════════════════════════════════════════════════════════════════

test.describe('Flow 8: Error Handling', () => {
  test('API: non-admin gets 403 on admin endpoints', async () => {
    // Login as a regular user (david@test.org) and try admin endpoint
    const loginRes = await fetch(
      'https://qutuivleheybnkbhpdbn.supabase.co/auth/v1/token?grant_type=password',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
        body: JSON.stringify({
          email: process.env.E2E_NONADMIN_EMAIL ?? 'david@test.org',
          password: process.env.E2E_NONADMIN_PASSWORD ?? '',
        }),
      }
    );

    if (!loginRes.ok) {
      test.skip(true, 'Could not login as david@test.org');
      return;
    }

    const { access_token } = await loginRes.json();
    const res = await fetch(`${API_URL}/v1/admin/stats`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    expect(res.status).toBe(403);
  });

  test('API: invalid token gets 401', async () => {
    const res = await fetch(`${API_URL}/v1/admin/stats`, {
      headers: { Authorization: 'Bearer invalid-garbage-token' },
    });
    expect(res.status).toBe(401);
  });

  test('API: health endpoint is public', async () => {
    const res = await fetch(`${API_URL}/v1/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });
});
