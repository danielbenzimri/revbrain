# CLAUDE.md — AI Assistant Context

> This file helps AI assistants (Claude Code, Copilot, etc.) understand the project quickly. It's loaded automatically by Claude Code at conversation start.

## Project

RevBrain — multi-tenant SaaS for migrating Salesforce CPQ to Revenue Cloud Advanced (RCA). Serves Revenue Operations teams at mid-to-enterprise companies.

## Quick Reference

```
pnpm dev            # Mock mode (offline dev, no credentials needed)
pnpm dev:stg        # Local server against staging Supabase
pnpm dev:stg-remote # Client-only against deployed staging edge functions
pnpm test           # All tests (889+)
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
4. **Env vars:** `.env.mock` (mock, committed), `.env.staging` (staging, gitignored), `.env.staging.remote` (staging-remote, gitignored). No `.env.local` — it's a Vite reserved name.
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

## BB-3 Implementation Workflow (MANDATORY)

When working on BB-3 (Migration Planner IR Normalizer — see [docs/MIGRATION-PLANNER-BB3-DESIGN.md](docs/MIGRATION-PLANNER-BB3-DESIGN.md) and [docs/MIGRATION-PLANNER-BB3-TASKS.md](docs/MIGRATION-PLANNER-BB3-TASKS.md)), Claude MUST follow this workflow. It is enforced via the skills in [.claude/skills/](.claude/skills/).

### The loop

1. **Start every BB-3 task via `/bb3-next`.** Never start a BB-3 task by reading the design doc from scratch. `/bb3-next` loads narrow context, quotes non-negotiables, and presents a plan before any code is written.
2. **Never declare a BB-3 task done without `/ship-it`.** No exceptions. `/ship-it` runs format → lint → test → build → commit → push and invokes `/bb3-doctor` automatically when BB-3 files are touched.
3. **Every 5 shipped BB-3 task commits: invoke `/wave-review`** before picking up the next task. This catches drift before it compounds.
4. **Every 5 shipped commits OR at the end of a working session: invoke `/sync-branches`** to promote `feat/bb3-*` → `staging` → `main`, watch CI/CD on both, and fix if red.
5. **At each BB-3 wave boundary (Wave 1 / Wave 2 / Wave 3 per spec §14): invoke `/wave-review` followed by `/sync-branches`** regardless of commit counts. Wave boundaries are natural PR-merge points.

### BB-3 non-negotiables (enforced by `/bb3-doctor`)

These are copied from the design spec. Any violation is a blocker and MUST be fixed before `/ship-it` can proceed:

- **RCA neutrality:** no `PricingProcedure`, `DecisionTable`, `CML`, `ContextDefinition`, `ConstraintModelLanguage` anywhere in `packages/bb3-normalizer/src/`. (spec §2.4, acceptance test A14)
- **Determinism:** no `Date.now()`, `performance.now()`, `Math.random()`, `crypto.randomUUID()` in code that affects `IRGraph`. All wall-clock telemetry lives in `NormalizeResult.runtimeStats`, outside the graph. (spec §6.2, §6.4)
- **canonicalJson only** in identity/hash paths — never `JSON.stringify`. (spec §8.1)
- **NodeRef, not `string[]`** for any node-to-node reference. (spec §5.1a)
- **Deterministic parser budgets** (byte / AST-node / depth) — no wall-clock timeouts. (spec §8.4)
- **Contract package stays thin:** `packages/migration-ir-contract/` depends only on `zod`. No `tree-sitter`, no `@revbrain/database`, no `@revbrain/tpr`. (spec §6.3)

### Branching strategy for BB-3

- Feature branch: `feat/bb3-wave<N>` (e.g. `feat/bb3-wave1`) — one branch per wave
- Commits: one per task card from `docs/MIGRATION-PLANNER-BB3-TASKS.md`, each tagged in the commit body with `Task: <TASK-ID>`
- Promotion: `feat/bb3-wave<N>` → `staging` → `main`, via `/sync-branches`. Both `main` and `staging` run CI/CD; both must be green before the next task is picked up after a sync
- Never commit directly to `main` or `staging`. Never force-push to either.
