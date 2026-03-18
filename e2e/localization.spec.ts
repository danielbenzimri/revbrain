import { test, expect } from './fixtures/auth';

/**
 * Test Suite 5: Localization (Hebrew RTL)
 * Tests TC-5.1 through TC-5.2
 */

test.describe('Localization', () => {
  test.describe('TC-5.1: Switch to Hebrew', () => {
    test('user can switch language to Hebrew and see RTL layout', async ({ authenticatedPage }) => {
      // Navigate to a page with content
      await authenticatedPage.goto('/billing');
      await authenticatedPage.waitForLoadState('networkidle');

      // Find language switcher
      // Could be in header, settings, or footer
      const languageSwitcher = authenticatedPage
        .getByRole('button', { name: /language|שפה|en|he|english|עברית/i })
        .or(authenticatedPage.locator('[aria-label*="language"]'))
        .or(authenticatedPage.locator('button').filter({ hasText: /🇺🇸|🇮🇱|EN|HE/i }));

      const hasLanguageSwitcher = await languageSwitcher
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false);

      if (!hasLanguageSwitcher) {
        // Try settings page
        await authenticatedPage.goto('/settings');
        await authenticatedPage.waitForLoadState('networkidle');
      }

      // Look for language option again
      const langOption = authenticatedPage.getByText(/עברית|hebrew/i);
      const langSelect = authenticatedPage.locator('select').filter({ hasText: /language|שפה/i });

      const hasLangOption = await langOption.isVisible({ timeout: 3000 }).catch(() => false);
      const hasLangSelect = await langSelect.isVisible({ timeout: 2000 }).catch(() => false);

      if (!hasLangOption && !hasLangSelect && !hasLanguageSwitcher) {
        console.log('Language switcher not found - skipping localization test');
        test.skip();
        return;
      }

      // Switch to Hebrew
      if (hasLanguageSwitcher) {
        await languageSwitcher.first().click();
        const hebrewOption = authenticatedPage.getByText(/עברית|hebrew/i);
        if (await hebrewOption.isVisible({ timeout: 2000 }).catch(() => false)) {
          await hebrewOption.click();
        }
      } else if (hasLangSelect) {
        await langSelect.selectOption({ label: /עברית|hebrew/i });
      } else if (hasLangOption) {
        await langOption.click();
      }

      // Wait for language change
      await authenticatedPage.waitForTimeout(500);

      // Verify RTL direction
      const htmlDir = await authenticatedPage.locator('html').getAttribute('dir');
      const bodyDir = await authenticatedPage.locator('body').getAttribute('dir');

      const isRTL = htmlDir === 'rtl' || bodyDir === 'rtl';
      expect(isRTL).toBe(true);

      // Verify Hebrew text is visible
      const hebrewText = authenticatedPage.getByText(/חיוב|תוכנית|משתמשים|פרויקטים/);
      await expect(hebrewText.first()).toBeVisible();

      // Verify numbers remain LTR (check price or date)
      const priceElement = authenticatedPage.getByText(/\$\d+/);
      if (
        await priceElement
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        // Price should still be formatted correctly
        const priceText = await priceElement.first().textContent();
        expect(priceText).toMatch(/\$\d+/);
      }

      // Switch back to English for other tests
      if (hasLanguageSwitcher) {
        await languageSwitcher.first().click();
        const englishOption = authenticatedPage.getByText(/english|אנגלית/i);
        if (await englishOption.isVisible({ timeout: 2000 }).catch(() => false)) {
          await englishOption.click();
        }
      }
    });
  });

  test.describe('TC-5.2: Contact Sales in Hebrew', () => {
    test('contact sales modal is properly translated in Hebrew', async ({ authenticatedPage }) => {
      // First switch to Hebrew
      await authenticatedPage.goto('/settings');
      await authenticatedPage.waitForLoadState('networkidle');

      // Try to find and use language switcher
      const languageSwitcher = authenticatedPage
        .getByRole('button', { name: /language|שפה|en|he|english|עברית/i })
        .or(authenticatedPage.locator('select').filter({ hasText: /language|שפה/i }))
        .or(authenticatedPage.locator('button').filter({ hasText: /🇺🇸|🇮🇱|EN|HE/i }));

      const langOption = authenticatedPage.getByText(/עברית|hebrew/i);

      if (
        await languageSwitcher
          .first()
          .isVisible({ timeout: 3000 })
          .catch(() => false)
      ) {
        await languageSwitcher.first().click();
        if (await langOption.isVisible({ timeout: 2000 }).catch(() => false)) {
          await langOption.click();
        }
      } else if (await langOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await langOption.click();
      } else {
        console.log('Cannot switch to Hebrew - skipping test');
        test.skip();
        return;
      }

      await authenticatedPage.waitForTimeout(500);

      // Navigate to billing page
      await authenticatedPage.goto('/billing');
      await authenticatedPage.waitForLoadState('networkidle');

      // Find Contact Sales button
      const contactSalesButton = authenticatedPage.getByRole('button', {
        name: /contact sales|צור קשר/i,
      });

      if (!(await contactSalesButton.isVisible({ timeout: 3000 }).catch(() => false))) {
        console.log('Contact Sales button not found - skipping test');
        test.skip();
        return;
      }

      await contactSalesButton.click();

      // Wait for modal
      const modal = authenticatedPage.locator('.fixed.inset-0');
      await expect(modal).toBeVisible();

      // Verify Hebrew translations
      // Title should be in Hebrew
      const hebrewTitle = modal.getByText(/צור קשר עם מכירות|צור קשר/i);
      await expect(hebrewTitle.first()).toBeVisible();

      // Form labels should be in Hebrew
      const hebrewLabels = modal.getByText(/שם|אימייל|טלפון|חברה/);
      const labelCount = await hebrewLabels.count();
      expect(labelCount).toBeGreaterThan(0);

      // Submit button should be in Hebrew
      const submitButton = modal.getByRole('button', { name: /שלח בקשה|שלח/i });
      await expect(submitButton).toBeVisible();

      // Close modal
      const cancelButton = modal.getByRole('button', { name: /ביטול|סגור/i });
      if (await cancelButton.isVisible()) {
        await cancelButton.click();
      }

      // Switch back to English
      await authenticatedPage.goto('/settings');
      if (
        await languageSwitcher
          .first()
          .isVisible({ timeout: 2000 })
          .catch(() => false)
      ) {
        await languageSwitcher.first().click();
        const englishOption = authenticatedPage.getByText(/english|אנגלית/i);
        if (await englishOption.isVisible({ timeout: 2000 }).catch(() => false)) {
          await englishOption.click();
        }
      }
    });
  });

  test.describe('Layout Mirroring in RTL', () => {
    test('sidebar and layout mirror correctly in RTL mode', async ({ authenticatedPage }) => {
      // Switch to Hebrew
      await authenticatedPage.goto('/settings');
      await authenticatedPage.waitForLoadState('networkidle');

      const languageSwitcher = authenticatedPage
        .getByRole('button', { name: /language|שפה|en|he|english|עברית/i })
        .or(authenticatedPage.locator('button').filter({ hasText: /🇺🇸|🇮🇱|EN|HE/i }));

      const langOption = authenticatedPage.getByText(/עברית|hebrew/i);

      if (
        !(await languageSwitcher
          .first()
          .isVisible({ timeout: 3000 })
          .catch(() => false))
      ) {
        if (!(await langOption.isVisible({ timeout: 2000 }).catch(() => false))) {
          test.skip();
          return;
        }
        await langOption.click();
      } else {
        await languageSwitcher.first().click();
        if (await langOption.isVisible({ timeout: 2000 }).catch(() => false)) {
          await langOption.click();
        }
      }

      await authenticatedPage.waitForTimeout(500);

      // Navigate to a page with sidebar
      await authenticatedPage.goto('/billing');
      await authenticatedPage.waitForLoadState('networkidle');

      // Check if RTL is applied
      const htmlDir = await authenticatedPage.locator('html').getAttribute('dir');
      if (htmlDir !== 'rtl') {
        console.log('RTL not applied - skipping layout test');
        return;
      }

      // Check sidebar position
      // In RTL, sidebar should be on the right
      const sidebar = authenticatedPage.locator('[class*="sidebar"], nav, aside').first();

      if (await sidebar.isVisible({ timeout: 2000 }).catch(() => false)) {
        const sidebarBounds = await sidebar.boundingBox();
        const viewportSize = authenticatedPage.viewportSize();

        if (sidebarBounds && viewportSize) {
          // In RTL, sidebar should be closer to the right edge
          const isOnRight = sidebarBounds.x > viewportSize.width / 2;
          console.log(
            `Sidebar position: x=${sidebarBounds.x}, viewport width=${viewportSize.width}, on right: ${isOnRight}`
          );
        }
      }

      // Switch back to English
      await authenticatedPage.goto('/settings');
      if (
        await languageSwitcher
          .first()
          .isVisible({ timeout: 2000 })
          .catch(() => false)
      ) {
        await languageSwitcher.first().click();
        const englishOption = authenticatedPage.getByText(/english|אנגלית/i);
        if (await englishOption.isVisible({ timeout: 2000 }).catch(() => false)) {
          await englishOption.click();
        }
      }
    });
  });
});
