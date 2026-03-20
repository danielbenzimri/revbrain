# Database Seeder — Implementation Progress

> Tracking implementation of [DATABASE-SEEDER-SPEC.md](./DATABASE-SEEDER-SPEC.md) v2.0.
> Each task is tested, formatted, linted, and committed before moving to the next.

---

## Phase 1: Extract Seed Data Package — COMPLETE

| Task | Description                                                           | Spec Section     | Status   | Commit    |
| ---- | --------------------------------------------------------------------- | ---------------- | -------- | --------- |
| S.0a | Create `packages/seed-data/` package (tsconfig, package.json, vitest) | §4 Architecture  | **Done** | `eb9d7d2` |
| S.0b | Move seed data files to `packages/seed-data/src/`                     | §4 Architecture  | **Done** | `eb9d7d2` |
| S.0c | Server mocks re-export from `@revbrain/seed-data`                     | §4 Architecture  | **Done** | `eb9d7d2` |
| S.0d | Client mock-ids re-exports from `@revbrain/seed-data`                 | §4 Architecture  | **Done** | `eb9d7d2` |
| S.0e | All 741 existing tests pass (29 seed-data + 553 server + 159 client)  | §4 Architecture  | **Done** | `eb9d7d2` |
| S.0f | Referential integrity test (14 FK checks + 4 business rules)          | §14 Verification | **Done** | `eb9d7d2` |

**Test coverage added:** 29 tests in `packages/seed-data/src/seed-data.test.ts`:

- 3 MOCK_IDS tests (categories, UUID format, uniqueness)
- 9 entity count tests
- 13 referential integrity tests (all FK references valid)
- 4 business rule tests (all roles covered, all statuses, pending users, messages)

---

## Phase 2: Seeder Core — BLOCKED (needs DATABASE_URL)

| Task | Description                                                 | Spec Section   | Status      | Commit |
| ---- | ----------------------------------------------------------- | -------------- | ----------- | ------ |
| S.1a | Create `_seed_runs` table creation logic + seed-log.ts      | §8 Idempotency | **Blocked** | —      |
| S.1b | Per-entity mapping functions (toPlanInsert, etc.)           | §4 Transform   | **Blocked** | —      |
| S.1c | Orchestrator with phased execution + FK-ordered upserts     | §5, §6         | **Blocked** | —      |
| S.1d | Preflight checks (DB host verification, environment safety) | §10            | **Blocked** | —      |
| S.1e | CLI entry point with arg parsing                            | §12            | **Blocked** | —      |
| S.1f | Add `db:seed` script to package.json                        | §12            | **Blocked** | —      |
| S.1g | Integration test: seed → verify → cleanup → re-seed         | §14            | **Blocked** | —      |

## Phase 3: Auth Reconciliation — BLOCKED (needs SUPABASE_SERVICE_ROLE_KEY)

| Task | Description                                       | Spec Section | Status      | Commit |
| ---- | ------------------------------------------------- | ------------ | ----------- | ------ |
| S.2a | Auth reconciliation logic with edge case handling | §7           | **Blocked** | —      |
| S.2b | Wire auth into orchestrator Phase 2               | §5           | **Blocked** | —      |
| S.2c | Cleanup auth ID caching (read before delete)      | §9           | **Blocked** | —      |
| S.2d | Integration test: auth lifecycle                  | §14          | **Blocked** | —      |

## Phase 4: RLS Verification — BLOCKED (needs Supabase Auth)

| Task | Description                         | Spec Section | Status      | Commit |
| ---- | ----------------------------------- | ------------ | ----------- | ------ |
| S.3a | RLS verification suite (10 checks)  | §11          | **Blocked** | —      |
| S.3b | Wire verification into orchestrator | §5           | **Blocked** | —      |
| S.3c | `--verify-only` CLI flag            | §12          | **Blocked** | —      |

---

## Spec Coverage

| Spec Section                     | Status                                                          |
| -------------------------------- | --------------------------------------------------------------- |
| §4 Architecture (shared package) | **Done** — `packages/seed-data/`                                |
| §4 Architecture (schema drift)   | **Done** — TypeScript compilation + referential integrity tests |
| §4 Transform (mapping functions) | **Blocked** — needs schema types                                |
| §5-§14 (all other sections)      | **Blocked** — needs DATABASE_URL                                |

**Phase 1 complete: 6/17 tasks done. Remaining 11 tasks blocked on Supabase.**

---

## Auditor Notes Applied

- [x] Shared package for seed data (no cross-layer coupling)
- [x] Referential integrity tests for all FK references
- [x] Business rule validation (roles, statuses, messages)
- [x] Single source of truth (client + server import same package)
- [ ] Per-entity mapping functions (Phase 2)
- [ ] Upsert semantics (Phase 2)
- [ ] Advisory lock for concurrency (Phase 2)
- [ ] Auth edge case handling (Phase 3)
- [ ] Auth ID caching before cleanup (Phase 3)
- [ ] RLS verification derived from seed data counts (Phase 4)
