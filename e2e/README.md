# E2E Tests

End-to-end tests for Geometrix using Playwright.

## Prerequisites

Before running E2E tests, you need to:

1. **Start the development server**

   ```bash
   pnpm --filter client dev
   ```

2. **Create test users in your database**

   The tests require real users to exist. Create these users via Supabase Dashboard or the API:

   ### System Admin User
   - Must have `system_admin` role
   - Used for testing admin functionality (coupons, leads, etc.)

   ### Regular User
   - Must have `org_admin` or `user` role
   - Used for testing billing, settings, etc.

## Configuration

Set environment variables for test credentials:

```bash
# Option 1: Export in terminal
export TEST_ADMIN_EMAIL=your-admin@example.com
export TEST_ADMIN_PASSWORD=your-admin-password
export TEST_USER_EMAIL=your-user@example.com
export TEST_USER_PASSWORD=your-user-password

# Option 2: Create .env.test file
# TEST_ADMIN_EMAIL=your-admin@example.com
# TEST_ADMIN_PASSWORD=your-admin-password
# TEST_USER_EMAIL=your-user@example.com
# TEST_USER_PASSWORD=your-user-password
```

**Default credentials** (if environment variables not set):

- Admin: `admin@geometrix.io` / `test123456`
- User: `user@test.com` / `test123456`

## Running Tests

```bash
# Run all tests
npx playwright test

# Run specific test suite
npx playwright test smoke.spec.ts
npx playwright test billing-page.spec.ts
npx playwright test coupon-management.spec.ts

# Run tests in headed mode (see browser)
npx playwright test --headed

# Run tests with UI
npx playwright test --ui

# Run a specific test by title
npx playwright test -g "login page loads"
```

## Test Suites

| Suite             | File                        | Description                                  |
| ----------------- | --------------------------- | -------------------------------------------- |
| Smoke Tests       | `smoke.spec.ts`             | Basic tests - login page, redirects          |
| Billing Page      | `billing-page.spec.ts`      | Billing UI, interval toggle, usage dashboard |
| Coupon Management | `coupon-management.spec.ts` | Admin coupon CRUD operations                 |
| Contact Sales     | `contact-sales.spec.ts`     | Enterprise contact form                      |
| Admin Leads       | `admin-leads.spec.ts`       | Lead management (Phase 8)                    |
| Localization      | `localization.spec.ts`      | Hebrew/RTL support                           |

## Troubleshooting

### Login fails with "Invalid login credentials"

- Check that test users exist in the database
- Verify the email/password match
- Ensure environment variables are set correctly

### Tests timeout waiting for elements

- Make sure the dev server is running
- Check if the page structure has changed
- Review test-results folder for screenshots/videos

### Admin pages not accessible

- Verify the admin user has `system_admin` role in `organization_members` table
- Check that the organization is properly set up

## Test Results

After running tests:

- HTML report: `playwright-report/index.html`
- Screenshots on failure: `test-results/`
- Videos on failure: `test-results/`

View the report:

```bash
npx playwright show-report
```

## Writing New Tests

Use the auth fixtures for authenticated tests:

```typescript
import { test, expect } from './fixtures/auth';

// Test that requires logged-in user
test('can access billing page', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/billing');
  await expect(authenticatedPage.getByText('Billing')).toBeVisible();
});

// Test that requires admin user
test('admin can access coupons', async ({ adminPage }) => {
  await adminPage.goto('/admin/coupons');
  await expect(adminPage.getByText('Coupons')).toBeVisible();
});
```
