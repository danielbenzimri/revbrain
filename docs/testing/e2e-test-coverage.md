# E2E Test Coverage

> **Last Updated:** 2026-02-17
> **Total:** 17 spec files, 137+ test cases
> **CI Status:** Smoke tests on PR, full suite on main branch

## Test Suites

| Spec File                  | Tests | Category  | Auth Required |
| -------------------------- | ----- | --------- | ------------- |
| smoke.spec.ts              | 4     | Core      | No            |
| permissions.spec.ts        | 16    | Security  | Yes           |
| work-logs.spec.ts          | 15    | Domain    | Yes           |
| plans-subscription.spec.ts | 14    | Billing   | Yes           |
| billing-limits.spec.ts     | 13    | Billing   | Yes           |
| user-management.spec.ts    | 10    | Admin     | Yes           |
| execution-bills.spec.ts    | 10    | Domain    | Yes           |
| admin-support.spec.ts      | 9     | Admin     | Yes (Admin)   |
| accessibility.spec.ts      | 8     | Quality   | No            |
| tasks-kanban.spec.ts       | 7     | Domain    | Yes           |
| coupon-management.spec.ts  | 7     | Admin     | Yes (Admin)   |
| billing-page.spec.ts       | 6     | Billing   | Yes           |
| boq-management.spec.ts     | 5     | Domain    | Yes           |
| contact-sales.spec.ts      | 4     | Marketing | No            |
| admin-leads.spec.ts        | 3     | Admin     | Yes (Admin)   |
| localization.spec.ts       | 3     | i18n      | No            |
| modules-migration.spec.ts  | 3     | Legacy    | Yes           |

## Coverage by Feature

### Authentication & Authorization

- [x] Login flow (smoke)
- [x] Multi-tenant isolation (permissions)
- [x] Role-based access control (permissions)
- [x] User invitation flow (user-management)

### Billing & Subscriptions

- [x] Plan selection & checkout (plans-subscription)
- [x] Usage limits enforcement (billing-limits)
- [x] Billing page UI (billing-page)
- [x] Coupon management (coupon-management)
- [x] Contact sales flow (contact-sales)

### Domain Features

- [x] BOQ management (boq-management)
- [x] Execution bills workflow (execution-bills)
- [x] Work logs CRUD & signatures (work-logs)
- [x] Task/Kanban board (tasks-kanban)
- [x] Legacy module loading (modules-migration)

### Admin Features

- [x] User management (user-management)
- [x] Support tickets (admin-support)
- [x] Leads CRM (admin-leads)
- [x] Coupon CRUD (coupon-management)

### Quality & UX

- [x] WCAG 2.1 AA compliance (accessibility)
- [x] RTL/Hebrew support (localization)
- [x] Language switching (localization)

## Test Fixtures

Located in `e2e/fixtures/auth.ts`:

- `authenticatedPage` - Logged in as tenant user
- `adminPage` - Logged in as system admin

## Running Tests

```bash
# Smoke tests (no auth, fast)
pnpm e2e:smoke

# Full suite (requires .env.test credentials)
pnpm e2e

# Single file
pnpm e2e -- e2e/billing-page.spec.ts
```

## CI Configuration

- **PR checks:** `e2e-smoke` job (no secrets needed)
- **Main branch:** `e2e-full` job (uses GitHub secrets)
- **Coverage thresholds:** Server 50%+, Client stores/hooks/lib

## Missing Coverage (TODO)

- [ ] Offline mode / network resilience
- [ ] Error recovery scenarios
- [ ] Performance/load testing
- [ ] Visual regression testing
- [ ] Mobile viewport testing
