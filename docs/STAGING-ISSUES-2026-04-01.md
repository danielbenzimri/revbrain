# Staging Environment — Issues Deep Dive

> **Date:** 2026-04-01
> **Environment:** stg.revbrain.ai (Supabase Edge Functions / Deno)
> **User:** daniel@gaialabs.ai (role: `org_owner`)
> **Observed:** All admin endpoints return 403; project and billing endpoints return 500
> **Branch sync:** staging was 62 commits behind main — merged and pushed (fast-forward)

---

## Issue 1: Admin Panel Completely Blocked (403 Forbidden)

### Symptom

Every `/v1/admin/*` endpoint returns **403 Forbidden** when logged in as `org_owner`. The entire admin sidebar and dashboard are non-functional.

**Affected endpoints:** `/admin/audit`, `/admin/stats`, `/admin/tenants`, `/admin/users`, `/admin/coupons`, `/admin/support`, `/admin/billing`, `/admin/jobs`, `/admin/overrides`, `/admin/notifications`, `/admin/onboard`

### Root Cause

All admin routes (11 of 13) use `requireRole('system_admin')` — a strict role check that only passes for users with `role === 'system_admin'`. The `org_owner` role fails this check.

```typescript
// apps/server/src/middleware/rbac.ts:12-29
export function requireRole(...allowedRoles: UserRole[]) {
  return createMiddleware(async (c, next) => {
    const user = c.get('user');
    if (!allowedRoles.includes(user.role as UserRole)) {
      throw new AppError(ErrorCodes.FORBIDDEN, '...', 403);
    }
    await next();
  });
}
```

### Two Authorization Systems in Conflict

The codebase has **two** authorization systems:

| System | Middleware | Used By | Status |
|--------|-----------|---------|--------|
| **Role-based (RBAC)** | `requireRole('system_admin')` | 11 of 13 admin routes | Legacy — blocks org_owner |
| **Permission-based** | `requireAdminPermission()` | Only `impersonate.ts` | New — migration incomplete |

The permission-based system (`apps/server/src/middleware/admin-permissions.ts`) resolves permissions from `admin_role_assignments` + `admin_role_definitions` tables, with backward compatibility: `system_admin` without explicit assignment gets wildcard `['*']`. But `org_owner` has no mapping in this system either.

### Affected Routes (exact middleware per file)

| Route File | Middleware | Line |
|-----------|-----------|------|
| `admin/users.ts` | `requireRole('system_admin')` | 29 |
| `admin/billing.ts` | `requireRole('system_admin')` | 36 |
| `admin/stats.ts` | `requireRole('system_admin')` | 24 |
| `admin/audit.ts` | `requireRole('system_admin')` | route-level |
| `admin/coupons.ts` | `requireRole('system_admin')` | route-level |
| `admin/jobs.ts` | `requireRole('system_admin')` | 30 |
| `admin/support.ts` | `requireRole('system_admin')` | 32 |
| `admin/tenants.ts` | `requireRole('system_admin')` | 28 |
| `admin/overrides.ts` | `requireRole('system_admin')` | 33 |
| `admin/notifications.ts` | `requireRole('system_admin')` | 35 |
| `admin/onboarding.ts` | `requireRole('system_admin')` | 24 |
| **`admin/impersonate.ts`** | **`requireAdminPermission('impersonate:read_only')`** | 42 |

### Client-Side Also Hardcoded

The client mirrors the same assumption:

```typescript
// apps/client/src/components/layout/sidebar.tsx:45
const isSystemAdmin = user?.role === 'system_admin';

// apps/client/src/app/router.tsx:162-167
<ProtectedRoute requiredRoles={['system_admin']}>
```

An `org_owner` user won't even see the admin sidebar items. Even if the API was fixed, the client would still hide admin UI.

### Fix Options

**Option A — Quick fix: Allow org_owner in role check**
- Change all admin routes to `requireRole('system_admin', 'org_owner')`
- Update client sidebar and router guards to include `org_owner`
- Pros: Fast, minimal change
- Cons: Doesn't leverage the granular permission system

**Option B — Complete migration to permission-based system**
- Replace `requireRole('system_admin')` with `requireAdminPermission()` on all admin routes
- Add `org_owner` → `super_admin` mapping in permission resolution (or create role assignments)
- Update client to check permissions, not roles
- Pros: Uses the system that was designed for this, future-proof
- Cons: Larger change, needs careful testing

**Option C — Hybrid (recommended)**
- Add `org_owner` to the `requireRole()` calls as an immediate fix
- Plan the permission migration as a separate task
- Update client guards to include `org_owner`

---

## Issue 2: Project Endpoints Return 500 (Stub Repositories on Edge)

### Symptom

All `/v1/projects/{projectId}/*` sub-endpoints return **500 Internal Server Error**. The Overview page shows "No data available yet" and the console shows repeated 500s from `OverviewPage-BEenl9zF.js` and `AssessmentPage-CuRnt-H1.js`.

### Root Cause

On the Edge Function (Deno), the repository middleware correctly selects **PostgREST** mode. But PostgREST repositories only have real implementations for 5 tables. The remaining 5 are **stubs that throw on every method call**:

```typescript
// apps/server/src/repositories/postgrest/index.ts:38-51
export function createPostgRESTRepositories(supabase: SupabaseClient): Repositories {
  return {
    // Real implementations:
    users: new PostgRESTUserRepository(supabase),
    organizations: new PostgRESTOrganizationRepository(supabase),
    plans: new PostgRESTPlanRepository(supabase),
    auditLogs: new PostgRESTAuditLogRepository(supabase),
    projects: new PostgRESTProjectRepository(supabase),

    // STUBS — all throw on every call:
    salesforceConnections: new StubSalesforceConnectionRepository(),
    salesforceConnectionSecrets: new StubSalesforceConnectionSecretsRepository(),
    oauthPendingFlows: new StubOauthPendingFlowRepository(),
    salesforceConnectionLogs: new StubSalesforceConnectionLogRepository(),
    assessmentRuns: new StubAssessmentRepository(),
  };
}
```

The stubs throw a raw `Error` (not `AppError`), which the global error handler catches as a generic 500:

```typescript
// apps/server/src/repositories/salesforce-stubs.ts:19-23
const NOT_IMPLEMENTED = 'Salesforce repository not yet implemented — see Task 1.6/1.7';
function stub(): never {
  throw new Error(NOT_IMPLEMENTED);
}
```

### Call Chain That Triggers 500s

When the client loads the Overview page for a project:

1. **`GET /v1/projects/{id}/salesforce/connections`** (from `useSalesforceConnections` hook)
   - Route handler calls `repos.salesforceConnections.findByProject(projectId)` → stub throws
   - Also calls `repos.oauthPendingFlows.findLiveByProjectAndRole()` → stub throws
   - File: `apps/server/src/v1/routes/salesforce.ts:548`

2. **`GET /v1/projects/{id}/assessment/status`** (from `useAssessmentRun` hook)
   - Route handler calls `repos.assessmentRuns.findLatestRunByProject()` → stub throws
   - File: `apps/server/src/v1/routes/assessment.ts:313`

3. **`GET /v1/projects/{id}/assessment/runs`** (from assessment page)
   - Route handler calls `repos.assessmentRuns.findRunsByProject()` → stub throws

### Additional Edge Compatibility Risk: Node.js Imports

Several route files import Node.js built-in modules at the top level:

| File | Import | Risk on Deno |
|------|--------|-------------|
| `routes/assessment.ts:14` | `import { spawn } from 'node:child_process'` | May fail on Edge |
| `routes/assessment.ts:15-16` | `import { resolve, dirname } from 'node:path'` | May fail on Edge |
| `routes/salesforce.ts:12` | `import crypto from 'node:crypto'` | May fail on Edge |
| `routes/webhooks.ts:17` | `import { timingSafeEqual } from 'node:crypto'` | May fail on Edge |
| `lib/encryption.ts:15` | `import crypto from 'node:crypto'` | May fail on Edge |

If Deno's Node.js compatibility layer handles these, the imports won't crash. But if any fail, the entire route module (and potentially the whole API) would fail to load.

### Fix Options

**Option A — Implement PostgREST repositories for Salesforce + Assessment**
- Write real PostgREST implementations for the 5 stubbed repos
- Pros: Full Edge Function support
- Cons: Significant work (5 repositories, each with multiple methods)

**Option B — Graceful degradation for stubs**
- Replace stubs with implementations that return empty results instead of throwing
- e.g., `findByProject() → []`, `findLatestRunByProject() → null`
- Pros: Fast fix, pages load without errors, show "no data" states
- Cons: Salesforce/assessment features still non-functional on Edge

**Option C — Route-level Edge guards (recommended short-term)**
- Add middleware or guards on Salesforce/assessment routes that return a proper error response on Edge
- e.g., `{ success: false, error: { code: 'FEATURE_NOT_AVAILABLE', message: 'This feature requires direct database access' } }`
- Client handles this gracefully (shows "not available" instead of error)

---

## Issue 3: Billing Subscription Returns 500

### Symptom

`GET /v1/billing/subscription` returns **500 Internal Server Error**.

### Root Cause

`BillingService` bypasses the repository layer entirely and uses a lazy `getDb()` function that dynamically imports `@revbrain/database/client` (postgres.js / Drizzle):

```typescript
// apps/server/src/services/billing.service.ts:31-39
let _db: DrizzleDB | null = null;
async function getDb(): Promise<DrizzleDB> {
  if (!_db) {
    const { db } = await import('@revbrain/database/client');
    _db = db;
  }
  return _db;
}
```

On the Edge Function:
1. The repository middleware selected PostgREST — `initDB()` was never called
2. The `db` proxy in `@revbrain/database/client` throws `"Database not initialized"` if accessed before `initDB()`
3. Even if `initDB()` were called, `postgres.js` can't establish TCP connections from Deno Edge Functions (this is why PostgREST was built in the first place)

The subscription route doesn't guard against this:

```typescript
// apps/server/src/v1/routes/billing.ts:176-187
async (c) => {
  const user = c.get('user');
  const billingService = new BillingService();
  const result = await billingService.getSubscription(user.organizationId);
  // ↑ Calls getDb() → fails on Edge
  return c.json({ success: true, data: result });
}
```

Unlike checkout/portal/cancel routes which check `isStripeConfigured()` first, the subscription route has no guard.

### Other Services With Same Pattern

Any service that uses `getDb()` or directly imports from `@revbrain/database/client` will fail on Edge:

| Service | Pattern | Risk |
|---------|---------|------|
| `billing.service.ts` | `getDb()` lazy import | Fails on Edge — all billing DB operations |
| `coupon.service.ts` | Likely same pattern | Needs verification |
| `salesforce-oauth.service.ts` | Uses repos (safe) | OK |
| `onboarding.service.ts` | Uses `withTransaction()` | Has PostgREST fallback (fixed earlier) |

### Fix Options

**Option A — Add Stripe/billing guard**
- The subscription route should check `isStripeConfigured()` and return `{ subscription: null, plan: null }` if not configured
- Stripe is noted as "not configured yet" in tech debt — this is expected behavior
- Pros: Fast, correct (billing IS non-functional per tech debt doc)
- Cons: Doesn't fix the underlying Edge/Drizzle bypass

**Option B — Route billing queries through PostgREST repos**
- Add a `subscriptions` PostgREST repository
- Refactor `BillingService.getSubscription()` to use repos
- Pros: Edge-compatible
- Cons: More work, may conflict with eventual Stripe integration

**Option C — Return stub response on Edge (recommended)**
- Detect Edge runtime in billing routes and return a "billing not available" response
- Client shows "Subscription: Free tier" or similar

---

## Issue 4: Error Handling Gap (Stubs throw raw Error, not AppError)

### Symptom

500 errors return generic `{ code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' }` — no indication of what actually failed.

### Root Cause

The stubs throw `new Error(...)`, not `new AppError(...)`. The global error handler distinguishes between these:

- `AppError` → structured JSON response with specific error code and status
- Raw `Error` → generic 500 with no useful information (especially in production where `err.message` is hidden)

### Fix

Replace stub implementations with proper `AppError` throws:

```typescript
function stub(): never {
  throw new AppError(
    'FEATURE_NOT_AVAILABLE',
    'This feature is not available in the current deployment mode',
    503
  );
}
```

Or better: return empty/null results instead of throwing (see Issue 2, Option B).

---

## Summary: Priority and Effort

| # | Issue | Impact | Effort | Priority |
|---|-------|--------|--------|----------|
| 1 | Admin 403 — role check blocks org_owner | **Critical** — entire admin panel broken | Small (add role to checks) | P0 |
| 2 | Project 500 — stub repos throw on Edge | **High** — project pages broken on staging | Medium (graceful degradation) | P0 |
| 3 | Billing 500 — direct DB access on Edge | **Medium** — billing page broken (but billing is non-functional anyway) | Small (add guard) | P1 |
| 4 | Error handling — stubs throw raw Error | **Low** — poor DX, no user impact beyond existing 500s | Small (change throw type) | P2 |

### Recommended Fix Order

1. **Fix Issue 1** — Add `org_owner` to `requireRole()` calls + update client guards
2. **Fix Issue 2** — Replace stubs with graceful empty-result implementations
3. **Fix Issue 3** — Add `isStripeConfigured()` guard to subscription route
4. **Fix Issue 4** — Improve error types in remaining stubs

### Longer-Term Items (separate tasks)

- Migrate all admin routes from `requireRole()` to `requireAdminPermission()`
- Implement real PostgREST repositories for Salesforce + Assessment
- Refactor `BillingService` to use repository layer instead of direct DB access
- Audit all `node:*` imports for Edge compatibility
