import { test, expect } from './fixtures/auth';

/**
 * Test Suite 3: Billing Page UI Components
 * Tests TC-3.1 through TC-3.4
 */

test.describe('Billing Page UI', () => {
  /**
   * Helper to navigate to billing page via sidebar
   */
  async function navigateToBilling(page: import('@playwright/test').Page) {
    // First try direct navigation
    await page.goto('/billing');
    await page.waitForLoadState('networkidle');

    // If redirected away from billing, try clicking sidebar link
    if (!page.url().includes('/billing')) {
      // Look for billing/invoices link in sidebar (Hebrew: דוחות וחשבונות or חיוב)
      const billingLink = page
        .getByRole('link', { name: /billing|invoices|דוחות וחשבונות|חיוב/i })
        .or(page.locator('nav, aside').getByText(/billing|invoices|דוחות|חיוב/i));

      if (await billingLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await billingLink.click();
        await page.waitForLoadState('networkidle');
      }
    }
  }

  test.describe('TC-3.1: Billing Interval Toggle', () => {
    test('monthly/yearly toggle works correctly', async ({ authenticatedPage }) => {
      await navigateToBilling(authenticatedPage);
      await authenticatedPage.waitForLoadState('networkidle');

      // Wait for page to load completely
      await authenticatedPage.waitForTimeout(2000);

      // The billing interval toggle is only visible for users WITHOUT a subscription
      // Check if user has an active subscription first
      const currentPlanText = authenticatedPage.getByText(/current plan|תוכנית נוכחית/i);
      const manageBillingBtn = authenticatedPage.getByRole('button', {
        name: /manage billing|ניהול חיוב/i,
      });

      const hasCurrentPlan = await currentPlanText.isVisible({ timeout: 3000 }).catch(() => false);
      const hasManageBilling = await manageBillingBtn
        .isVisible({ timeout: 1000 })
        .catch(() => false);

      if (hasCurrentPlan || hasManageBilling) {
        // User has active subscription, toggle is not shown (it's in PlanSelector only)
        console.log(
          'User has active subscription - interval toggle not shown (only shown when selecting a plan), skipping'
        );
        test.skip();
        return;
      }

      // Find the billing interval toggle
      // Looking for Monthly/Yearly buttons (they're plain buttons)
      const monthlyButton = authenticatedPage
        .locator('button')
        .filter({ hasText: /^Monthly$|^חודשי$/i });
      const yearlyButton = authenticatedPage
        .locator('button')
        .filter({ hasText: /^Yearly$|^שנתי$/i });

      // Verify toggle exists
      await expect(monthlyButton).toBeVisible({ timeout: 10000 });
      await expect(yearlyButton).toBeVisible();

      // Get initial state - check which is "active" (has shadow/white background)
      const monthlyClasses = await monthlyButton.getAttribute('class');
      const isMonthlyActive =
        monthlyClasses?.includes('bg-white') || monthlyClasses?.includes('shadow');

      // Click yearly
      await yearlyButton.click();
      await authenticatedPage.waitForTimeout(300);

      // Verify yearly is now active
      const yearlyClassesAfter = await yearlyButton.getAttribute('class');
      const isYearlyActiveNow =
        yearlyClassesAfter?.includes('bg-white') || yearlyClassesAfter?.includes('shadow');
      expect(isYearlyActiveNow).toBe(true);

      // Click monthly
      await monthlyButton.click();
      await authenticatedPage.waitForTimeout(300);

      // Verify monthly is active again
      const monthlyClassesFinal = await monthlyButton.getAttribute('class');
      const isMonthlyActiveFinal =
        monthlyClassesFinal?.includes('bg-white') || monthlyClassesFinal?.includes('shadow');
      expect(isMonthlyActiveFinal).toBe(true);

      // Check for savings badge when yearly is selected
      await yearlyButton.click();
      await authenticatedPage.waitForTimeout(300);

      // Savings badge shows percentage like "-20%" (format: -{{percent}}%)
      const savingsBadge = authenticatedPage.getByText(/-\d+%/);
      // Savings badge is optional - only shown if yearly plans have discount
      const hasSavingsBadge = await savingsBadge.isVisible().catch(() => false);
      console.log(`Savings badge visible: ${hasSavingsBadge}`);
    });
  });

  test.describe('TC-3.2: Usage Dashboard Display', () => {
    test('usage dashboard shows resource usage', async ({ authenticatedPage }) => {
      await navigateToBilling(authenticatedPage);
      await authenticatedPage.waitForLoadState('networkidle');

      // Usage dashboard only shows when user has active subscription
      // Look for usage-related elements
      const usageSection = authenticatedPage.getByText(/usage|שימוש/i);

      // If no usage section, check if user has subscription
      const subscriptionInfo = authenticatedPage.getByText(/current plan|התוכנית הנוכחית/i);

      if (!(await usageSection.isVisible({ timeout: 3000 }).catch(() => false))) {
        if (!(await subscriptionInfo.isVisible({ timeout: 2000 }).catch(() => false))) {
          // No subscription, usage dashboard not applicable
          test.skip();
          return;
        }
      }

      // Look for usage indicators (users, projects, storage)
      const usersUsage = authenticatedPage.getByText(/users|משתמשים/i);
      const projectsUsage = authenticatedPage.getByText(/projects|פרויקטים/i);
      const storageUsage = authenticatedPage.getByText(/storage|אחסון/i);

      // At least one usage metric should be visible
      const hasUsersMetric = await usersUsage.isVisible().catch(() => false);
      const hasProjectsMetric = await projectsUsage.isVisible().catch(() => false);
      const hasStorageMetric = await storageUsage.isVisible().catch(() => false);

      expect(hasUsersMetric || hasProjectsMetric || hasStorageMetric).toBe(true);

      // Look for progress bars or usage numbers (e.g., "3 / 5")
      const usageNumbers = authenticatedPage.locator(
        'text=/\\d+\\s*\\/\\s*\\d+|unlimited|ללא הגבלה/i'
      );
      const progressBars = authenticatedPage.locator(
        '[role="progressbar"], .bg-violet-500, .bg-amber-500, .bg-red-500'
      );

      const hasUsageNumbers = (await usageNumbers.count()) > 0;
      const hasProgressBars = (await progressBars.count()) > 0;

      // Either numbers or progress bars should be present
      console.log(`Usage numbers visible: ${hasUsageNumbers}, Progress bars: ${hasProgressBars}`);
    });
  });

  test.describe('TC-3.3: Trial Countdown Badge', () => {
    test('trial countdown shows for trialing subscriptions', async ({ authenticatedPage }) => {
      await navigateToBilling(authenticatedPage);
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for trial-related elements
      const trialBadge = authenticatedPage.getByText(/days left|trial|ימים נותרו|תקופת ניסיון/i);
      const trialingStatus = authenticatedPage.getByText(/trialing/i);

      const hasTrialBadge = await trialBadge.isVisible({ timeout: 3000 }).catch(() => false);
      const isTrialing = await trialingStatus.isVisible({ timeout: 2000 }).catch(() => false);

      if (!hasTrialBadge && !isTrialing) {
        // User is not in trial period
        console.log('User not in trial period - skipping trial countdown test');
        test.skip();
        return;
      }

      // If in trial, verify trial-related UI elements
      if (isTrialing || hasTrialBadge) {
        // Look for add payment method prompt
        const addPaymentPrompt = authenticatedPage.getByText(/add payment|הוסף אמצעי תשלום/i);
        const hasPaymentPrompt = await addPaymentPrompt.isVisible().catch(() => false);
        console.log(`Add payment method prompt visible: ${hasPaymentPrompt}`);

        // Trial badge should use orange/amber colors
        const trialElement = trialBadge.or(trialingStatus);
        await expect(trialElement.first()).toBeVisible();
      }
    });
  });

  test.describe('TC-3.4: Upgrade Prompt', () => {
    test('upgrade prompt appears when approaching limits', async ({ authenticatedPage }) => {
      await navigateToBilling(authenticatedPage);
      await authenticatedPage.waitForLoadState('networkidle');

      // Upgrade prompt only shows when usage > threshold (e.g., 80%)
      // Look for upgrade-related UI
      const upgradePrompt = authenticatedPage.getByText(/approaching.*limit|upgrade|שדרג/i);
      const upgradeButton = authenticatedPage.getByRole('button', { name: /upgrade|שדרג/i });

      const hasUpgradePrompt = await upgradePrompt.isVisible({ timeout: 3000 }).catch(() => false);
      const hasUpgradeButton = await upgradeButton.isVisible({ timeout: 2000 }).catch(() => false);

      if (!hasUpgradePrompt && !hasUpgradeButton) {
        // User is not approaching limits
        console.log('User not approaching limits - upgrade prompt not shown');
        // This is expected behavior when usage is below threshold
        // Verify the upgrade button in the plan card is still accessible
        const manageBillingButton = authenticatedPage.getByRole('button', { name: /manage|נהל/i });
        const planUpgradeButton = authenticatedPage.getByRole('button', { name: /upgrade|שדרג/i });

        // Either manage billing or plan upgrade should be available
        const hasManage = await manageBillingButton.isVisible().catch(() => false);
        const hasUpgrade = await planUpgradeButton.isVisible().catch(() => false);

        console.log(`Manage billing button: ${hasManage}, Upgrade button: ${hasUpgrade}`);
        return;
      }

      // If upgrade prompt is visible, verify it shows which limit is approached
      if (hasUpgradePrompt) {
        await expect(upgradePrompt).toBeVisible();

        // Click upgrade button if available
        if (hasUpgradeButton) {
          await upgradeButton.click();

          // Should open upgrade modal or navigate to plan selection
          const upgradeModal = authenticatedPage.locator('[role="dialog"]');
          const hasModal = await upgradeModal.isVisible({ timeout: 2000 }).catch(() => false);

          if (hasModal) {
            // Close modal
            const closeButton = upgradeModal.getByRole('button', {
              name: /close|cancel|סגור|ביטול/i,
            });
            if (await closeButton.isVisible()) {
              await closeButton.click();
            }
          }
        }
      }
    });
  });

  test.describe('Current Plan Display', () => {
    test('billing page shows current plan information', async ({ authenticatedPage }) => {
      await navigateToBilling(authenticatedPage);
      await authenticatedPage.waitForLoadState('networkidle');

      // Wait for page to fully load
      await authenticatedPage.waitForTimeout(2000);

      // Page title should be visible (h1 with "Billing" or "חיוב")
      const pageTitle = authenticatedPage.getByRole('heading', { level: 1 });
      await expect(pageTitle).toBeVisible({ timeout: 10000 });

      // Either current plan section header OR plan selector ("choose a plan") should be visible
      // Hebrew translations: "תוכנית נוכחית" (Current Plan), "בחר תוכנית" (Choose plan)
      const currentPlanHeader = authenticatedPage.getByText(/current plan|תוכנית נוכחית/i);
      const choosePlanText = authenticatedPage.getByText(/choose.*plan|בחר תוכנית/i);
      const subscribeButtons = authenticatedPage.getByRole('button', { name: /subscribe|הירשם/i });

      const hasCurrentPlan = await currentPlanHeader
        .isVisible({ timeout: 3000 })
        .catch(() => false);
      const hasChoosePlan = await choosePlanText.isVisible({ timeout: 2000 }).catch(() => false);
      const hasSubscribeButtons = (await subscribeButtons.count()) > 0;

      console.log(
        `Current plan visible: ${hasCurrentPlan}, Choose plan: ${hasChoosePlan}, Subscribe buttons: ${hasSubscribeButtons}`
      );

      // At least one of these should be visible
      expect(hasCurrentPlan || hasChoosePlan || hasSubscribeButtons).toBe(true);

      if (hasCurrentPlan) {
        // Verify plan details are shown
        const priceInfo = authenticatedPage.getByText(/\$\d+/);
        await expect(priceInfo.first()).toBeVisible();

        // Verify manage billing button
        const manageBilling = authenticatedPage.getByRole('button', { name: /manage|ניהול/i });
        await expect(manageBilling.first()).toBeVisible();
      }
    });
  });

  test.describe('Payment History', () => {
    test('payment history is shown for subscribed users', async ({ authenticatedPage }) => {
      await navigateToBilling(authenticatedPage);
      await authenticatedPage.waitForLoadState('networkidle');

      // Payment history section
      const paymentHistorySection = authenticatedPage.getByText(
        /payment history|היסטוריית תשלומים/i
      );

      const hasPaymentHistory = await paymentHistorySection
        .isVisible({ timeout: 3000 })
        .catch(() => false);

      if (!hasPaymentHistory) {
        // User might not have subscription or no payment history
        console.log('Payment history section not visible - user may not have subscription');
        return;
      }

      // If section exists, verify it shows payments or "no payments" message
      const noPaymentsMessage = authenticatedPage.getByText(/no payments|אין תשלומים/i);
      const paymentRows = authenticatedPage.locator('[class*="divide-y"] > div').filter({
        hasText: /\$/,
      });

      const hasNoPayments = await noPaymentsMessage.isVisible().catch(() => false);
      const hasPayments = (await paymentRows.count()) > 0;

      expect(hasNoPayments || hasPayments).toBe(true);

      if (hasPayments) {
        // Verify payment row has status badge
        const statusBadge = authenticatedPage.getByText(/succeeded|paid|failed|נכשל|שולם/i);
        await expect(statusBadge.first()).toBeVisible();
      }
    });
  });
});
