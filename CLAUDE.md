# CLAUDE.md — AI Assistant Context

> This file helps AI assistants (Claude Code, Copilot, etc.) understand the project quickly. It's loaded automatically by Claude Code at conversation start.

## Project

RevBrain — multi-tenant SaaS for migrating Salesforce CPQ to Revenue Cloud Advanced (RCA). Serves Revenue Operations teams at mid-to-enterprise companies.

## Quick Reference

```
pnpm mock           # Mock mode (fully local, offline — works after clone)
pnpm dev            # Local server + staging DB/storage
pnpm stg            # Client-only against deployed staging edge functions
pnpm test           # All tests
pnpm lint           # All packages
pnpm db:seed        # Seed staging DB
```

## Monorepo Structure

- `apps/server/` — Hono API server (TypeScript, runs on Node locally, Deno in Edge Functions)
- `apps/client/` — React SPA (Vite, Tailwind, shadcn/ui, React Query, Zustand)
- `packages/contract/` — Shared types, Zod schemas, repository interfaces
- `packages/database/` — Drizzle ORM schema, migrations, seeder
- `packages/seed-data/` — Curated test data (shared by mock mode + seeder)
- `supabase/functions/api/` — Edge Function adapter (thin wrapper around Hono app)
- `e2e/` — Playwright E2E tests

## Key Patterns

- **Triple-adapter:** Mock (in-memory), PostgREST (Supabase JS/HTTP for Edge), Drizzle (postgres.js/TCP for Node) — same interface, runtime-selected
- **Contract-first:** All shared types in `@revbrain/contract`. Server and client both depend on it.
- **Feature gating:** `requireFeature()`, `requireUserCapacity()` middleware enforce plan limits
- **Admin permissions:** `requireAdminPermission('users:write')` — not role-based, permission-based
- **Audit logging:** All admin mutations log via `buildAuditContext(c)` utility
- **Impersonation:** Read-only tenant impersonation with reason capture, time limit, allowlisted endpoints
- **i18n:** Full English + Hebrew (RTL). Use `start-*`/`end-*` CSS, never `left-*`/`right-*`

## File Naming

- Server routes: `apps/server/src/v1/routes/{resource}.ts`
- Admin routes: `apps/server/src/v1/routes/admin/{resource}.ts`
- Client features: `apps/client/src/features/{feature}/pages/`, `components/`, `hooks/`
- Tests: co-located `*.test.ts` files
- Seed data: `packages/seed-data/src/{entity}.ts`

## Important Conventions

1. **All imports use `.ts` extensions** — required for Deno edge function compatibility
2. **Zod schemas in contract package** — not in server or client
3. **Mock repos follow real repo interface** — `ALLOWED_FILTERS`, `findMany`, `findById`, etc.
4. **Env vars:** `.env.mock` (mock, committed — zero secrets), `.env.staging` (staging, gitignored), `.env.staging.remote` (staging-remote, gitignored). No `.env.local` (Vite reserved name). No `.env.prod` (production uses platform-injected vars).
5. **API responses:** `{ success: true, data: ... }` or `{ success: false, error: { code, message } }`
6. **CSS borders:** Always `border border-slate-200`, not just `border-slate-200`
7. **Translations:** Every UI string in both `en/admin.json` and `he/admin.json`

## When Modifying Code

- Run `pnpm lint && pnpm test` before committing
- Add audit log events for admin mutations
- Add translations for new UI strings (both en + he)
- Use `requireAdminPermission()` not `requireRole()` for admin routes
- Check `findById` calls are org-scoped for tenant-facing routes
- New seed entities go in `packages/seed-data/` (not `apps/server/src/mocks/`)

## Architecture Decisions

See `docs/ARCHITECTURE.md` for full ADRs. Key ones:

- Hono over Express (multi-runtime support)
- Drizzle over Supabase client (type safety, transactions)
- Edge Function adapter pattern (vendor-agnostic hosting)
- JWT decode-only on edge functions (gateway already verified)
- Seed data as shared package (single source of truth)

## Tech Debt

See `docs/TECH-DEBT.md` for deferred items. Notable:

- Stripe not configured yet (billing non-functional)
- Sentry not set up (no error tracking)
- Enterprise admin features deferred (SSO, approval workflows, PII masking)
- In-app notifications not built yet

## Pipeline Implementation Workflow (MANDATORY)

The migration planner pipeline (Connect → Extract → Normalize → Segment → Disposition → Emit) follows a strict task-card workflow. Each module has its own design spec, task doc, and non-negotiables. The workflow is enforced via skills in [.claude/skills/](.claude/skills/).

### The loop (applies to ALL pipeline modules)

1. **Start every task via `/task-next`.** Never start a task by reading the design doc from scratch. `/task-next` detects the active module from the branch name, loads narrow context, quotes non-negotiables, and presents a plan before any code is written.
2. **Never declare a task done without `/ship-it`.** No exceptions. `/ship-it` runs format → lint → test → build → commit → push and invokes `/bb3-doctor` automatically when pipeline files are touched.
3. **Every 5 shipped task commits: invoke `/wave-review`** before picking up the next task. This catches drift before it compounds.
4. **Every 5 shipped commits OR at the end of a working session: invoke `/sync-branches`** to promote the feature branch → `staging` → `main`, watch CI/CD on both, and fix if red.
5. **At each phase boundary: invoke `/wave-review` followed by `/sync-branches`** regardless of commit counts.

### Module registry

| Module               | Design spec                                                             | Task doc                                                              | Package                         | Branch prefix    |
| -------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------- | ---------------- |
| **Normalize (BB-3)** | [MIGRATION-PLANNER-BB3-DESIGN.md](docs/MIGRATION-PLANNER-BB3-DESIGN.md) | [MIGRATION-PLANNER-BB3-TASKS.md](docs/MIGRATION-PLANNER-BB3-TASKS.md) | `packages/bb3-normalizer/`      | `feat/bb3-*`     |
| **Segment**          | [MIGRATION-SEGMENTER-DESIGN.md](docs/MIGRATION-SEGMENTER-DESIGN.md)     | [MIGRATION-SEGMENTER-TASKS.md](docs/MIGRATION-SEGMENTER-TASKS.md)     | `packages/migration-segmenter/` | `feat/segmenter` |

### BB-3 non-negotiables (enforced by `/bb3-doctor` C1–C8)

- **RCA neutrality:** no `PricingProcedure`, `DecisionTable`, `CML`, `ContextDefinition`, `ConstraintModelLanguage` anywhere in `packages/bb3-normalizer/src/`. (spec §2.4, acceptance test A14)
- **Determinism:** no `Date.now()`, `performance.now()`, `Math.random()`, `crypto.randomUUID()` in code that affects `IRGraph`. All wall-clock telemetry lives in `NormalizeResult.runtimeStats`, outside the graph. (spec §6.2, §6.4)
- **canonicalJson only** in identity/hash paths — never `JSON.stringify`. (spec §8.1)
- **NodeRef, not `string[]`** for any node-to-node reference. (spec §5.1a)
- **Deterministic parser budgets** (byte / AST-node / depth) — no wall-clock timeouts. (spec §8.4)
- **Contract package stays thin:** `packages/migration-ir-contract/` depends only on `zod`. No `tree-sitter`, no `@revbrain/database`, no `@revbrain/tpr`. (spec §6.3)

### Segmenter non-negotiables (enforced by `/bb3-doctor` C9 + tests)

- **Determinism:** same graph + options → byte-identical `assignment` + `manifest`. All sorting uses strict `<`/`>` — never `localeCompare`. `runtimeStats` excluded.
- **No silent fall-through:** unknown edge types throw. Missing structural-edge targets throw. No implicit edges inferred.
- **Thin dependencies:** `packages/migration-segmenter/` depends on `@revbrain/migration-ir-contract` + `zod` only. No cross-package imports from `bb3-normalizer` — all algorithms (SCC, union-find, articulation) are local.
- **All thresholds injectable** via `SegmenterOptions`, validated by Zod schema at entry.
- **Content-addressable IDs:** length-prefixed streaming hash (`base64url`). `persistentId` uses the full root node ID (never truncated). (spec §6.2)
- **Three edge categories:** every `IREdgeType` classified as strong / ordering / hazard. Unknown = hard error. (spec §4)

### Branching strategy

- Feature branch: `feat/segmenter` (Segmenter) or `feat/bb3-wave<N>` (BB-3)
- Commits: one per task card, tagged with `Task: <TASK-ID>` in the commit body
- Promotion: `feat/*` → `staging` → `main` via `/sync-branches`. Both `main` and `staging` run CI/CD; both must be green before the next task is picked up after a sync
- Never commit directly to `main` or `staging`. Never force-push to either.
