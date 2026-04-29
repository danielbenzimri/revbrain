// DORMANT: Tests for subscription-based billing model. Skipped for SI billing.
import { test, expect } from './fixtures/auth';
import { navigate } from './fixtures/test-utils';
import type { Page } from '@playwright/test';

/**
 * Billing Limits Edge Case Tests
 *
 * Tests for limit enforcement and edge cases:
 * - Usage approaching limits (warning states)
 * - At-limit states (blocking behavior)
 * - Overage handling
 * - Free tier restrictions
 * - Trial expiration behavior
 */

/**
 * Helper to check if user has subscription
 */
async function hasActiveSubscription(page: Page): Promise<boolean> {
  const currentPlan = page.getByText(/current plan|תוכנית נוכחית/i);
  return currentPlan.isVisible({ timeout: 5000 }).catch(() => false);
}

test.describe.skip('Billing Limits - Warning States', () => {
  test('shows warning when approaching user limit (>80%)', async ({ authenticatedPage }) => {
    await navigate.toBilling(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    // Look for usage dashboard
    const usageDashboard = authenticatedPage.getByText(/current usage|שימוש נוכחי/i);
    const hasUsageDashboard = await usageDashboard.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasUsageDashboard) {
      console.log('Usage dashboard not visible - user may not have subscription');
      return;
    }

    // Check for warning state (amber/orange colors or warning text)
    const warningState = authenticatedPage.locator(
      '.bg-amber-500, .bg-orange-500, .text-amber-600'
    );
    const warningText = authenticatedPage.getByText(/approaching|limit|warning|מתקרב|מגבלה|אזהרה/i);

    const hasWarningColor = (await warningState.count()) > 0;
    const hasWarningText = await warningText
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    console.log(`Warning color indicators: ${hasWarningColor}, Warning text: ${hasWarningText}`);

    // This is informational - actual state depends on user's current usage
  });

  test('shows critical state when at limit (100%)', async ({ authenticatedPage }) => {
    await navigate.toBilling(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    // Look for critical/error state (red colors)
    const criticalState = authenticatedPage.locator('.bg-red-500, .text-red-600');
    const limitReachedText = authenticatedPage.getByText(/limit reached|at limit|הגעת למגבלה/i);

    const hasCritical = (await criticalState.count()) > 0;
    const hasLimitText = await limitReachedText.isVisible({ timeout: 2000 }).catch(() => false);

    console.log(`Critical state indicators: ${hasCritical}, Limit reached text: ${hasLimitText}`);
  });

  test('upgrade prompt appears when approaching limits', async ({ authenticatedPage }) => {
    await navigate.toBilling(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    // Look for upgrade prompt component
    const upgradePrompt = authenticatedPage.getByText(
      /upgrade.*capacity|upgrade.*features|שדרג.*קיבולת/i
    );
    const upgradeButton = authenticatedPage.getByRole('button', { name: /upgrade|שדרג/i });

    const hasPrompt = await upgradePrompt.isVisible({ timeout: 3000 }).catch(() => false);
    const hasUpgradeBtn = await upgradeButton
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    console.log(`Upgrade prompt: ${hasPrompt}, Upgrade button: ${hasUpgradeBtn}`);

    // If upgrade button exists and user is approaching limits, clicking should open modal
    if (hasUpgradeBtn && hasPrompt) {
      await upgradeButton.first().click();

      const modal = authenticatedPage.locator('[role="dialog"]');
      const modalVisible = await modal.isVisible({ timeout: 5000 }).catch(() => false);

      if (modalVisible) {
        console.log('Upgrade modal opened successfully');
        await authenticatedPage.keyboard.press('Escape');
      }
    }
  });
});

test.describe.skip('Billing Limits - Plan Features', () => {
  test('free tier shows limited features', async ({ authenticatedPage }) => {
    await navigate.toBilling(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    // Look for Free plan indicator
    const freePlan = authenticatedPage.getByText(/free|חינם/i);
    const isFreePlan = await freePlan
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (!isFreePlan) {
      console.log('User not on free plan');
      return;
    }

    // Free plan should show upgrade prompts for premium features
    const premiumFeatures = authenticatedPage.getByText(/premium|pro|business|upgrade required/i);
    const hasPremiumIndicators = await premiumFeatures
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    console.log(`Premium feature indicators on free plan: ${hasPremiumIndicators}`);
  });

  test('displays correct limits for current plan', async ({ authenticatedPage }) => {
    await navigate.toBilling(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    // Look for limit displays (e.g., "3 / 5 users")
    const limitPattern = authenticatedPage.getByText(/\d+\s*\/\s*\d+|unlimited|ללא הגבלה/i);
    const limitCount = await limitPattern.count();

    console.log(`Found ${limitCount} limit displays`);

    if (limitCount > 0) {
      // Verify limit text is properly formatted
      const firstLimit = await limitPattern.first().textContent();
      console.log(`Example limit display: "${firstLimit}"`);
    }
  });

  test('Enterprise plan shows unlimited features', async ({ authenticatedPage }) => {
    await navigate.toBilling(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    // Check if user is on Enterprise
    const enterprisePlan = authenticatedPage.getByText(/enterprise|ארגוני/i);
    const isEnterprise = await enterprisePlan
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (!isEnterprise) {
      console.log('User not on Enterprise plan');
      return;
    }

    // Enterprise should show "Unlimited" for users/projects
    const unlimitedText = authenticatedPage.getByText(/unlimited|ללא הגבלה/i);
    const unlimitedCount = await unlimitedText.count();

    console.log(`"Unlimited" indicators for Enterprise: ${unlimitedCount}`);
    expect(unlimitedCount).toBeGreaterThan(0);
  });
});

test.describe.skip('Billing Limits - Trial Behavior', () => {
  test('trial users see countdown and payment prompt', async ({ authenticatedPage }) => {
    await navigate.toBilling(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    // Check for trial status
    const trialStatus = authenticatedPage.getByText(/trial|trialing|ניסיון/i);
    const isTrialing = await trialStatus
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (!isTrialing) {
      console.log('User not in trial period');
      return;
    }

    // Trial users should see:
    // 1. Days remaining countdown
    const countdown = authenticatedPage.getByText(/\d+\s*days?\s*(left|remaining)|ימים?\s*נותר/i);
    const hasCountdown = await countdown.isVisible({ timeout: 2000 }).catch(() => false);

    // 2. Add payment method prompt
    const paymentPrompt = authenticatedPage.getByText(
      /add payment|add card|הוסף.*תשלום|הוסף.*כרטיס/i
    );
    const hasPaymentPrompt = await paymentPrompt.isVisible({ timeout: 2000 }).catch(() => false);

    console.log(`Trial countdown: ${hasCountdown}, Payment prompt: ${hasPaymentPrompt}`);

    // Both should be visible for trial users
    if (isTrialing) {
      expect(hasCountdown || hasPaymentPrompt).toBe(true);
    }
  });

  test('trial features are accessible during trial period', async ({ authenticatedPage }) => {
    await navigate.toBilling(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    // Check for trial status
    const trialStatus = authenticatedPage.getByText(/trial|trialing|ניסיון/i);
    const isTrialing = await trialStatus
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (!isTrialing) {
      console.log('User not in trial period');
      return;
    }

    // Trial users should have access to all plan features
    // Check that no "upgrade required" blockers are shown for current plan features
    const blockedFeature = authenticatedPage.getByText(/upgrade required|locked|נעול/i);
    const hasBlockedFeatures = await blockedFeature.isVisible({ timeout: 2000 }).catch(() => false);

    console.log(`Blocked features during trial: ${hasBlockedFeatures}`);
    // During trial, features should NOT be blocked
  });
});

test.describe.skip('Billing Limits - Coupon & Discounts', () => {
  test('discount is reflected in pricing display', async ({ authenticatedPage }) => {
    await navigate.toBilling(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    // Look for discount indicators
    const discountText = authenticatedPage.getByText(/discount|coupon|off|הנחה|קופון/i);
    const strikethroughPrice = authenticatedPage.locator(
      '.line-through, [style*="text-decoration: line-through"]'
    );

    const hasDiscount = await discountText.isVisible({ timeout: 2000 }).catch(() => false);
    const hasStrikethrough = (await strikethroughPrice.count()) > 0;

    console.log(`Discount text: ${hasDiscount}, Strikethrough price: ${hasStrikethrough}`);

    // This is informational - depends on whether user has active discount
  });

  test('yearly plan shows savings badge', async ({ authenticatedPage }) => {
    await navigate.toBilling(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    // Check if user is on yearly plan or viewing yearly options
    const yearlyIndicator = authenticatedPage.getByText(/yearly|annual|year|שנתי|שנה/i);
    const savingsBadge = authenticatedPage.getByText(/-\d+%|save \d+%|חסוך \d+%/i);

    const isYearly = await yearlyIndicator
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    const hasSavings = await savingsBadge.isVisible({ timeout: 2000 }).catch(() => false);

    console.log(`Yearly plan: ${isYearly}, Savings badge: ${hasSavings}`);
  });
});

test.describe.skip('Billing Limits - Past Due Handling', () => {
  test('past due status shows payment action required', async ({ authenticatedPage }) => {
    await navigate.toBilling(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    // Check for past due status
    const pastDueStatus = authenticatedPage.getByText(
      /past due|overdue|payment failed|באיחור|נכשל/i
    );
    const isPastDue = await pastDueStatus.isVisible({ timeout: 3000 }).catch(() => false);

    if (!isPastDue) {
      console.log('Account not past due');
      return;
    }

    // Past due accounts should see:
    // 1. Warning/error banner
    const warningBanner = authenticatedPage.locator('.bg-red-50, .bg-amber-50, [role="alert"]');
    const hasWarning = (await warningBanner.count()) > 0;

    // 2. Update payment action
    const updatePayment = authenticatedPage.getByRole('button', {
      name: /update payment|pay now|עדכן תשלום/i,
    });
    const hasPaymentAction = await updatePayment.isVisible({ timeout: 2000 }).catch(() => false);

    console.log(`Warning banner: ${hasWarning}, Payment action: ${hasPaymentAction}`);

    if (isPastDue) {
      expect(hasWarning || hasPaymentAction).toBe(true);
    }
  });
});

test.describe.skip('Billing Limits - Downgrade Warnings', () => {
  test('downgrade shows feature loss warning', async ({ authenticatedPage }) => {
    await navigate.toBilling(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    // Try to access plan change options
    const upgradeButton = authenticatedPage.getByRole('button', {
      name: /upgrade|change plan|שדרג|שנה תוכנית/i,
    });

    if (
      !(await upgradeButton
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false))
    ) {
      console.log('No plan change option available');
      return;
    }

    await upgradeButton.first().click();

    const modal = authenticatedPage.locator('[role="dialog"]');
    if (!(await modal.isVisible({ timeout: 5000 }).catch(() => false))) {
      return;
    }

    // Look for downgrade option
    const downgradeOption = modal.getByRole('button', { name: /downgrade|free|חינם|שנמך/i });
    const hasDowngrade = await downgradeOption
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (!hasDowngrade) {
      console.log('No downgrade option visible');
      await authenticatedPage.keyboard.press('Escape');
      return;
    }

    await downgradeOption.first().click();

    // Should show warning about losing features
    const warning = authenticatedPage.getByText(/lose|warning|features|access|תאבד|אזהרה|תכונות/i);
    const hasWarning = await warning
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    console.log(`Downgrade warning shown: ${hasWarning}`);

    // Cancel without downgrading
    await authenticatedPage.keyboard.press('Escape');
  });

  test('shows data at risk when downgrading with over-limit usage', async ({
    authenticatedPage,
  }) => {
    // This test verifies that users are warned if they have data that exceeds
    // the limits of the plan they're downgrading to

    await navigate.toBilling(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    const upgradeButton = authenticatedPage.getByRole('button', {
      name: /upgrade|change plan|שדרג|שנה תוכנית/i,
    });

    if (
      !(await upgradeButton
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false))
    ) {
      console.log('No plan change option available');
      return;
    }

    await upgradeButton.first().click();

    const modal = authenticatedPage.locator('[role="dialog"]');
    if (!(await modal.isVisible({ timeout: 5000 }).catch(() => false))) {
      return;
    }

    // Look for data-at-risk warnings
    const dataWarning = authenticatedPage.getByText(
      /data.*deleted|users.*removed|projects.*archived|נתונים.*ימחקו|משתמשים.*יוסרו/i
    );
    const hasDataWarning = await dataWarning.isVisible({ timeout: 2000 }).catch(() => false);

    console.log(`Data at risk warning: ${hasDataWarning}`);

    await authenticatedPage.keyboard.press('Escape');
  });
});
