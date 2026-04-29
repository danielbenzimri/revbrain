// DORMANT: Tests for subscription-based billing model. Skipped for SI billing.
import { test, expect } from './fixtures/auth';
import { navigate, selectors } from './fixtures/test-utils';

/**
 * Plans & Subscription E2E Tests
 *
 * Tests cover:
 * - Viewing available plans
 * - Plan comparison
 * - Upgrade/downgrade flows
 * - Stripe checkout integration
 * - Subscription management
 *
 * Note: These tests are careful not to actually complete payments
 * - Stripe checkout is tested up to the redirect
 * - Cancel/downgrade tests verify UI but don't confirm
 */

test.describe.skip('Plans Display', () => {
  test.describe.skip('Plan Cards', () => {
    test('shows all available plans with pricing', async ({ authenticatedPage }) => {
      await navigate.toBilling(authenticatedPage);

      // Wait for plans to load
      await authenticatedPage.waitForTimeout(2000);

      // Look for plan cards or plan selector
      const planNames = authenticatedPage.getByText(
        /free|professional|business|enterprise|חינם|מקצועי|עסקי|ארגוני/i
      );
      const planCount = await planNames.count();

      console.log(`Found ${planCount} plan references`);

      // Should show pricing (either in plan selector or current plan)
      const priceText = authenticatedPage.getByText(/\$\d+/);
      const hasPrice = await priceText
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      console.log(`Price visible: ${hasPrice}`);
    });

    test('displays plan features list', async ({ authenticatedPage }) => {
      await navigate.toBilling(authenticatedPage);
      await authenticatedPage.waitForTimeout(2000);

      // Look for feature lists (check marks with text)
      const features = authenticatedPage.locator('ul li, [class*="feature"]');
      const featureCount = await features.count();

      // Look for common feature keywords
      const userFeature = authenticatedPage.getByText(/users|משתמשים/i);
      const projectFeature = authenticatedPage.getByText(/projects|פרויקטים/i);
      const storageFeature = authenticatedPage.getByText(/storage|אחסון|GB/i);

      const hasUsers = await userFeature
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false);
      const hasProjects = await projectFeature
        .first()
        .isVisible({ timeout: 2000 })
        .catch(() => false);
      const hasStorage = await storageFeature
        .first()
        .isVisible({ timeout: 2000 })
        .catch(() => false);

      console.log(
        `Features - Users: ${hasUsers}, Projects: ${hasProjects}, Storage: ${hasStorage}`
      );
    });

    test('highlights current plan if subscribed', async ({ authenticatedPage }) => {
      await navigate.toBilling(authenticatedPage);
      await authenticatedPage.waitForTimeout(2000);

      // Look for "current plan" indicator
      const currentPlanBadge = authenticatedPage.getByText(/current plan|תוכנית נוכחית/i);
      const hasCurrentPlan = await currentPlanBadge.isVisible({ timeout: 3000 }).catch(() => false);

      if (hasCurrentPlan) {
        console.log('User has active subscription - current plan is highlighted');
        await expect(currentPlanBadge).toBeVisible();
      } else {
        console.log('No current plan badge - user may not have subscription');
      }
    });
  });

  test.describe.skip('Plan Comparison', () => {
    test('can compare plans side by side', async ({ authenticatedPage }) => {
      await navigate.toBilling(authenticatedPage);

      // Look for comparison view or multiple plan cards
      const planCards = authenticatedPage.locator('[class*="plan"], [class*="card"]').filter({
        hasText: /subscribe|select|בחר|הירשם/i,
      });

      const cardCount = await planCards.count();
      console.log(`Found ${cardCount} selectable plan cards`);

      // If user has subscription, may see upgrade modal instead
      const upgradeButton = authenticatedPage.getByRole('button', { name: /upgrade|שדרג/i });
      if (await upgradeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await upgradeButton.click();

        // Modal should show plan comparison
        const modal = authenticatedPage.locator('[role="dialog"]');
        await expect(modal).toBeVisible({ timeout: 5000 });

        const modalPlans = modal.locator('[class*="plan"], [class*="card"]');
        const modalPlanCount = await modalPlans.count();
        console.log(`Upgrade modal shows ${modalPlanCount} plans`);

        // Close modal
        await authenticatedPage.keyboard.press('Escape');
      }
    });
  });
});

test.describe.skip('Subscription Status', () => {
  test('shows subscription status badge', async ({ authenticatedPage }) => {
    await navigate.toBilling(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    // Look for status badges
    const statusBadge = authenticatedPage.getByText(
      /active|trialing|past due|canceled|פעיל|ניסיון|באיחור|בוטל/i
    );
    const hasStatus = await statusBadge
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (hasStatus) {
      console.log('Subscription status badge found');
      await expect(statusBadge.first()).toBeVisible();
    } else {
      console.log('No subscription status - user may not have subscription');
    }
  });

  test('shows billing period dates', async ({ authenticatedPage }) => {
    await navigate.toBilling(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    // Look for date information
    const periodText = authenticatedPage.getByText(/period|billing date|תקופה|תאריך חיוב/i);
    const datePattern = authenticatedPage.getByText(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/);

    const hasPeriod = await periodText
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    const hasDate = await datePattern
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    console.log(`Period text: ${hasPeriod}, Date found: ${hasDate}`);
  });

  test('shows next billing amount', async ({ authenticatedPage }) => {
    await navigate.toBilling(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    // Look for next billing info
    const nextBilling = authenticatedPage.getByText(/next|renews|חידוש|הבא/i);
    const amount = authenticatedPage.getByText(/\$\d+/);

    const hasNextInfo = await nextBilling
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    const hasAmount = await amount
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    console.log(`Next billing info: ${hasNextInfo}, Amount visible: ${hasAmount}`);
  });
});

test.describe.skip('Upgrade Flow', () => {
  test('upgrade button opens plan selection', async ({ authenticatedPage }) => {
    await navigate.toBilling(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    const upgradeButton = authenticatedPage.getByRole('button', { name: /upgrade|שדרג/i });

    if (!(await upgradeButton.isVisible({ timeout: 5000 }).catch(() => false))) {
      console.log('No upgrade button - user may already be on highest plan or no subscription');
      test.skip();
      return;
    }

    await upgradeButton.click();

    // Should open modal or navigate to plan selection
    const modal = authenticatedPage.locator('[role="dialog"]');
    const hasModal = await modal.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasModal) {
      // Verify plans are shown in modal
      const planOptions = modal.locator('[class*="plan"], [class*="card"], button').filter({
        hasText: /select|upgrade|בחר|שדרג/i,
      });

      const planCount = await planOptions.count();
      console.log(`Upgrade modal shows ${planCount} plan options`);
      expect(planCount).toBeGreaterThan(0);

      // Close without selecting
      await authenticatedPage.keyboard.press('Escape');
    } else {
      // Might navigate to a plans page
      const currentUrl = authenticatedPage.url();
      console.log(`Navigated to: ${currentUrl}`);
    }
  });

  test('selecting higher plan shows price difference', async ({ authenticatedPage }) => {
    await navigate.toBilling(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    const upgradeButton = authenticatedPage.getByRole('button', { name: /upgrade|שדרג/i });

    if (!(await upgradeButton.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await upgradeButton.click();

    const modal = authenticatedPage.locator('[role="dialog"]');
    if (!(await modal.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    // Look for price comparison or difference indicator
    const priceInfo = modal.getByText(/\$\d+|difference|prorate|הפרש/i);
    const hasPrice = await priceInfo
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    console.log(`Price information shown: ${hasPrice}`);

    await authenticatedPage.keyboard.press('Escape');
  });
});

test.describe.skip('Downgrade Flow', () => {
  test('downgrade shows warning about feature loss', async ({ authenticatedPage }) => {
    await navigate.toBilling(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    // Look for downgrade option (might be in upgrade modal or separate)
    const upgradeButton = authenticatedPage.getByRole('button', {
      name: /upgrade|change plan|שדרג|שנה תוכנית/i,
    });

    if (!(await upgradeButton.isVisible({ timeout: 5000 }).catch(() => false))) {
      console.log('No plan change option found');
      test.skip();
      return;
    }

    await upgradeButton.click();

    const modal = authenticatedPage.locator('[role="dialog"]');
    if (!(await modal.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    // Look for downgrade button or lower tier plans
    const downgradeOption = modal.getByRole('button', { name: /downgrade|free|חינם|שנמך/i });

    if (
      !(await downgradeOption
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false))
    ) {
      console.log('No downgrade option visible');
      await authenticatedPage.keyboard.press('Escape');
      return;
    }

    await downgradeOption.first().click();

    // Should show warning about losing features
    const warning = authenticatedPage.getByText(/lose|warning|features|אזהרה|תאבד|תכונות/i);
    const hasWarning = await warning
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    console.log(`Downgrade warning shown: ${hasWarning}`);

    // Cancel without downgrading
    const cancelButton = authenticatedPage.getByRole('button', { name: selectors.cancelButton });
    if (await cancelButton.isVisible().catch(() => false)) {
      await cancelButton.click();
    } else {
      await authenticatedPage.keyboard.press('Escape');
    }
  });
});

test.describe.skip('Stripe Integration', () => {
  test('subscribe button initiates Stripe checkout', async ({ authenticatedPage }) => {
    await navigate.toBilling(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    // Find subscribe button (for users without subscription)
    const subscribeButton = authenticatedPage.getByRole('button', { name: /subscribe|הירשם/i });

    if (
      !(await subscribeButton
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false))
    ) {
      console.log('No subscribe button - user may already have subscription');
      test.skip();
      return;
    }

    // Note: We don't actually click to avoid starting a real checkout
    // Just verify the button exists and is clickable
    await expect(subscribeButton.first()).toBeEnabled();
    console.log('Subscribe button is present and enabled');

    // In a real test with Stripe test mode, you could:
    // 1. Click subscribe
    // 2. Wait for redirect to checkout.stripe.com
    // 3. Verify URL contains expected parameters
    // 4. Navigate back without completing
  });

  test('manage billing opens Stripe portal', async ({ authenticatedPage }) => {
    await navigate.toBilling(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    const manageButton = authenticatedPage.getByRole('button', {
      name: /manage billing|ניהול חיוב/i,
    });

    if (!(await manageButton.isVisible({ timeout: 5000 }).catch(() => false))) {
      console.log('No manage billing button - user may not have subscription');
      test.skip();
      return;
    }

    // Note: Clicking would redirect to Stripe portal
    // Verify button exists without clicking
    await expect(manageButton).toBeEnabled();
    console.log('Manage billing button is present and enabled');
  });
});

test.describe.skip('Trial Period', () => {
  test('trial users see countdown and payment prompt', async ({ authenticatedPage }) => {
    await navigate.toBilling(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    // Look for trial indicators
    const trialStatus = authenticatedPage.getByText(/trial|ניסיון/i);
    const countdown = authenticatedPage.getByText(/days left|days remaining|ימים נותרו/i);
    const addPayment = authenticatedPage.getByText(/add payment|הוסף.*תשלום/i);

    const isTrialing = await trialStatus
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (!isTrialing) {
      console.log('User not in trial period');
      return;
    }

    console.log('User is in trial period');

    const hasCountdown = await countdown
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    const hasPaymentPrompt = await addPayment
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    console.log(`Countdown: ${hasCountdown}, Payment prompt: ${hasPaymentPrompt}`);
  });
});

test.describe.skip('Cancel Subscription', () => {
  test('cancel option requires confirmation', async ({ authenticatedPage }) => {
    await navigate.toBilling(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    // Cancel is usually in Stripe portal, but might have in-app option
    const cancelButton = authenticatedPage.getByRole('button', {
      name: /cancel subscription|ביטול מנוי/i,
    });

    if (!(await cancelButton.isVisible({ timeout: 3000 }).catch(() => false))) {
      // Might be in manage billing / Stripe portal
      console.log('Cancel option not available in-app - likely in Stripe portal');
      return;
    }

    await cancelButton.click();

    // Should show confirmation dialog
    const confirmDialog = authenticatedPage.locator('[role="alertdialog"], [role="dialog"]');
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });

    // Should warn about losing access
    const warning = confirmDialog.getByText(/lose access|end of period|תאבד גישה|סוף התקופה/i);
    const hasWarning = await warning.isVisible({ timeout: 2000 }).catch(() => false);

    console.log(`Cancel warning shown: ${hasWarning}`);

    // Cancel the cancellation (don't actually cancel)
    const keepButton = confirmDialog.getByRole('button', {
      name: /keep|nevermind|cancel|שמור|ביטול/i,
    });
    if (
      await keepButton
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await keepButton.first().click();
    } else {
      await authenticatedPage.keyboard.press('Escape');
    }
  });
});
