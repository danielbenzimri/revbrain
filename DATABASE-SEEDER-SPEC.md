# RevBrain — Database Seeder Spec

> **Purpose:** Specification for a database seeding system that populates a real Supabase/PostgreSQL database with curated test data. This bridges the gap between RevBrain's in-memory mock mode (used for local development) and real database environments (staging, QA, demos). Written for external review.
>
> **Context:** RevBrain is a multi-tenant SaaS platform for Salesforce CPQ → RCA migration. It uses Supabase (PostgreSQL) with Drizzle ORM, Row-Level Security (RLS), and a dual-adapter architecture (mock mode for offline dev, production mode for real databases).
>
> **Date:** 2026-03-20 | **Status:** Spec — implementation pending

---

## Table of Contents

1. [Why This Matters](#1-why-this-matters)
2. [Current State — The Gap](#2-current-state--the-gap)
3. [Reference: What Procure Built](#3-reference-what-procure-built)
4. [Proposed Solution for RevBrain](#4-proposed-solution-for-revbrain)
5. [Architecture Design](#5-architecture-design)
6. [Data Inventory — What Gets Seeded](#6-data-inventory--what-gets-seeded)
7. [Insertion Order & Foreign Key Dependencies](#7-insertion-order--foreign-key-dependencies)
8. [Idempotency & Safety](#8-idempotency--safety)
9. [RLS & Tenant Isolation](#9-rls--tenant-isolation)
10. [CLI Interface](#10-cli-interface)
11. [Environment Strategy](#11-environment-strategy)
12. [Implementation Plan](#12-implementation-plan)
13. [Testing Strategy](#13-testing-strategy)

---

## 1. Why This Matters

### The Problem

RevBrain has a mature mock data layer — 8 seed data files with 60+ entities covering plans, organizations, users, projects, tickets, coupons, overrides, and audit logs. This data powers local development via in-memory mock repositories. However, **none of this data can reach a real database**.

This creates several critical problems:

| Problem                                            | Impact                                                                                                                       | Who It Affects  |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------- |
| **Staging is empty after deployment**              | Every staging deploy starts with zero data. Engineers must manually create test tenants, users, and projects before testing. | Engineering, QA |
| **Demo environments have no data**                 | Sales demos require pre-populating data by hand. Each demo reset requires manual re-creation.                                | Sales, Product  |
| **QA cannot reproduce mock-mode bugs**             | Bugs found in mock mode may behave differently in real DB mode because the data shape is different.                          | QA              |
| **New engineers have no starting data**            | Onboarding requires learning how to create tenants/users/plans manually before seeing real functionality.                    | Engineering     |
| **E2E tests against real DB have no fixture data** | Playwright E2E tests currently run against mock mode only. Testing against a real database requires seed data.               | CI/CD           |
| **Supabase Auth users don't exist**                | Mock mode bypasses Supabase Auth entirely. Real DB mode needs actual auth users with matching database records.              | Engineering     |

### The Value

A database seeder eliminates all of the above by providing a single command that populates any database with the same curated data used in mock mode:

```bash
pnpm db:seed                    # Seed local/staging database
pnpm db:seed --cleanup          # Wipe and re-seed
pnpm db:seed --env=production   # Seed production (with safeguards)
```

**Key benefits:**

- **Consistency:** Same data in mock mode, staging, and demos — developers and sales see the same tenants, users, and projects everywhere
- **Speed:** New environment from zero to fully populated in seconds, not hours of manual setup
- **Reproducibility:** Deterministic UUIDs mean the same entities have the same IDs across all environments
- **Safety:** Idempotent — can re-run without duplicating data. Production safeguards prevent accidental seeding
- **E2E enablement:** Provides the fixture data needed to run E2E tests against real databases

---

## 2. Current State — The Gap

### What RevBrain Has (Mock Layer)

RevBrain has a well-structured mock data layer at `apps/server/src/mocks/`:

| File                  | Entities                                   | Count                  |
| --------------------- | ------------------------------------------ | ---------------------- |
| `plans.ts`            | Plans (Starter, Pro, Enterprise)           | 3                      |
| `organizations.ts`    | Organizations (Acme Corp, Beta Industries) | 2                      |
| `users.ts`            | Users across all roles                     | 8                      |
| `projects.ts`         | Migration projects                         | 4                      |
| `audit-logs.ts`       | Admin action logs                          | 10                     |
| `support-tickets.ts`  | Support tickets with messages              | 6 tickets, 10 messages |
| `coupons.ts`          | Discount coupons                           | 4                      |
| `tenant-overrides.ts` | Feature overrides                          | 2                      |

**Total: ~49 entities** across 8 entity types, all with deterministic IDs (`MOCK_IDS` in `constants.ts`).

These entities follow the contract types from `packages/contract/src/repositories/types.ts` and are used by mock repositories in `apps/server/src/repositories/mock/`. The mock mode (`USE_MOCK_DATA=true`) runs entirely in-memory — data is lost on server restart, reset via `resetAllMockData()`.

### What RevBrain Doesn't Have

| Capability                                     | Status      |
| ---------------------------------------------- | ----------- |
| `db:seed` command                              | **Missing** |
| Script to insert mock data into real database  | **Missing** |
| Drizzle-based seeder using existing schema     | **Missing** |
| Auth user creation for seed users              | **Missing** |
| Idempotency tracking (avoid duplicate inserts) | **Missing** |
| CLI with options (cleanup, env selection)      | **Missing** |
| Supabase Auth integration for seed users       | **Missing** |

### What RevBrain Has (Database Layer)

- **Drizzle ORM schema** at `packages/database/src/schema.ts` — full schema for plans, organizations, users, projects, audit logs, support tickets, job queue, and more
- **Drizzle migration system** — `db:generate` and `db:migrate` commands
- **Database client** at `packages/database/src/client.ts` — PostgreSQL connection via `DATABASE_URL`
- **Drizzle repositories** at `apps/server/src/repositories/drizzle/` — production-mode data access

The seeder needs to bridge `mocks/*.ts` (source data) → `packages/database/src/schema.ts` (target schema) via Drizzle ORM.

---

## 3. Reference: What Procure Built

RevBrain's sister project, [Procure](https://github.com/danielbenzimri/procure) (a procurement SaaS), solved this problem with a 3-layer Data Factory architecture. Understanding Procure's approach informs RevBrain's design.

### Procure's Architecture

```
Layer 1: Builders (pure functions)
  ↓ generates
Layer 2: Seeders (DB-aware insertion)
  ↓ composed by
Layer 3: Scenarios (business-oriented configurations)
```

**Layer 1 — Builders:** Pure functions that generate typed entities with no database awareness. Use Faker.js for realistic data, support seeded randomness for deterministic output. Example: `buildSupplier(tenantId, { otd: 55 })` returns a Supplier object.

**Layer 2 — Seeders:** Functions that take builder output and insert it into a real database via Supabase client. Handle RLS context (`setTenantContext()`), batching, progress reporting, and idempotency tracking via a `seed_log` table.

**Layer 3 — Scenarios:** Named business configurations like `tenantWithLateSupplier` or `healthyCompany` that compose builders and seeders into complete test environments. Support scaling from `testBasic` (3 entities) to `enterprise` (5,000+ entities).

### Key Procure Features

| Feature                          | How It Works                                                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Curated seeder**               | `seedCuratedDemo()` inserts the exact same data as the frontend mock service — Acme Corporation with 10 suppliers, 15 purchase orders, 8 AI agents |
| **Deterministic UUIDs**          | `deterministicUUID(key)` generates stable UUIDs via UUID v5. Same key → same UUID across all environments                                          |
| **Idempotency**                  | `seed_log` table tracks which seed operations have been applied. `seedIfNotExists()` skips already-applied seeds                                   |
| **RLS-aware**                    | `setTenantContext()` / `clearTenantContext()` RPCs ensure all inserts go through RLS policies                                                      |
| **CLI**                          | `npx tsx scripts/seed-staging.ts --curated --cleanup` with progress reporting and login credential output                                          |
| **~5,800 lines of curated data** | Hand-crafted, realistic business data across 11 files                                                                                              |

### What RevBrain Should Adopt vs. Skip

| Procure Feature                                   | Adopt?                       | Reasoning                                                                                                                                               |
| ------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Curated seeder reusing mock data                  | **Yes**                      | Core feature — RevBrain's mock data is already curated                                                                                                  |
| Deterministic UUIDs                               | **Already done**             | RevBrain's `MOCK_IDS` are already deterministic                                                                                                         |
| Idempotency (seed_log)                            | **Yes, simplified**          | Prevent duplicate inserts on re-run                                                                                                                     |
| RLS-aware seeding                                 | **Yes**                      | RevBrain uses RLS via Supabase                                                                                                                          |
| CLI with options                                  | **Yes**                      | Essential for developer experience                                                                                                                      |
| 3-layer architecture (builders/seeders/scenarios) | **No — too complex for now** | RevBrain has fewer entity types and already has curated data. A single-layer seeder is sufficient. Builders and scenarios can be added later if needed. |
| Faker-based random generation                     | **No — not needed yet**      | RevBrain's curated data is sufficient. Random generation adds complexity without clear benefit at this stage.                                           |

---

## 4. Proposed Solution for RevBrain

### Design Philosophy

**Simple, single-purpose, and reliable.** Unlike Procure's 3-layer factory, RevBrain needs a focused tool that does one thing well: take the existing curated mock data and insert it into a real database.

### Core Concept

```
SEED_* arrays (mocks/*.ts)
        ↓ transform
Drizzle insert values (schema-compatible)
        ↓ insert
PostgreSQL via Drizzle ORM
        ↓ verify
Console output with counts and credentials
```

The seeder reuses the **exact same data** that powers mock mode. No separate data to maintain. When mock data is updated, the seeder automatically uses the new data.

### Architecture Decision: Drizzle ORM, Not Supabase Client

Procure uses the Supabase client (`supabase.from('table').insert(...)`) for seeding. RevBrain should use **Drizzle ORM** (`db.insert(table).values(...)`) instead:

| Approach                 | Pros                                                                                                    | Cons                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Supabase client**      | RLS-aware by default, matches runtime behavior                                                          | Requires RLS context management RPCs, different API from app code |
| **Drizzle ORM** (chosen) | Same ORM as production code, type-safe schema, transaction support, no RLS bypass needed (service role) | Must bypass RLS via service role or disable temporarily           |

**Why Drizzle:** RevBrain's production code uses Drizzle, not the Supabase client. Using the same ORM for seeding ensures the seed data matches the exact schema types. The seeder connects with the service role key (which bypasses RLS) — this is acceptable because seeding is an admin operation.

---

## 5. Architecture Design

### File Structure

```
packages/database/
├── src/
│   ├── schema.ts          # Existing Drizzle schema
│   ├── client.ts           # Existing DB connection
│   ├── seed.ts             # NEW: Seed entry point
│   └── seeders/
│       ├── index.ts         # Orchestrator
│       ├── transform.ts     # Mock data → Drizzle insert values
│       ├── seed-log.ts      # Idempotency tracking
│       └── auth-users.ts    # Supabase Auth user creation
```

### Key Components

**1. Transform Layer (`transform.ts`)**

Maps mock data types (from `apps/server/src/mocks/`) to Drizzle insert types (from `packages/database/src/schema.ts`). Handles field name differences, type coercions, and any necessary transformations.

```typescript
// Example transform
function transformUser(seedUser: SeedUser): NewUser {
  return {
    id: seedUser.id,
    supabaseUserId: seedUser.supabaseUserId,
    organizationId: seedUser.organizationId,
    email: seedUser.email,
    fullName: seedUser.fullName,
    role: seedUser.role,
    isOrgAdmin: seedUser.isOrgAdmin,
    isActive: seedUser.isActive,
    invitedBy: seedUser.invitedBy,
    phoneNumber: seedUser.phoneNumber,
    jobTitle: seedUser.jobTitle,
    // ... map all fields
    createdAt: seedUser.createdAt,
  };
}
```

**2. Orchestrator (`index.ts`)**

Controls the seeding flow:

1. Check idempotency (has this seed already been applied?)
2. Insert entities in dependency order
3. Log results
4. Mark seed as applied

**3. Auth User Creation (`auth-users.ts`)**

Creates Supabase Auth users for the seed users so they can actually log in. Uses the Supabase Admin API (`supabase.auth.admin.createUser()`).

```typescript
async function createAuthUser(supabase: SupabaseClient, user: SeedUser, password: string) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: user.email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: user.fullName,
      role: user.role,
      organization_id: user.organizationId,
    },
  });
  // Update the database user record with the Supabase Auth ID
  if (data.user) {
    await db.update(users).set({ supabaseUserId: data.user.id }).where(eq(users.id, user.id));
  }
}
```

**4. Seed Log (`seed-log.ts`)**

Simple idempotency tracking:

```sql
CREATE TABLE IF NOT EXISTS _seed_log (
  seed_id VARCHAR(100) PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  entity_counts JSONB,
  environment VARCHAR(50)
);
```

Before seeding, check if `seed_id` exists. After seeding, record it. This allows `db:seed` to be run multiple times safely.

---

## 6. Data Inventory — What Gets Seeded

The seeder inserts the **exact same entities** from the mock data files:

| Entity Type          | Source File                 | Count   | Key Data                                                                               |
| -------------------- | --------------------------- | ------- | -------------------------------------------------------------------------------------- |
| **Plans**            | `mocks/plans.ts`            | 3       | Starter (free), Pro ($99/mo), Enterprise ($499/mo)                                     |
| **Organizations**    | `mocks/organizations.ts`    | 2       | Acme Corp (Pro plan, 25 seats), Beta Industries (Starter, 5 seats)                     |
| **Users**            | `mocks/users.ts`            | 8       | 1 system_admin, 5 Acme users (all roles), 2 Beta users, 1 pending                      |
| **Projects**         | `mocks/projects.ts`         | 4       | Q1 Migration (active), Legacy Cleanup (active), RCA Pilot (completed), Phase 2 (draft) |
| **Audit Logs**       | `mocks/audit-logs.ts`       | 10      | Onboarding, invitations, project creates/updates                                       |
| **Support Tickets**  | `mocks/support-tickets.ts`  | 6       | Across all statuses/priorities                                                         |
| **Ticket Messages**  | `mocks/support-tickets.ts`  | 10      | Admin replies, customer messages, internal notes                                       |
| **Coupons**          | `mocks/coupons.ts`          | 4       | Active percent, expired fixed, scheduled, maxed-out                                    |
| **Tenant Overrides** | `mocks/tenant-overrides.ts` | 2       | Active grant, expired grant                                                            |
| **Total**            |                             | **~49** |                                                                                        |

### Auth Users Created

For each seed user, a corresponding Supabase Auth user is created with a default password so they can log in:

| Email               | Role         | Org             | Default Password |
| ------------------- | ------------ | --------------- | ---------------- |
| `admin@revbrain.io` | system_admin | Platform        | `RevBrain2024!`  |
| `david@acme.com`    | org_owner    | Acme Corp       | `RevBrain2024!`  |
| `sarah@acme.com`    | admin        | Acme Corp       | `RevBrain2024!`  |
| `mike@acme.com`     | operator     | Acme Corp       | `RevBrain2024!`  |
| `amy@acme.com`      | reviewer     | Acme Corp       | `RevBrain2024!`  |
| `lisa@beta-ind.com` | org_owner    | Beta Industries | `RevBrain2024!`  |
| `tom@beta-ind.com`  | operator     | Beta Industries | `RevBrain2024!`  |
| `pending@acme.com`  | operator     | Acme Corp       | (not activated)  |

The seeder outputs these credentials after completion so the developer knows how to log in.

---

## 7. Insertion Order & Foreign Key Dependencies

Entities must be inserted in dependency order to satisfy foreign key constraints:

```
1. plans          ← no dependencies
2. organizations  ← references plans.id (planId)
3. users          ← references organizations.id, users.id (invitedBy)
4. projects       ← references users.id (ownerId), organizations.id
5. audit_logs     ← references users.id, organizations.id
6. support_tickets ← references users.id, organizations.id
7. ticket_messages ← references support_tickets.id
8. coupons         ← no foreign keys (standalone)
9. tenant_overrides ← references organizations.id, users.id (grantedBy)
```

The seeder processes these in order within a single database transaction. If any step fails, the entire seed is rolled back.

### Self-Referencing Users

The `users` table has a self-referencing `invitedBy` column. The seeder handles this by:

1. First inserting users with `invitedBy: null`
2. Then updating the `invitedBy` field for users who were invited by other seed users

---

## 8. Idempotency & Safety

### Idempotency Strategy

The seeder uses a `_seed_log` table to track which seed sets have been applied:

```typescript
// Before seeding
const alreadyApplied = await isSeedApplied('revbrain-curated-v1');
if (alreadyApplied && !options.force) {
  console.log('Seed already applied. Use --force to re-apply or --cleanup to wipe first.');
  return;
}

// After seeding
await markSeedApplied('revbrain-curated-v1', {
  entityCounts: { plans: 3, orgs: 2, users: 8, ... },
  environment: process.env.APP_ENV,
});
```

### Conflict Resolution

For individual entity inserts, use Drizzle's `onConflictDoNothing()`:

```typescript
await db.insert(plans).values(seedPlans).onConflictDoNothing({ target: plans.id });
```

This ensures re-running the seeder with the same IDs doesn't throw errors or duplicate data.

### Cleanup Mode

`--cleanup` flag wipes seed data before re-inserting:

```typescript
if (options.cleanup) {
  // Delete in reverse dependency order
  await db.delete(tenantOverrides).where(inArray(tenantOverrides.id, OVERRIDE_IDS));
  await db.delete(ticketMessages).where(inArray(ticketMessages.ticketId, TICKET_IDS));
  await db.delete(supportTickets).where(inArray(supportTickets.id, TICKET_IDS));
  // ... etc
  await db.delete(plans).where(inArray(plans.id, PLAN_IDS));

  // Also remove auth users
  for (const user of SEED_USERS) {
    await supabase.auth.admin.deleteUser(user.supabaseUserId);
  }

  // Clear seed log
  await db.delete(seedLog).where(eq(seedLog.seedId, 'revbrain-curated-v1'));
}
```

### Production Safeguards

The seeder **refuses to run** in production unless explicitly confirmed:

```typescript
if (environment === 'production') {
  if (!options.iKnowWhatImDoing) {
    console.error('REFUSING to seed production. Use --i-know-what-im-doing to override.');
    process.exit(1);
  }
  console.warn('⚠️  SEEDING PRODUCTION DATABASE. Press Ctrl+C within 5 seconds to abort...');
  await sleep(5000);
}
```

---

## 9. RLS & Tenant Isolation

### Approach: Service Role Bypass

The seeder connects using the `SUPABASE_SERVICE_ROLE_KEY`, which bypasses Row-Level Security policies. This is the standard approach for admin/seeder operations because:

1. Seeding inserts data across multiple tenants (Acme and Beta) — RLS would prevent cross-tenant inserts
2. The service role key is already used by the server for admin operations
3. No RPC-based context switching needed (simpler than Procure's approach)

### Post-Seed Verification

After seeding, the script runs a verification step that connects with the **anon key** (RLS-enforced) and verifies:

1. Authenticating as `david@acme.com` (Acme org_owner) can see Acme projects but NOT Beta projects
2. Authenticating as `lisa@beta-ind.com` (Beta org_owner) can see Beta data but NOT Acme data

This confirms that RLS policies are correctly applied to the seeded data.

---

## 10. CLI Interface

### Commands

```bash
# Seed the database configured in .env.local (or DATABASE_URL)
pnpm db:seed

# Seed with cleanup (wipe existing seed data first)
pnpm db:seed --cleanup

# Seed staging environment
pnpm db:seed --env=staging

# Force re-seed even if already applied
pnpm db:seed --force

# Skip auth user creation (DB records only)
pnpm db:seed --skip-auth

# Dry run — show what would be inserted without inserting
pnpm db:seed --dry-run
```

### Output

```
🌱 RevBrain Database Seeder
━━━━━━━━━━━━━━━━━━━━━━━━━━

Environment: development
Database:    postgresql://...@localhost:5432/revbrain

Step 1/9: Seeding plans...           ✓ 3 plans
Step 2/9: Seeding organizations...   ✓ 2 organizations
Step 3/9: Seeding users...           ✓ 8 users
Step 4/9: Creating auth users...     ✓ 7 auth users (1 pending skipped)
Step 5/9: Seeding projects...        ✓ 4 projects
Step 6/9: Seeding audit logs...      ✓ 10 audit logs
Step 7/9: Seeding support tickets... ✓ 6 tickets, 10 messages
Step 8/9: Seeding coupons...         ✓ 4 coupons
Step 9/9: Seeding overrides...       ✓ 2 overrides

━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Seed complete! 49 entities created.

Login Credentials:
┌─────────────────────┬──────────────┬────────────────┐
│ Email               │ Role         │ Password       │
├─────────────────────┼──────────────┼────────────────┤
│ admin@revbrain.io   │ system_admin │ RevBrain2024!  │
│ david@acme.com      │ org_owner    │ RevBrain2024!  │
│ sarah@acme.com      │ admin        │ RevBrain2024!  │
│ mike@acme.com       │ operator     │ RevBrain2024!  │
│ amy@acme.com        │ reviewer     │ RevBrain2024!  │
│ lisa@beta-ind.com   │ org_owner    │ RevBrain2024!  │
│ tom@beta-ind.com    │ operator     │ RevBrain2024!  │
└─────────────────────┴──────────────┴────────────────┘
```

---

## 11. Environment Strategy

| Environment         | Seeded By                        | Auth Users                   | Production Guard                             | Cleanup Allowed        |
| ------------------- | -------------------------------- | ---------------------------- | -------------------------------------------- | ---------------------- |
| **Local (real DB)** | Developer manually               | Yes (default password)       | No                                           | Yes                    |
| **Staging**         | CI/CD or manual                  | Yes (default password)       | No                                           | Yes                    |
| **Demo**            | Pre-deployment script            | Yes (demo-specific password) | No                                           | Yes                    |
| **Production**      | Never (unless explicit override) | No                           | `--i-know-what-im-doing` required + 5s delay | Only via explicit flag |
| **CI/CD**           | Test setup fixture               | Yes (test password)          | No                                           | Always (fresh per run) |

### Environment Detection

```typescript
const env = process.env.APP_ENV || process.env.NODE_ENV || 'development';
```

The seeder loads environment variables from the appropriate `.env` file:

- `.env.local` for local development
- `.env.dev` for staging
- `.env.prod` for production (with safeguards)

---

## 12. Implementation Plan

### Tasks

| #   | Task                                                                                         | Effort | Dependencies        |
| --- | -------------------------------------------------------------------------------------------- | ------ | ------------------- |
| S.1 | Create `packages/database/src/seeders/transform.ts` — map mock types to Drizzle insert types | 2-3h   | None                |
| S.2 | Create `packages/database/src/seeders/seed-log.ts` — idempotency tracking                    | 1h     | None                |
| S.3 | Create `packages/database/src/seeders/auth-users.ts` — Supabase Auth user creation           | 2h     | Supabase connection |
| S.4 | Create `packages/database/src/seeders/index.ts` — orchestrator with dependency ordering      | 2-3h   | S.1, S.2            |
| S.5 | Create `packages/database/src/seed.ts` — CLI entry point with argument parsing               | 1-2h   | S.4                 |
| S.6 | Add `db:seed` script to `package.json`                                                       | 5m     | S.5                 |
| S.7 | Post-seed RLS verification                                                                   | 1h     | S.4, Supabase       |
| S.8 | Integration test: seed → verify → cleanup → re-seed                                          | 2h     | S.4                 |

**Total effort:** ~1.5–2 days

### Verification

- **Integration test:** Seed, query each table to verify counts match, cleanup, re-seed — all pass
- **Auth test:** Log in as each seed user via Supabase Auth — all succeed
- **RLS test:** Query as Acme user, verify zero Beta data visible
- **Idempotency test:** Run `db:seed` twice — second run skips without error

---

## 13. Testing Strategy

### Unit Tests

```
transform.test.ts:
  - transformPlan() maps all fields correctly
  - transformUser() handles null invitedBy
  - transformProject() maps status enum values
  - All MOCK_IDS are preserved through transformation
```

### Integration Tests

```
seed.integration.test.ts:
  - Full seed creates expected entity counts
  - Cleanup removes all seeded entities
  - Re-seed after cleanup produces same counts
  - Idempotency: second seed without cleanup is a no-op
  - Auth users can authenticate after seeding
  - RLS: org_owner sees own org data only
  - Foreign key relationships are intact (project.ownerId → user.id)
  - Conflict handling: partial seed + re-run doesn't duplicate
```

### CI Considerations

For CI pipelines that test against a real database:

1. Seed data as test setup fixture
2. Run E2E tests against seeded database
3. Cleanup as test teardown
4. Each CI run gets a fresh seed (no reliance on previous state)

---

## Appendix: Comparison with Procure

| Aspect                | Procure                                                                                            | RevBrain (Proposed)                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Architecture**      | 3-layer (Builders → Seeders → Scenarios)                                                           | Single-layer (Transform + Orchestrate)                                |
| **Curated data**      | ~5,800 lines across 11 files                                                                       | ~1,100 lines across 8 files                                           |
| **Entity types**      | Tenants, users, suppliers, POs, agents, signals, shipments, playbooks, emails, invoices, contracts | Plans, orgs, users, projects, audit logs, tickets, coupons, overrides |
| **DB client**         | Supabase client (`supabase.from().insert()`)                                                       | Drizzle ORM (`db.insert().values()`)                                  |
| **RLS handling**      | `setTenantContext()` RPC                                                                           | Service role bypass                                                   |
| **Deterministic IDs** | UUID v5 via `deterministicUUID()`                                                                  | Pre-defined constants (`MOCK_IDS`)                                    |
| **Idempotency**       | `seed_log` table                                                                                   | `_seed_log` table (same concept)                                      |
| **Random data**       | Faker.js with seeded randomness                                                                    | Not needed (curated only)                                             |
| **Scenarios**         | 9 named business scenarios                                                                         | Not needed (single curated scenario)                                  |
| **CLI**               | `--curated`, `--random`, `--cleanup`                                                               | `--cleanup`, `--force`, `--skip-auth`, `--dry-run`                    |
| **Auth integration**  | Manual auth user scripts                                                                           | Integrated `supabase.auth.admin.createUser()`                         |
| **Complexity**        | ~3,000 lines of seeder code                                                                        | ~500 lines (estimated)                                                |

### Why RevBrain's Approach Is Simpler

1. **RevBrain has fewer entity types** (8 vs. 11+) and fewer relationships
2. **The curated data already exists** in mock files — no builders needed
3. **Drizzle ORM provides type safety** for inserts — no manual schema mapping
4. **Single scenario is sufficient** — Acme Corp + Beta Industries covers all role/plan combinations
5. **Auth user creation is integrated** — Procure had it as a separate manual step

### What RevBrain Can Add Later (If Needed)

- **Builders:** Pure functions for generating random entities (useful for load testing)
- **Scenarios:** Named configurations for specific test cases (e.g., `tenantAtSeatLimit`)
- **Scaling:** Generate hundreds/thousands of entities for performance testing
- **Data Factory package:** Extract to `packages/data-factory/` if complexity grows

These are not needed for MVP. The curated seeder provides the immediate value.
