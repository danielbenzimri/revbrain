# CLAUDE.md — AI Assistant Context

> This file helps AI assistants (Claude Code, Copilot, etc.) understand the project quickly. It's loaded automatically by Claude Code at conversation start.

## Project

RevBrain — multi-tenant SaaS for migrating Salesforce CPQ to Revenue Cloud Advanced (RCA). Serves Revenue Operations teams at mid-to-enterprise companies.

## Quick Reference

```
pnpm local          # Mock mode (offline dev)
pnpm dev            # Against staging Supabase
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

- **Dual-adapter:** Mock mode (in-memory) and production mode (Supabase/Drizzle) share the same interfaces
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
4. **Env vars:** `.env.local` (mock), `.env.stg` (staging), `.env.prod` (production). Secrets are gitignored.
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
