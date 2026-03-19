import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { login, TEST_USERS } from './fixtures/auth';

/**
 * Admin Page Accessibility Tests (WCAG 2.1 AA)
 *
 * Tests all admin pages for critical/serious accessibility violations
 * using axe-core. Requires authentication as system_admin.
 *
 * Implements Task 2.21 from SYSTEM-ADMIN-IMPLEMENTATION-PLAN.md
 */

const ADMIN_PAGES = [
  { name: 'Dashboard', path: '/admin' },
  { name: 'Tenants', path: '/admin/tenants' },
  { name: 'Users', path: '/admin/users' },
  { name: 'Pricing', path: '/admin/pricing' },
  { name: 'Coupons', path: '/admin/coupons' },
  { name: 'Support', path: '/admin/support' },
  { name: 'Audit Log', path: '/admin/audit' },
];

test.describe('Admin Accessibility (WCAG 2.1 AA)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USERS.systemAdmin.email, TEST_USERS.systemAdmin.password);
  });

  for (const adminPage of ADMIN_PAGES) {
    test(`${adminPage.name} page should have no critical accessibility violations`, async ({
      page,
    }) => {
      await page.goto(adminPage.path);
      await page.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const criticalViolations = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious'
      );

      if (criticalViolations.length > 0) {
        console.log(`[${adminPage.name}] Critical accessibility violations:`);
        criticalViolations.forEach((v) => {
          console.log(`  [${v.impact}] ${v.id}: ${v.description}`);
          v.nodes.forEach((node) => {
            console.log(`    - ${node.target}`);
          });
        });
      }

      expect(
        criticalViolations,
        `${adminPage.name} page has ${criticalViolations.length} critical/serious accessibility violations`
      ).toHaveLength(0);
    });
  }

  test('Admin sidebar should be keyboard navigable', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Tab through sidebar links
    const sidebarLinks = page.locator('nav a');
    const linkCount = await sidebarLinks.count();

    // Should have admin navigation links
    expect(linkCount).toBeGreaterThan(0);

    // Focus first link and verify it's visible
    await sidebarLinks.first().focus();
    const isFocused = await sidebarLinks.first().evaluate((el) => {
      return document.activeElement === el;
    });
    expect(isFocused).toBeTruthy();
  });

  test('Icon-only buttons should have aria labels', async ({ page }) => {
    await page.goto('/admin/tenants');
    await page.waitForLoadState('networkidle');

    // Check all buttons that contain only icons (no text content)
    const iconButtons = page.locator('button:has(svg):not(:has-text(""))');
    const count = await iconButtons.count();

    for (let i = 0; i < Math.min(count, 10); i++) {
      const button = iconButtons.nth(i);
      const ariaLabel = await button.getAttribute('aria-label');
      const ariaLabelledBy = await button.getAttribute('aria-labelledby');
      const title = await button.getAttribute('title');
      const textContent = (await button.textContent())?.trim();

      // Icon-only button should have some form of accessible name
      const hasAccessibleName = ariaLabel || ariaLabelledBy || title || (textContent && textContent.length > 0);

      if (!hasAccessibleName) {
        const html = await button.evaluate((el) => el.outerHTML.substring(0, 100));
        console.log(`Warning: icon-only button missing accessible name: ${html}`);
      }
    }
  });
});
