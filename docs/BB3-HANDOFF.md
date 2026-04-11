# BB-3 Implementation — Session Handoff

This document hands off the BB-3 implementation task mid-stream. Feed
it to a new Claude Code thread as the starting prompt.

---

## The task, in one paragraph

We are implementing **BB-3 — the Migration Planner IR Normalizer** per
the authoritative specs in
[docs/MIGRATION-PLANNER-BB3-DESIGN.md](MIGRATION-PLANNER-BB3-DESIGN.md)
(≈2700 lines) and
[docs/MIGRATION-PLANNER-BB3-TASKS.md](MIGRATION-PLANNER-BB3-TASKS.md)
(89 task cards across 9 phases). BB-3 consumes the extraction worker's
`AssessmentFindingInput[]` and produces a deterministic `IRGraph` — the
stable, platform-neutral intermediate representation that downstream
building blocks (BB-4, BB-5, BB-17 re-assessment) consume. The work
lives on the `feat/bb3-wave1` branch. Non-negotiables are enforced by
the `/bb3-doctor` skill and are listed in
[CLAUDE.md](../CLAUDE.md) under "BB-3 Implementation Workflow".

## How we are working — the mandatory loop

From [CLAUDE.md](../CLAUDE.md):

1. **Start every BB-3 task via `/bb3-next`.** The skill reads narrow
   spec anchors only, quotes the non-negotiables for the task, and
   presents a plan before writing any code.
2. **Never declare a task done without `/ship-it`.** `/ship-it` runs
   format → lint → test → build → commit → push and invokes
   `/bb3-doctor` automatically when BB-3 files are touched.
3. **Every 5 shipped BB-3 task commits: invoke `/wave-review`** before
   picking up the next task.
4. **At wave boundaries (Wave 1 / Wave 2 / Wave 3 per spec §14):
   `/wave-review` followed by `/sync-branches`** to promote
   `feat/bb3-wave1` → `staging` → `main` and watch CI/CD on both.
5. **All commits tagged with `Task: <TASK-ID>` in the body** and refs
   to the spec section.

**The user has pre-authorized autonomous continuation**: do not pause
for permission between tasks. Continue task-by-task through `/bb3-next`
→ implement → `/ship-it` until every task is shipped. Self-reflect
(`/wave-review`) periodically.

## BB-3 non-negotiables (copied from CLAUDE.md)

- **RCA neutrality:** zero `PricingProcedure` / `DecisionTable` / `CML` /
  `ContextDefinition` / `ConstraintModelLanguage` in
  `packages/bb3-normalizer/src/` or
  `packages/migration-ir-contract/src/`. (spec §2.4, test A14)
- **Determinism:** zero `Date.now()` / `performance.now()` /
  `Math.random()` / `crypto.randomUUID()` in any code affecting
  `IRGraph`. Wall-clock telemetry lives ONLY in
  `NormalizeResult.runtimeStats`, never on the graph. The ONE allowed
  `new Date().toISOString()` is in `pipeline.ts` populating
  `extractedAt`, and it is commented explicitly. (§6.2, §6.4)
- **canonicalJson only** in identity/hash paths — never
  `JSON.stringify`. (§8.1)
- **NodeRef, not `string[]`** for any node-to-node reference. (§5.1a)
- **Deterministic parser budgets** (byte / AST-node / depth). No
  wall-clock timeouts. (§8.4)
- **Contract package stays thin:** `@revbrain/migration-ir-contract`
  depends only on `zod`. No `tree-sitter`, no `@revbrain/database`, no
  `@revbrain/tpr`. Enforced by
  `scripts/check-no-native-deps.mjs`. (§6.3)
- **Every non-composite IR node** has
  `evidence.sourceFindingKeys.length >= 1`. (§5.4)

## Where we are right now

**Branch:** `feat/bb3-wave1` — pushed to origin, 82 commits ahead of `main`.

**Last commit:** `5fbf603 test(bb3): PH7.14 RCA-leakage lint test (A14)`

**Test suite health:** 716+ tests passing across the monorepo — 456 in
`@revbrain/bb3-normalizer`, 133 in `@revbrain/migration-ir-contract`,
301 in `@revbrain/worker`. Full `pnpm lint && pnpm test && pnpm build`
is green.

**Branches NOT touched:** `staging` and `main` have not been updated
this session. `/sync-branches` was intentionally deferred to the end
of the session so a human can observe the CI/CD runs.

### Commits pushed this session (selected highlights)

- `5fbf603` PH7.14 RCA-leakage lint
- `81e1e28` PH7.13 determinism harness
- `e485566` PH7.11 integration harness
- `4a668b7` PH7.1–PH7.10 fixture builders
- `2052581` registerAllNormalizers wiring
- `5fbf603..b45baa7` all 17 Phase 6 (Wave 3 long tail) normalizers
- `84a7cb8..` Phase 5 (Wave 2 automation) — 6 normalizers
- `c84f09d..` Phase 4 (Wave 1) — 17 normalizers + shared base helpers
- `ab3e4c2..` Phase 3 pipeline stages + `normalize()` entry
- `8c02f1d..` Phase 2 shared algorithms (Tarjan, formula parser, SOQL,
  Apex tree-sitter wrapper, edge projection)
- `7e089b1..` Phase 1 identity (canonicalJson, identityHash, structural
  signature)
- `b48cc1f..` Phase 0 contract types (PH0.1 – PH0.10)

Run `git log origin/main..HEAD --oneline` to see the full 82-commit
list.

### Phase status

| Phase | Status         | Notes                                                                                                 |
| ----- | -------------- | ----------------------------------------------------------------------------------------------------- |
| PH0   | ✅ DONE        | PH0.1 – PH0.10 all shipped                                                                            |
| PH1   | ✅ DONE        | PH1.1 – PH1.6 shipped (PH1.2/3/4/6 bundled in one commit with multi-task footer)                      |
| PH2   | ✅ DONE        | PH2.1 – PH2.6 shipped                                                                                 |
| PH3   | ✅ DONE        | PH3.1 – PH3.11 shipped                                                                                |
| PH4   | ✅ DONE        | PH4.1 – PH4.17 shipped                                                                                |
| PH5   | ✅ DONE        | PH5.1 – PH5.6 shipped                                                                                 |
| PH6   | ✅ DONE        | PH6.1 – PH6.17 shipped                                                                                |
| PH7   | 🟡 MOSTLY      | PH7.1–PH7.11 + PH7.13 + PH7.14 shipped. **PH7.12 (staging golden) deferred** — see below.             |
| PH8   | 🟡 IN PROGRESS | PH8.1 + PH8.3 + PH8.4 **in working tree, not yet committed**. **PH8.2 + PH8.5 deferred** — see below. |

## What is NOT yet committed in the working tree

These files are uncommitted at handoff:

- `apps/worker/src/pipeline/run-bb3.ts` + `.test.ts` — **PH8.1**
  `runBB3()` wrapper + `buildSchemaCatalogFromFindings()` helper. 10
  tests passing.
- `apps/worker/src/pipeline/bb3-metrics.ts` + `.test.ts` — **PH8.3**
  `summarizeNormalizeResult()` + `emitBB3Metrics()`. 5 tests passing.
- `apps/worker/scripts/run-bb3-smoke.ts` — **PH8.4** CLI smoke script.
  Runnable via `pnpm --filter @revbrain/worker smoke:bb3` (script
  entry added to `apps/worker/package.json`). Verified locally — emits
  `apps/worker/output/bb3-smoke.json` and a 5-line summary.
- `apps/worker/package.json` — added
  `@revbrain/bb3-normalizer` + `@revbrain/migration-ir-contract` to
  `dependencies` and the `smoke:bb3` script entry.
- `pnpm-lock.yaml` — updated by the install that added the new
  workspace deps.

Everything under `.claude/skills/`, `.claude/settings.json`,
`CLAUDE.md`, `apps/worker/scripts/seed-run-from-json.ts`, and the two
`docs/MIGRATION-PLANNER-BB3-*.md` files are **user-local pre-existing
state** — do NOT touch them, do NOT commit them.

## What is intentionally deferred

### PH7.12 — Staging golden file (A12)

Requires capturing the IRGraph output from a real staging extraction
and wiring a CI job that fails on byte-level diff. Needs:

- access to staging / a real extraction run
- a CI workflow change in `.github/workflows/ci.yml`
- human review of the golden on the first capture

**Not safe for autonomous execution.** Leave as a deferred item.

### PH8.2 — Persistence layer (IRGraph JSONB column)

Requires a Drizzle migration adding an encrypted JSONB column to the
assessments table, plus a new repository matching the triple-adapter
pattern (Mock + PostgREST + Drizzle). Database schema changes are
high-blast-radius during an autonomous run.

**Not safe for autonomous execution.** Leave as a deferred item.

### PH8.5 — Playwright smoke (assessment page IR badge)

Requires touching three layers (server route, client component, e2e
Playwright spec) and needs the staging env to be available. The badge
is explicitly a placeholder surface per the task card, but the test
requires real staging.

**Not safe for autonomous execution.** Leave as a deferred item.

### Session-end `/sync-branches`

The last step of CLAUDE.md's mandatory loop is to promote
`feat/bb3-wave1` → `staging` → `main` and watch CI/CD. This was
intentionally deferred because it:

- involves 82+ commits touching shared branches
- requires watching two CI runs for 5–10 minutes each
- leaves `main` red if recovery isn't handled carefully

**Do this LAST**, after PH7.12 / PH8.2 / PH8.5 are decided and after
PH8.1 / PH8.3 / PH8.4 are committed. Or ask the user to run
`/sync-branches` manually.

## How to continue in the new thread

### Step 1 — read this file

Start by reading this file in full. Then read
[CLAUDE.md](../CLAUDE.md) for the mandatory workflow and
[docs/MIGRATION-PLANNER-BB3-TASKS.md](MIGRATION-PLANNER-BB3-TASKS.md)
for the task cards you still need.

### Step 2 — verify the state is clean and green

```bash
git status --porcelain         # should show only the PH8.1/8.3/8.4 files + user-local state
git log --oneline -3           # HEAD should be 5fbf603
pnpm lint && pnpm test && pnpm build   # all green
```

If any of those fails, `/bb3-doctor` first and fix the failure before
touching anything else.

### Step 3 — ship the 3 already-written Phase 8 tasks

The files for PH8.1, PH8.3, PH8.4 are in the working tree with tests
passing but no commits yet. `/ship-it` them as three atomic commits:

1. **PH8.1** — `apps/worker/src/pipeline/run-bb3.ts` + `.test.ts` +
   the `@revbrain/bb3-normalizer` + `@revbrain/migration-ir-contract`
   additions to `apps/worker/package.json` + `pnpm-lock.yaml` changes.
   Commit message: `feat(bb3): PH8.1 wire BB-3 into the worker pipeline`.
   Tag: `Task: PH8.1`, Refs: `§6.4`.
2. **PH8.3** — `apps/worker/src/pipeline/bb3-metrics.ts` + `.test.ts`.
   Commit message: `feat(bb3): PH8.3 worker metrics sink for runtimeStats`.
   Tag: `Task: PH8.3`, Refs: `§6.4`.
3. **PH8.4** — `apps/worker/scripts/run-bb3-smoke.ts` + the
   `smoke:bb3` script entry in `apps/worker/package.json`. Commit
   message: `feat(bb3): PH8.4 CLI smoke test script`. Tag:
   `Task: PH8.4`, Refs: `§3.3`.

Do NOT stage the user-local files listed under "What is NOT yet
committed" above. Use explicit `git add` of specific paths.

### Step 4 — decide the deferred tasks with the user

For **PH7.12**, **PH8.2**, **PH8.5**, ask the user whether they want
them attempted or left as documented follow-ups in
[docs/TECH-DEBT.md](TECH-DEBT.md). If the user says yes to PH8.2,
proceed very carefully with a Drizzle migration that only ADDS a
nullable column — do not touch existing data.

### Step 5 — final `/wave-review` and `/sync-branches`

Once PH8.1/8.3/8.4 are shipped and the deferred-task decision is made:

1. Run `/wave-review` one more time as the end-of-wave review.
2. If it returns GREEN, run `/sync-branches` to promote
   `feat/bb3-wave1` → `staging` → `main`. Watch the CI/CD runs. On
   any red, **do not force-merge**; return to the feature branch,
   fix, and try again.

### Step 6 — declare done

After main is green, update
[docs/MIGRATION-PLANNER-BB3-TASKS.md §15 (Progress tracking)](MIGRATION-PLANNER-BB3-TASKS.md)
with the final status and add a short entry to
[docs/TECH-DEBT.md](TECH-DEBT.md) for any deferred tasks.

## Project structure — the files the new thread will touch

- `packages/migration-ir-contract/` — pure-type contract package. Only
  runtime dep is `zod`. Deno-edge-safe. Contains canonicalJson,
  identityHash, structuralSignature, every IR type, error classes,
  `IR_SCHEMA_VERSION`.
- `packages/bb3-normalizer/` — the implementation package.
  `src/stages/` holds the 9 pipeline stages (s1…s9). `src/normalizers/`
  holds 40 per-type normalizers keyed by `artifactType`.
  `src/parsers/` holds the formula / SOQL / Apex tree-sitter parsers.
  `src/graph/` holds Tarjan SCC, field-ref normalization, edge
  projection, reference index. `src/pipeline.ts` is the public
  `normalize()` entry. Re-exports via `src/index.ts`.
- `apps/worker/src/pipeline/run-bb3.ts` (PH8.1) — the worker-level
  entry point the real extraction pipeline will call.
- `apps/worker/src/pipeline/bb3-metrics.ts` (PH8.3) — metrics sink.
- `apps/worker/scripts/run-bb3-smoke.ts` (PH8.4) — CLI smoke script.
- `scripts/check-no-native-deps.mjs` (from PH0.1) — enforces the
  contract package's "only zod" runtime dependency.
- `docs/MIGRATION-PLANNER-BB3-DESIGN.md` — the ≈2700-line spec.
- `docs/MIGRATION-PLANNER-BB3-TASKS.md` — the 89-task-card list.
- `.claude/skills/bb3-next/`, `bb3-doctor/`, `ship-it/`,
  `wave-review/`, `sync-branches/` — the mandatory workflow skills.

## Handy commands

```bash
# Run the full workspace pipeline
pnpm lint && pnpm test && pnpm build

# Run just the BB-3 package
pnpm --filter @revbrain/bb3-normalizer test
pnpm --filter @revbrain/migration-ir-contract test

# Run the worker's BB-3 tests
pnpm --filter @revbrain/worker test src/pipeline

# Invoke the CLI smoke test
pnpm --filter @revbrain/worker smoke:bb3

# Verify the contract barrier is clean
node scripts/check-no-native-deps.mjs @revbrain/migration-ir-contract
# Expected: `check-no-native-deps: OK — ... (2 packages scanned)`

# See all commits this session
git log origin/main..HEAD --oneline
```

## One open architectural note to carry forward

The Wave 1–3 normalizers build synthetic parent `NodeRef` values like
`{id: 'bundle:${parentProductCode}', resolved: true}` for parent
pointers (e.g. `BundleOptionIR.parentBundle`, `BundleFeatureIR.parentBundle`).
These synthetic keys do NOT match the actual identity-hash IDs that
the parent normalizers produce. Stage 4 (`resolveReferences`) currently
does identity merging but does NOT re-resolve these synthetic parent
refs into the real hash IDs — that was intentionally deferred to
"each per-normalizer task or a PH8.1 follow-up" because the deferral
was called out in the spec's Stage 4 card. The validator (PH3.9 V5)
only checks `CyclicDependencyIR.members` (which uses real hash IDs
produced by Stage 6), so nothing in the current test suite flags
these synthetic refs.

**This is a real open item**, not a blocker. The new thread should
either wire a post-Stage-4 "resolve synthetic parent refs" pass, or
update each affected normalizer to look up the parent ID from the
`FindingIndex` built in Stage 2 (passing the finding index through the
normalizer context). Note this in the first commit's body if you
touch it.
