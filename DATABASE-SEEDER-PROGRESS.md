# Database Seeder — Implementation Progress

> Tracking implementation of [DATABASE-SEEDER-SPEC.md](./DATABASE-SEEDER-SPEC.md) v2.0.
> Each task is tested, formatted, linted, and committed before moving to the next.

---

## Phase 1: Extract Seed Data Package (no Supabase needed)

| Task | Description                                                                     | Spec Section     | Status  | Commit |
| ---- | ------------------------------------------------------------------------------- | ---------------- | ------- | ------ |
| S.0a | Create `packages/seed-data/` package with tsconfig, package.json                | §4 Architecture  | Pending | —      |
| S.0b | Move seed data files from `apps/server/src/mocks/` to `packages/seed-data/src/` | §4 Architecture  | Pending | —      |
| S.0c | Update `apps/server/src/mocks/index.ts` to import from `@revbrain/seed-data`    | §4 Architecture  | Pending | —      |
| S.0d | Update `apps/client/src/lib/mock-ids.ts` to import from `@revbrain/seed-data`   | §4 Architecture  | Pending | —      |
| S.0e | Verify all existing tests pass with new package structure                       | §4 Architecture  | Pending | —      |
| S.0f | Add referential integrity test for seed data (FK references valid)              | §14 Verification | Pending | —      |

## Phase 2: Seeder Core (needs DATABASE_URL)

| Task | Description                                                            | Spec Section                           | Status  | Commit |
| ---- | ---------------------------------------------------------------------- | -------------------------------------- | ------- | ------ |
| S.1a | Create `_seed_runs` table creation logic + seed-log.ts                 | §8 Idempotency                         | Pending | —      |
| S.1b | Create per-entity mapping functions (toPlanInsert, toUserInsert, etc.) | §4 Transform                           | Pending | —      |
| S.1c | Create orchestrator with phased execution + FK-ordered upserts         | §5 Phased Execution, §6 Data Inventory | Pending | —      |
| S.1d | Create preflight checks (DB host verification, environment safety)     | §10 Environment Safety                 | Pending | —      |
| S.1e | Create CLI entry point with arg parsing                                | §12 CLI Interface                      | Pending | —      |
| S.1f | Add `db:seed` script to package.json                                   | §12 CLI                                | Pending | —      |
| S.1g | Integration test: seed → verify counts → cleanup → re-seed             | §14 Verification                       | Pending | —      |

## Phase 3: Auth Reconciliation (needs SUPABASE_SERVICE_ROLE_KEY)

| Task | Description                                                 | Spec Section           | Status  | Commit |
| ---- | ----------------------------------------------------------- | ---------------------- | ------- | ------ |
| S.2a | Create auth-users.ts with full reconciliation logic         | §7 Auth Reconciliation | Pending | —      |
| S.2b | Wire auth reconciliation into orchestrator Phase 2          | §5 Phased Execution    | Pending | —      |
| S.2c | Handle cleanup auth ID caching (read before delete)         | §9 Cleanup             | Pending | —      |
| S.2d | Integration test: auth create → login → cleanup → re-create | §14 Verification       | Pending | —      |

## Phase 4: RLS Verification (needs Supabase Auth working)

| Task | Description                                         | Spec Section         | Status  | Commit |
| ---- | --------------------------------------------------- | -------------------- | ------- | ------ |
| S.3a | Create RLS verification suite (10 checks from spec) | §11 RLS Verification | Pending | —      |
| S.3b | Wire verification into orchestrator Phase 3         | §5 Phased Execution  | Pending | —      |
| S.3c | Add `--verify-only` CLI flag                        | §12 CLI              | Pending | —      |

---

## Spec Coverage Matrix

| Spec Section                            | Tasks Covering It             | Status                      |
| --------------------------------------- | ----------------------------- | --------------------------- |
| §1 Why This Matters                     | N/A (motivation)              | Covered by implementation   |
| §2 Current State                        | N/A (analysis)                | Covered by implementation   |
| §3 Procure Reference                    | N/A (context)                 | Covered by design decisions |
| §4 Architecture (shared package)        | S.0a-S.0e                     | **Pending**                 |
| §4 Architecture (transform decision)    | S.1b                          | **Pending**                 |
| §4 Architecture (schema drift)          | S.0f, S.1b (TypeScript types) | **Pending**                 |
| §5 Phased Execution (Phase 0 preflight) | S.1d                          | **Pending**                 |
| §5 Phased Execution (Phase 1 DB seed)   | S.1c                          | **Pending**                 |
| §5 Phased Execution (Phase 2 auth)      | S.2a, S.2b                    | **Pending**                 |
| §5 Phased Execution (Phase 3 verify)    | S.3a, S.3b                    | **Pending**                 |
| §5 Partial failure handling             | S.1c, S.2b                    | **Pending**                 |
| §6 Data Inventory (49 entities)         | S.1c                          | **Pending**                 |
| §6 Insertion order (FK-safe)            | S.1c                          | **Pending**                 |
| §6 Self-referencing users               | S.1c                          | **Pending**                 |
| §7 Auth users to create                 | S.2a                          | **Pending**                 |
| §7 Password handling (env var)          | S.2a                          | **Pending**                 |
| §7 Edge case matrix (6 scenarios)       | S.2a                          | **Pending**                 |
| §8 Upsert semantics                     | S.1c                          | **Pending**                 |
| §8 `_seed_runs` table                   | S.1a                          | **Pending**                 |
| §9 Cleanup (deterministic IDs)          | S.1c                          | **Pending**                 |
| §9 Cleanup safety (confirmation)        | S.1e                          | **Pending**                 |
| §9 Auth cleanup (cache IDs first)       | S.2c                          | **Pending**                 |
| §10 DB host verification                | S.1d                          | **Pending**                 |
| §10 No production seeding               | S.1d                          | **Pending**                 |
| §10 Preflight output                    | S.1d                          | **Pending**                 |
| §11 RLS checks (10 defined)             | S.3a                          | **Pending**                 |
| §11 When to run                         | S.3c                          | **Pending**                 |
| §12 CLI commands                        | S.1e                          | **Pending**                 |
| §12 CLI output format                   | S.1e                          | **Pending**                 |
| §13 Error handling matrix               | S.1c, S.2a, S.3a              | **Pending**                 |
| §13 Concurrency (advisory lock)         | S.1c                          | **Pending**                 |
| §14 Implementation plan                 | This document                 | In progress                 |

---

## Auditor Implementation Notes (from reviews)

Applied during implementation:

- [x] Lightweight per-entity mapping functions (not full transform layer)
- [ ] Drop `_seed_entities` provenance — use deterministic ID constants for cleanup
- [ ] Cache auth IDs before cleanup deletes
- [ ] Guard Phase 3 against Phase 2 failures
- [ ] Use email filter on `listUsers()` not full scan
- [ ] Type assertion: `const values: (typeof table.$inferInsert)[] = data`
- [ ] Advisory lock for concurrency (`pg_advisory_lock`)
- [ ] Derive RLS expected counts from seed data, not hardcoded
- [ ] Add `--reset-passwords` to CLI or remove from error matrix
- [ ] Add timeout on auth API calls
