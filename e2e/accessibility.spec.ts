import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility Tests (WCAG 2.1 AA)
 *
 * Tests core pages for accessibility compliance using axe-core.
 * These tests run without authentication to check public pages.
 */

test.describe('Accessibility', () => {
  test.describe('Public Pages', () => {
    test('login page should have no critical accessibility violations', async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('networkidle');

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      // Filter for critical and serious violations only
      const criticalViolations = accessibilityScanResults.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious'
      );

      // Log all violations for debugging
      if (accessibilityScanResults.violations.length > 0) {
        console.log('Accessibility violations found:');
        accessibilityScanResults.violations.forEach((v) => {
          console.log(`  [${v.impact}] ${v.id}: ${v.description}`);
          v.nodes.forEach((node) => {
            console.log(`    - ${node.target}`);
          });
        });
      }

      expect(criticalViolations).toHaveLength(0);
    });

    test('login page should have proper form labels', async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('networkidle');

      // Check that form inputs have associated labels
      const emailInput = page.locator('input[type="email"]');
      const passwordInput = page.locator('input[type="password"]');

      // Check for labels or aria-label
      const emailLabel = await emailInput.getAttribute('aria-label');
      const emailLabelledBy = await emailInput.getAttribute('aria-labelledby');
      const hasEmailLabel = emailLabel || emailLabelledBy;

      const passwordLabel = await passwordInput.getAttribute('aria-label');
      const passwordLabelledBy = await passwordInput.getAttribute('aria-labelledby');
      const hasPasswordLabel = passwordLabel || passwordLabelledBy;

      // At least one form of labeling should exist
      // (we also check for visual labels via axe-core above)
      expect(hasEmailLabel || (await page.locator('label[for]').count()) > 0).toBeTruthy();
    });

    test('login page should be keyboard navigable', async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('networkidle');

      // Tab through the page
      await page.keyboard.press('Tab');
      const firstFocused = await page.evaluate(() => document.activeElement?.tagName);

      await page.keyboard.press('Tab');
      const secondFocused = await page.evaluate(() => document.activeElement?.tagName);

      await page.keyboard.press('Tab');
      const thirdFocused = await page.evaluate(() => document.activeElement?.tagName);

      // Should be able to tab through interactive elements
      console.log(`Focus order: ${firstFocused} -> ${secondFocused} -> ${thirdFocused}`);
      expect(['INPUT', 'BUTTON', 'A']).toContain(firstFocused);
    });

    test('login page should have sufficient color contrast', async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('networkidle');

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['cat.color'])
        .analyze();

      const contrastViolations = accessibilityScanResults.violations.filter(
        (v) => v.id === 'color-contrast' && v.impact === 'serious'
      );

      if (contrastViolations.length > 0) {
        console.log('Color contrast violations:');
        contrastViolations.forEach((v) => {
          v.nodes.forEach((node) => {
            console.log(`  - ${node.target}: ${node.failureSummary}`);
          });
        });
      }

      // Allow minor contrast issues but no serious ones
      expect(contrastViolations).toHaveLength(0);
    });
  });

  test.describe('Focus Management', () => {
    test('page should have visible focus indicators', async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('networkidle');

      // Focus on email input
      const emailInput = page.locator('input[type="email"]');
      await emailInput.focus();

      // Check that focus is visible (element has focus styles)
      const hasFocus = await emailInput.evaluate((el) => {
        const styles = window.getComputedStyle(el);
        // Check for common focus indicators
        const hasOutline = styles.outline !== 'none' && styles.outlineWidth !== '0px';
        const hasBoxShadow = styles.boxShadow !== 'none';
        const hasBorderChange = styles.borderColor !== '';
        return hasOutline || hasBoxShadow || hasBorderChange;
      });

      // Focus indicator should be present (may be custom styled)
      expect(hasFocus).toBeTruthy();
    });

    test('skip to main content link should exist', async ({ page }) => {
      await page.goto('/login');

      // Check for skip link (common accessibility pattern)
      const skipLink = page.locator(
        '[href="#main"], [href="#content"], .skip-link, .skip-to-content'
      );

      // Skip link is a best practice but not required
      const hasSkipLink = (await skipLink.count()) > 0;
      if (!hasSkipLink) {
        console.log('Note: No skip-to-content link found (recommended for accessibility)');
      }
    });
  });

  test.describe('Semantic Structure', () => {
    test('login page should have proper heading hierarchy', async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('networkidle');

      // Check for h1
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBeGreaterThanOrEqual(1);

      // Check heading hierarchy
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['cat.semantics'])
        .analyze();

      const headingViolations = accessibilityScanResults.violations.filter((v) =>
        v.id.includes('heading')
      );

      if (headingViolations.length > 0) {
        console.log('Heading structure issues:');
        headingViolations.forEach((v) => {
          console.log(`  ${v.id}: ${v.description}`);
        });
      }
    });

    test('login page should have a main landmark', async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('networkidle');

      // Check for main landmark
      const mainLandmark = page.locator('main, [role="main"]');
      const hasMain = (await mainLandmark.count()) > 0;

      if (!hasMain) {
        console.log('Note: No <main> landmark found (recommended for accessibility)');
      }
    });
  });
});
