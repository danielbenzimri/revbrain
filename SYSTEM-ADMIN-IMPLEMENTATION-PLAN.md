# RevBrain System Admin — Phased Implementation Plan

> **Purpose:** Executable implementation plan derived from the [System Admin Audit & Spec v3.1](./SYSTEM-ADMIN-AUDIT.md). Each phase is composed of discrete tasks with testable objectives, verification methods, and rollout protocols. Written for external review.
>
> **Product:** RevBrain — multi-tenant SaaS for CPQ → RCA migration. See audit document for full architecture, current state, and gap analysis.
>
> **Date:** 2026-03-19 | **Revision:** 2.0 (post dual external review)

---

## Table of Contents

- [Engineering Process](#engineering-process)
- [Phase 0: Fix Broken Items](#phase-0-fix-broken-items) (1-2 days)
- [Phase 1: MVP](#phase-1-mvp) (2-3 weeks)
- [Phase 2: Launch](#phase-2-launch) (10-14 weeks, with buffer)
- [Phase 3: Enterprise](#phase-3-enterprise) (planning milestone — requires detailed breakdown)
- [Phase 4: Maturity](#phase-4-maturity) (ongoing)
- [Appendix: Task Quick Reference](#appendix-task-quick-reference)

---

## Engineering Process

### PR Protocol

Every task merges as **one PR**. Multiple commits within a PR are allowed and encouraged for readability. Large tasks (impersonation, SSO) may use feature branches with sub-PRs merged behind feature flags.

Each PR must pass before merge:

1. `prettier --write` — all changed files formatted
2. `eslint --fix` — zero errors (max-warnings=30 per project config)
3. `npm run test` — all unit/integration tests pass
4. `npm run test:e2e` — all E2E tests pass (if applicable to changed area)
5. PR description references this plan (e.g., "Implements Task 1.3")

### Code Review Policy

| Task Type                                                  | Review Required                                      | Reviewer                |
| ---------------------------------------------------------- | ---------------------------------------------------- | ----------------------- |
| Bug fix (Phase 0)                                          | Self-merge after tests pass                          | —                       |
| Security task (isolation, MFA, permissions, impersonation) | **Required** — second engineer                       | Security-aware reviewer |
| Schema migration                                           | **Required** — migration reviewed before execution   | Backend reviewer        |
| Feature task                                               | Recommended for complex tasks, self-merge for simple | Any team member         |
| UI-only task                                               | Self-merge after visual verification                 | —                       |

### Rollout Protocol for Risky Tasks

Tasks affecting auth, security, data model, or permissions follow a staged rollout:

1. **Logging-only mode** — new behavior is logged but not enforced. Deploy to production. Verify logs show expected behavior for 24-48h.
2. **Enforcement mode** — flip env var or feature flag to enforce. Monitor for 24h.
3. **Cleanup** — remove logging-only codepath after confidence established.

Tasks requiring staged rollout are marked with **[STAGED ROLLOUT]** in the plan.

**Rollback:** Every risky task specifies a rollback procedure. At minimum: revert PR + redeploy. For schema migrations: documented reverse migration.

### Localization Requirement

Every task that adds UI strings must:

- Add translation keys to both `apps/client/src/locales/en/admin.json` and `he/admin.json`
- Phase completion checklists include: "All new UI strings present in both locales"

Tasks with localization impact are marked with **[i18n]**.

### Accessibility Requirement

Every task that adds interactive UI must ensure:

- Keyboard navigation works (Tab/Enter/Escape)
- ARIA labels on icon-only buttons
- Focus management on drawer/dialog open and close

### Schema Change Protocol

Tasks with database schema changes are marked with **[SCHEMA]** and must:

1. Generate Drizzle migration file (`npx drizzle-kit generate:pg`)
2. Ensure backward compatibility (nullable or defaulted new columns)
3. Update mock seed data to include new fields
4. Document rollback migration
5. Review migration before execution

### Test Pyramid

| Layer           | Primary Purpose                                                   | Tools                |
| --------------- | ----------------------------------------------------------------- | -------------------- |
| **Unit**        | Isolated functions, utilities, Zod schemas                        | Vitest               |
| **Integration** | Service + repository interaction, middleware behavior, API routes | Vitest + supertest   |
| **E2E**         | Critical user journeys across client + server                     | Playwright           |
| **Manual**      | Visual verification, RTL, responsive                              | Documented checklist |
| **DB Config**   | RLS policies, permissions, indexes                                | SQL queries          |

**Principle:** Auth, tenancy, billing, and audit are proven primarily in integration tests. E2E validates critical journeys, not every branch.

### Error Handling Convention for New Endpoints

All new admin endpoints follow this pattern:

- Wrap service calls in try-catch
- Map known error types to specific HTTP codes (e.g., "not found" → 404, "already exists" → 409)
- Unknown errors fall through to global error handler (500)
- Multi-source aggregation endpoints (stats, dashboard) return partial data with `null` for failed sources, not 500

---

## Phase 0: Fix Broken Items

**Goal:** Eliminate all known bugs and security gaps identified in the audit. After this phase, the admin pages render correctly, role selection works, server endpoints validate properly, and no critical audit findings remain open.

**Phase completion test:** Run `npm run test` + `npm run test:e2e`. All existing tests pass. Manual walkthrough of all 7 admin pages in English and Hebrew — no console errors or visual defects.

**Dependencies:** None — all tasks are independent of each other and can be executed in any order or in parallel.

| Task     | Can Parallel With         |
| -------- | ------------------------- |
| 0.1–0.11 | All tasks are independent |

---

### Task 0.1: Fix ALL_ROLES import in user list and detail drawer

**Objective:** Role filter dropdown and role edit dropdown show exactly 5 unique roles with no duplicates.

**Files to change:**

- `apps/client/src/features/admin/pages/AdminUserListPage.tsx` — delete local `ALL_ROLES` (lines 18-30), add `import { ALL_ROLES } from '@revbrain/contract'`
- `apps/client/src/features/admin/components/UserDetailDrawer.tsx` — delete local `ALL_ROLES` (lines 34-46), add same import

**Verification:**

- **Unit test (existing):** Verify contract `ALL_ROLES` has exactly 5 elements
- **Manual:** Admin users page → role filter dropdown → 5 unique entries. User detail → edit mode → role dropdown → 5 unique entries. Zero React key warnings in console.

---

### Task 0.2: Fix CreateUserDrawer role selector

**Objective:** Org member invitation shows all 4 org-level roles.

**Files to change:**

- `apps/client/src/features/admin/components/CreateUserDrawer.tsx:248-253` — replace two `org_owner` options + TODO with: org_owner, admin, operator, reviewer

**Verification:**

- **Manual:** CreateUserDrawer → "Org Member" → role dropdown → 4 distinct roles. Submit with each role → success state.
- **E2E test to write:** `admin-user-invite-roles.spec.ts` — open drawer, verify 4 options in role dropdown, select "operator", submit, verify success. Asserts: `await expect(page.locator('select option')).toHaveCount(5)` (including empty "Select" option).

---

### Task 0.3: Add missing CSS border classes

**Objective:** All admin containers have visible borders. **[i18n: No]**

**Files to change:** ~15 locations — `border-slate-200` → `border border-slate-200` in AdminDashboardPage (3), TenantListPage (2), AdminUserListPage (2), PricingPlansPage (1), CouponListPage (1), AdminSupportPage (2+), drawers (if applicable).

**Verification:**

- **Manual:** Navigate all 7 admin pages. Cards have visible 1px borders. Before/after screenshot comparison.

---

### Task 0.4: Fix RTL logical properties

**Objective:** Search icons and inputs align correctly in Hebrew mode.

**Files to change:**

- `AdminSupportPage.tsx:157` — `left-3` → `start-3`, `pl-10` → `ps-10`
- `CreateUserDrawer.tsx:190,195` — `left-3` → `start-3`, `pl-9` → `ps-9`, `pr-3` → `pe-3`

**Verification:**

- **Manual:** Switch to Hebrew. Support page search icon on right. CreateUserDrawer org icon on right.

---

### Task 0.5: Remove duplicate shadow-sm classes

**Files:** AdminDashboardPage (lines 64, 82, 103), TenantListPage (68, 82), AdminUserListPage (113, 176) — remove one `shadow-sm` each.

**Verification:** Grep `shadow-sm.*shadow-sm` in admin files → zero matches.

---

### Task 0.6: Wire canInviteRole into invitation flow

**Objective:** Role hierarchy enforced server-side when inviting users.

**Files to change:** `apps/server/src/v1/routes/admin/users.ts` or user service — add `if (!canInviteRole(actor.role, targetRole)) throw new AppError(ErrorCodes.FORBIDDEN, ...)` before invitation creation.

**Verification:**

- **Integration test to write:** `canInviteRole-enforcement.test.ts`:
  - `system_admin` → `operator`: allowed
  - `org_owner` → `admin`: allowed
  - `org_owner` → `system_admin`: rejected (403)
  - `admin` → `org_owner`: rejected (403)
  - `operator` → anyone: rejected (403)

---

### Task 0.7: Fix orphaned user role default

**Files:** `apps/server/src/middleware/auth.ts` — legacy mock token handler: `role: 'admin'` → `role: 'reviewer'`.

**Verification:**

- **Unit test to write:** `auth-orphan-recovery.test.ts` — token references non-existent user → auto-created user has `role: 'reviewer'`.

---

### Task 0.8: Add refund over-payment validation

**Files:** `apps/server/src/v1/routes/admin/billing.ts` — add `if (input.amountCents && input.amountCents > refundableAmountCents) throw new AppError(...)`.

**Verification:**

- **Integration test to write:** `refund-validation.test.ts`:
  - $100 payment, $0 refunded, refund $50 → 200 OK
  - $100 payment, $80 refunded, refund $30 → 400 (exceeds $20 refundable)
  - $100 payment, $100 refunded, refund $1 → 400

---

### Task 0.9: Add null checks and enum validation

**Files:**

- `admin/tenants.ts:134` — add `if (!user) throw new AppError(ErrorCodes.UNAUTHORIZED, ...)`
- `admin/support.ts:310` — same null check
- `admin/support.ts:36-40` — validate status against `['open', 'in_progress', 'waiting_customer', 'resolved', 'closed']`, priority against `['low', 'medium', 'high', 'urgent']`

**Verification:**

- **Integration test to write:** `admin-route-validation.test.ts`:
  - `?status=invalid_value` → 400
  - `?status=open` → 200
  - `?priority=banana` → 400

---

### Task 0.10: Add rate limiting to remaining admin mutations

**Files:** Add `adminLimiter` to PUT/POST/DELETE handlers in `admin/support.ts`, `admin/coupons.ts`, `admin/tenants.ts`.

**Verification:** Existing rate limiting tests cover the pattern. Manual: rapid-fire coupon creation → 429.

---

### Task 0.11: Unhide dashboard content sections

**Files:** `AdminDashboardPage.tsx:81` — remove `content-offscreen`. Replace hardcoded placeholder sections with "Live data coming in Phase 1" empty state, or remove entirely.

**Verification:** Navigate `/admin` → bottom sections visible. No hidden content.

---

### Phase 0 Completion Checklist

- [ ] All 11 PRs merged
- [ ] `npm run lint` — 0 errors
- [ ] `npm run test` — all tests pass (52+ including new tests)
- [ ] `npm run test:e2e` — all tests pass
- [ ] Manual: all 7 admin pages render correctly in English and Hebrew
- [ ] Zero React warnings in browser console on admin pages

---

## Phase 1: MVP

**Goal:** Safe, functional admin ready for the first paying customer. Tenant isolation verified, audit logging covers all actions, MFA protects admin accounts, dashboard shows live data, mock mode supports all workflows.

**Phase completion test:** Full test suite passes including new isolation, audit, MFA tests. Dashboard shows real counts. Support/coupon pages populated in mock mode. Admin login requires MFA enrollment.

### Task Dependencies

| Task                       | Depends On                                       | Can Parallel With        |
| -------------------------- | ------------------------------------------------ | ------------------------ |
| 1.1 (ticket seeds)         | —                                                | 1.2, 1.6, 1.7, 1.8, 1.10 |
| 1.2 (coupon seeds)         | —                                                | 1.1, 1.6, 1.7, 1.8, 1.10 |
| 1.3 (MockTicketRepo)       | 1.1                                              | 1.4, 1.6, 1.7, 1.10      |
| 1.4 (MockCouponRepo)       | 1.2                                              | 1.3, 1.6, 1.7, 1.10      |
| 1.5 (reduce LocalAPI)      | 1.3, 1.4                                         | 1.8, 1.9, 1.10           |
| 1.6 (isolation audit)      | —                                                | 1.1-1.4, 1.8, 1.10       |
| 1.7 (RLS + immutability)   | —                                                | 1.1-1.4, 1.8, 1.10       |
| 1.8 (buildAuditContext)    | —                                                | 1.1-1.7, 1.10            |
| 1.9 (audit expansion)      | 1.8                                              | 1.10                     |
| 1.10 (MFA enforcement)     | —                                                | 1.1-1.9                  |
| 1.11 (live dashboard)      | 1.9 (partial — recent activity needs audit data) | 1.12                     |
| 1.12 (tenant list metrics) | —                                                | 1.11                     |
| 1.13 (cross-cutting infra) | 1.8 (uses correlation IDs in audit context)      | 1.10, 1.11, 1.12         |
| 1.14 (custom branding)     | —                                                | anything                 |

**Optimal two-engineer split:**

- Engineer A: 1.1 → 1.3 → 1.5 → 1.8 → 1.9 → 1.11 → 1.13
- Engineer B: 1.2 → 1.4 → 1.6 → 1.7 → 1.10 → 1.12 → 1.14

---

### Task 1.1: Create support ticket seed data

**Objective:** Mock mode serves realistic support ticket data.

**Files to create:**

- `apps/server/src/mocks/support-tickets.ts` — 6-8 seed tickets across statuses (open, in_progress, waiting_customer, resolved, closed), priorities (low-urgent), with 2-3 messages each (admin reply, customer message, internal note). Reference existing `MOCK_IDS`.
- `apps/server/src/mocks/support-messages.ts` — seed messages linked to tickets

**Files to update:**

- `apps/server/src/mocks/index.ts` — add mutable stores, add to `resetAllMockData()`

**Verification:**

- **Unit test to write:** `support-ticket-seeds.test.ts` — all required fields present, valid user/org ID references, all status/priority values covered, message count per ticket >= 1.

---

### Task 1.2: Create coupon seed data

**Files to create:**

- `apps/server/src/mocks/coupons.ts` — 4 coupons: (1) active 20% forever, 15/100 uses, (2) expired $50 fixed, (3) scheduled future 10%, (4) maxed-out 30%.

**Files to update:** `mocks/index.ts`

**Verification:** **Unit test:** shapes valid, date relationships correct, usage counts consistent.

---

### Task 1.3: Create MockTicketRepository

**Files to create:**

- `apps/server/src/repositories/mock/ticket.repository.ts` — findMany (status/priority/search filters, pagination, sorting), findById, create, update, getStats, addMessage, findMessages

**Files to update:** `repositories/mock/index.ts` — add to `createMockRepositories()`

**Verification:**

- **Integration test to write:** `mock-ticket-repository.test.ts`:
  - `findMany()` returns seed tickets (assert count matches seed)
  - `findMany({ filter: { status: 'open' } })` returns only open tickets (assert count)
  - `findMany({ filter: { search: 'migration' } })` matches subject/description
  - `findById(MOCK_IDS.TICKET_1)` returns single ticket with correct shape
  - `create(data)` + `findMany()` includes new ticket (count = seed + 1)
  - `update(id, { status: 'resolved' })` + `findById(id)` shows resolved
  - `getStats()` returns `{ open: N, inProgress: N, ... }` matching seed distribution
  - `addMessage(ticketId, msg)` + `findMessages(ticketId)` includes new message

---

### Task 1.4: Create MockCouponRepository

**Files to create:**

- `apps/server/src/repositories/mock/coupon.repository.ts` — findMany (includeInactive filter), findById, create, update, delete (soft), getUsageHistory

**Files to update:** `repositories/mock/index.ts`

**Verification:**

- **Integration test to write:** `mock-coupon-repository.test.ts`:
  - `findMany()` returns only active coupons (assert: excludes expired and inactive)
  - `findMany({ includeInactive: true })` returns all 4 (assert count = 4)
  - `create(data)` + `findMany({ includeInactive: true })` count = 5
  - `delete(id)` → `findById(id).isActive === false`

---

### Task 1.5: Reduce LocalAPIAdapter to auth-only

**Architectural decision (made):** Standardize on server-side mocks. `LocalAPIAdapter` data methods are removed. `dev:real` is the primary development command.

**Files to change:**

- `apps/client/src/lib/services/local/api.ts` — remove `get`, `post`, `put`, `patch`, `delete` methods. If the service factory can point all data calls to `RemoteAPIAdapter` (with mock server running), delete the data methods entirely.
- `apps/client/src/lib/services/index.ts` — update factory: in mock mode, use `LocalAuthAdapter` for auth + `RemoteAPIAdapter` for data (pointing to `http://localhost:3000`).
- Update `README.md` or dev docs — `dev:real` is the standard development command. `dev` (client-only) is deprecated for admin development.

**Verification:**

- **Smoke test:** `dev:real` → navigate all admin pages → data loads from mock server.
- **Smoke test:** `dev` (client-only) → admin pages show clear "Server required" message or redirect, not fake data.

---

### Task 1.6: Tenant isolation — audit findById usage **[SECURITY REVIEW REQUIRED]**

**Objective:** Confirm no route handler allows cross-tenant data access via unscoped `findById()`.

**Scope:** All files in `apps/server/src/v1/routes/` (both admin and tenant-facing). Count of route files to audit: ~15-20 files.

**Deliverable:** Structured audit table committed to the repo (`docs/tenant-isolation-audit.md`):

```markdown
| File        | Handler  | Method   | Lookup             | Auth        | Org Check       | Status              |
| ----------- | -------- | -------- | ------------------ | ----------- | --------------- | ------------------- |
| projects.ts | GET /:id | findById | projectId from URL | requireAuth | ✅ checks orgId | Safe                |
| projects.ts | PUT /:id | findById | projectId from URL | requireAuth | ❌ no check     | VULNERABILITY — FIX |
```

**Decision framework:**

- Route with `requireRole('system_admin')`: cross-tenant access is **intentional** (admin routes) — mark as Safe/Admin
- Route with `requireAuth()` only: `findById` result **must** be checked against `user.organizationId` — mark as Vulnerability if missing
- Public route: `findById` is **information disclosure risk** — flag separately

**Verification:**

- **Test to write:** `tenant-isolation.spec.ts` (integration):
  - Authenticate as Acme user (org A)
  - Attempt `GET /v1/projects/{betaProjectId}` (org B project) → expect 403 or 404
  - Attempt `GET /v1/users/{betaUserId}` (org B user) → expect 403 or 404
  - Repeat for all entity types accessible by org-level users
  - Assert: zero cross-tenant data in any response

---

### Task 1.7: Supabase RLS status + audit log immutability **[DB CONFIG]**

**Objective:** Document RLS status. Make audit logs tamper-proof.

**Sub-task A: RLS status check**

- Check Supabase dashboard for RLS policies. Document in `docs/tenant-isolation-audit.md` (same file as 1.6).
- If RLS is NOT enabled: document as a finding. Full RLS enablement deferred to Enterprise (E6) but the risk is documented now.

**Sub-task B: Audit log immutability**

- **Technical validation first:** Verify the actual Supabase role name used by the app (may not be `service_role_user`). Check via `SELECT current_user;` from the app connection.
- Execute: `REVOKE UPDATE, DELETE ON audit_logs FROM [actual_app_role];`
- If Supabase role model prevents this (e.g., `service_role` has irrevocable superuser-like privileges), document the limitation and implement application-level immutability guard (throw error on UPDATE/DELETE audit log queries).

**Verification:**

- **DB Config:** `SELECT has_table_privilege('[app_role]', 'audit_logs', 'UPDATE')` → false
- **Integration test:** Attempt `repos.auditLogs.update(...)` or `repos.auditLogs.delete(...)` → expect error/rejection

---

### Task 1.8: Standardize buildAuditContext utility

**Files to create:**

- `apps/server/src/v1/routes/admin/utils/audit-context.ts`:
  ```typescript
  export function buildAuditContext(c: Context) {
    const user = c.get('user');
    return {
      actorId: user?.id ?? null,
      actorEmail: user?.email ?? null,
      ipAddress:
        c.req.header('CF-Connecting-IP') ||
        c.req.header('X-Forwarded-For')?.split(',')[0].trim() ||
        null,
      userAgent: c.req.header('User-Agent') || null,
      requestId: c.req.header('X-Request-Id') || crypto.randomUUID(),
    };
  }
  ```

**Files to change:** All admin routes that manually build context — replace with `buildAuditContext(c)`.

**Metadata contract:**

- `metadata` field must never contain raw secrets, passwords, or full credit card numbers
- Include `requestId` for traceability
- Before/after values for change events (added in Task 1.9)

**Verification:**

- **Unit test:** `audit-context.test.ts` — extracts correct fields from mock Hono context. Handles null user. Extracts IP from CF-Connecting-IP, X-Forwarded-For, and fallback.

---

### Task 1.9: Expand audit logging to all admin mutations

**Objective:** Every admin mutation produces an audit log entry with standardized context.

**Files to change:** All handlers in `apps/server/src/v1/routes/admin/`:

- `users.ts`: POST → `user.created`, PUT → `user.updated`, DELETE → `user.deleted`
- `tenants.ts`: PUT → `tenant.updated`, DELETE → `tenant.deactivated`
- `onboarding.ts`: POST → `tenant.onboarded` (verify existing)
- `coupons.ts`: POST → `coupon.created`, PUT → `coupon.updated`, DELETE → `coupon.deleted`, POST sync → `coupon.synced`
- `support.ts`: PUT status → `ticket.status_changed`, POST reply → `ticket.replied`, PUT assign → `ticket.assigned`
- `billing.ts`: POST refund → `refund.issued`

Use `buildAuditContext(c)` from 1.8.

**Before/after diffs:** For update mutations, **fetch the entity before applying changes**. Pass `{ before: entityBeforeUpdate, after: entityAfterUpdate }` as metadata to the audit logger. This is critical — the audit viewer (Task 2.11) depends on this data existing. At minimum capture diffs for: role changes, status changes, plan changes, seat limit changes.

**Progressive taxonomy:** This task covers the initial ~15 event types. Subsequent tasks are responsible for adding their own audit events: Task 2.2 must add `admin.permissions_changed`, Task 2.12 must add `admin.override_granted` / `admin.override_revoked` / `admin.override_expired`, Tasks 2.4/2.6 add impersonation events.

**Verification:**

- **Integration test to write:** `audit-logging-coverage.test.ts`:
  - For each of the ~15 admin mutation endpoints: call it, then query `auditLogs.findMany()` and assert:
    - Entry exists with correct `action` string
    - `actorId` is non-null
    - `ipAddress` is non-null (from test headers)
    - `requestId` is present in metadata
    - For update actions: `metadata.before` and `metadata.after` are present
  - Assert total distinct action types >= 15

**[i18n: No — server-only task]**

---

### Task 1.10: Admin MFA enforcement **[STAGED ROLLOUT] [SECURITY REVIEW REQUIRED]**

**Objective:** System admin accounts require MFA enrollment.

**MFA status detection:** Supabase Auth stores MFA factor enrollment on the auth user object. The middleware will call `supabase.auth.mfa.listFactors()` for the authenticated user. If no verified TOTP factor exists, return 403 with `mfa_required` code.

**Performance note:** MFA status check involves a Supabase API call. Cache the result in the user's JWT custom claims or in a server-side cache with 5-minute TTL to avoid per-request latency.

**Files to create:**

- `apps/server/src/middleware/mfa-check.ts` — `requireMFA()` middleware. In logging-only mode: log warning but allow access. In enforcement mode: return 403.

**Files to change:**

- `apps/server/src/v1/routes/admin/index.ts` — add `requireMFA()` after auth middleware
- Client: detect 403 `mfa_required` → show enrollment prompt/redirect

**Mock mode:** MFA check is **skipped** when `AUTH_MODE=mock` (same condition as auth bypass). This is safe because mock mode already bypasses real auth entirely. The `MOCK_SKIP_MFA` env var is unnecessary — mock auth mode implies it.

**CI mode:** Integration tests run with `AUTH_MODE=mock`, so MFA is skipped. A dedicated `mfa-enforcement.test.ts` tests the middleware in isolation with mocked Supabase Auth responses.

**Staged rollout:**

1. Deploy with `MFA_ENFORCEMENT=log` — middleware logs "MFA not enrolled for admin {email}" but allows access
2. Verify all internal admins enroll MFA (manual check)
3. Switch to `MFA_ENFORCEMENT=enforce` — middleware blocks access
4. **Rollback:** set `MFA_ENFORCEMENT=log` to immediately unblock

**Bootstrap:** First admin user must be able to access the platform to enroll MFA. The middleware allows a grace period: if the admin user was created within the last 24 hours and MFA is not enrolled, allow access with a persistent banner prompting enrollment. After 24 hours, enforcement is strict.

**Verification:**

- **Integration test to write:** `mfa-enforcement.test.ts`:
  - Mock Supabase Auth `listFactors()` returning verified TOTP → admin routes return 200
  - Mock `listFactors()` returning empty → admin routes return 403 `mfa_required`
  - Mock `listFactors()` with `MFA_ENFORCEMENT=log` → return 200 (not blocked)
- **Post-deploy:** Verify admin dashboard loads for MFA-enrolled user. Verify non-enrolled user sees enrollment prompt.

---

### Task 1.11: Admin dashboard — live stats **[i18n]**

**Files to create:**

- `apps/server/src/v1/routes/admin/stats.ts` — `GET /v1/admin/stats`:

  ```json
  {
    "tenantCount": 2,
    "activeUserCount": 7,
    "activeProjectCount": 3,
    "mrr": 9900,
    "recentActivity": [
      {
        "action": "tenant.onboarded",
        "actorName": "System Admin",
        "targetName": "Acme Corp",
        "createdAt": "..."
      }
    ]
  }
  ```

  Error handling: if any repository query fails, return `null` for that field (partial data), not 500.

- `GET /v1/admin/health` — dependency health check: ping Supabase (DB query), Stripe (API key validation), Resend (account check). Returns `{ supabase: 'ok'|'error', stripe: 'ok'|'error', resend: 'ok'|'error' }`.

- `apps/client/src/features/admin/hooks/use-admin-stats.ts` — React Query hook, 30s stale time
- `apps/client/src/features/admin/hooks/use-admin-health.ts` — React Query hook for health endpoint, 60s stale time

**Files to change:**

- `AdminDashboardPage.tsx` — replace hardcoded values with hook data + `Skeleton` loading states. Replace placeholder sections with recent activity feed. Add dependency health widget showing green/red status for each service.

**Localization keys to add:** `admin.dashboard.liveStats.*`, `admin.dashboard.recentActivity.title`, `admin.dashboard.noRecentActivity` (both en + he)

**Verification:**

- **Integration test:** `admin-stats.test.ts` — endpoint returns counts matching mock seed data: `tenantCount: 2`, `activeUserCount: 7` (excluding pending user), `activeProjectCount: 3`.
- **Manual:** Navigate `/admin` → stats match seed data. Loading skeletons appear briefly. Recent activity shows audit log entries from seed data.

---

### Task 1.12: Tenant list — show usage metrics **[i18n]**

**Files to change:**

- `TenantListPage.tsx` — enhance table: storage column formatted as MB/GB, ensure seat column shows `seatUsed / seatLimit`
- `EditTenantDrawer.tsx` — show `seatUsed` next to limit input. Warning when `newLimit < seatUsed`: "Warning: current usage ({seatUsed} seats) exceeds this limit."

**Localization keys:** `admin.tenants.table.storage`, `admin.tenants.seatWarning` (both en + he)

**Verification:**

- **Manual:** Tenant list → Acme shows "4/25 seats", "150 MB". Edit drawer → set limit to 2 → warning appears with "4 seats" text.

---

### Task 1.13: Cross-cutting — correlation IDs, rate limit headers, environment safety

**Objective:** Apply API conventions from spec Section 35 and environment protection from Section 26.

**Sub-task A: Correlation ID middleware**

- Create middleware that reads `X-Request-Id` from request headers or generates `crypto.randomUUID()`. Sets on response header. Stores in context for use by `buildAuditContext`.
- **Files:** New `middleware/correlation-id.ts`, add to global middleware chain.

**Sub-task B: Rate limit response headers**

- Update rate limiter to include `X-RateLimit-Remaining` and `Retry-After` in 429 responses.
- **Files:** `middleware/rate-limit.ts` (or wherever limiter is configured).

**Sub-task C: Environment safety + badge**

- Server: add startup check that **fails hard** if `MOCK_MODE=true` and `NODE_ENV=production`. Log and exit.
- Client: add environment badge in admin header. Shows "Development" (amber) when `MOCK_MODE=true`, hidden in production. Badge reads from a `/v1/admin/health` or config endpoint.
- **Localization keys:** `admin.environment.development`, `admin.environment.production`

**Verification:**

- **Integration test:** Request to any admin endpoint returns `X-Request-Id` header. Rate-limited request returns `Retry-After`.
- **Unit test:** Server startup with `MOCK_MODE=true` + `NODE_ENV=production` → process exits with error.
- **Manual:** Dev mode → amber "Development" badge in admin header. Production mode → no badge.

---

### Task 1.14: Custom branding feature disposition

**Objective:** Remove `customBranding` from plan UI/pricing until implementation exists. Spec Section 21 identified this as a declared but unimplemented feature.

**Files to change:**

- `PlanEditorDrawer.tsx` — remove or disable the custom branding checkbox. Add a note: "Custom branding — coming soon" or remove entirely.
- `PricingPlansPage.tsx` — do not display custom branding as a feature on plan cards.
- Seed plans: remove `customBranding: true` from Enterprise seed plan (misleading).
- Feature gating middleware remains — `requireFeature('customBranding')` still returns 403. This is correct behavior (feature is gated, just not offered in any plan UI).

**Verification:**

- **Manual:** Plan editor does not show custom branding toggle. Plan cards do not mention custom branding.

---

### Phase 1 Completion Checklist

- [ ] All 14 PRs merged (1.1–1.14)
- [ ] `npm run lint` + `npm run test` + `npm run test:e2e` pass
- [ ] Mock mode: all 7 admin pages show populated data (tickets, coupons populated)
- [ ] Dashboard shows live stats matching seed data counts
- [ ] MFA enforcement active (or logging-only with all admins enrolled)
- [ ] `tenant-isolation.spec.ts` passes — zero cross-tenant data access
- [ ] `audit-logging-coverage.test.ts` passes — 15+ action types logged
- [ ] Audit log table is INSERT-only at DB level (or application-level guard)
- [ ] `docs/tenant-isolation-audit.md` committed with structured findings
- [ ] All new UI strings in both `en/admin.json` and `he/admin.json`

---

## Phase 2: Launch

**Goal:** Admin supports real operations with governance. Read-only impersonation for troubleshooting. Permission foundation gates admin routes. Audit viewer with export. Tenant overrides for flexible feature management.

**Timeline:** 10-14 weeks (including 2-week buffer). If timeline runs long, **slippable items** (lower priority, can move to Enterprise without blocking operations): L7 (support ops), L8 (job queue), L9 (notifications).

### Task Dependencies

| Task                        | Depends On    | Can Parallel With            |
| --------------------------- | ------------- | ---------------------------- |
| 2.1 (permission schema)     | —             | 2.11, 2.12, 2.14, 2.15, 2.16 |
| 2.2 (permission middleware) | 2.1           | 2.11, 2.12, 2.14, 2.15, 2.16 |
| 2.3 (step-up auth)          | 2.2           | 2.11, 2.12, 2.14, 2.15, 2.16 |
| 2.0 (impersonation spike)   | —             | anything                     |
| 2.4-2.10 (impersonation)    | 2.2, 2.3, 2.0 | 2.11, 2.12                   |
| 2.11 (audit viewer)         | —             | everything                   |
| 2.12-2.13 (overrides)       | —             | 2.11, 2.14, 2.15             |
| 2.14 (lifecycle)            | —             | 2.11, 2.12, 2.15             |
| 2.15 (support ops)          | —             | 2.11, 2.12, 2.14             |
| 2.16 (job queue)            | —             | everything                   |
| 2.17-2.18 (notifications)   | —             | everything                   |

**Optimal two-engineer split:**

- Engineer A (critical path): 2.0 → 2.1 → 2.2 → 2.3 → 2.4-2.10
- Engineer B (parallel stream): 2.11 → 2.12 → 2.13 → 2.14 → 2.15 → 2.16 → 2.17

---

### Task 2.0: Technical spike — impersonation JWT + step-up auth mechanism

**Objective:** Resolve two architectural unknowns before building impersonation:

**Spike A: Impersonation JWT approach**

- Can the RevBrain server issue its own JWTs? What signing key does it use?
- Does the auth middleware currently validate JWTs only against Supabase's signing key? If so, a RevBrain-signed impersonation JWT will fail.
- **Decision options:** (1) RevBrain-signed JWT with dual-key validation in middleware, (2) Server-side session ID with lookup, (3) Supabase custom claims if supported.
- **Deliverable:** Short design doc (1 page) with chosen approach and implementation implications.

**Spike B: Step-up auth flow with Supabase**

- How does `lastMfaVerifiedAt` get set? Options: (1) JWT `iat` claim (MFA at login = iat is the timestamp), (2) Supabase Auth `amr` claim, (3) Server-side session store updated on MFA verify.
- For step-up re-challenge mid-session: does the client call Supabase MFA verify, and if so, does the existing JWT get refreshed or does a new token get issued?
- **Deliverable:** Chosen mechanism documented. If JWT `iat` is used (simplest — MFA at login means iat = last MFA time), document that step-up re-challenge requires token refresh.

**Effort:** 1-2 days. No code changes — research and design doc only.

---

### Task 2.1: Admin permission model — schema and migration **[SCHEMA] [SECURITY REVIEW REQUIRED]**

**Architectural decision (made):** Use a **junction table** (`admin_role_assignments`), not a JSON array. Junction tables are queryable, auditable, and extensible.

**Schema:**

```sql
CREATE TABLE admin_role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_name TEXT NOT NULL,  -- 'super_admin', 'support_admin', etc.
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role_name)
);

-- Named role definitions with permission sets
CREATE TABLE admin_role_definitions (
  role_name TEXT PRIMARY KEY,
  permissions JSONB NOT NULL,  -- ['users:read', 'users:write', ...]
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Seed data:** Insert `super_admin` role definition with `['*']` permissions. Assign `super_admin` to system_admin seed user.

**Backward compatibility:** During migration window, `requireAdminPermission()` middleware falls back: if user has no `admin_role_assignments` but has `role = 'system_admin'`, treat as `super_admin` (wildcard permissions). This ensures zero downtime during migration.

**Files to create/change:**

- `packages/contract/src/index.ts` — add `AdminPermission` type, `ADMIN_ROLE_DEFINITIONS` constant
- Drizzle migration for both tables
- Mock seed data: `admin_role_definitions` with super_admin, mock assignment for system_admin user
- `apps/server/src/mocks/admin-roles.ts` — seed definitions and assignments

**Rollback:** Drop tables. Old `requireRole('system_admin')` still works until Task 2.2 replaces it.

**Verification:**

- **Unit test:** Contract exports permission types correctly
- **Integration test:** Create assignment, query by user, verify permissions resolved correctly. Verify backward-compat fallback for users without assignments.

---

### Task 2.2: requireAdminPermission middleware **[STAGED ROLLOUT]**

**Files to create:**

- `apps/server/src/middleware/admin-permissions.ts`:
  ```typescript
  export function requireAdminPermission(...permissions: string[]) {
    return async (c: Context, next: Next) => {
      const user = c.get('user');
      const userPermissions = await resolveAdminPermissions(user.id);
      // '*' grants everything
      if (userPermissions.includes('*')) return next();
      // Check all required permissions
      for (const p of permissions) {
        if (!userPermissions.includes(p)) {
          throw new AppError(ErrorCodes.FORBIDDEN, `Missing permission: ${p}`, 403);
        }
      }
      return next();
    };
  }
  ```

**Files to change:** All admin routes — replace `requireRole('system_admin')` with specific permissions (see list in audit spec Section 32).

**Staged rollout:**

1. Deploy with dual-check: `requireRole('system_admin') AND requireAdminPermission(...)` — both must pass. Log when permission check would have differed from role check.
2. Verify logs show no discrepancies for 48h.
3. Remove `requireRole` fallback. Permission-only enforcement.
4. **Rollback:** Re-add `requireRole('system_admin')` as single guard.

**Verification:**

- **Integration test:** `admin-permissions.test.ts`:
  - User with `super_admin` role (`['*']`) → all routes 200
  - User with `['support:read', 'support:reply']` → support GET 200, support POST 200, billing GET 403
  - User with `['billing:read']` → billing GET 200, billing refund 403
  - User with no admin roles → all admin routes 403
  - Backward-compat: user with `role='system_admin'` but no assignment → treated as super_admin (200)
- **E2E:** `permissions.spec.ts` continues to pass

---

### Task 2.3: Step-up auth middleware

**Mechanism (from spike 2.0):** Use JWT `iat` claim as proxy for last auth time. When step-up is triggered, client refreshes the Supabase session (which re-issues JWT with new `iat`), then retries the request.

**Files to create:**

- `apps/server/src/middleware/step-up-auth.ts`:
  ```typescript
  export function requireRecentAuth(maxAgeMinutes: number) {
    return (c: Context, next: Next) => {
      const iat = c.get('jwtIat'); // set by auth middleware from JWT
      const ageMinutes = (Date.now() / 1000 - iat) / 60;
      if (ageMinutes > maxAgeMinutes) {
        throw new AppError('STEP_UP_REQUIRED', 'Recent authentication required', 403);
      }
      return next();
    };
  }
  ```

**Files to change:**

- Apply `requireRecentAuth(5)` to: refund endpoint, tenant deactivation, role elevation, impersonation start (Task 2.4)
- Client: detect `STEP_UP_REQUIRED` → show dialog "Please re-authenticate" → call `supabase.auth.refreshSession()` → retry original request

**Verification:**

- **Integration test:** `step-up-auth.test.ts`:
  - JWT `iat` = 2 minutes ago, `maxAge=5` → 200
  - JWT `iat` = 10 minutes ago, `maxAge=5` → 403 `STEP_UP_REQUIRED`

---

### Tasks 2.4–2.10: Impersonation (read-only) — Feature Branch

**Branch:** `feat/impersonation`

**Read-only enforcement decision (made):** **Allowlist approach.** During impersonation, only explicitly allowed endpoints are accessible. Everything else returns 403. This is safer than a blocklist (new endpoints are blocked by default).

**Initial allowlist:**

- `GET /v1/projects/*`
- `GET /v1/users/*` (org-scoped)
- `GET /v1/billing/usage`
- `GET /v1/billing/subscription`
- `GET /v1/org/users`
- `POST /v1/billing/portal` (read-like: creates Stripe portal session)

All admin routes remain accessible (impersonation doesn't affect admin functionality).

**Task 2.4: Server endpoint** — `POST /v1/admin/impersonate`

- Accepts `{ targetUserId, reason }`. Validates: user exists, not system_admin, requester has `impersonate:read_only` permission. Requires `requireRecentAuth(5)`.
- Returns impersonation token (per spike decision) with claims: `realUserId`, `impersonatedUserId`, `mode: 'read_only'`, `reason`, `expiresAt` (30 min).
- Creates audit log: `impersonation.started` with reason.
- **Test:** Verify token shape. system_admin target → 403. Audit log created. Step-up required.

**Task 2.5: Server middleware — impersonation detection**

- Auth middleware extended: detect impersonation token. Set `c.set('user', targetUser)` and `c.set('realUser', adminUser)`.
- Apply allowlist: non-admin routes not in allowlist → 403 `impersonation_read_only`.
- Audit logging during impersonation uses `realUser` as actor.
- **Test:** Impersonation token + `GET /v1/projects` → 200. Impersonation token + `POST /v1/projects` → 403. Impersonation token + `GET /v1/admin/stats` → 200 (admin routes unaffected).

**Task 2.6: Server — end impersonation**

- `POST /v1/admin/end-impersonation`. Creates audit log: `impersonation.ended` with duration.
- **Test:** Verify audit log with duration calculation.

**Task 2.7: Client — useImpersonationStore** (Zustand)

- State: `isImpersonating`, `originalSession`, `impersonatedUser`, `impersonatedTenantName`, `reason`, `expiresAt`.
- Actions: `startImpersonation(...)`, `endImpersonation()`.
- localStorage sync (`storage` event listener) for multi-tab awareness.
- Auto-expire timer: calls `endImpersonation()` at `expiresAt`, shows warning at `expiresAt - 5min`.
- **Test (unit):** State transitions. localStorage sync between two store instances. Auto-expire fires.

**Task 2.8: Client — ImpersonationBanner** **[i18n]**

- Persistent top bar: "Viewing as [Tenant] — [User] | Read-only | Reason: [text] | Expires in [mm:ss] | [End Session]"
- `role="status"` `aria-live="polite"` for screen readers.
- **Localization keys:** `admin.impersonation.banner.*` (en + he)
- **Manual:** Banner appears, countdown works, End Session returns to admin.

**Task 2.9: Client — reason dialog + TenantListPage integration** **[i18n]**

- "Login as Owner" action in tenant row dropdown.
- Dialog: "Reason for access" required textarea + "Start Read-Only Session" button.
- Flow: step-up auth if needed → `POST /v1/admin/impersonate` → store token → switch view.
- **Localization keys:** `admin.impersonation.dialog.*`, `admin.tenants.loginAsOwner`
- **E2E test to write:** `impersonation.spec.ts`:
  - Click "Login as Owner" on Acme → enter reason → start session
  - Verify banner appears with "Acme Corp" and reason text
  - Verify sidebar shows org navigation (Dashboard, Projects, etc.)
  - Attempt to create a project → verify read-only error message
  - Click "End Session" → verify admin view restored, sidebar shows admin navigation

**Task 2.10: Client — sidebar switching**

- When `isImpersonating`, sidebar shows org items (Dashboard, Projects, Billing, Settings) instead of admin items.
- Admin routes (`/admin/*`) redirect to org dashboard during impersonation.
- **Manual:** Sidebar switches during impersonation and restores after.

**Merge:** Squash-merge feature branch as `feat: implement read-only tenant impersonation with governance`

**Rollback:** Impersonation endpoint and middleware are behind `IMPERSONATION_ENABLED=true` env var. Set to `false` to disable entirely.

---

### Task 2.11: Audit viewer page **[i18n]**

- Create `/admin/audit` page: date range picker, actor dropdown, action type dropdown, entity search, org filter.
- Expandable rows showing before/after diffs.
- CSV/JSON export button → **async**: for large date ranges, queue export job and provide download link. For small ranges (< 1000 entries), synchronous download.
- **Localization keys:** `admin.audit.*` (page title, filters, columns, export button, empty state)
- **E2E:** Navigate to audit page → entries visible → filter by action type → results narrow → export CSV → file downloads.

---

### Task 2.12: Tenant overrides — table + service **[SCHEMA]**

**Schema (template for subsequent migrations):**

```sql
CREATE TABLE tenant_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,              -- e.g., 'data_validation', 'maxUsers'
  value JSONB NOT NULL,               -- true/false for boolean, number for limits
  expires_at TIMESTAMPTZ,             -- null = permanent
  granted_by UUID NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  revoked_at TIMESTAMPTZ,             -- null = active
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, feature) WHERE revoked_at IS NULL  -- one active override per feature
);

CREATE INDEX idx_overrides_org_active ON tenant_overrides(organization_id) WHERE revoked_at IS NULL;
```

**Mock data:** 2 seed overrides — one active grant, one expired.

**Service:** `limits.service.ts` modification: check `tenant_overrides` for active non-expired overrides before plan defaults. Override wins over plan. Revoked overrides are ignored.

**Background job:** Daily check for expired overrides → set `revoked_at = now()`, create audit event `admin.override_expired`.

**Rollback:** Drop table. `limits.service.ts` reverts to plan-only checks.

**Verification:**

- **Integration test:** Grant override for `data_validation` on Starter tenant → `requireFeature('data_validation')` passes. Revoke → feature blocked again. Expire → feature blocked. Verify audit events for grant/revoke/expire.

---

### Task 2.13: Tenant overrides — admin UI **[i18n]**

- Admin page or section within tenant detail: list active overrides per tenant, grant form (feature selector, value, expiration, reason — required), revoke button.
- **Localization keys:** `admin.overrides.*`
- **E2E:** Grant override → appears in list → revoke → removed from list.

---

### Task 2.14: Tenant lifecycle states **[SCHEMA] [i18n]**

**Schema change:** Add lifecycle states to org status. Options: expand existing `isActive` boolean to a `status` enum (`active`, `trial`, `suspended`, `deactivated`), OR add separate `lifecycleState` column.

**Decision:** Add `lifecycleState` column (nullable, defaults to `'active'` via backfill). Keep `isActive` for backward compatibility initially.

**Business logic for new states:**
| State | Login Allowed? | Background Jobs? | Billing? | Impersonation? |
|-------|---------------|-----------------|----------|----------------|
| `active` | Yes | Yes | Active | Yes |
| `trial` | Yes | Yes | No charge | Yes |
| `suspended` | **No** (show "contact admin") | Paused | Past due | Yes (admin can investigate) |
| `deactivated` | No | Stopped | Cancelled | Yes (read-only) |

**State transitions:** `trial → active` (on first payment), `active → suspended` (payment failure, manual), `suspended → active` (payment resolved, manual), `active → deactivated` (manual), `trial → deactivated` (manual/expired).

**Tenant detail page:** New page at `/admin/tenants/:id` showing: projects count, active users, storage used, billing status, recent activity (from audit log), lifecycle state badge, override list.

**Activity indicators on tenant list:** Last login (max `lastLoginAt` across tenant's users), active project count, days since last activity.

**Trial extension:** Admin can set `trialEndsAt` date on trial tenants.

**Localization keys:** `admin.tenants.detail.*`, `admin.tenants.lifecycle.*`, `admin.tenants.activity.*`

**Rollback:** Drop column. Existing `isActive` continues to work.

**Verification:**

- **Integration test:** Create trial tenant → verify state. Transition to active → verify. Suspend → verify login blocked. Reactivate → verify login restored.
- **E2E:** Navigate to tenant detail → verify metrics. Tenant list → verify activity columns.

---

### Tasks 2.15–2.18: Remaining Launch builds

**Task 2.15: Support operations** **[i18n] [SLIPPABLE]**

- Admin creates ticket on behalf of customer (`POST /v1/admin/support/tickets` with `onBehalfOf` field)
- SLA indicators: overdue highlighting on list (configurable threshold, default 4h for first response)
- Wire Resend email to notify customer on admin reply (queue via job queue)
- **Localization keys:** `admin.support.createOnBehalf`, `admin.support.slaOverdue`
- **Test:** Create ticket as admin → verify `createdBy` is admin. Reply → verify email job queued with correct recipient.

**Task 2.16: Job queue visibility** **[i18n] [SLIPPABLE]**

- Dashboard widget: pending, failed (24h), dead job counts.
- `GET /v1/admin/jobs/dead` — list dead jobs with type, failure reason, created date.
- `POST /v1/admin/jobs/:id/retry` — retry dead job (only if job type is idempotent-safe: `email`, `webhook`. Reject retry for `cleanup` jobs without manual confirmation).
- **Localization keys:** `admin.jobs.*`
- **Test:** Verify dead job listing returns correct data. Verify retry resets status to pending. Verify non-retryable job type returns 400.

**Task 2.17: Notifications — in-app** **[SCHEMA] [i18n] [SLIPPABLE]**

- `admin_notifications` table: `{ id, adminUserId, type, severity, title, message, metadata, isRead, createdAt }`
- Severity model: `critical` (failed payment, dead job), `warning` (SLA breach, over-limit tenant), `info` (ticket assigned, override granted)
- Deduplication: same `(type, metadata.entityId)` within 1 hour → update existing instead of creating new
- Client: notification bell in admin header with unread count badge. Dropdown with recent notifications. Mark-as-read on click.
- **Localization keys:** `admin.notifications.*`
- **Test:** Create high-priority ticket → verify notification created with `severity: 'warning'`. Mark as read → count decrements. Duplicate within 1h → count unchanged.

**Task 2.18: Notifications — email** **[SLIPPABLE]**

- Admin email preferences (stored in user metadata or separate table)
- On critical notification → queue email to subscribed admins
- **Test:** Trigger critical event → verify email job created for subscribed admin, not for unsubscribed.

---

### Cross-cutting Launch tasks

**Task 2.19: Optimistic concurrency for admin update endpoints**

- Add `updatedAt` check to all admin PUT handlers: fetch entity, compare `updatedAt` with value from request (sent as `If-Match` header or body field). If mismatch → 409 Conflict.
- Client: on 409 → show "This record was modified by another user. Reload and try again."
- **Files:** All admin PUT handlers in `admin/users.ts`, `admin/tenants.ts`, `admin/coupons.ts`, `admin/support.ts`.
- **Test (integration):** Two concurrent updates to same tenant → second receives 409.
- **Localization keys:** `common.concurrencyConflict` (en + he)

**Task 2.20: Cursor-based pagination migration**

- Replace offset-based pagination (`limit`/`offset`) with cursor-based (`cursor`/`limit`) for high-volume endpoints: `GET /v1/admin/users`, `GET /v1/admin/support/tickets`, `GET /v1/admin/audit` (new in 2.11).
- Keep offset pagination for low-volume endpoints (tenants, plans, coupons).
- **Spec NFR reference:** "Cursor-based by Launch for >1K entities."
- **Files:** Route handlers + repository findMany methods + client hooks.
- **Test:** Verify cursor pagination returns correct pages. Verify no duplicates across pages.

**Task 2.21: Accessibility — axe-core integration**

- Add `@axe-core/playwright` to E2E test dependencies.
- Add axe accessibility checks to existing E2E test suite — run on all admin pages.
- Fix critical violations found (missing ARIA labels on icon-only buttons, focus management on drawers).
- **Spec reference:** Section 37 — WCAG 2.1 AA target.
- **Test:** `npm run test:e2e` includes axe checks. Zero critical accessibility violations on admin pages.

**Task 2.22: Customer-visible admin access audit (stub)**

- Add Enterprise placeholder: when admin accesses a tenant's data (via impersonation or admin queries), the tenant's org_owner can see a log entry: "RevBrain admin accessed your workspace on [date] — reason: [text]".
- **This task is a stub:** Create the data model (`admin_access_events` table or filtered view of audit log). Do not build the tenant-facing UI yet (that's Enterprise). Ensure impersonation audit events include enough metadata to power this later.
- **Test:** After impersonation, query `admin_access_events` for the tenant → entry exists with admin name, reason, timestamp.

---

### Phase 2 Completion Checklist

- [ ] All Launch PRs merged
- [ ] Full test suite passes (including axe accessibility checks)
- [ ] Read-only impersonation: start with reason → banner → read-only → end → audit trail
- [ ] Permission middleware gates all admin routes (super_admin has `*`)
- [ ] Step-up auth challenges on refund, deactivation, impersonation
- [ ] Audit viewer: search, filter, before/after diffs, CSV export
- [ ] Tenant overrides: grant/revoke with expiration and audit
- [ ] Trial + suspended lifecycle states with enforcement
- [ ] All new UI strings in both en + he locales
- [ ] Impersonation allowlist documented and tested
- [ ] Keyboard navigation works for new UI components
- [ ] Cursor-based pagination on users, tickets, audit endpoints
- [ ] Optimistic concurrency on admin update endpoints (409 on conflict)
- [ ] Zero critical axe accessibility violations
- [ ] `X-Request-Id` correlation header on all responses
- [ ] Environment badge visible in dev mode
- [ ] **Competitive benchmark check:** Audit log viewer ✓, Tenant impersonation ✓, Role-based admin permissions (backend) ✓, Feature gating ✓

**If timeline runs long:** Tasks marked [SLIPPABLE] (2.15, 2.16, 2.17, 2.18) can defer to Phase 3 without blocking core operations.

---

## Phase 3: Enterprise

**Goal:** F500 procurement readiness. Admin role UI, full-write impersonation, approval workflows, PII masking, compliance tooling, SSO.

**Status: Planning milestone.** Tasks below are scoped at epic level. Each requires a **detailed task breakdown** before implementation begins, similar to the Phase 0-2 detail level. This is intentional — Phase 3 is 20+ weeks away and over-specifying now wastes effort on decisions that may change.

**Before Phase 3 starts:** Each task below should be expanded into a mini-spec with: schema design, API endpoints, UI wireframes, test plan, rollout strategy, effort estimate.

---

### Task 3.1: Admin role management UI (E1)

**Scope:** Named permission sets (super_admin, support_admin, billing_admin, **compliance_auditor**, readonly_admin). Admin page to assign roles. Sidebar show/hide per permissions. Compliance auditor gets `audit:read` + `audit:export` only. Migration ops persona permission set reserved for P1.
**Requires:** Mini-spec defining exact permission-to-route mapping, UI mockups.
**Persona validation:** After shipping, verify each persona from spec Section 33 can perform their top jobs and ONLY their top jobs (integration test per persona).

### Task 3.2: Full-write impersonation (E1)

**Scope:** `impersonate:full` permission. Action restrictions in write mode. Unlock only for super_admin.
**Requires:** Action restriction allowlist. Separate from Task 3.1 — different dependency (needs restriction engine, not just role UI).

### Task 3.3: Commercial metadata (E2)

**Scope:** Contract dates, billing contacts, PO number, tax ID on OrganizationEntity. Admin UI section in tenant detail.
**Requires:** Schema design reviewed with finance/sales.

### Task 3.4: Billing model extension (E2 — GTM gated)

**Scope:** `billingModel`, `projectFee`, `projectFeeInterval`, `includedProjects` on plan schema. PlanEditorDrawer conditional fields.
**Decision gate:** Only build if GTM validates commercial model.

### Task 3.5: Compliance tooling (E3)

**Scope:** Permission matrix doc, data retention policy with **automated** enforcement job, tenant data export (async via job queue), tenant purge workflow (soft-delete → grace → cascade hard purge), incident runbook, **data residency documentation** (Supabase region, processing locations, subprocessor inventory).
**Requires:** Dedicated sub-plan — export/purge is complex (async job, scope definition, cascade, grace period, legal hold exclusions).

### Task 3.5a: Customer-visible admin access audit (E3 — trust feature)

**Scope:** Tenant org_owners can view when RevBrain admins accessed their workspace. Builds on `admin_access_events` stub from Task 2.22. Tenant-facing UI in org settings. Shows admin name, reason, timestamp, duration, mode.
**Competitive differentiator** per spec Section 38.

### Task 3.5b: Sensitive data read-logging (E3)

**Scope:** Log when admins view sensitive data (billing details, user PII, ticket content). Extend audit to emit `data.accessed` events for configurable sensitive GET endpoints. Start with impersonation reads + admin billing views + admin user detail views.

### Task 3.6: Approval workflows (E4)

**Scope:** `approval_requests` table, configurable thresholds, pending queue, approver notifications.
**Requires:** Mini-spec: table schema, API endpoints (how many?), UI (list? detail? inline?), timeout policy, configuration mechanism (env vars? admin UI?).
**Pre-Enterprise operational stance:** Before formal approvals ship, sensitive actions require reason + strong audit + out-of-band dual review (e.g., Slack confirmation).

### Task 3.7: PII masking (E5)

**Scope:** Field-level masking utility, role-based visibility, reveal-on-demand with audit.
**Note:** Masking must be server-side before serialization. Audit metadata should avoid raw PII. Client-side cached data should respect masking.

### Task 3.8: Tenant isolation hardening (E6)

**Scope:** Supabase RLS on all tables, ORM query-scoping interceptor, shared lookup governance.

### Task 3.9: SSO implementation (E7)

**Scope:** SAML 2.0 + OIDC, per-tenant config, JIT provisioning, IdP fallback. SCIM out of scope.
**Requires:** Dedicated design doc before build. Verify Supabase plan supports SSO. Define: domain verification flow, cert rollover handling, JIT collision handling, logout behavior, login discovery UX.
**Revised effort:** 6-8 weeks (realistic for multi-IdP production-grade implementation).

---

### Phase 3 Completion Criteria (defined at planning time)

Each task's detailed breakdown defines its own acceptance criteria. At the phase level:

- Named admin roles restrict access per persona (including compliance_auditor)
- Each persona from spec Section 33 validated via integration test
- Full-write impersonation restricted with action restrictions
- Approval workflows gate configurable sensitive actions
- PII masked per admin role with reveal-on-demand audit
- Tenant data export and purge functional with automated retention enforcement
- Customer-visible admin access audit available to org_owners
- Sensitive data read-logging for admin billing/user views
- Data residency documented
- SSO works with Okta, Azure AD, Google Workspace
- **Competitive benchmark check:** SSO ✓, Admin role decomposition (UI) ✓, Approval workflows ✓, Customer-visible access audit ✓

---

## Phase 4: Maturity

Triggered by operational needs, not scheduled. Each follows the same task format.

| Build                      | Trigger                  | Scope                                               |
| -------------------------- | ------------------------ | --------------------------------------------------- |
| P1: Integration Ops        | Migration engine alpha   | Connection status, sync health, retry controls      |
| P2: Advanced Notifications | Ops team needs Slack     | Slack/webhook destinations, escalation              |
| P3: Bulk Operations        | >200 tenants             | Bulk update, tagging, CSV export, cursor pagination |
| P4: Sandbox Support        | Enterprise UAT need      | Tenant sandbox creation, environment badges         |
| P5: Admin Search           | >10 min/day admin search | Global search, saved views, custom columns          |
| P6: Full Entitlements      | >10 custom contracts     | Contract-backed entitlements, auto-expiration       |
| P7: Maintenance Mode       | First maintenance window | Platform + per-tenant read-only toggle              |

---

## Appendix: Task Quick Reference

### Phase 0 (11 tasks, ~7 hours, 1-2 days)

All independent — max parallelism.

| Task                     | Type     | Review       | Rollout |
| ------------------------ | -------- | ------------ | ------- |
| 0.1 Fix ALL_ROLES        | Bug      | Self         | Direct  |
| 0.2 Fix CreateUserDrawer | Bug      | Self         | Direct  |
| 0.3 CSS borders          | Bug      | Self         | Direct  |
| 0.4 RTL properties       | Bug      | Self         | Direct  |
| 0.5 Duplicate shadow-sm  | Bug      | Self         | Direct  |
| 0.6 Wire canInviteRole   | Security | **Required** | Direct  |
| 0.7 Orphan user role     | Security | **Required** | Direct  |
| 0.8 Refund validation    | Security | **Required** | Direct  |
| 0.9 Null checks + enums  | Security | Self         | Direct  |
| 0.10 Rate limiting       | Security | Self         | Direct  |
| 0.11 Dashboard sections  | UI       | Self         | Direct  |

### Phase 1 (14 tasks, 2-3 weeks elapsed with 2 engineers)

| Task                             | Type         | Review       | Rollout       | Schema | i18n    |
| -------------------------------- | ------------ | ------------ | ------------- | ------ | ------- |
| 1.1 Ticket seeds                 | Mock         | Self         | Direct        | No     | No      |
| 1.2 Coupon seeds                 | Mock         | Self         | Direct        | No     | No      |
| 1.3 MockTicketRepo               | Mock         | Self         | Direct        | No     | No      |
| 1.4 MockCouponRepo               | Mock         | Self         | Direct        | No     | No      |
| 1.5 Reduce LocalAPI              | Arch         | Self         | Direct        | No     | No      |
| 1.6 Isolation audit              | **Security** | **Required** | Direct        | No     | No      |
| 1.7 RLS + immutability           | **Security** | **Required** | **DB Config** | No     | No      |
| 1.8 buildAuditContext            | Refactor     | Self         | Direct        | No     | No      |
| 1.9 Audit expansion              | Feature      | Self         | Direct        | No     | No      |
| 1.10 MFA enforcement             | **Security** | **Required** | **Staged**    | No     | No      |
| 1.11 Live dashboard              | Feature      | Self         | Direct        | No     | **Yes** |
| 1.12 Tenant metrics              | Feature      | Self         | Direct        | No     | **Yes** |
| 1.13 Cross-cutting infra         | Infra        | Self         | Direct        | No     | **Yes** |
| 1.14 Custom branding disposition | Product      | Self         | Direct        | No     | No      |

### Phase 2 (23 tasks including spike, 10-14 weeks with buffer)

| Task                         | Type         | Review                | Rollout    | Schema  | i18n    |
| ---------------------------- | ------------ | --------------------- | ---------- | ------- | ------- |
| 2.0 JWT/auth spike           | Spike        | —                     | —          | No      | No      |
| 2.1 Permission schema        | **Security** | **Required**          | **Staged** | **Yes** | No      |
| 2.2 Permission middleware    | **Security** | **Required**          | **Staged** | No      | No      |
| 2.3 Step-up auth             | **Security** | **Required**          | Direct     | No      | No      |
| 2.4-2.10 Impersonation       | **Security** | **Required**          | **Flag**   | No      | **Yes** |
| 2.11 Audit viewer            | Feature      | Self                  | Direct     | No      | **Yes** |
| 2.12 Overrides service       | Feature      | **Required** (schema) | Direct     | **Yes** | No      |
| 2.13 Overrides UI            | Feature      | Self                  | Direct     | No      | **Yes** |
| 2.14 Lifecycle states        | Feature      | **Required** (schema) | Direct     | **Yes** | **Yes** |
| 2.15 Support ops             | Feature      | Self                  | Direct     | No      | **Yes** |
| 2.16 Job queue               | Feature      | Self                  | Direct     | No      | **Yes** |
| 2.17 Notifications in-app    | Feature      | Self                  | Direct     | **Yes** | **Yes** |
| 2.18 Notifications email     | Feature      | Self                  | Direct     | No      | No      |
| 2.19 Optimistic concurrency  | Infra        | Self                  | Direct     | No      | **Yes** |
| 2.20 Cursor pagination       | Infra        | Self                  | Direct     | No      | No      |
| 2.21 Accessibility (axe)     | Quality      | Self                  | Direct     | No      | No      |
| 2.22 Admin access audit stub | Feature      | Self                  | Direct     | **Yes** | No      |

### Phase 3 (11 epics — detailed breakdown required before execution)

### Phase 4 (7 triggered builds)

**Total: 59 tasks across Phases 0-2 + 11 Enterprise epics + 7 maturity builds.**
