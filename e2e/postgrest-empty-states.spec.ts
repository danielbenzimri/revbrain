import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env.e2e') });

/**
 * PostgREST Empty States — Staging Smoke Tests
 *
 * Verifies that project-scoped endpoints return proper responses (not 500)
 * now that PostgREST stubs have been replaced with real implementations.
 * All endpoints should return 200 with empty/default data, never 500.
 *
 * Run: npx playwright test postgrest-empty-states --project=chromium
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
    'https://qutuivleheybnkbhpdbn.supabase.co/auth/v1/token?grant_type=password',
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

// Helper: get first project ID from the API
async function getFirstProjectId(): Promise<string> {
  const { status, body } = await api('/v1/projects');
  if (status !== 200 || !body.data?.length) {
    throw new Error(`Could not fetch projects: status=${status}`);
  }
  return body.data[0].id;
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
// 1: Project endpoints don't return 500
// ═══════════════════════════════════════════════════════════════════

test.describe('PostgREST: Project endpoints return no 500s', () => {
  let projectId: string;

  test.beforeAll(async () => {
    projectId = await getFirstProjectId();
  });

  test('GET /projects returns 200', async () => {
    const { status, body } = await api('/v1/projects');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('GET /projects/:id returns 200', async () => {
    const { status, body } = await api(`/v1/projects/${projectId}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(projectId);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2: Overview page loads without errors
// ═══════════════════════════════════════════════════════════════════

test.describe('PostgREST: Overview page loads without API errors', () => {
  let projectId: string;

  test.beforeAll(async () => {
    projectId = await getFirstProjectId();
  });

  test('UI: project overview has no 500 responses', async ({ page }) => {
    const errors: string[] = [];

    // Intercept all API responses and flag any 500s
    page.on('response', (response) => {
      if (response.url().includes('/functions/v1/api') && response.status() >= 500) {
        errors.push(`${response.status()} ${response.url()}`);
      }
    });

    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/project/${projectId}/overview`);
    await page.waitForTimeout(5_000);

    // No 500-level errors from any API call
    expect(errors).toEqual([]);

    // Page should not show an error boundary
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('Something went wrong');
  });

  test('UI: project overview has no console error from API calls', async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('500')) {
        consoleErrors.push(msg.text());
      }
    });

    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/project/${projectId}/overview`);
    await page.waitForTimeout(5_000);

    expect(consoleErrors).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3: Salesforce connections endpoint returns empty (not 500)
// ═══════════════════════════════════════════════════════════════════

test.describe('PostgREST: Salesforce connections returns empty', () => {
  let projectId: string;

  test.beforeAll(async () => {
    projectId = await getFirstProjectId();
  });

  test('API: GET /projects/:id/salesforce/connections returns 200', async () => {
    const { status, body } = await api(`/v1/projects/${projectId}/salesforce/connections`);

    // Must not be a 500 — 200 with empty data is the expected response
    expect(status).not.toBeGreaterThanOrEqual(500);
    expect(status).toBe(200);
    expect(body.success).toBe(true);

    // Source and target should be null/empty when no connections exist
    if (body.data) {
      expect(body.data).toHaveProperty('source');
      expect(body.data).toHaveProperty('target');
    }
  });

  test('UI: Salesforce page intercepts connections call without 500', async ({ page }) => {
    const apiErrors: string[] = [];

    page.on('response', (response) => {
      if (response.url().includes('salesforce/connections') && response.status() >= 500) {
        apiErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/project/${projectId}/connections`);
    await page.waitForTimeout(5_000);

    expect(apiErrors).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4: Assessment status endpoint returns empty (not 500)
// ═══════════════════════════════════════════════════════════════════

test.describe('PostgREST: Assessment status returns proper response', () => {
  let projectId: string;

  test.beforeAll(async () => {
    projectId = await getFirstProjectId();
  });

  test('API: GET /projects/:id/assessment/status returns 200', async () => {
    const { status, body } = await api(`/v1/projects/${projectId}/assessment/status`);

    // Must not be a 500
    expect(status).not.toBeGreaterThanOrEqual(500);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  test('UI: Assessment page loads without 500 errors', async ({ page }) => {
    const apiErrors: string[] = [];

    page.on('response', (response) => {
      if (response.url().includes('assessment') && response.status() >= 500) {
        apiErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/project/${projectId}/assessment`);
    await page.waitForTimeout(5_000);

    expect(apiErrors).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5: Billing subscription doesn't 500
// ═══════════════════════════════════════════════════════════════════

test.describe('PostgREST: Billing subscription returns proper response', () => {
  test('API: GET /billing/subscription returns non-500 status', async () => {
    const { status, body } = await api('/v1/billing/subscription');

    // Must not be a server error — 200, 402, 404 are all acceptable
    expect(status).not.toBeGreaterThanOrEqual(500);

    // If 200, body should be well-formed
    if (status === 200) {
      expect(body.success).toBe(true);
    }

    // If an error status, it should be a structured error, not a crash
    if (status >= 400 && status < 500) {
      expect(body).toHaveProperty('success', false);
      expect(body.error).toBeTruthy();
      expect(body.error.code).toBeTruthy();
    }
  });

  test('UI: billing page loads without 500 errors', async ({ page }) => {
    const apiErrors: string[] = [];

    page.on('response', (response) => {
      if (response.url().includes('billing') && response.status() >= 500) {
        apiErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/settings/billing`);
    await page.waitForTimeout(5_000);

    expect(apiErrors).toEqual([]);
  });
});
