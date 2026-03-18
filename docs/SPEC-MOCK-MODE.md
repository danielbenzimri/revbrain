# RevBrain — Mock Mode Specification

> **Status**: PROPOSED
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

The codebase already has partial mock infrastructure inherited from Geometrix:

- **Client local auth adapter** (`apps/client/src/lib/adapters/local/auth.ts`) — logs in with mock users from `MOCK_USERS`, stores session in localStorage, issues `mock_token_{userId}` tokens
- **Server mock token handling** (`apps/server/src/middleware/auth.ts`) — recognizes `mock_token_` prefix, auto-provisions a user and organization in the database
- **Service config store** (`apps/client/src/stores/service-config-store.ts`) — switches between `offline` (local adapters) and `online` (Supabase) modes
- **Mock users** (`apps/client/src/lib/mock-data.ts`) — 5 mock users, one per role

**What's missing**: The server still requires a PostgreSQL database even in "mock" mode, because the mock token handler creates real DB records. There is no way to run the server without a database. The client can log in locally, but every API call after login fails.

---

## 2. Approach: Repository-Level Mock vs. Route-Level Mock

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
// packages/contract/src/repositories/types.ts
export interface Repositories {
  users: UserRepository;
  organizations: OrganizationRepository;
  plans: PlanRepository;
  auditLogs: AuditLogRepository;
  projects: ProjectRepository;
}
```

Every route handler accesses data through `c.var.repos` — it never imports Drizzle directly. Today, `repos` is always a `DrizzleRepositories` instance. Our mock mode simply provides an alternative implementation:

```typescript
// Current (real mode):
middleware → createDrizzleRepositories(db) → c.set('repos', repos)

// Mock mode:
middleware → createMockRepositories() → c.set('repos', repos)
```

**Route handlers remain unchanged** — they call `repos.projects.findByOrganization()` and get data back. They don't know or care whether it came from PostgreSQL or an in-memory array.

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

## 3. What We Will Build

### 3.1 Server: Mock Repository Engine

**New directory**: `apps/server/src/repositories/mock/`

One file per repository, implementing the same interface as Drizzle repos:

```
apps/server/src/repositories/mock/
├── index.ts                    # createMockRepositories() factory
├── user.repository.ts          # MockUserRepository
├── organization.repository.ts  # MockOrganizationRepository
├── plan.repository.ts          # MockPlanRepository
├── audit-log.repository.ts     # MockAuditLogRepository
└── project.repository.ts       # MockProjectRepository
```

Each mock repository:

- Implements the full `XxxRepository` interface from `@revbrain/contract`
- Stores data in module-level arrays (in-memory, shared across requests)
- Supports `create()`, `update()`, `delete()` — mutations persist in memory for the lifetime of the server process
- Supports `findMany()` with `limit`, `offset`, `orderBy`, `filter`
- Is pre-populated with realistic seed data on import

**Factory**:

```typescript
export function createMockRepositories(): Repositories {
  return {
    users: new MockUserRepository(),
    organizations: new MockOrganizationRepository(),
    plans: new MockPlanRepository(),
    auditLogs: new MockAuditLogRepository(),
    projects: new MockProjectRepository(),
  };
}
```

### 3.2 Server: Mock Data

**New directory**: `apps/server/src/mocks/`

```
apps/server/src/mocks/
├── index.ts          # Central export
├── organizations.ts  # 2 organizations
├── users.ts          # 7 users across both orgs
├── plans.ts          # 3 pricing plans (Starter, Pro, Enterprise)
├── projects.ts       # 4 migration projects at different stages
└── helpers.ts        # Date helpers, ID generators
```

**Mock data design**:

| Entity        | Count | Story                                                                                                                              |
| ------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Organizations | 2     | "Acme Corp" (main demo org, Pro plan), "Beta Industries" (secondary)                                                               |
| Plans         | 3     | Starter (free trial), Pro (standard), Enterprise (full features)                                                                   |
| Users         | 7     | system_admin (1), org_owner (1 per org), admin (1), operator (1), reviewer (1)                                                     |
| Projects      | 4     | "Q1 Product Migration" (active, 60%), "Legacy Pricing Cleanup" (active, 30%), "RCA Pilot" (completed), "Phase 2 Migration" (draft) |
| Audit Logs    | 10    | Recent org/user/project actions                                                                                                    |

**Data realism requirements**:

- Proper UUIDs (deterministic, e.g., `00000000-0000-4000-a000-000000000001`)
- Realistic dates (created 30 days ago, updated yesterday)
- Cross-references (users belong to orgs, projects belong to orgs)
- Status distribution (not all "active" — include draft, completed, on_hold)

### 3.3 Server: Repository Middleware Update

Update `apps/server/src/repositories/middleware.ts` to select engine based on environment:

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

No route changes needed.

### 3.4 Server: Auth Middleware Update

Update `apps/server/src/middleware/auth.ts` to support `AUTH_MODE=mock`:

When `AUTH_MODE=mock`:

- Skip JWT verification entirely
- Read `X-Mock-User-Id` header (or default to org_owner user)
- Look up user from mock repository
- Set `c.var.user` with the mock user

This removes the current behavior where mock tokens auto-provision database records (which requires a live DB).

### 3.5 Client: Mock Mode Auto-Login

The client already has the infrastructure (`LocalAuthAdapter`, `service-config-store`). We update it to:

1. Detect `VITE_AUTH_MODE=mock` (or absence of `VITE_SUPABASE_URL`)
2. Auto-login with the org_owner mock user
3. Skip Supabase initialization entirely

### 3.6 Client: Dev Role Switcher

The login page already has a role simulator in dev mode. We enhance it:

- Show all 5 roles with descriptions
- Switching role sends `X-Mock-User-Id` header with subsequent API calls
- Each role sees a different data scope (reviewer can't create projects, operator sees assigned projects only)

### 3.7 Environment Configuration

**`.env.local`** (new file, gitignored):

```bash
# Mock mode — no external dependencies needed
USE_MOCK_DATA=true
AUTH_MODE=mock
APP_ENV=local
VITE_API_URL=http://localhost:3001
VITE_AUTH_MODE=mock
```

**Server `dev` script update**:

```json
"dev": "APP_ENV=local USE_MOCK_DATA=true AUTH_MODE=mock tsx watch src/dev.ts"
```

Running `pnpm dev` starts the server with mock data. No database, no Supabase, no configuration.

### 3.8 Dashboard: Live Data

Update the dashboard to fetch real data from the API (which in mock mode returns mock data):

- Total projects count
- Active / completed / draft breakdown
- Recent project activity

This replaces the current hardcoded zero-value cards.

---

## 4. What We Will NOT Build

These are explicitly out of scope for this spec:

| Item                             | Why not now                                                  |
| -------------------------------- | ------------------------------------------------------------ |
| Database seeder (`pnpm db:seed`) | No DB connected yet — will add when Supabase is set up       |
| Mock Stripe/billing responses    | Billing pages work with their own empty states already       |
| Mock support tickets             | Support system works end-to-end, just shows empty list       |
| Mock file storage                | File upload requires Supabase Storage — out of scope         |
| Migration-specific mock data     | Step 1 concern — we need to define what a migration IS first |
| E2E test mock mode               | E2E tests run against real or CI environment                 |

---

## 5. Implementation Plan

| Step | Task                                                    | Files                                         | Risk                               |
| ---- | ------------------------------------------------------- | --------------------------------------------- | ---------------------------------- |
| 5.1  | Create mock data files                                  | `apps/server/src/mocks/*.ts`                  | Low                                |
| 5.2  | Create mock repository implementations                  | `apps/server/src/repositories/mock/*.ts`      | Medium — must match full interface |
| 5.3  | Update repository middleware for engine selection       | `apps/server/src/repositories/middleware.ts`  | Low                                |
| 5.4  | Update auth middleware for `AUTH_MODE=mock`             | `apps/server/src/middleware/auth.ts`          | Low                                |
| 5.5  | Update `.env.example`, add `.env.local` to `.gitignore` | Root config                                   | Low                                |
| 5.6  | Update server `dev` script to default to mock           | `package.json`                                | Low                                |
| 5.7  | Update client to auto-detect mock mode                  | `apps/client/src/lib/services.ts`             | Low                                |
| 5.8  | Update dashboard to fetch API data                      | `apps/client/src/features/dashboard/`         | Low                                |
| 5.9  | Write tests for mock repositories                       | `apps/server/src/repositories/mock/*.test.ts` | Medium                             |
| 5.10 | Verify full flow: start → login → navigate → see data   | Manual QA                                     | Low                                |

**Estimated total**: ~15 files created, ~8 files modified.

---

## 6. Verification Criteria

The spec is complete when:

1. `pnpm dev` starts the server with zero configuration (no `.env` file needed)
2. Opening `http://localhost:5173` auto-logs in as org_owner
3. Dashboard shows project counts from mock data
4. Projects page lists 4 migration projects
5. Clicking a project shows overview with dates and status
6. Switching to "operator" role shows only assigned projects
7. Switching to "reviewer" role shows read-only view
8. Admin panel shows tenants, users, plans from mock data
9. All 523+ existing tests still pass
10. No new ESLint warnings introduced

---

## 7. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Client (React)                                             │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │ Auth Store   │    │ React Query  │    │ Role Switcher │  │
│  │ (Zustand)    │    │ (API calls)  │    │ (Dev Mode)    │  │
│  └──────┬───────┘    └──────┬───────┘    └───────────────┘  │
│         │                   │                                │
│   VITE_AUTH_MODE=mock       │ Authorization: Bearer mock_... │
│   → LocalAuthAdapter        │                                │
│   → Auto-login              │                                │
└─────────────────────────────┼────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Server (Hono)                                              │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Auth Middleware                                      │   │
│  │  AUTH_MODE=mock → lookup user in mock repos           │   │
│  │  AUTH_MODE=jwt  → verify JWT via Supabase             │   │
│  └──────────────────────────────────────────────────────┘   │
│                              │                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Repository Middleware                                │   │
│  │  USE_MOCK_DATA=true → createMockRepositories()        │   │
│  │  USE_MOCK_DATA=false → createDrizzleRepositories()    │   │
│  └──────────────────────────────────────────────────────┘   │
│                              │                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Route Handlers (UNCHANGED)                           │   │
│  │  const projects = await c.var.repos.projects.find()   │   │
│  │  // Works identically with mock or real repos         │   │
│  └──────────────────────────────────────────────────────┘   │
│                              │                               │
│  ┌─────────────┐    ┌───────┴─────────┐                    │
│  │ Mock Repos  │    │  Drizzle Repos  │                    │
│  │ (in-memory) │    │  (PostgreSQL)   │                    │
│  │             │    │                 │                    │
│  │ users[]     │    │ DrizzleUser     │                    │
│  │ orgs[]      │    │ DrizzleOrg      │                    │
│  │ projects[]  │    │ DrizzleProject  │                    │
│  │ plans[]     │    │ DrizzlePlan     │                    │
│  │ auditLogs[] │    │ DrizzleAudit    │                    │
│  └─────────────┘    └─────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. Risk Assessment

| Risk                                      | Likelihood | Impact | Mitigation                                                                                               |
| ----------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------------------- |
| Mock repo drifts from real repo behavior  | Medium     | High   | TypeScript interface enforcement — mock repos implement same interface, compiler catches missing methods |
| Mock data becomes stale as schema evolves | Medium     | Low    | Mock data uses same entity types from `@revbrain/contract` — schema changes force mock data updates      |
| Developers forget they're in mock mode    | Low        | Medium | Server logs `[MOCK MODE] Server running with in-memory data` on startup                                  |
| Mock mode masks real bugs                 | Low        | Medium | All unit tests run against mocked repos already — same pattern                                           |
| Performance differs between mock and real | Low        | Low    | Not testing performance in mock mode — it's for UI/UX iteration                                          |

---

## 9. Success Metrics

After implementation:

- **Developer onboarding**: Clone repo → `pnpm install` → `pnpm dev` → working app (< 2 minutes)
- **Demo readiness**: Can show the platform to stakeholders with realistic data
- **UI iteration speed**: Change a component → see it with data immediately
- **Zero external dependencies**: Works on airplane, works without credentials
- **Test compatibility**: All existing tests continue to pass
