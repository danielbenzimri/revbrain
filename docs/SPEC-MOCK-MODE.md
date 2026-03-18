# RevBrain — Mock Mode Specification

> **Status**: PROPOSED (v2 — incorporates external audit feedback)
>
> **Author**: Engineering
>
> **Reviewers**: External audit
>
> **Goal**: Enable the full RevBrain UI to run with realistic data and no external dependencies (no Supabase, no PostgreSQL, no Stripe), so the team can develop, demo, and iterate on the product before connecting to a live backend.

---

## 1. Context

### What is RevBrain?

RevBrain is a multi-tenant SaaS platform for migrating Salesforce CPQ configurations to Revenue Cloud Advanced (RCA). It was forked from a construction management platform (Geometrix) and has been stripped of all domain-specific features, leaving a clean SaaS shell.

### Where are we now?

The platform has a working **envelope** — the infrastructure that surrounds the product but is not the product itself:

| Layer     | Status      | Details                                                         |
| --------- | ----------- | --------------------------------------------------------------- |
| Auth      | Ready       | Supabase Auth, JWT, magic links, password reset                 |
| Billing   | Ready       | Stripe subscriptions, trials, coupons, webhooks                 |
| RBAC      | Ready       | 5 roles: system_admin, org_owner, admin, operator, reviewer     |
| API       | Ready       | Hono REST server with OpenAPI, rate limiting, alerting          |
| Client    | Ready       | React 19, Vite, TailwindCSS, i18n (EN/HE), Zustand, React Query |
| Database  | Schema only | Drizzle ORM schema defined, no live DB connected                |
| Projects  | Shell       | CRUD routes exist but produce empty results                     |
| Dashboard | Static      | Hardcoded zero-value cards, no data fetching                    |

**The problem**: You cannot run the application and see it working. Every page is either empty or errors out because there is no database. You cannot:

- Verify the UI makes visual sense
- Demo to stakeholders or investors
- Iterate on layouts, navigation, or data presentation
- Onboard new developers without Supabase credentials
- Test role-based access visually (what does an operator see vs. a reviewer?)

### What exists today

The codebase has partial mock infrastructure inherited from Geometrix:

- **Client local auth adapter** (`apps/client/src/lib/adapters/local/auth.ts`) — logs in with mock users, stores session in localStorage, issues `mock_token_{userId}` tokens
- **Server mock token handling** (`apps/server/src/middleware/auth.ts`) — recognizes `mock_token_` prefix, auto-provisions a user and organization in the database
- **Service config store** — switches between `offline` (local adapters) and `online` (Supabase) modes
- **Mock users** (`apps/client/src/lib/mock-data.ts`) — 5 mock users, one per role

**What's missing**: The server still requires a PostgreSQL database even in "mock" mode, because the mock token handler creates real DB records. There is no way to run the server without a database.

---

## 2. Assumptions and Non-Goals

### Assumptions

- Mock mode is for **local development and demos only** — never staging or production
- No data persistence across server restarts — this is acceptable
- Auth in mock mode is **intentionally insecure** — no JWT verification
- Exact parity with PostgreSQL behavior is **best-effort**, not guaranteed for edge cases (e.g., complex sort collation, concurrent writes)
- Mock mode is not intended for performance or load testing

### Non-Goals

| Item                                           | Why not now                                                  |
| ---------------------------------------------- | ------------------------------------------------------------ |
| Database seeder (`pnpm db:seed`)               | No DB connected yet — will add when Supabase is set up       |
| Mock Stripe/billing responses                  | Billing pages work with their own empty states already       |
| Mock support tickets                           | Support system works end-to-end, just shows empty list       |
| Mock file storage                              | File upload requires Supabase Storage — out of scope         |
| Migration-specific mock data                   | Step 1 concern — we need to define what a migration IS first |
| E2E test mock mode                             | E2E tests run against real or CI environment                 |
| Configurable scenarios (`MOCK_SCENARIO=empty`) | Future enhancement if needed                                 |

---

## 3. Approach: Repository-Level Mock vs. Route-Level Mock

### The Procure approach (route-level)

A reference project (Procure) implements mock mode by checking `useMockData()` inside every route handler:

```typescript
router.get('/suppliers', async (c) => {
  if (useMockData()) {
    return c.json({ data: MOCK_SUPPLIERS }); // Branch A: mock
  }
  const result = await repos.suppliers.findAll(); // Branch B: real
  return c.json({ data: result });
});
```

**Downsides**:

- Every route has two code paths — doubles the surface area for bugs
- Every new route must remember to add the mock branch
- Mock filtering/pagination logic is duplicated across routes (not DRY)
- Mock data and real data can drift in shape — no shared interface guarantees they match

### Our approach (repository-level)

RevBrain already has a **hexagonal architecture** with a `Repositories` interface:

```typescript
export interface Repositories {
  users: UserRepository;
  organizations: OrganizationRepository;
  plans: PlanRepository;
  auditLogs: AuditLogRepository;
  projects: ProjectRepository;
}
```

Every route handler accesses data through `c.var.repos` — it never imports Drizzle directly. Our mock mode provides an alternative implementation of the same interface:

```
// Current (real mode):
middleware → createDrizzleRepositories(db) → c.set('repos', repos)

// Mock mode:
middleware → createMockRepositories() → c.set('repos', repos)
```

**Route handlers remain unchanged.** They call `repos.projects.findByOrganization()` and get data back regardless of source.

### Why this is better

| Criterion                | Route-level (Procure)     | Repository-level (RevBrain)           |
| ------------------------ | ------------------------- | ------------------------------------- |
| Route handler complexity | Two code paths per route  | Single code path                      |
| New route cost           | Must add mock branch      | Nothing — works automatically         |
| Type safety              | Mock data shape can drift | Same interface enforced by TypeScript |
| Filtering/pagination     | Reimplemented per route   | Implemented once in mock repo         |
| Test reuse               | Mock logic not reusable   | Mock repos usable in unit tests       |
| Risk of forgetting       | High (every route)        | Zero (middleware handles it)          |
| Architecture alignment   | Breaks hexagonal pattern  | Extends hexagonal pattern             |

---

## 4. Architectural Invariants

These are hard rules that must not be violated:

1. **Route handlers must not branch on mock vs. real mode.** All data access goes through `c.var.repos`.
2. **Mock mode must not require any network or database access.** Zero external dependencies.
3. **Mock repositories must implement the exact same TypeScript interface** as Drizzle repositories. The compiler enforces this — missing methods are build errors, not runtime surprises.
4. **Mock auth must never be enabled in production.** The server fails fast if `AUTH_MODE=mock` is set when `APP_ENV` is `staging` or `production`.
5. **Mock data must use the same entity types** from `@revbrain/contract`. Schema changes force mock data updates.

---

## 5. What We Will Build

### 5.1 Production Safety Guard

Before anything else, add a hard runtime check at server startup:

```typescript
if (
  (process.env.AUTH_MODE === 'mock' || process.env.USE_MOCK_DATA === 'true') &&
  ['production', 'staging'].includes(process.env.APP_ENV || '')
) {
  console.error('FATAL: Mock mode cannot be enabled in production or staging.');
  process.exit(1);
}
```

This is non-negotiable.

### 5.2 Mock Repository Engine

**New directory**: `apps/server/src/repositories/mock/`

```
apps/server/src/repositories/mock/
├── index.ts                    # createMockRepositories() factory + resetMockData()
├── user.repository.ts          # MockUserRepository
├── organization.repository.ts  # MockOrganizationRepository
├── plan.repository.ts          # MockPlanRepository
├── audit-log.repository.ts     # MockAuditLogRepository
└── project.repository.ts       # MockProjectRepository
```

Each mock repository:

- Implements the full `XxxRepository` interface from `@revbrain/contract`
- Stores data in module-level arrays (in-memory, shared across requests within the process)
- Supports `create()` — generates UUID, sets timestamps, appends to array
- Supports `update()` — returns `null` for nonexistent records (same as Drizzle)
- Supports `delete()` — returns `false` for nonexistent records
- Supports `findMany()` with `limit`, `offset`, `orderBy`
- Enforces `organizationId` scoping on multi-tenant queries (e.g., `findByOrganization` filters by org)
- Is pre-populated with seed data on module load

### 5.3 Repository Behavior Parity

Mock repositories match Drizzle repository behavior in these ways:

| Behavior                         | Mock                                         | Drizzle          |
| -------------------------------- | -------------------------------------------- | ---------------- |
| `findById` with nonexistent ID   | Returns `null`                               | Returns `null`   |
| `update` with nonexistent ID     | Returns `null`                               | Returns `null`   |
| `delete` with nonexistent ID     | Returns `false`                              | Returns `false`  |
| `create`                         | Generates UUID, sets `createdAt`/`updatedAt` | Same             |
| `findMany` with `limit`/`offset` | Slices array after filtering                 | SQL LIMIT/OFFSET |
| `findByOrganization`             | Filters by `organizationId`                  | WHERE clause     |
| Default sort order               | By `createdAt` descending                    | Same             |
| `count`                          | Returns filtered array length                | COUNT query      |

**Not guaranteed to match**: complex text search, collation-dependent ordering, concurrent mutation safety, transaction isolation. These are acceptable gaps for local dev.

### 5.4 Mock Data

**New directory**: `apps/server/src/mocks/`

```
apps/server/src/mocks/
├── index.ts          # Central export + resetAllMockData()
├── organizations.ts  # 2 organizations
├── users.ts          # 7 users across both orgs
├── plans.ts          # 3 pricing plans
├── projects.ts       # 4 migration projects at different stages
├── audit-logs.ts     # 10 recent audit entries
└── helpers.ts        # Date helpers, deterministic UUID generator
```

**Data design**:

| Entity        | Count | Story                                                                                                                                     |
| ------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Organizations | 2     | "Acme Corp" (main demo, Pro plan, 5 users, active), "Beta Industries" (secondary, Starter plan, 2 users, quieter)                         |
| Plans         | 3     | Starter (free trial, 5 users, 3 projects), Pro ($99/mo, 25 users, unlimited projects), Enterprise ($499/mo, unlimited, SSO)               |
| Users         | 7     | system_admin (1, platform-level), Acme: org_owner + admin + operator + reviewer (4), Beta: org_owner + operator (2)                       |
| Projects      | 4     | Acme owns all 4: "Q1 Product Migration" (active), "Legacy Pricing Cleanup" (active), "RCA Pilot" (completed), "Phase 2 Migration" (draft) |
| Audit Logs    | 10    | Mix of user.invited, project.created, project.updated, tenant.onboarded actions                                                           |

**Data realism requirements**:

- Deterministic UUIDs: `00000000-0000-4000-a000-00000000{NNN}` pattern
- Realistic dates using helpers: `daysAgo(30)`, `daysAgo(7)`, `hoursAgo(2)`
- Cross-references: users reference their org's ID, projects reference org + owner
- Status variety: not all "active" — include draft, completed, on_hold
- At least one project with a long name (tests text truncation)
- At least one old project and one recently updated project
- Organization seat usage: Acme uses 4/25 seats, Beta uses 2/5

### 5.5 Mock Data Lifecycle

- Seed data is loaded once when the server process starts (module-level initialization)
- All mutations via `create()`, `update()`, `delete()` persist in memory until the process restarts
- Restarting the server (or tsx watch triggering a reload) resets all data to initial seed
- A dev-only endpoint `POST /v1/dev/reset-mock-data` resets all repositories to seed state without restarting

### 5.6 Repository Middleware Update

Update `apps/server/src/repositories/middleware.ts`:

```typescript
export function repositoryMiddleware() {
  return createMiddleware(async (c, next) => {
    const useMock = getEnv('USE_MOCK_DATA', 'false') === 'true';

    if (useMock) {
      c.set('repos', createMockRepositories());
      c.set('engine', 'mock');
    } else {
      c.set('repos', createDrizzleRepositories());
      c.set('engine', 'drizzle');
    }

    await next();
  });
}
```

**Middleware execution order** (must be maintained):

```
1. repositoryMiddleware()  ← sets c.var.repos
2. authMiddleware()        ← reads c.var.repos (in mock mode, to look up user)
3. route handlers          ← reads c.var.repos and c.var.user
```

Primary route handlers require no changes. Minor adjustments may be needed where current handlers assume DB-specific semantics.

### 5.7 Auth: Single Canonical Mechanism

**Decision**: Keep `Authorization: Bearer mock_token_{userId}` as the single mock auth mechanism. Deprecate `X-Mock-User-Id` header — it is not used.

When `AUTH_MODE=mock`:

1. Server reads `Authorization: Bearer mock_token_{userId}` header
2. Parses `{userId}` from the token string
3. Looks up user in mock repository via `repos.users.findById(userId)`
4. Sets `c.var.user` with the mock user entity
5. If no auth header or user not found, defaults to the Acme org_owner user

The dev role switcher on the client changes the mock token stored in localStorage. The client's `LocalAuthAdapter` already does this.

No `X-Mock-User-Id` header. No dual mechanisms. One path.

### 5.8 Client Updates

The client already has most of the infrastructure. Updates:

1. **Auto-detect mock mode**: `VITE_AUTH_MODE=mock` or absence of `VITE_SUPABASE_URL` → use `LocalAuthAdapter`, skip Supabase initialization
2. **Role switcher**: Already exists on login page. Switching role updates the mock token in localStorage; subsequent API calls use the new token
3. **Mock mode banner**: Show a small `[MOCK MODE]` indicator in the header when running in mock mode, so developers always know

### 5.9 Dashboard: Live Data

Update dashboard to fetch from the API (which returns mock data in mock mode):

- Total projects count
- Active / completed / draft breakdown
- Recent audit log entries

Replaces current hardcoded zero-value cards.

### 5.10 Environment Configuration

**`.env.local`** (gitignored, for zero-config local dev):

```bash
USE_MOCK_DATA=true
AUTH_MODE=mock
APP_ENV=local
VITE_API_URL=http://localhost:3001
VITE_AUTH_MODE=mock
```

**Server `dev` script** defaults to mock mode:

```json
"dev": "APP_ENV=local USE_MOCK_DATA=true AUTH_MODE=mock tsx watch src/dev.ts"
```

**Opting out of mock mode** (when DB is connected):

```json
"dev:real": "APP_ENV=local tsx watch src/dev.ts"
```

**Valid configuration combinations**:

| `USE_MOCK_DATA` | `AUTH_MODE` | `APP_ENV`    | Valid? | Behavior                                          |
| --------------- | ----------- | ------------ | ------ | ------------------------------------------------- |
| `true`          | `mock`      | `local`      | Yes    | Full mock — no external deps                      |
| `false`         | `jwt`       | `local`      | Yes    | Real DB + Supabase auth                           |
| `false`         | `jwt`       | `production` | Yes    | Production                                        |
| `true`          | `mock`      | `production` | **No** | Server exits with error                           |
| `true`          | `jwt`       | `local`      | No     | Invalid — mock data with real auth makes no sense |
| `false`         | `mock`      | `local`      | No     | Invalid — real DB with mock auth makes no sense   |

---

## 6. RBAC Matrix in Mock Mode

Each role sees different data. This is enforced by existing route-level RBAC middleware + repository scoping:

| Capability            | `system_admin` | `org_owner`      | `admin`                      | `operator`    | `reviewer`    |
| --------------------- | -------------- | ---------------- | ---------------------------- | ------------- | ------------- |
| See all organizations | Yes            | Own org only     | Own org only                 | Own org only  | Own org only  |
| See all users         | Yes (all orgs) | Own org users    | Own org users                | Own org users | Own org users |
| See projects          | All            | Own org projects | Own org projects             | Assigned only | Assigned only |
| Create project        | Yes            | Yes              | Yes                          | No            | No            |
| Edit project          | Yes            | Yes              | Yes                          | Assigned only | No            |
| Delete project        | Yes            | Yes              | No                           | No            | No            |
| Admin panel           | Full access    | No               | No                           | No            | No            |
| Invite users          | Yes            | Yes              | Yes (operator/reviewer only) | No            | No            |
| Billing page          | Yes            | Yes              | Yes                          | View only     | View only     |

---

## 7. Error Behavior in Mock Repos

Mock repositories handle errors consistently with real repos:

| Scenario                                  | Behavior                                                |
| ----------------------------------------- | ------------------------------------------------------- |
| `findById` — ID doesn't exist             | Returns `null`                                          |
| `update` — ID doesn't exist               | Returns `null`                                          |
| `delete` — ID doesn't exist               | Returns `false`                                         |
| `findByOrganization` — org has no records | Returns `[]`                                            |
| `create` — missing required field         | Not enforced at repo level (validated by Zod in routes) |
| Cross-org access                          | Filtered out — Acme user never sees Beta data           |

Services and routes handle `null` returns with appropriate 404 responses — this behavior is unchanged.

---

## 8. Implementation Plan

| Step | Task                                            | Files                                               | Risk   |
| ---- | ----------------------------------------------- | --------------------------------------------------- | ------ |
| 8.1  | Add production safety guard                     | `apps/server/src/index.ts`                          | Low    |
| 8.2  | Create mock data files                          | `apps/server/src/mocks/*.ts` (~6 files)             | Low    |
| 8.3  | Create mock repository implementations          | `apps/server/src/repositories/mock/*.ts` (~6 files) | Medium |
| 8.4  | Update repository middleware                    | `apps/server/src/repositories/middleware.ts`        | Low    |
| 8.5  | Update auth middleware for `AUTH_MODE=mock`     | `apps/server/src/middleware/auth.ts`                | Low    |
| 8.6  | Add `POST /v1/dev/reset-mock-data` endpoint     | `apps/server/src/v1/routes/dev.ts`                  | Low    |
| 8.7  | Update env config (`.env.example`, dev scripts) | Root config                                         | Low    |
| 8.8  | Update client auto-detect + mock banner         | Client lib/layout                                   | Low    |
| 8.9  | Update dashboard to fetch API data              | `apps/client/src/features/dashboard/`               | Low    |
| 8.10 | Write tests for mock repositories               | `apps/server/src/repositories/mock/*.test.ts`       | Medium |
| 8.11 | Update README with mock mode section            | `README.md`                                         | Low    |
| 8.12 | Verify full flow                                | Manual QA                                           | Low    |

**Estimated total**: ~15 files created, ~10 files modified.

---

## 9. Testing Strategy

### Unit tests for mock repositories

Each mock repo gets tests verifying CRUD, filtering, pagination, and org scoping.

### Contract tests (shared)

A shared test suite runs against both mock and Drizzle implementations to verify behavioral equivalence for common operations:

- `create` → `findById` round-trip
- `findMany` with `limit`/`offset`
- `findByOrganization` scoping
- `update` → verify changed fields
- `delete` → verify `findById` returns `null`

This is the strongest mechanism to prevent mock/real drift.

### Existing tests

All 523+ existing tests must continue to pass unchanged.

### Integration smoke test

A test that starts the server with `USE_MOCK_DATA=true`, sends a request to `/v1/projects`, and verifies it returns mock data.

---

## 10. Verification Criteria

The spec is complete when:

1. `pnpm dev` starts the server with zero configuration
2. Opening `http://localhost:5173` auto-logs in as org_owner
3. Dashboard shows project counts from mock data
4. Projects page lists 4 migration projects
5. Clicking a project shows overview with dates and status
6. Switching to "operator" role shows only assigned projects
7. Switching to "reviewer" role shows read-only view
8. Logging in as Acme org_owner shows only Acme's projects, not Beta's
9. Admin panel (system_admin) shows tenants, users, plans
10. `[MOCK MODE]` indicator visible in header
11. `POST /v1/dev/reset-mock-data` restores seed state
12. Server refuses to start with `AUTH_MODE=mock` + `APP_ENV=production`
13. All existing tests pass
14. No new ESLint warnings

---

## 11. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Client (React)                                             │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │ Auth Store   │    │ React Query  │    │ Role Switcher │  │
│  │ (Zustand)    │    │ (API calls)  │    │ (Dev Mode)    │  │
│  └──────┬───────┘    └──────┬───────┘    └───────────────┘  │
│         │                   │                                │
│   VITE_AUTH_MODE=mock       │ Authorization: Bearer          │
│   → LocalAuthAdapter        │ mock_token_{userId}            │
│   → Auto-login              │                                │
└─────────────────────────────┼────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Server (Hono)                                              │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  1. Repository Middleware (runs first)                │   │
│  │     USE_MOCK_DATA=true → createMockRepositories()     │   │
│  │     USE_MOCK_DATA=false → createDrizzleRepositories() │   │
│  └──────────────────────────────────────────────────────┘   │
│                              │                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  2. Auth Middleware (runs second — needs repos)       │   │
│  │     AUTH_MODE=mock → parse userId from mock_token_    │   │
│  │                      → repos.users.findById(userId)   │   │
│  │     AUTH_MODE=jwt  → verify JWT via Supabase          │   │
│  └──────────────────────────────────────────────────────┘   │
│                              │                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  3. Route Handlers (UNCHANGED)                        │   │
│  │     const projects = await c.var.repos.projects.find()│   │
│  └──────────────────────────────────────────────────────┘   │
│                              │                               │
│  ┌─────────────┐    ┌───────┴─────────┐                    │
│  │ Mock Repos  │    │  Drizzle Repos  │                    │
│  │ (in-memory) │    │  (PostgreSQL)   │                    │
│  └─────────────┘    └─────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 12. Risk Assessment

| Risk                                   | Likelihood | Impact   | Mitigation                                                    |
| -------------------------------------- | ---------- | -------- | ------------------------------------------------------------- |
| Mock mode deployed to production       | Low        | Critical | Hard runtime check — server exits immediately (section 5.1)   |
| Mock repo behavior drifts from Drizzle | Medium     | High     | TypeScript interface + shared contract tests                  |
| Middleware ordering broken by refactor | Low        | High     | Explicitly documented order; auth depends on repos            |
| Developers forget they're in mock mode | Low        | Medium   | `[MOCK MODE]` banner in UI + server startup log               |
| Mock data becomes stale                | Medium     | Low      | Same entity types from contract — compiler catches mismatches |
| Mock mode masks real bugs              | Low        | Medium   | Existing unit tests unaffected; contract tests catch drift    |

---

## 13. Lifecycle and Transition Plan

**When the real database is connected**, mock mode is not removed — it is maintained for local development:

- Developers use `pnpm dev` (mock mode) for UI work
- Developers use `pnpm dev:real` when testing database integration
- CI runs tests against both mock and real repos (via shared contract tests)
- Mock data evolves alongside real schema — contract types enforce sync

**Maintenance cost**: When a new repository method is added to the contract interface, TypeScript will refuse to compile until the mock implementation is added. This is the desired behavior — it's a feature, not overhead.

---

## 14. Developer UX

- **Mock mode banner**: A small violet `MOCK MODE` badge in the header, visible only in mock mode
- **Role indicator**: Currently impersonated role shown in header user menu
- **Reset button**: Dev tools panel or `POST /v1/dev/reset-mock-data` to restore seed state
- **README section**: How to start, what to expect, how to switch to real mode

---

## 15. Open Questions

1. Should mock repos support transactions (`withTransaction` helper)? Proposal: no — just execute the callback directly without isolation.
2. Should Hebrew mock data exist for RTL layout testing? Proposal: not initially — can be added if RTL bugs surface.
3. Should the role switcher be visible in staging demos? Proposal: no — dev mode only (`import.meta.env.DEV`).
