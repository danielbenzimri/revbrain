import { test, expect } from '@playwright/test';

/**
 * Tenant Onboarding E2E Test — Real Staging
 *
 * Logs in as system_admin (daniel@revbrain.ai) on the real staging
 * environment and onboards a new tenant "All Cloud Test" with
 * daniel@gaialabs.ai as the org admin.
 *
 * Run with: npx playwright test onboard-tenant-staging --project=chromium
 */

const ADMIN_EMAIL = 'daniel@revbrain.ai';
const ADMIN_PASSWORD = 'wkiN3jgh!982';
const BASE_URL = 'https://stg.revbrain.ai';

const NEW_ORG = {
  name: 'All Cloud Test',
  phone: '+1-555-0199',
  address: '42 Innovation Drive, San Francisco, CA 94105',
  description:
    'Cloud migration consulting firm specializing in Salesforce CPQ to Revenue Cloud transitions.',
};

const NEW_ADMIN = {
  fullName: 'Daniel Aviram',
  email: 'daniel@gaialabs.ai',
};

test.describe('Tenant Onboarding — Staging', () => {
  test('system_admin can onboard a new tenant via UI', async ({ page }) => {
    test.setTimeout(60_000);

    // Step 1: Login as system admin
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('domcontentloaded');

    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const signInButton = page.getByRole('button', { name: /sign in|התחבר/i });

    await emailInput.fill(ADMIN_EMAIL);
    await passwordInput.fill(ADMIN_PASSWORD);
    await signInButton.click();

    // Wait for dashboard to load
    await page.waitForURL(/.*(?:admin|\/)/, { timeout: 15_000 });
    await page.waitForTimeout(2_000);

    // Step 2: Navigate to admin tenants
    await page.goto(`${BASE_URL}/admin/tenants`);
    await page.waitForTimeout(3_000);

    // Step 3: Click "Onboard Tenant" button
    const onboardButton = page.getByRole('button', { name: /onboard|הוספת/i });
    await expect(onboardButton).toBeVisible({ timeout: 10_000 });
    await onboardButton.click();
    await page.waitForTimeout(1_000);

    // Step 4: Fill in organization details
    // Organization name
    const orgNameInput = page
      .locator('input[placeholder*="organization"], input[placeholder*="ארגון"]')
      .first();
    if ((await orgNameInput.count()) === 0) {
      // Fallback: first text input in the form
      const inputs = page.locator('input[type="text"]');
      await inputs.first().fill(NEW_ORG.name);
    } else {
      await orgNameInput.fill(NEW_ORG.name);
    }

    // Phone
    const phoneInput = page.locator('input[type="tel"]').first();
    if ((await phoneInput.count()) > 0) {
      await phoneInput.fill(NEW_ORG.phone);
    }

    // Address
    const addressInputs = page.locator('input[type="text"]');
    const addressCount = await addressInputs.count();
    for (let i = 0; i < addressCount; i++) {
      const placeholder = await addressInputs.nth(i).getAttribute('placeholder');
      if (placeholder && /address|כתובת/i.test(placeholder)) {
        await addressInputs.nth(i).fill(NEW_ORG.address);
        break;
      }
    }

    // Description
    const descTextarea = page.locator('textarea').first();
    if ((await descTextarea.count()) > 0) {
      await descTextarea.fill(NEW_ORG.description);
    }

    // Step 5: Select a plan (Pro should be pre-selected, but click it to be sure)
    const proPlan = page.locator('text=Pro').first();
    if ((await proPlan.count()) > 0) {
      await proPlan.click();
    }

    // Step 6: Fill in admin details
    // Admin email
    const emailInputs = page.locator('input[type="email"]');
    const emailCount = await emailInputs.count();
    // The last email input should be the admin email (first is in the header/nav)
    if (emailCount > 0) {
      await emailInputs.last().fill(NEW_ADMIN.email);
    }

    // Admin name — find the input near "Admin Full Name" label
    const nameInputs = page.locator('input[type="text"]');
    const nameCount = await nameInputs.count();
    for (let i = 0; i < nameCount; i++) {
      const placeholder = await nameInputs.nth(i).getAttribute('placeholder');
      if (placeholder && /full name|שם מלא|admin name/i.test(placeholder)) {
        await nameInputs.nth(i).fill(NEW_ADMIN.fullName);
        break;
      }
    }

    // Step 7: Take screenshot before submit
    await page.screenshot({ path: 'test-results/onboard-before-submit.png', fullPage: false });

    // Step 8: Submit the form
    const createButton = page.getByRole('button', { name: /create organization|צור ארגון/i });
    await expect(createButton).toBeVisible();
    await createButton.click();

    // Step 9: Wait for result (success or error)
    await page.waitForTimeout(5_000);

    // Take screenshot of result
    await page.screenshot({ path: 'test-results/onboard-result.png', fullPage: false });

    // Check for success indicator OR capture the error
    const successIndicator = page.locator('text=/success|הצלחה|created|נוצר/i');
    const errorIndicator = page.locator('text=/error|failed|שגיאה|נכשל/i');

    const hasSuccess = await successIndicator.count();
    const hasError = await errorIndicator.count();

    if (hasError > 0) {
      const errorText = await errorIndicator.first().textContent();
      console.log('Onboarding error:', errorText);
    }

    if (hasSuccess > 0) {
      console.log('Onboarding succeeded!');
    }

    // We expect success — the org should be created
    expect(hasSuccess, 'Expected success indicator after onboarding').toBeGreaterThan(0);
  });

  test('API: onboard tenant directly', async () => {
    // Login to get token
    const loginRes = await fetch(
      `${BASE_URL.replace('stg.revbrain.ai', 'qutuivleheybnkbhpdbn.supabase.co')}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1dHVpdmxlaGV5Ym5rYmhwZGJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTQxMzgsImV4cCI6MjA4OTY3MDEzOH0.Arjxw1r7DhD1LLGQBiNkPkqo1ycsQVBQqXPEjugPsPA',
        },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
      }
    );

    if (!loginRes.ok) {
      console.log('Login failed:', await loginRes.text());
      test.skip(true, 'Could not login to staging');
      return;
    }

    const { access_token } = await loginRes.json();

    // Call onboard API
    const res = await fetch(
      'https://qutuivleheybnkbhpdbn.supabase.co/functions/v1/api/v1/admin/onboard',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organization: {
            name: 'All Cloud Test',
            seatLimit: 10,
          },
          admin: {
            email: 'daniel@gaialabs.ai',
            fullName: 'Daniel Aviram',
          },
        }),
      }
    );

    const body = await res.json();
    console.log('Onboard API response:', res.status, JSON.stringify(body, null, 2));

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.organization.name).toBe('All Cloud Test');
    expect(body.data.admin.email).toBe('daniel@gaialabs.ai');
    expect(body.data.invitationSent).toBe(true);
  });
});
