# RevBrain — Database Seeder Spec

> **Purpose:** Specification for a database seeding system that populates a real Supabase/PostgreSQL database with curated test data. Bridges the gap between RevBrain's in-memory mock mode and real database environments (staging, QA, demos). Written for external review.
>
> **Context:** RevBrain is a multi-tenant SaaS for Salesforce CPQ → RCA migration. Uses Supabase (PostgreSQL) with Drizzle ORM, Row-Level Security (RLS), and a dual-adapter architecture (mock mode for offline dev, production mode for real databases).
>
> **Date:** 2026-03-20 | **Revision:** 2.0 (post dual external review)

---

## Table of Contents

1. [Why This Matters](#1-why-this-matters)
2. [Current State](#2-current-state)
3. [Reference: Procure's Approach](#3-reference-procures-approach)
4. [Architecture](#4-architecture)
5. [Phased Execution Model](#5-phased-execution-model)
6. [Data Inventory](#6-data-inventory)
7. [Auth User Reconciliation](#7-auth-user-reconciliation)
8. [Idempotency & Upsert Semantics](#8-idempotency--upsert-semantics)
9. [Cleanup & Provenance](#9-cleanup--provenance)
10. [Environment Safety](#10-environment-safety)
11. [RLS Verification Suite](#11-rls-verification-suite)
12. [CLI Interface](#12-cli-interface)
13. [Error Handling Matrix](#13-error-handling-matrix)
14. [Implementation Plan](#14-implementation-plan)

---

## 1. Why This Matters

RevBrain has 8 curated mock data files with ~49 entities powering local development via in-memory repositories. This data cannot reach a real database. The seeder solves:

| Problem                            | Impact                                       | Who             |
| ---------------------------------- | -------------------------------------------- | --------------- |
| Empty staging after deploy         | Manual setup before every test cycle         | Engineering, QA |
| No demo data                       | Sales demos require hand-populating          | Sales, Product  |
| Mock-mode bugs differ from DB-mode | Data shape mismatches between environments   | QA              |
| New engineer onboarding friction   | Must learn manual tenant/user creation       | Engineering     |
| No E2E fixtures for real DB        | Playwright tests only work against mock mode | CI/CD           |
| No Supabase Auth users exist       | Mock mode bypasses auth entirely             | Engineering     |

**Value:** A single command (`pnpm db:seed`) populates any database with the same curated data used in mock mode — consistently, reproducibly, safely.

---

## 2. Current State

### What exists (mock layer)

8 seed data files at `apps/server/src/mocks/` with deterministic IDs (`MOCK_IDS`):

| File                  | Count  | Data                              |
| --------------------- | ------ | --------------------------------- |
| `plans.ts`            | 3      | Starter, Pro, Enterprise          |
| `organizations.ts`    | 2      | Acme Corp, Beta Industries        |
| `users.ts`            | 8      | All 5 roles + pending user        |
| `projects.ts`         | 4      | Active, completed, draft          |
| `audit-logs.ts`       | 10     | Onboarding, invitations, updates  |
| `support-tickets.ts`  | 6 + 10 | Tickets with messages             |
| `coupons.ts`          | 4      | Active, expired, scheduled, maxed |
| `tenant-overrides.ts` | 2      | Active grant, expired grant       |

### What's missing

`db:seed` command, Drizzle-based insertion, Supabase Auth user creation, idempotency, CLI, environment safety.

### What exists (database layer)

Drizzle ORM schema (`packages/database/src/schema.ts`), migration system, DB client, Drizzle repositories. The seeder bridges mock data → Drizzle schema → PostgreSQL.

---

## 3. Reference: Procure's Approach

Procure (sister project) built a 3-layer Data Factory: Builders → Seeders → Scenarios. Key features: curated seeder reusing mock data, deterministic UUIDs (UUID v5), `seed_log` idempotency, RLS context management (`setTenantContext()` RPC), CLI with progress output.

**What RevBrain adopts:** Curated mock data reuse, idempotency tracking, CLI with options, auth user creation.

**What RevBrain skips:** 3-layer architecture (too complex for 49 entities), Faker random generation, named scenarios, Supabase client for insertion (using Drizzle ORM instead).

---

## 4. Architecture

### Structural decision: Seed data in a shared package

**Problem identified by review:** The spec originally placed the seeder in `packages/database/` importing from `apps/server/src/mocks/`. This violates monorepo dependency rules — shared packages must not import from app packages.

**Solution:** Extract seed data to a shared package consumed by both the mock system and the seeder:

```
packages/seed-data/               # NEW: shared fixture data
├── src/
│   ├── plans.ts                   # Moved from apps/server/src/mocks/
│   ├── organizations.ts
│   ├── users.ts
│   ├── projects.ts
│   ├── audit-logs.ts
│   ├── support-tickets.ts
│   ├── coupons.ts
│   ├── tenant-overrides.ts
│   ├── constants.ts               # MOCK_IDS
│   ├── helpers.ts                 # daysAgo, hoursAgo, cloneArray
│   └── index.ts                   # Barrel exports
│
apps/server/src/mocks/
├── index.ts                       # Imports from @revbrain/seed-data, creates mutable stores
│
packages/database/
├── src/
│   ├── seed.ts                    # CLI entry point
│   └── seeders/
│       ├── index.ts               # Orchestrator (imports from @revbrain/seed-data)
│       ├── seed-log.ts            # Run tracking
│       └── auth-users.ts          # Supabase Auth reconciliation
```

**Dependency flow:**

```
packages/seed-data  ←  apps/server/src/mocks (mock stores)
packages/seed-data  ←  packages/database/src/seeders (DB insertion)
```

Both consumers import the same source data. No cross-layer coupling.

### Transform layer: Likely unnecessary

**Review feedback:** If mock types (from `@revbrain/contract`) align with Drizzle insert types (from `schema.ts`), a dedicated transform file is over-engineering.

**Decision:** Inline any field mapping directly in the orchestrator. If fewer than 5 fields differ per entity, no separate transform module is needed. The Drizzle insert type (`typeof table.$inferInsert`) will enforce completeness at compile time — if a required column is missing from seed data, TypeScript catches it.

### Schema drift protection

Add a CI check: the seeder's TypeScript compilation is itself a schema compatibility test. If `schema.ts` adds a `NOT NULL` column without a default, and seed data doesn't provide it, the build fails. No separate compatibility check needed.

---

## 5. Phased Execution Model

**Key insight from review:** DB writes and Supabase Auth calls cannot be in a single transaction. Auth is an external API call — it cannot be rolled back with a Postgres `ROLLBACK`. The seeder must handle partial failures across these boundaries.

### Four phases

```
Phase 0: Preflight
  ├── Validate target environment (DB host allowlist)
  ├── Check schema compatibility (TypeScript compilation)
  ├── Check prior seed runs
  └── Display plan (entity counts, target DB)

Phase 1: DB Seed (transactional)
  ├── Insert/upsert all relational entities in FK order
  ├── Record entity provenance
  └── Mark run status: db_complete

Phase 2: Auth Reconciliation (non-transactional, resumable)
  ├── For each seed user: create or find Supabase Auth user
  ├── Update DB user records with auth IDs
  ├── Handle existing users gracefully
  └── Mark run status: auth_complete

Phase 3: Verification
  ├── Count checks (each table matches expected)
  ├── Auth login checks (each seed user can authenticate)
  ├── RLS checks (cross-tenant isolation verified)
  └── Mark run status: completed
```

### Partial failure handling

| Phase 1 fails     | DB transaction rolls back. No cleanup needed. Run can be retried.                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Phase 2 fails** | DB is seeded. Auth is partially done. Run marked `partial_auth`. Re-run resumes auth reconciliation for remaining users. |
| **Phase 3 fails** | DB + Auth complete. Verification issues logged as warnings. Run marked `completed_with_warnings`.                        |

---

## 6. Data Inventory

49 entities across 8 types, all with deterministic IDs from `MOCK_IDS`:

| Entity           | Count | FK Dependencies                                 |
| ---------------- | ----- | ----------------------------------------------- |
| Plans            | 3     | None                                            |
| Organizations    | 2     | plans.id                                        |
| Users            | 8     | organizations.id, users.id (self-ref invitedBy) |
| Projects         | 4     | users.id, organizations.id                      |
| Audit Logs       | 10    | users.id, organizations.id                      |
| Support Tickets  | 6     | users.id, organizations.id                      |
| Ticket Messages  | 10    | support_tickets.id                              |
| Coupons          | 4     | None                                            |
| Tenant Overrides | 2     | organizations.id, users.id                      |

### Insertion order (FK-safe)

1. plans → 2. organizations → 3. users (with `invitedBy: null`) → 4. users UPDATE (set invitedBy) → 5. projects → 6. audit_logs → 7. support_tickets → 8. ticket_messages → 9. coupons → 10. tenant_overrides

### Self-referencing users

Two-pass: insert all users with `invitedBy: null`, then update `invitedBy` for users who were invited by other seed users.

---

## 7. Auth User Reconciliation

This is the hardest part of the seeder and requires explicit handling of every edge case.

### Auth users to create

| Email               | Role         | Org             | Auth Created?               |
| ------------------- | ------------ | --------------- | --------------------------- |
| `admin@revbrain.io` | system_admin | Platform        | Yes                         |
| `david@acme.com`    | org_owner    | Acme Corp       | Yes                         |
| `sarah@acme.com`    | admin        | Acme Corp       | Yes                         |
| `mike@acme.com`     | operator     | Acme Corp       | Yes                         |
| `amy@acme.com`      | reviewer     | Acme Corp       | Yes                         |
| `lisa@beta-ind.com` | org_owner    | Beta Industries | Yes                         |
| `tom@beta-ind.com`  | operator     | Beta Industries | Yes                         |
| `pending@acme.com`  | operator     | Acme Corp       | **No** (pending invitation) |

### Password handling

Passwords are **not hardcoded in the spec or source code**. Instead:

```typescript
const seedPassword = process.env.SEED_PASSWORD || 'RevBrain-Dev-2026!';
```

- **Local/staging:** Uses `SEED_PASSWORD` env var or a default (acceptable for dev)
- **CI:** `SEED_PASSWORD` set from CI secrets
- **Credentials displayed:** Only when `--show-credentials` flag is explicitly passed. Not printed by default except in local/development environment.

### Edge case matrix

| Scenario                                                  | Action                                                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Auth user **does not exist**                              | Create via `supabase.auth.admin.createUser()`                                                    |
| Auth user **exists with same email**                      | Fetch existing user, map DB record to existing auth ID, optionally update metadata               |
| Auth **creation succeeds** but DB update fails            | Log warning, continue. Auth user exists but DB mapping is missing. Next run will reconcile.      |
| Auth creation **fails** (rate limit, API error)           | Log error, mark user as `auth_failed`, continue with remaining users. Run marked `partial_auth`. |
| DB `supabaseUserId` **already set** and matches auth      | Skip (already reconciled)                                                                        |
| DB `supabaseUserId` **already set** but auth user missing | Clear DB field, recreate auth user                                                               |

### Implementation

```typescript
async function reconcileAuthUser(supabase, db, seedUser, password) {
  // Skip pending/inactive users
  if (!seedUser.isActive) return { status: 'skipped', reason: 'inactive' };

  // Check if already reconciled
  const dbUser = await db.query.users.findFirst({ where: eq(users.id, seedUser.id) });
  if (dbUser?.supabaseUserId) {
    // Verify auth user still exists
    const { data } = await supabase.auth.admin.getUserById(dbUser.supabaseUserId);
    if (data.user) return { status: 'already_reconciled' };
    // Auth user gone — clear and recreate
  }

  // Check if auth user exists by email
  const { data: existing } = await supabase.auth.admin.listUsers();
  const existingAuth = existing.users.find((u) => u.email === seedUser.email);

  if (existingAuth) {
    // Map to existing auth user
    await db
      .update(users)
      .set({ supabaseUserId: existingAuth.id })
      .where(eq(users.id, seedUser.id));
    return { status: 'mapped_existing', authId: existingAuth.id };
  }

  // Create new auth user
  const { data, error } = await supabase.auth.admin.createUser({
    email: seedUser.email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: seedUser.fullName,
      role: seedUser.role,
      organization_id: seedUser.organizationId,
    },
  });

  if (error) return { status: 'auth_failed', error: error.message };

  await db.update(users).set({ supabaseUserId: data.user.id }).where(eq(users.id, seedUser.id));
  return { status: 'created', authId: data.user.id };
}
```

---

## 8. Idempotency & Upsert Semantics

### Primary mechanism: Upsert, not insert-ignore

**Review feedback:** `onConflictDoNothing()` silently skips updates, causing DB data to drift from seed source when mock data changes. For curated datasets, **upsert** is correct:

```typescript
await db
  .insert(plans)
  .values(seedPlans)
  .onConflictDoUpdate({
    target: plans.id,
    set: {
      name: sql`excluded.name`,
      price: sql`excluded.price`,
      limits: sql`excluded.limits`,
      features: sql`excluded.features`,
      // ... all mutable fields
    },
  });
```

This means: re-running `db:seed` always aligns the database with the current seed data source. If mock data changes, the next seed run updates existing rows.

### Operational tracking: `_seed_runs` table

A lightweight run log for operational visibility (not as a gate):

```sql
CREATE TABLE IF NOT EXISTS _seed_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_name TEXT NOT NULL,          -- 'curated'
  status TEXT NOT NULL,                -- started, db_complete, auth_complete, completed, failed
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  environment TEXT,
  entity_counts JSONB,
  auth_results JSONB,
  error_summary TEXT
);
```

This is **not a gate** — the seeder doesn't refuse to run because a prior run exists. It always upserts. The table provides operational auditability: when was the last seed? What was the status? How many entities?

---

## 9. Cleanup & Provenance

### Provenance tracking

To safely identify seed data for cleanup, each seeded row is tracked:

```sql
CREATE TABLE IF NOT EXISTS _seed_entities (
  dataset_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  entity_id UUID NOT NULL,
  run_id UUID NOT NULL,
  PRIMARY KEY (dataset_name, table_name, entity_id)
);
```

After inserting each entity, record it in `_seed_entities`. Cleanup is then driven by provenance, not hardcoded ID lists:

```typescript
// Cleanup: delete all entities from dataset 'curated'
const seededEntities = await db
  .select()
  .from(seedEntities)
  .where(eq(seedEntities.datasetName, 'curated'))
  .orderBy(/* reverse FK order */);

for (const entity of seededEntities) {
  await db
    .delete(tableMap[entity.tableName])
    .where(eq(tableMap[entity.tableName].id, entity.entityId));
}
```

**Benefits over hardcoded IDs:**

- New seed entities are automatically tracked
- No manual reverse-order delete lists to maintain
- Cleanup is dataset-scoped (supports future `test` dataset alongside `curated`)

### Cleanup safety

- `--cleanup` shows row counts and requires `--yes` confirmation (or `--non-interactive` for CI)
- Cleanup deletes in reverse FK order (overrides → messages → tickets → audit → projects → users → orgs → plans)
- Auth user deletion: for each cleaned user, calls `supabase.auth.admin.deleteUser()`

---

## 10. Environment Safety

### Database identity verification (not just env vars)

**Review feedback:** `APP_ENV` alone is insufficient for a destructive tool. The seeder verifies the **actual database target**:

```typescript
// Parse database host from connection string
const dbHost = new URL(process.env.DATABASE_URL).hostname;

// Known environment registry
const KNOWN_TARGETS = {
  localhost: { env: 'local', safe: true },
  '127.0.0.1': { env: 'local', safe: true },
  'db.*.supabase.co': { env: 'remote', safe: true }, // matches staging/dev projects
};

// Production detection
const isProduction = dbHost.includes('prod') || process.env.APP_ENV === 'production';

if (isProduction) {
  console.error('ERROR: Refusing to seed a production database.');
  console.error(`Database host: ${dbHost}`);
  console.error('Production seeding is not supported. Use a staging project instead.');
  process.exit(1);
}

if (!isKnownTarget(dbHost)) {
  console.error(`WARNING: Unknown database host: ${dbHost}`);
  console.error('Use --allow-unknown-target to proceed.');
  process.exit(1);
}
```

### No production seeding

**Decision (per review):** Remove `--env=production` entirely. The seeder does not support production databases. Period. If production bootstrapping is ever needed, it will be a separate, purpose-built script with its own safety model.

### Preflight output

Before any writes, the seeder displays:

```
🌱 RevBrain Database Seeder — Preflight
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Target:      db.abcdefgh.supabase.co (staging)
Dataset:     curated (49 entities)
Prior runs:  1 (last: 2026-03-19, status: completed)
Action:      Upsert (update existing, insert new)

Proceed? [y/N]
```

In CI (`--non-interactive`), the confirmation is skipped but the preflight info is still logged.

---

## 11. RLS Verification Suite

Post-seed verification is a defined test suite, not a smoke test.

### Checks

| #   | Check                                          | Expected                         |
| --- | ---------------------------------------------- | -------------------------------- |
| 1   | Acme org_owner can read Acme org               | Yes                              |
| 2   | Acme org_owner **cannot** read Beta org        | 403 or empty                     |
| 3   | Acme org_owner can read Acme projects          | 4 projects                       |
| 4   | Acme org_owner **cannot** read Beta projects   | 0 projects                       |
| 5   | Beta org_owner can read Beta org               | Yes                              |
| 6   | Beta org_owner **cannot** read Acme org        | 403 or empty                     |
| 7   | system_admin can read all orgs                 | 2 orgs                           |
| 8   | system_admin can read all users                | 8 users                          |
| 9   | Pending user **cannot** authenticate           | Auth fails                       |
| 10  | Support ticket messages inherit tenant scoping | Acme user sees only Acme tickets |

### Implementation

The verification step authenticates as each seed user via `supabase.auth.signInWithPassword()` and runs scoped queries. Results are reported as pass/fail with details.

### When to run

- **Always** after a fresh seed (Phase 3)
- **Standalone** via `pnpm db:seed --verify-only` (no seeding, just checks)
- **In CI** as a post-seed validation step

---

## 12. CLI Interface

```bash
pnpm db:seed                        # Seed (upsert) with interactive confirmation
pnpm db:seed --cleanup --yes        # Wipe seed data and re-seed
pnpm db:seed --skip-auth            # DB records only, no Supabase Auth
pnpm db:seed --show-credentials     # Display login credentials after seeding
pnpm db:seed --dry-run              # Show plan without executing
pnpm db:seed --verify-only          # Run RLS verification without seeding
pnpm db:seed --non-interactive      # CI mode, no prompts
```

**Removed:** `--env=production`, `--force`, `--i-know-what-im-doing`. Production seeding is not supported.

### Output (default)

```
🌱 RevBrain Database Seeder
━━━━━━━━━━━━━━━━━━━━━━━━━━

Target: db.abcdefgh.supabase.co

Phase 1: DB Seed
  plans...            ✓ 3 (2 updated, 1 inserted)
  organizations...    ✓ 2 (2 updated)
  users...            ✓ 8 (8 updated)
  projects...         ✓ 4
  audit_logs...       ✓ 10
  support_tickets...  ✓ 6 + 10 messages
  coupons...          ✓ 4
  overrides...        ✓ 2

Phase 2: Auth Reconciliation
  admin@revbrain.io   ✓ already_reconciled
  david@acme.com      ✓ created
  sarah@acme.com      ✓ created
  mike@acme.com       ✓ mapped_existing
  amy@acme.com        ✓ created
  lisa@beta-ind.com   ✓ created
  tom@beta-ind.com    ✓ created
  pending@acme.com    ⊘ skipped (inactive)

Phase 3: Verification
  RLS checks...       ✓ 10/10 passed

━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Seed complete. 49 entities, 6 auth users.
   Use --show-credentials to display login info.
```

---

## 13. Error Handling Matrix

| Phase         | Failure                                  | State After                              | Recovery                                            |
| ------------- | ---------------------------------------- | ---------------------------------------- | --------------------------------------------------- |
| 0 (Preflight) | Unknown DB host                          | No changes                               | Fix DATABASE_URL or use --allow-unknown-target      |
| 0 (Preflight) | Schema incompatible                      | No changes                               | Update seed data to match schema                    |
| 1 (DB Seed)   | Insert fails (constraint violation)      | Transaction rolled back, no changes      | Fix seed data, re-run                               |
| 1 (DB Seed)   | Connection lost mid-transaction          | Transaction rolled back                  | Re-run                                              |
| 2 (Auth)      | Supabase Auth API error for one user     | DB seeded, some auth users created       | Re-run (reconciliation skips already-created users) |
| 2 (Auth)      | Supabase Auth API down                   | DB seeded, no auth users                 | Re-run later (Phase 2 is resumable)                 |
| 2 (Auth)      | Auth user exists with different password | Mapped to existing (password unchanged)  | Use `--reset-passwords` if password sync needed     |
| 3 (Verify)    | RLS check fails                          | DB + Auth complete, verification warning | Investigate RLS policies                            |
| Cleanup       | FK constraint prevents delete            | Partial cleanup                          | Run again (provenance-driven cleanup retries)       |

### Concurrency

Two developers seeding the same staging DB simultaneously: safe because upserts are idempotent. The `_seed_runs` table may show two concurrent runs, but the final state is the same regardless of execution order.

---

## 14. Implementation Plan

| #   | Task                                                                                                             | Effort | Dependencies        |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------ | ------------------- |
| S.0 | Extract seed data to `packages/seed-data/` — move files, update imports in `apps/server/src/mocks/`              | 2-3h   | None                |
| S.1 | Create `packages/database/src/seeders/index.ts` — orchestrator with phased execution, upsert logic, FK ordering  | 3-4h   | S.0                 |
| S.2 | Create `packages/database/src/seeders/seed-log.ts` — `_seed_runs` + `_seed_entities` table creation and tracking | 1-2h   | None                |
| S.3 | Create `packages/database/src/seeders/auth-users.ts` — full reconciliation with edge case handling               | 3-4h   | Supabase connection |
| S.4 | Create `packages/database/src/seed.ts` — CLI entry point with arg parsing, preflight, environment safety         | 2h     | S.1                 |
| S.5 | Add `db:seed` script to root `package.json`                                                                      | 5m     | S.4                 |
| S.6 | RLS verification suite                                                                                           | 2-3h   | S.1, Supabase       |
| S.7 | Integration test: seed → verify → cleanup → re-seed                                                              | 2-3h   | S.1, S.3            |

**Total effort:** 3-4 days (revised from 1.5-2 days per review feedback)

### Verification

- Full seed creates expected counts per table
- Cleanup removes all seeded entities (provenance-driven)
- Re-seed after cleanup produces same counts
- Upsert: modify mock data, re-seed, verify DB reflects changes
- Auth users can authenticate after seeding
- RLS suite: 10 checks pass
- Concurrent seed runs produce consistent state
- Schema drift: add NOT NULL column without seed data → TypeScript compile error

---

## Appendix: Auditor Feedback Triage

| Feedback                                | Source    | Action                                                                                                           |
| --------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------- |
| Cross-package dependency inversion      | Both      | **Fixed** — seed data extracted to `packages/seed-data/`                                                         |
| Auth edge cases under-specified         | Both      | **Fixed** — full edge case matrix + reconciliation code                                                          |
| Production safeguard is weak            | Both      | **Fixed** — production seeding removed entirely                                                                  |
| Hardcoded passwords                     | Both      | **Fixed** — env var with fallback, `--show-credentials` opt-in                                                   |
| Transaction claim incorrect with Auth   | Auditor 1 | **Fixed** — phased execution model with explicit boundaries                                                      |
| `onConflictDoNothing` hides drift       | Auditor 1 | **Fixed** — upsert semantics for curated data                                                                    |
| Cleanup needs provenance                | Auditor 1 | **Fixed** — `_seed_entities` table                                                                               |
| Environment targeting needs DB identity | Auditor 1 | **Fixed** — database host verification                                                                           |
| RLS verification too thin               | Auditor 1 | **Fixed** — 10-check verification suite                                                                          |
| Transform layer may be unnecessary      | Auditor 2 | **Accepted** — inlined, no separate transform module                                                             |
| `_seed_log` over-engineering            | Auditor 2 | **Partially accepted** — simplified to `_seed_runs` (operational tracking, not a gate)                           |
| Effort estimate optimistic              | Auditor 2 | **Accepted** — revised to 3-4 days                                                                               |
| Entity count inconsistency              | Both      | **Fixed** — consistently 49 entities throughout                                                                  |
| Missing error handling matrix           | Auditor 2 | **Fixed** — Section 13                                                                                           |
| Missing concurrency handling            | Auditor 2 | **Fixed** — upserts are inherently concurrent-safe                                                               |
| Seed versioning unclear                 | Auditor 1 | **Deferred** — upsert semantics make versioning less critical. `_seed_runs` tracks when data was applied.        |
| Multiple seed modes (curated vs test)   | Auditor 1 | **Deferred** — single curated mode sufficient for now. `dataset_name` in tracking tables supports future modes.  |
| Seed data manifest/hash                 | Auditor 1 | **Deferred** — adds complexity without clear near-term value. Can add when dataset versioning becomes important. |

### Comparison with Procure

| Aspect       | Procure                                  | RevBrain                                              |
| ------------ | ---------------------------------------- | ----------------------------------------------------- |
| Architecture | 3-layer (Builders → Seeders → Scenarios) | Single-layer (Orchestrate + Upsert)                   |
| Data source  | `packages/data-factory/src/mocks/`       | `packages/seed-data/` (new shared package)            |
| DB client    | Supabase client                          | Drizzle ORM                                           |
| Idempotency  | `seed_log` + `onConflictDoNothing`       | `_seed_runs` tracking + `onConflictDoUpdate` (upsert) |
| Auth         | Separate manual scripts                  | Integrated reconciliation with edge case handling     |
| RLS          | `setTenantContext()` RPC                 | Service role bypass + post-seed RLS verification      |
| Cleanup      | Hardcoded ID lists                       | Provenance-driven via `_seed_entities`                |
| Production   | Allowed with flag                        | **Not supported** (removed entirely)                  |
| Complexity   | ~3,000 lines                             | ~600 lines (estimated)                                |
