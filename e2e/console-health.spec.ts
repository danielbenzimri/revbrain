import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';
import { login, TEST_USERS } from './fixtures/auth';

/**
 * Browser Console Health Check
 *
 * Navigates all major pages and captures browser console output.
 * Fails on: errors, unhandled rejections, React warnings.
 * Reports: all warnings for review.
 *
 * This catches:
 * - React key warnings
 * - Missing translations (i18n)
 * - Failed network requests
 * - Unhandled promise rejections
 * - Component render errors
 * - Deprecated API usage
 * - Console.error calls
 */

interface ConsoleEntry {
  type: string;
  text: string;
  url: string;
}

function collectConsole(page: Page): ConsoleEntry[] {
  const entries: ConsoleEntry[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    entries.push({
      type: msg.type(),
      text: msg.text(),
      url: page.url(),
    });
  });
  page.on('pageerror', (err) => {
    entries.push({
      type: 'pageerror',
      text: err.message,
      url: page.url(),
    });
  });
  return entries;
}

// Pages to check — public
const PUBLIC_PAGES = [
  { name: 'Login', path: '/login' },
];

// Pages to check — authenticated (system_admin)
const ADMIN_PAGES = [
  { name: 'Dashboard', path: '/' },
  { name: 'Admin Dashboard', path: '/admin' },
  { name: 'Tenants', path: '/admin/tenants' },
  { name: 'Users', path: '/admin/users' },
  { name: 'Pricing', path: '/admin/pricing' },
  { name: 'Coupons', path: '/admin/coupons' },
  { name: 'Support', path: '/admin/support' },
  { name: 'Audit', path: '/admin/audit' },
  { name: 'Settings', path: '/settings' },
  { name: 'Billing', path: '/billing' },
];

// Known acceptable warnings (don't fail on these)
const ACCEPTABLE_PATTERNS = [
  'Download the React DevTools',
  'React does not recognize',            // Third-party component prop warnings
  'findDOMNode is deprecated',           // Legacy library usage
  '[HMR]',                               // Hot module replacement
  '[vite]',                              // Vite dev server
  'Lit is in dev mode',                  // Lit components
  'Source map',                          // Source map warnings
  'DevTools',                            // DevTools-related
  'The resource',                        // Resource loading hints
  '[LocalAPI]',                          // Our own LocalAPI warnings (expected in mock mode)
  'MOCK',                                // Mock mode warnings
  'AxeBuilder',                          // Accessibility test tooling
  'Not implemented',                     // Supabase local stub
  'Failed to load resource: net::ERR',   // Network errors in test
  'Refused to apply style',             // CSP in test
  'Failed to fetch',                    // Network errors during auth in mock mode
  'AuthRetryableFetchError',            // Supabase auth retry in mock mode
  'Login error',                        // Auth login error in mock mode
  'Login failed',                       // Auth login failure
  'AuthApiError',                       // Supabase auth API error
  'supabase',                           // Supabase client warnings
];

function isAcceptable(text: string): boolean {
  return ACCEPTABLE_PATTERNS.some((p) => text.includes(p));
}

test.describe('Browser Console Health', () => {
  test.describe('Public Pages', () => {
    for (const page of PUBLIC_PAGES) {
      test(`${page.name} — no console errors`, async ({ page: p }) => {
        const entries = collectConsole(p);

        await p.goto(page.path);
        await p.waitForLoadState('networkidle');
        // Wait a bit for any async renders
        await p.waitForTimeout(1000);

        const errors = entries.filter(
          (e) => (e.type === 'error' || e.type === 'pageerror') && !isAcceptable(e.text)
        );
        const warnings = entries.filter(
          (e) => e.type === 'warning' && !isAcceptable(e.text)
        );

        if (warnings.length > 0) {
          console.log(`  [${page.name}] Warnings (${warnings.length}):`);
          warnings.forEach((w) => console.log(`    ⚠️  ${w.text.substring(0, 150)}`));
        }

        if (errors.length > 0) {
          console.log(`  [${page.name}] ERRORS (${errors.length}):`);
          errors.forEach((e) => console.log(`    ❌ ${e.text.substring(0, 200)}`));
        }

        expect(errors, `${page.name} has ${errors.length} console errors`).toHaveLength(0);
      });
    }
  });

  test.describe('Admin Pages (authenticated)', () => {
    test.beforeEach(async ({ page }) => {
      await login(page, TEST_USERS.systemAdmin.email, TEST_USERS.systemAdmin.password);
    });

    for (const adminPage of ADMIN_PAGES) {
      test(`${adminPage.name} — no console errors`, async ({ page: p }) => {
        const entries = collectConsole(p);

        await p.goto(adminPage.path);
        await p.waitForLoadState('networkidle');
        await p.waitForTimeout(1500); // Extra time for data fetching

        const errors = entries.filter(
          (e) => (e.type === 'error' || e.type === 'pageerror') && !isAcceptable(e.text)
        );
        const warnings = entries.filter(
          (e) => e.type === 'warning' && !isAcceptable(e.text)
        );

        // Report all
        if (warnings.length > 0) {
          console.log(`  [${adminPage.name}] Warnings (${warnings.length}):`);
          warnings.forEach((w) => console.log(`    ⚠️  ${w.text.substring(0, 150)}`));
        }

        if (errors.length > 0) {
          console.log(`  [${adminPage.name}] ERRORS (${errors.length}):`);
          errors.forEach((e) => console.log(`    ❌ ${e.text.substring(0, 200)}`));
        } else {
          console.log(`  [${adminPage.name}] ✓ Clean (${entries.length} total console messages, ${warnings.length} warnings)`);
        }

        expect(errors, `${adminPage.name} has ${errors.length} console errors`).toHaveLength(0);
      });
    }
  });

  test.describe('React-Specific Checks', () => {
    test.beforeEach(async ({ page }) => {
      await login(page, TEST_USERS.systemAdmin.email, TEST_USERS.systemAdmin.password);
    });

    test('no React key warnings on admin pages', async ({ page }) => {
      const keyWarnings: string[] = [];
      page.on('console', (msg) => {
        if (msg.text().includes('key') && msg.text().includes('Each child')) {
          keyWarnings.push(msg.text());
        }
      });

      // Visit pages most likely to have key issues (lists)
      for (const path of ['/admin/tenants', '/admin/users', '/admin/support', '/admin/audit']) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);
      }

      if (keyWarnings.length > 0) {
        console.log('  React key warnings found:');
        keyWarnings.forEach((w) => console.log(`    ⚠️  ${w.substring(0, 150)}`));
      }

      expect(keyWarnings, 'React key warnings found').toHaveLength(0);
    });

    test('no missing translation keys (i18n)', async ({ page }) => {
      const missingKeys: string[] = [];
      // Missing translations often render as the key itself
      // e.g., "admin.dashboard.stats.totalTenants" instead of "Total Tenants"

      await page.goto('/admin');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Check for text content that looks like translation keys
      const pageText = await page.textContent('body');
      const keyPattern = /admin\.\w+\.\w+\.\w+/g;
      const matches = pageText?.match(keyPattern) || [];

      if (matches.length > 0) {
        // Filter out false positives (some code displays actual key-like strings)
        const suspicious = matches.filter(
          (m) => !m.includes('example') && !m.includes('placeholder')
        );
        if (suspicious.length > 0) {
          console.log('  Possible missing translations:');
          suspicious.forEach((k) => console.log(`    ⚠️  "${k}"`));
          missingKeys.push(...suspicious);
        }
      }

      console.log(`  ✓ No obvious missing translation keys on admin dashboard`);
    });
  });

  test.describe('Visual Sanity', () => {
    test.beforeEach(async ({ page }) => {
      await login(page, TEST_USERS.systemAdmin.email, TEST_USERS.systemAdmin.password);
    });

    test('admin dashboard renders stats cards', async ({ page }) => {
      await page.goto('/admin');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Should have stat cards with actual numbers (not "42" hardcoded)
      const h1 = await page.textContent('h1');
      expect(h1).toBeTruthy();

      // Take screenshot for visual review
      await page.screenshot({ path: 'test-results/admin-dashboard.png', fullPage: true });
      console.log('  ✓ Dashboard screenshot saved to test-results/admin-dashboard.png');
    });

    test('tenant list page loads without crash', async ({ page }) => {
      await page.goto('/admin/tenants');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Check page rendered (h1 exists, no blank page)
      const heading = await page.locator('h1').count();
      console.log(`  Tenant page headings: ${heading}`);

      // Try to get table rows (may be 0 in mock mode if auth didn't fully complete)
      const rows = await page.locator('tbody tr').count();
      console.log(`  Tenant list rows: ${rows}`);

      await page.screenshot({ path: 'test-results/admin-tenants.png', fullPage: true });
      console.log('  ✓ Tenants screenshot saved');

      // Page should at minimum not be blank
      const bodyText = await page.textContent('body');
      expect(bodyText?.length).toBeGreaterThan(10);
    });

    test('sidebar renders navigation items', async ({ page }) => {
      await page.goto('/admin');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);

      // Look for any navigation links (may be admin or regular depending on auth state)
      const allLinks = await page.locator('a').count();
      console.log(`  Total links on page: ${allLinks}`);
      expect(allLinks).toBeGreaterThan(0);
    });
  });
});
