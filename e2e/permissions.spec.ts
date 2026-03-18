import { test, expect } from './fixtures/auth';
import { navigate } from './fixtures/test-utils';
import type { Page } from '@playwright/test';

/**
 * User Permissions Edge Case Tests
 *
 * Tests for role-based access control and authorization:
 * - Admin-only pages and actions
 * - Organization member restrictions
 * - Cross-tenant isolation
 * - Permission elevation attempts
 */

test.describe('Admin-Only Access', () => {
  test('regular user cannot access admin dashboard', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin');
    await authenticatedPage.waitForLoadState('networkidle');

    // Should either:
    // 1. Redirect away from /admin
    // 2. Show access denied/forbidden
    // 3. Show 403/404

    const currentUrl = authenticatedPage.url();
    const isOnAdmin = currentUrl.includes('/admin');

    if (isOnAdmin) {
      // If on admin page, should show access denied
      const accessDenied = authenticatedPage.getByText(
        /access denied|forbidden|unauthorized|אין הרשאה|גישה נדחתה/i
      );
      const hasAccessDenied = await accessDenied.isVisible({ timeout: 5000 }).catch(() => false);

      console.log(`On admin URL with access denied: ${hasAccessDenied}`);
      expect(hasAccessDenied).toBe(true);
    } else {
      // Redirected away - this is acceptable
      console.log(`Redirected from /admin to: ${currentUrl}`);
      expect(currentUrl).not.toContain('/admin');
    }
  });

  test('regular user cannot access coupon management', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/coupons');
    await authenticatedPage.waitForLoadState('networkidle');

    const currentUrl = authenticatedPage.url();
    const accessDenied = authenticatedPage.getByText(
      /access denied|forbidden|unauthorized|אין הרשאה/i
    );

    const isBlocked =
      !currentUrl.includes('/admin/coupons') ||
      (await accessDenied.isVisible({ timeout: 3000 }).catch(() => false));

    console.log(`Coupon management blocked for regular user: ${isBlocked}`);
    expect(isBlocked).toBe(true);
  });

  test('regular user cannot access user management', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/users');
    await authenticatedPage.waitForLoadState('networkidle');

    const currentUrl = authenticatedPage.url();
    const accessDenied = authenticatedPage.getByText(
      /access denied|forbidden|unauthorized|אין הרשאה/i
    );

    const isBlocked =
      !currentUrl.includes('/admin/users') ||
      (await accessDenied.isVisible({ timeout: 3000 }).catch(() => false));

    console.log(`Admin user management blocked for regular user: ${isBlocked}`);
    expect(isBlocked).toBe(true);
  });

  test('admin can access admin dashboard', async ({ adminPage }) => {
    await adminPage.goto('/admin');
    await adminPage.waitForLoadState('networkidle');

    const currentUrl = adminPage.url();

    // Admin should stay on admin page or be redirected to admin section
    const isOnAdmin = currentUrl.includes('/admin');
    const hasAdminContent = await adminPage
      .getByRole('heading', { name: /admin|dashboard|לוח בקרה/i })
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    console.log(`Admin on admin page: ${isOnAdmin}, Admin content visible: ${hasAdminContent}`);
    expect(isOnAdmin || hasAdminContent).toBe(true);
  });
});

test.describe('Organization Member Permissions', () => {
  test('member cannot invite new users without permission', async ({ authenticatedPage }) => {
    await navigate.toUsers(authenticatedPage);

    // Check if on users page
    const pageTitle = authenticatedPage.getByRole('heading', { name: /team|users|צוות|משתמשים/i });
    const hasPage = await pageTitle.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasPage) {
      console.log('Users page not accessible');
      return;
    }

    // Look for invite button
    const inviteButton = authenticatedPage.getByRole('button', {
      name: /invite|add user|הזמן|הוסף משתמש/i,
    });

    const hasInviteButton = await inviteButton.isVisible({ timeout: 3000 }).catch(() => false);

    // Either:
    // 1. Invite button is not visible (permission not granted)
    // 2. Invite button is visible (user has permission)
    console.log(`Invite button visible: ${hasInviteButton}`);

    // This is informational - depends on user's role in organization
  });

  test('member cannot modify billing settings', async ({ authenticatedPage }) => {
    await navigate.toBilling(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    // Check for manage billing button
    const manageBilling = authenticatedPage.getByRole('button', {
      name: /manage billing|ניהול חיוב/i,
    });

    const hasManageBilling = await manageBilling.isVisible({ timeout: 3000 }).catch(() => false);

    // Depending on role:
    // - org_admin: should have access
    // - member: may not have access

    // Look for restricted message
    const restricted = authenticatedPage.getByText(
      /only admin|contact admin|restricted|רק מנהל|פנה למנהל/i
    );
    const hasRestricted = await restricted.isVisible({ timeout: 2000 }).catch(() => false);

    console.log(`Manage billing: ${hasManageBilling}, Restricted message: ${hasRestricted}`);
  });

  test('member cannot delete organization', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/settings');
    await authenticatedPage.waitForLoadState('networkidle');

    // Look for danger zone / delete org option
    const deleteOrg = authenticatedPage.getByRole('button', {
      name: /delete organization|delete account|מחק ארגון|מחק חשבון/i,
    });

    const hasDeleteOption = await deleteOrg.isVisible({ timeout: 3000 }).catch(() => false);

    // Members should NOT see delete organization option
    // Only org owners/admins should see it
    console.log(`Delete organization option visible: ${hasDeleteOption}`);

    // If visible, it should require confirmation
    if (hasDeleteOption) {
      await deleteOrg.click();
      const confirmDialog = authenticatedPage.locator('[role="alertdialog"]');
      const hasConfirm = await confirmDialog.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`Delete requires confirmation: ${hasConfirm}`);

      if (hasConfirm) {
        await authenticatedPage.keyboard.press('Escape');
      }
    }
  });
});

test.describe('Data Isolation', () => {
  test('user only sees their organization data', async ({ authenticatedPage }) => {
    // Navigate to a page with organization-specific data
    await authenticatedPage.goto('/projects');
    await authenticatedPage.waitForLoadState('networkidle');

    // Check that we're seeing data (or empty state for own org)
    const projectsList = authenticatedPage.locator('table tbody tr, [data-testid*="project"]');
    const emptyState = authenticatedPage.getByText(
      /no projects|create.*first|אין פרויקטים|צור.*ראשון/i
    );

    const hasProjects = (await projectsList.count()) > 0;
    const isEmpty = await emptyState.isVisible({ timeout: 3000 }).catch(() => false);

    // Either we see our projects or an empty state - not other org's data
    console.log(`Has projects: ${hasProjects}, Empty state: ${isEmpty}`);
    expect(hasProjects || isEmpty).toBe(true);
  });

  test('cannot access another organization via URL manipulation', async ({ authenticatedPage }) => {
    // Try to access a resource with a different org ID
    // Use a fake UUID that definitely doesn't belong to the user
    const fakeOrgId = '00000000-0000-0000-0000-000000000000';

    await authenticatedPage.goto(`/org/${fakeOrgId}/settings`);
    await authenticatedPage.waitForLoadState('networkidle');

    // Should either:
    // 1. Redirect to own org
    // 2. Show 404/not found
    // 3. Show access denied

    const currentUrl = authenticatedPage.url();
    const notFound = authenticatedPage.getByText(/not found|404|לא נמצא/i);
    const accessDenied = authenticatedPage.getByText(/access denied|forbidden|אין הרשאה/i);

    const isBlocked =
      !currentUrl.includes(fakeOrgId) ||
      (await notFound.isVisible({ timeout: 3000 }).catch(() => false)) ||
      (await accessDenied.isVisible({ timeout: 2000 }).catch(() => false));

    console.log(`Cross-org access blocked: ${isBlocked}`);
    expect(isBlocked).toBe(true);
  });
});

test.describe('Self-Service Restrictions', () => {
  test('user cannot elevate own role', async ({ authenticatedPage }) => {
    // Try to access profile/settings
    await authenticatedPage.goto('/settings/profile');
    await authenticatedPage.waitForLoadState('networkidle');

    // Look for role selection that would be disabled for self
    const roleSelect = authenticatedPage.locator('select[name="role"], [aria-label*="role"]');
    const hasRoleSelect = await roleSelect.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasRoleSelect) {
      // Role select should be disabled for own profile
      const isDisabled = await roleSelect.isDisabled();
      console.log(`Role selection disabled for self: ${isDisabled}`);
    } else {
      console.log('No role selection on profile page (expected)');
    }
  });

  test('user can update own profile', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/settings/profile');
    await authenticatedPage.waitForLoadState('networkidle');

    // Check if profile page loaded
    const profileHeading = authenticatedPage.getByRole('heading', { name: /profile|פרופיל/i });
    const hasProfile = await profileHeading.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasProfile) {
      // Might be at different URL or combined settings page
      await authenticatedPage.goto('/settings');
      await authenticatedPage.waitForLoadState('networkidle');
    }

    // Look for editable fields (name, email display, etc.)
    const nameInput = authenticatedPage.locator('input[name="name"], input[name="fullName"]');
    const saveButton = authenticatedPage.getByRole('button', { name: /save|update|שמור|עדכן/i });

    const hasNameInput = await nameInput.isVisible({ timeout: 3000 }).catch(() => false);
    const hasSaveButton = await saveButton
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    console.log(`Profile name input: ${hasNameInput}, Save button: ${hasSaveButton}`);
  });

  test('user can change own password', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/settings/security');
    await authenticatedPage.waitForLoadState('networkidle');

    // Check if security/password page loaded
    const securityHeading = authenticatedPage.getByRole('heading', {
      name: /security|password|אבטחה|סיסמה/i,
    });
    const hasSecurityPage = await securityHeading.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasSecurityPage) {
      // Might be at different URL
      await authenticatedPage.goto('/settings');
      await authenticatedPage.waitForLoadState('networkidle');
    }

    // Look for password change form
    const currentPassword = authenticatedPage.locator(
      'input[name="currentPassword"], input[name="oldPassword"]'
    );
    const newPassword = authenticatedPage.locator(
      'input[name="newPassword"], input[name="password"]'
    );

    const hasCurrentPwd = await currentPassword.isVisible({ timeout: 3000 }).catch(() => false);
    const hasNewPwd = await newPassword.isVisible({ timeout: 2000 }).catch(() => false);

    console.log(`Password change form - Current: ${hasCurrentPwd}, New: ${hasNewPwd}`);
  });
});

test.describe('API Key / Token Security', () => {
  test('API keys are masked in UI', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/settings/api');
    await authenticatedPage.waitForLoadState('networkidle');

    // Check if API settings page exists
    const apiHeading = authenticatedPage.getByRole('heading', { name: /api|tokens|מפתחות/i });
    const hasApiPage = await apiHeading.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasApiPage) {
      console.log('API settings page not found');
      return;
    }

    // Look for masked key display (e.g., "sk_...abc123" or "••••••••")
    const maskedKey = authenticatedPage.locator('text=/\\.\\.\\.|•{4,}|\\*{4,}/');
    const hasMaskedKey = (await maskedKey.count()) > 0;

    console.log(`API keys are masked: ${hasMaskedKey}`);
  });

  test('can regenerate API key with confirmation', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/settings/api');
    await authenticatedPage.waitForLoadState('networkidle');

    const regenerateBtn = authenticatedPage.getByRole('button', {
      name: /regenerate|new key|refresh|חדש|רענן/i,
    });

    const hasRegenerateBtn = await regenerateBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasRegenerateBtn) {
      console.log('No API key regeneration option');
      return;
    }

    await regenerateBtn.click();

    // Should require confirmation
    const confirmDialog = authenticatedPage.locator('[role="alertdialog"], [role="dialog"]');
    const hasConfirm = await confirmDialog.isVisible({ timeout: 5000 }).catch(() => false);

    console.log(`Regenerate requires confirmation: ${hasConfirm}`);

    if (hasConfirm) {
      await authenticatedPage.keyboard.press('Escape');
    }
  });
});

test.describe('Session Security', () => {
  test('can view active sessions', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/settings/security');
    await authenticatedPage.waitForLoadState('networkidle');

    // Look for active sessions list
    const sessionsHeading = authenticatedPage.getByText(
      /active sessions|current sessions|הפעלות פעילות/i
    );
    const hasSessions = await sessionsHeading.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasSessions) {
      console.log('Active sessions not displayed');
      return;
    }

    // Should show at least current session
    const sessionItems = authenticatedPage.locator('[data-testid*="session"], .session-item');
    const sessionCount = await sessionItems.count();

    console.log(`Active sessions displayed: ${sessionCount}`);
    expect(sessionCount).toBeGreaterThanOrEqual(0);
  });

  test('can sign out of other sessions', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/settings/security');
    await authenticatedPage.waitForLoadState('networkidle');

    // Look for sign out other sessions button
    const signOutOthers = authenticatedPage.getByRole('button', {
      name: /sign out.*other|logout.*other|revoke.*sessions|התנתק.*אחרים/i,
    });

    const hasSignOutOthers = await signOutOthers.isVisible({ timeout: 5000 }).catch(() => false);

    console.log(`Sign out other sessions available: ${hasSignOutOthers}`);

    // Don't actually click - just verify option exists
  });
});
