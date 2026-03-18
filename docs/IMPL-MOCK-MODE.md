# RevBrain — Mock Mode Implementation Plan

> **Spec**: [SPEC-MOCK-MODE.md](SPEC-MOCK-MODE.md) (v3 FINAL)
>
> **Structure**: 4 phases, 17 tasks. Each task is one commit.
>
> **Commit protocol**: Before each commit — `pnpm format && pnpm lint && pnpm test`. Zero errors required. Then commit, push, move to next task.
>
> **Version**: v4 FINAL — incorporates three rounds of external audit feedback.

---

## Context

RevBrain is a multi-tenant SaaS platform with a hexagonal architecture. Data access flows through a `Repositories` interface injected via middleware. Route handlers call `c.var.repos.projects.findByOrganization()` — they never know the underlying data source.

Today, the only implementation is `createDrizzleRepositories()` which requires PostgreSQL. This plan adds `createMockRepositories()` — an in-memory alternative that requires nothing. One environment variable (`USE_MOCK_DATA=true`) switches between them. Route handlers remain unchanged.

### Key discovery: `withTransaction`

`withTransaction()` is a standalone function in `apps/server/src/repositories/drizzle/index.ts`. It imports `defaultDb` directly, which triggers a PostgreSQL connection via a lazy Proxy. Two services use it: `user.service.ts` and `onboarding.service.ts`.

**Solution**: Move `withTransaction` to a repository-agnostic module (`apps/server/src/repositories/with-transaction.ts`) that delegates to mock or Drizzle based on environment. Neither implementation knows about the other. This is addressed in Task 5.

### Server port: 3000

The dev server runs on port 3000. All env configs and docs use 3000.

### Mock ID sharing strategy

**Decision**: Duplicate IDs in both server and client with a cross-reference comment. Moving to `@revbrain/contract` would pollute the contract package with dev-only constants. A separate shared package is overkill for a constants file. An automated parity test (`mock-ids-parity.test.ts`) compares both files to catch drift — added in Task 12.

### Repository interfaces: 5 repos, ~52 methods

| Repository               | Methods | Key operations                                                                                        |
| ------------------------ | ------- | ----------------------------------------------------------------------------------------------------- |
| `UserRepository`         | 12      | CRUD + findByEmail, findBySupabaseId, findByOrganization, activate/deactivate, updateLastLogin        |
| `OrganizationRepository` | 12      | CRUD + findBySlug, findWithPlan, increment/decrementSeatUsed, tryIncrementSeatUsed, updateStorageUsed |
| `PlanRepository`         | 10      | CRUD + findByCode, findByName, findActive, findPublic                                                 |
| `AuditLogRepository`     | 7       | create + findMany, count, findByOrganization/User/Action/TargetUser                                   |
| `ProjectRepository`      | 9       | CRUD + findByOwner, findByOrganization, countByOrganization                                           |

### RBAC discovery note

The spec's verification criteria include "operator sees assigned projects only" and "reviewer sees read-only view." Task 7 verifies whether existing route guards implement this filtering. If the filtering does not exist, implementing basic assigned-project filtering for operator/reviewer is in scope under Task 7. The criteria are not weakened — they are delivered.

---

## Phase 1: Server Foundation (Tasks 1–7)

Goal: Server boots in mock mode and responds to API calls with mock data.

### Task 1: Production safety guard + env config + dev scripts

**Goal**: Server refuses to start with invalid mock config. Dev scripts default to mock mode.

**Files to create**:

- `apps/server/src/lib/mock-mode-guard.ts` — Pure functions: `validateMockModeConfig(env)`, `isMockMode(env)`

**Files to modify**:

- `apps/server/src/index.ts` — Import and call guard at top
- `apps/server/package.json` — `dev` script adds mock env vars, add `dev:real` script
- `package.json` (root) — Add `dev:real` script
- `.env.example` — Document `USE_MOCK_DATA`, `AUTH_MODE`
- `.gitignore` — Ensure `.env.local` is listed

**Implementation**:

```typescript
// apps/server/src/lib/mock-mode-guard.ts
export function validateMockModeConfig(env: Record<string, string | undefined>): void {
  const useMock = env.USE_MOCK_DATA === 'true';
  const mockAuth = env.AUTH_MODE === 'mock';
  const appEnv = env.APP_ENV || '';

  if ((useMock || mockAuth) && ['production', 'staging'].includes(appEnv)) {
    throw new Error('FATAL: Mock mode cannot be enabled in production or staging.');
  }
  if (useMock !== mockAuth) {
    throw new Error(
      'FATAL: USE_MOCK_DATA=true requires AUTH_MODE=mock, and USE_MOCK_DATA=false requires AUTH_MODE=jwt.'
    );
  }
}

export function isMockMode(env: Record<string, string | undefined>): boolean {
  return env.USE_MOCK_DATA === 'true';
}
```

**Startup logging** (in `index.ts` — first two lines; third line added in Task 8 when endpoint is registered):

```
[MOCK MODE] Running with in-memory data. No database connected.
[MOCK MODE] Auth: mock tokens (no JWT verification)
```

**Tests** (`apps/server/src/lib/mock-mode-guard.test.ts`):

- `local` + mock → no error
- `local` + real → no error
- `production` + mock → throws
- `staging` + mock → throws
- `USE_MOCK_DATA=true` + `AUTH_MODE=jwt` → throws
- `USE_MOCK_DATA=false` + `AUTH_MODE=mock` → throws
- `isMockMode` returns correct boolean

---

### Task 2: Mock data files + shared constants

**Goal**: Realistic seed data for all entities. Canonical mock IDs exported as constants.

**Files to create**:

- `apps/server/src/mocks/constants.ts` — All deterministic UUIDs
- `apps/server/src/mocks/helpers.ts` — `daysAgo()`, `hoursAgo()`, deep clone via `structuredClone()`
- `apps/server/src/mocks/plans.ts` — 3 plans
- `apps/server/src/mocks/organizations.ts` — 2 orgs
- `apps/server/src/mocks/users.ts` — 8 users (7 active + 1 invited-pending)
- `apps/server/src/mocks/projects.ts` — 4 projects (one with long name for text truncation testing)
- `apps/server/src/mocks/audit-logs.ts` — 10 entries
- `apps/server/src/mocks/index.ts` — Central export + `resetAllMockData()`

**Data design** (8 users — spec says 7, pending user makes 8):

| Entity     | Count | Details                                                                                                                                                              |
| ---------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plans      | 3     | Starter (free, 5 users, 3 projects), Pro ($99/mo, 25 users, unlimited), Enterprise ($499/mo, unlimited, SSO)                                                         |
| Orgs       | 2     | Acme Corp (Pro, 4/25 seats — pending user not counted), Beta Industries (Starter, 2/5 seats)                                                                         |
| Users      | 8     | system_admin (1), Acme: owner + admin + operator + reviewer + pending (5), Beta: owner + operator (2)                                                                |
| Projects   | 4     | All Acme. At least one owned by operator user (for assigned-project testing). One with long name: "Q1 Enterprise Product Catalog Migration — Revenue Cloud Advanced" |
| Audit Logs | 10    | Mix of user.invited, project.created, project.updated, tenant.onboarded                                                                                              |

**Reset**: `resetAllMockData()` uses `structuredClone()` to deep-clone immutable seed snapshots.

**Tests** (`apps/server/src/mocks/mocks.test.ts`):

- All arrays non-empty and typed correctly
- Cross-reference integrity (user→org, project→org+owner)
- `MOCK_IDS` values are valid UUIDs
- `resetAllMockData()` restores state after mutations
- Deep clone: mutating returned entity doesn't affect seed

---

### Task 3: Mock repositories — PlanRepository + AuditLogRepository + shared helpers

**Goal**: First two repos + shared helpers. Establishes implementation pattern.

**Files to create**:

- `apps/server/src/repositories/mock/helpers.ts` — `applyPagination()`, `applySorting()`, `generateId()`, `validateFilters()`
- `apps/server/src/repositories/mock/plan.repository.ts` — 10 methods
- `apps/server/src/repositories/mock/audit-log.repository.ts` — 7 methods

**Filter validation** (from spec: "unsupported query shapes fail loudly"). Repo-specific, not global:

```typescript
export function validateFilters(
  filters: Record<string, unknown>,
  allowedKeys: readonly string[],
  repoName: string
): void {
  for (const key of Object.keys(filters)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(
        `[MOCK ${repoName}] Unsupported filter: "${key}". Allowed: ${allowedKeys.join(', ')}`
      );
    }
  }
}
```

Each repo defines its own allowed filters:

- **Plans**: `['isActive', 'isPublic']`
- **Users**: `['organizationId', 'role', 'isActive', 'email']`
- **Orgs**: `['isActive']`
- **AuditLogs**: `['organizationId', 'userId', 'action', 'targetUserId']`
- **Projects**: `['organizationId', 'status', 'ownerId']`

**Tests**:

- `apps/server/src/repositories/mock/plan.repository.test.ts` — All 10 methods
- `apps/server/src/repositories/mock/audit-log.repository.test.ts` — All 7 methods
- `apps/server/src/repositories/mock/helpers.test.ts` — pagination, sorting, filter validation (throws on unknown key)

---

### Task 4: Mock repositories — UserRepository + OrganizationRepository

**Goal**: The two interdependent repos.

**Files to create**:

- `apps/server/src/repositories/mock/user.repository.ts` — 12 methods
- `apps/server/src/repositories/mock/organization.repository.ts` — 12 methods

**Key methods**: `findWithPlan` joins with plan store, `tryIncrementSeatUsed` checks limits, `activate`/`deactivate` set flags + timestamps.

**Tests**:

- `apps/server/src/repositories/mock/user.repository.test.ts` — All 12 methods (tenant isolation, activate/deactivate, updateLastLogin)
- `apps/server/src/repositories/mock/organization.repository.test.ts` — All 12 methods (findBySlug, findWithPlan, seat management)

---

### Task 5: Mock repositories — ProjectRepository + factory + withTransaction

**Goal**: Final repo, factory, reset, and mock-aware `withTransaction` in a neutral module.

**Files to create**:

- `apps/server/src/repositories/mock/project.repository.ts` — 9 methods
- `apps/server/src/repositories/mock/index.ts` — `createMockRepositories()`, `resetMockData()`, `mockWithTransaction()`
- `apps/server/src/repositories/with-transaction.ts` — Mode-aware `withTransaction` (neutral location)

**`withTransaction` architecture**: Move out of Drizzle directory to prevent cross-dependency:

```typescript
// apps/server/src/repositories/with-transaction.ts
import { isMockMode } from '../lib/mock-mode-guard.ts';

export async function withTransaction<T>(
  callback: (repos: Repositories) => Promise<T>
): Promise<T> {
  if (isMockMode(process.env)) {
    const { mockWithTransaction } = await import('./mock/index.ts');
    return mockWithTransaction(callback);
  }
  const { drizzleWithTransaction } = await import('./drizzle/index.ts');
  return drizzleWithTransaction(callback);
}
```

**Files to modify**:

- `apps/server/src/repositories/drizzle/index.ts` — Rename `withTransaction` to `drizzleWithTransaction`, export both names for backward compat during transition
- `apps/server/src/services/user.service.ts` — Update import: `from '../repositories/with-transaction.ts'` (was `from '../repositories/drizzle/index.ts'`)
- `apps/server/src/services/onboarding.service.ts` — Same import change
- `apps/server/src/services/user.service.test.ts` — Update mock path for `withTransaction`

**Update** `packages/contract/src/repositories/types.ts`:

```typescript
export type RepositoryEngine = 'drizzle' | 'supabase' | 'mock';
```

**Tests**:

- `apps/server/src/repositories/mock/project.repository.test.ts` — All 9 methods
- Factory test: `createMockRepositories()` returns all 5 repos
- `resetMockData()` restores all stores
- `mockWithTransaction` executes callback and returns result
- TypeScript compilation verifies all 52 methods implemented

---

### Task 6: Repository middleware update

**Goal**: Middleware switches between mock and Drizzle. Singleton for mock.

**Files to modify**:

- `apps/server/src/repositories/middleware.ts`

**Implementation**:

```typescript
const useMock = isMockMode(process.env);
const mockRepos = useMock ? createMockRepositories() : null;

export function repositoryMiddleware(options = {}) {
  return createMiddleware(async (c, next) => {
    if (mockRepos) {
      c.set('repos', mockRepos);
      c.set('engine', 'mock');
    } else {
      c.set('repos', createDrizzleRepositories());
      c.set('engine', selectEngine(options));
    }
    await next();
  });
}
```

**DB init guard**: Lazy Proxy in `@revbrain/database` only connects when accessed. Mock mode never accesses it. `withTransaction` (Task 5) prevents services from triggering it. Verified by Task 9 smoke test.

**Tests** (`apps/server/src/repositories/middleware.test.ts`):

- Mock mode: sets mock repos + engine='mock'
- Real mode: sets Drizzle repos (mocked) + engine='drizzle'
- Singleton: same mock repos instance across calls

---

### Task 7: Auth middleware mock mode

**Goal**: `AUTH_MODE=mock` parses `mock_token_{userId}`, returns 401 for invalid tokens, defaults to Acme org_owner when no header.

**Files to create**:

- Helper function `createMockJwtPayload(user)` — in `apps/server/src/middleware/auth.ts` (or separate file)

**Files to modify**:

- `apps/server/src/middleware/auth.ts`

**`createMockJwtPayload` implementation**:

```typescript
function createMockJwtPayload(user: UserEntity): SupabaseJWTPayload {
  return {
    sub: user.supabaseUserId || user.id,
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    user_metadata: { full_name: user.fullName, role: user.role },
    app_metadata: { provider: 'email' },
  };
}
```

**Auth behavior**:

- No auth header → default to Acme org_owner (convenience)
- Valid `mock_token_{userId}` → set correct user
- Invalid/malformed token → 401 (catches broken client)
- Nonexistent userId → 401

**RBAC delivery**: While implementing, verify whether existing route guards filter projects for operator/reviewer roles. If filtering exists, verify it works with mock data. If it does not exist, implement basic assigned-project filtering: operator sees only projects where `ownerId` matches their user ID; reviewer sees all org projects but cannot access mutation endpoints. This is in scope for this task.

**Tests** (extend `apps/server/src/middleware/auth.test.ts`):

- No header → sets Acme org_owner
- Valid mock token → sets correct user
- Nonexistent ID → 401
- Malformed token → 401
- Empty Bearer → 401
- Mock JWT payload has correct shape

---

## Phase 2: Verification + Reset (Tasks 8–11)

### Task 8: Dev reset endpoint

**Goal**: `POST /v1/dev/reset-mock-data` resets data. Conditionally registered. Excluded from OpenAPI.

**Files to modify**: `apps/server/src/v1/routes/dev.ts`

**Implementation**: Use `devRouter.post()` (not `.openapi()`) for OpenAPI exclusion:

```typescript
if (isMockMode(process.env) && getEnv('APP_ENV', '') === 'local') {
  devRouter.post('/reset-mock-data', async (c) => {
    resetMockData();
    return c.json({ success: true, message: 'Mock data reset to seed state' });
  });
  console.log('[MOCK MODE] Reset endpoint: POST /v1/dev/reset-mock-data');
}
```

Startup logging is now complete across Task 1 (lines 1-2) + Task 8 (line 3).

**Tests**:

- Mock mode: POST returns 200
- Mutation-before-reset: create entity → verify → reset → verify seed restored
- Non-mock mode: 404

---

### Task 9: Integration smoke test

**Goal**: Full server flow verified: startup → auth → repo → response.

**Files to create**: `apps/server/src/integration/mock-mode.test.ts`

Uses `app.request()` (in-process, fast):

```typescript
describe('Mock mode integration', () => {
  it('health endpoint works');
  it('default auth returns Acme org_owner data (4 projects)');
  it('Beta org_owner sees 0 projects (tenant isolation)');
  it('invalid mock token returns 401');
  it('creating a project also creates an audit log entry');
  it('no Drizzle repos created in mock mode', () => {
    // Spy on createDrizzleRepositories — verify never called
  });
  it('project detail endpoint returns single project', () => {
    // GET /v1/projects/{MOCK_IDS.PROJECT_Q1_MIGRATION} → 200
  });
});
```

---

### Task 10: Contract test infrastructure

**Goal**: Shared test suite for all 5 repos, running against mock repos now and Drizzle later.

**Files to create**:

- `apps/server/src/repositories/contract-tests/project.contract.ts`
- `apps/server/src/repositories/contract-tests/user.contract.ts`
- `apps/server/src/repositories/contract-tests/organization.contract.ts`
- `apps/server/src/repositories/contract-tests/plan.contract.ts`
- `apps/server/src/repositories/contract-tests/audit-log.contract.ts`
- `apps/server/src/repositories/contract-tests/run-mock.test.ts`
- `apps/server/src/repositories/contract-tests/run-drizzle.test.ts` (placeholder, skips without `TEST_DATABASE_URL`)

Each contract file exports a function: `xxxContractTests(getRepos, resetData)`. Tests cover:

**Generic CRUD** (all repos):

- create → findById round-trip
- findMany with limit/offset
- update → verify changed fields
- delete → findById returns null

**Repo-specific parity** (at least one method per repo):

- Plans: `findPublic` returns only public plans
- Users: `findByEmail` returns correct user or null
- Organizations: `findWithPlan` returns org with plan data joined
- AuditLogs: `findByAction` returns entries matching action string
- Projects: `countByOrganization` returns correct count, `findByOrganization` scoping

Contract tests against mock: run always. Against Drizzle: run only when `TEST_DATABASE_URL` is set.

---

### Task 11: Admin endpoint verification

**Goal**: Verify admin panel endpoints return mock data for system_admin.

**Add to** `apps/server/src/integration/mock-mode.test.ts`:

```typescript
it('system_admin sees tenants in admin panel', async () => {
  const res = await app.request('/v1/admin/tenants', {
    headers: { Authorization: `Bearer mock_token_${MOCK_IDS.USER_SYSTEM_ADMIN}` },
  });
  expect(res.status).toBe(200);
  // Verify 2 orgs returned
});

it('system_admin sees users', async () => { ... });
it('system_admin sees plans', async () => { ... });
```

---

## Phase 3: Client Integration (Tasks 12–14)

### Task 12: Sync client IDs + auto-login + mock detection + banner

**Goal**: Client IDs match server. Auto-login works. Banner shown.

**Files to create**:

- `apps/client/src/lib/mock-ids.ts` — Duplicate of server `MOCK_IDS` with cross-reference comment:
  ```typescript
  // These IDs must match apps/server/src/mocks/constants.ts
  // If you update one, update the other.
  ```

**Files to modify**:

- `apps/client/src/lib/mock-data.ts` — Update user IDs to match `MOCK_IDS`
- `apps/client/src/stores/auth-store.ts` — Add auto-login logic in `initialize()` when `VITE_AUTH_MODE=mock`
- `apps/client/src/lib/services/index.ts` — Check `VITE_AUTH_MODE` for adapter selection
- `apps/client/src/components/layout/header.tsx` — Add mock mode badge + role indicator
- `apps/client/src/lib/adapters/local/auth.ts` — Verify tokens work with new IDs

**Auto-login mechanism**: In the auth store's `initialize()` method. When `VITE_AUTH_MODE=mock` and no session exists, call `LocalAuthAdapter.login()` with the org_owner email. This fires before route rendering — user never sees login page.

**Role indicator**: The header already shows the user's role from `ROLE_DISPLAY_NAMES`. Verify it displays correctly after role switching.

**Tests**:

- `apps/client/src/lib/services.test.ts` — Mock mode returns LocalAuthAdapter
- `apps/client/src/lib/adapters/local/auth.test.ts` — New IDs produce correct tokens
- `apps/client/src/components/layout/header.test.tsx` (create) — Badge renders in mock mode, hidden otherwise
- `apps/server/src/mocks/mock-ids-parity.test.ts` (create) — Lives in the server package (broader module resolution). Reads the client `mock-ids.ts` file as text, parses exported values, and compares against `MOCK_IDS` from `constants.ts`. Catches drift automatically without requiring cross-package TypeScript imports.

---

### Task 13: Dashboard fetches API data

**Goal**: Dashboard shows project counts + recent audit log activity.

**Files to modify**: `apps/client/src/features/dashboard/pages/DashboardPage.tsx`

**Implementation**:

- Use `useProjectsList()` for project stats (total, active, completed, needs attention)
- For recent activity: show last updated projects sorted by `updatedAt` (the data already exists from the projects fetch — no separate audit log endpoint needed). Display as "Recent Activity" cards with project name, status, and time ago.
- If a dedicated audit log list endpoint is needed later, it can be added — but the dashboard has real content now.
- Show loading spinner, handle empty state

**Tests** (`apps/client/src/features/dashboard/pages/DashboardPage.test.tsx`):

- Loading state renders
- Correct counts with mock data
- Empty list shows zeros

---

### Task 14: Role switcher + client env + project detail verification

**Goal**: Role switching works end-to-end. Client `.env.local` created. Project detail verified.

**Files to create**:

- `apps/client/.env.local` — Client-side mock env (Vite reads `.env.local` from the Vite project root, which is `apps/client/`):
  ```bash
  VITE_API_URL=http://localhost:3000
  VITE_AUTH_MODE=mock
  ```
  Note: Server-side env vars (`USE_MOCK_DATA`, `AUTH_MODE`, `APP_ENV`) are passed inline by the `dev` script — no server `.env.local` needed.

**Files to modify**:

- `apps/client/src/features/auth/pages/LoginPage.tsx` — Verify role simulation uses correct IDs
- `apps/client/package.json` — Add `dev:real` script

**`dev:real` client switching**:

```json
// apps/client/package.json
"dev:real": "VITE_AUTH_MODE=jwt vite"
```

Developers switching to real mode run `pnpm dev:real` which overrides `VITE_AUTH_MODE` via env var (takes precedence over `.env.local`). No need to delete the file.

**Project detail**: Task 9's integration test already verifies `GET /v1/projects/:id` returns data. Client `OverviewPage.tsx` uses `useProject(id)` which calls this endpoint. If it renders — it works.

**Tests** (`apps/client/src/features/auth/pages/LoginPage.test.tsx` — create):

- All 5 roles render in switcher
- Clicking a role calls `simulateRole`

---

## Phase 4: Documentation + Final (Tasks 15–17)

### Task 15: Update README

**Goal**: README explains mock mode with port 3000. Includes hot reload note.

**Content**: Quick start, role switching, reset endpoint, real mode instructions, hot reload behavior note.

---

### Task 16: Update docs

**Goal**: MIGRATION-CHANGELOG and STEP-0 reflect mock mode.

---

### Task 17: Final verification + cleanup

**Goal**: Full suite passes. All spec criteria met.

**Automated checks**:

1. `pnpm format` — clean
2. All 4 packages lint — 0 errors, no new warnings
3. All tests pass
4. Remove dead code/unused imports
5. `grep -rn 'USE_MOCK_DATA\|AUTH_MODE' apps/server/src/v1/routes/` — verify route handlers do NOT branch on mock mode (architectural invariant)

**Spec verification checklist**:

- [ ] `pnpm dev` starts with zero configuration
- [ ] All 3 startup log lines appear (`in-memory data`, `mock tokens`, `reset endpoint`)
- [ ] Auto-login as org_owner
- [ ] Dashboard shows project counts and recent activity
- [ ] Projects page lists 4 projects
- [ ] Project detail renders with dates and status
- [ ] Operator role shows assigned projects only
- [ ] Reviewer role shows read-only view
- [ ] Beta org_owner shows empty dashboard and zero projects (tenant isolation)
- [ ] System_admin sees tenants, users, plans in admin panel
- [ ] `[MOCK MODE]` badge + role indicator in header
- [ ] Reset endpoint restores seed state
- [ ] Server refuses `AUTH_MODE=mock` + `APP_ENV=production`
- [ ] Server refuses `USE_MOCK_DATA=true` + `AUTH_MODE=jwt`
- [ ] All tests pass
- [ ] No new ESLint warnings
- [ ] No route handlers branch on mock mode (`grep` check)

**Manual QA**:

1. `pnpm dev` → auto-login → dashboard with data
2. Projects page → click project → detail page
3. Switch to each role → verify appropriate view
4. Switch to Beta org_owner → verify empty state
5. Switch to system_admin → verify admin panel
6. POST reset → verify data restored
7. Restart server → verify clean state

---

## Summary

| Phase                   | Tasks        | Goal                                                   | New files     | Modified files |
| ----------------------- | ------------ | ------------------------------------------------------ | ------------- | -------------- |
| 1: Server Foundation    | 1–7          | Server boots and serves mock data                      | ~18           | ~8             |
| 2: Verification + Reset | 8–11         | Reset, smoke tests, contract tests, admin verification | ~9            | ~1             |
| 3: Client Integration   | 12–14        | Auto-login, dashboard, role switching                  | ~4            | ~8             |
| 4: Docs + Final         | 15–17        | Documented, verified, clean                            | 0             | ~4             |
| **Total**               | **17 tasks** |                                                        | **~31 files** | **~21 files**  |

Each task is one commit. Each commit is format + lint + test clean. No broken intermediate states.
