# RevBrain — Architecture

> System design, patterns, and key decisions. Read this to understand **why** things are the way they are.

---

## Origin & Context

RevBrain was forked from **Geometrix** (a construction management SaaS) in early 2026. All construction-domain code was removed (BOQ, execution bills, work logs, tasks, CAD viewer, GIS). The platform envelope was kept and adapted:

- **Kept:** Auth, billing, multi-tenancy, role system, i18n, job queue, email, alerting, admin console
- **Removed:** All construction features, 3D/geo libraries (three.js, leaflet, proj4), construction-specific schemas
- **Adapted:** Roles renamed to RevOps context (operator = migration specialist, reviewer = business analyst)

The sister project **Procure** (procurement SaaS) served as reference for mock mode, database seeder, and edge function deployment patterns.

---

## System Design

### Hexagonal Architecture

```
                    ┌─────────────────────────────────────┐
                    │           Contract Package           │
                    │  Types, Zod schemas, interfaces      │
                    └────────────┬────────────────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
    ┌─────────▼──────┐  ┌───────▼────────┐  ┌──────▼───────┐
    │     Server      │  │    Database     │  │  Seed Data   │
    │  Hono REST API  │  │  Drizzle ORM   │  │  Test data   │
    │  Business logic │  │  Schema + seed  │  │  Shared pkg  │
    └─────────┬──────┘  └───────┬────────┘  └──────────────┘
              │                  │
    ┌─────────▼──────┐  ┌───────▼────────┐
    │     Client      │  │   Edge Fn      │
    │  React SPA      │  │   Adapter      │
    │  Admin console  │  │   (Deno)       │
    └────────────────┘  └────────────────┘
```

### Dual-Adapter Architecture

The system runs in two modes with identical behavior:

```
Mock Mode (pnpm local)          Production Mode (pnpm dev / deployed)
─────────────────────           ─────────────────────────────────────
LocalAuthAdapter                RemoteAuthAdapter (Supabase Auth)
MockRepositories (in-memory)    DrizzleRepositories (PostgreSQL)
No external services            Stripe, Resend, Supabase Storage
Seed data from @revbrain/seed-data
```

**Why:** Enables fully offline development. No Supabase, Stripe, or internet connection needed. The same curated test data powers both mock mode and the database seeder.

**Single source of truth:** `packages/seed-data/` contains all test data. Both the mock server and the database seeder consume it. No duplicate fixtures.

### Multi-Tenant Isolation

**Model:** Shared tables with `organizationId` column. Not schema-per-tenant.

**Enforcement layers:**

1. Auth middleware extracts `organizationId` from JWT → attaches to request context
2. Repository methods filter by `organizationId` (all repos implement `findByOrganization`)
3. Supabase RLS enabled on all 22 tables (service_role bypasses for server operations)
4. Audit log table is INSERT+SELECT only (immutable)

**Verified:** `tenant-isolation.spec.ts` confirms zero cross-tenant data access. `docs/tenant-isolation-audit.md` documents the findById scoping audit.

### Role System

Two separate authorization models:

**Tenant roles** (what a user does inside their org):

- `org_owner` → owns org, manages billing and team
- `admin` → manages org settings, all projects
- `operator` → works on assigned migration projects
- `reviewer` → reviews and approves migration results

**Internal admin permissions** (what a platform employee can do):

- Stored as permission sets in `admin_role_assignments` + `admin_role_definitions` tables
- `requireAdminPermission('users:write')` middleware (replaces `requireRole('system_admin')`)
- `*` wildcard grants all permissions (super_admin)
- Separate from tenant roles — a person can be both an org_owner in their demo tenant AND a support_admin internally

### Feature Gating

Plan features are **enforced at middleware level**, not just declared:

- `requireFeature('data_validation')` → 403 if plan doesn't include it
- `requireUserCapacity()` → blocks invite if at seat limit (10% grace)
- `requireProjectCapacity()` → blocks project creation if at limit
- `requireActiveSubscription()` → blocks all gated operations if expired

Tenant overrides allow temporary feature grants/revocations independent of plan.

---

## Key Architecture Decisions

### ADR-001: Hono over Express

**Decision:** Use Hono as the HTTP framework.
**Why:** Runs on any JavaScript runtime (Node, Deno, Bun, Cloudflare Workers). This enables deployment to Supabase Edge Functions (Deno) without rewriting the server. Express is Node-only.

### ADR-002: Edge Function Adapter Pattern

**Decision:** The edge function (`supabase/functions/api/index.ts`) is a thin adapter that imports the Hono app. Zero business logic in the edge function.
**Why:** The same Hono app runs locally (Node via tsx) and in production (Deno via Edge Functions). Switching hosting providers requires only a new adapter file, not app changes.

### ADR-003: Drizzle ORM over Supabase Client for Data Access

**Decision:** Use Drizzle ORM (`db.insert/select/update/delete`) instead of Supabase client (`supabase.from('table').insert()`) for all data access.
**Why:** Type-safe schema, transaction support, same API in mock and production. The Supabase client is only used for Auth and Storage operations.

### ADR-004: JWT Verification Strategy

**Decision:** On edge functions, decode ES256 JWTs without signature verification (trust the Supabase gateway). Locally, verify HS256 JWTs with the JWT secret.
**Why:** The Supabase gateway already verifies the JWT before it reaches the edge function. Re-verifying adds latency and requires JWKS fetching. See `docs/spike-jwt-impersonation.md` for the full analysis.

### ADR-005: Impersonation via Server-Side Session

**Decision:** Impersonation uses a server-signed JWT with `realUserId` claim, not a Supabase-issued token.
**Why:** Supabase Auth doesn't support issuing tokens on behalf of another user. The server signs its own impersonation token and the auth middleware detects it. See `docs/spike-jwt-impersonation.md`.

### ADR-006: Seed Data as Shared Package

**Decision:** Curated test data lives in `packages/seed-data/`, consumed by both mock repositories and the database seeder.
**Why:** Eliminates duplicate fixture maintenance. When seed data changes, both mock mode and seeded databases stay in sync. Referential integrity is tested in CI (29 tests).

### ADR-007: CI Gates CD

**Decision:** CD (deploy) only runs after CI (lint+test+build) passes. Uses GitHub Actions `workflow_run` trigger.
**Why:** Prevents deploying broken code. CI failure = no deploy. The previous approach (CI and CD in parallel) risked deploying untested code.

---

## Billing Architecture

Full Stripe integration via `billing.service.ts` (1,690 lines):

- Customer creation on first checkout
- Subscription lifecycle (create, change, cancel, reactivate)
- Checkout sessions → Stripe-hosted checkout
- Billing portal (payment methods, invoices, cancel)
- Webhook handling (6 event types) with idempotent processing
- Plan sync to Stripe (Products + Prices)
- Proration on plan changes
- Full and partial refunds

Self-service: org owners manage their own billing without system admin.

---

## Email Architecture

Async delivery via job queue:

1. Code calls email adapter → creates job in `job_queue` table
2. Job worker picks up email jobs, sends via Resend API
3. Retries on failure (max 3 attempts)
4. Templates in `apps/server/src/emails/templates/` (welcome, payment receipt, etc.)

---

## Deployment Architecture

```
Developer pushes to main or staging
  │
  ├─→ GitHub Actions CI
  │     ├── Lint (all 5 packages)
  │     ├── Test (unit + integration, mock mode)
  │     ├── Build (TypeScript + Vite)
  │     └── Seed compatibility check
  │
  └─→ CI passes → GitHub Actions CD
        ├── Deploy Edge Function (supabase functions deploy)
        ├── Health check (curl /v1/health)
        └── Deploy Vercel (vercel build + deploy --prod)
```

| Environment      | Frontend        | Backend           | Database     |
| ---------------- | --------------- | ----------------- | ------------ |
| Local (mock)     | localhost:5173  | localhost:3000    | In-memory    |
| Dev (staging DB) | localhost:5173  | localhost:3000    | Supabase STG |
| Staging          | stg.revbrain.ai | Edge Function STG | Supabase STG |
| Production       | app.revbrain.ai | Edge Function PRD | Supabase PRD |
