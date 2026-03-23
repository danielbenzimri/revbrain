# RevBrain

> **Salesforce CPQ to Revenue Cloud Advanced migration platform**

RevBrain is a multi-tenant SaaS platform that enables revenue operations teams to migrate from Salesforce CPQ to Revenue Cloud Advanced (RCA) with confidence.

## Tech Stack

| Layer    | Technology                                                    |
| -------- | ------------------------------------------------------------- |
| Frontend | React 18, Vite, TailwindCSS, React Query, Zustand             |
| Backend  | Hono (TypeScript), Zod validation, OpenAPI                    |
| Database | PostgreSQL via Supabase + Drizzle ORM                         |
| Auth     | Supabase Auth (JWT, magic links, MFA)                         |
| Billing  | Stripe (subscriptions, checkout, coupons, webhooks)           |
| Email    | Resend (transactional, async via job queue)                   |
| Hosting  | Supabase Edge Functions (backend) + Vercel (frontend)         |
| CI/CD    | GitHub Actions (CI gates CD — lint, test, build, then deploy) |
| Monorepo | pnpm workspaces, Turborepo                                    |

## Repository Structure

```
revbrain/
├── apps/
│   ├── server/              # Hono API server
│   └── client/              # React frontend (Vite)
├── packages/
│   ├── contract/            # Shared types, Zod schemas, repository interfaces
│   ├── database/            # Drizzle ORM schema, migrations, seeder
│   └── seed-data/           # Curated test data (shared by mock mode + seeder)
├── supabase/
│   ├── config.toml          # Supabase project config
│   ├── migrations/          # SQL migrations
│   ├── templates/           # Auth email templates
│   └── functions/api/       # Edge Function adapter
├── e2e/                     # Playwright E2E tests
└── docs/                    # Project documentation
```

## Development Commands

| Command        | What It Does                                                        |
| -------------- | ------------------------------------------------------------------- |
| `pnpm local`   | Frontend + backend in **mock mode** (offline, no external services) |
| `pnpm dev`     | Frontend + backend against **staging Supabase** (real DB + Auth)    |
| `pnpm stg`     | Frontend only, pointing at **staging edge function**                |
| `pnpm test`    | Run all unit + integration tests                                    |
| `pnpm lint`    | Lint all packages                                                   |
| `pnpm format`  | Format with Prettier                                                |
| `pnpm db:seed` | Seed staging database with curated test data                        |

## Quick Start

### Mock Mode (no setup required)

```bash
pnpm install
pnpm local
```

Open http://localhost:5173 — auto-logged in as org_owner with sample data.

### Development Mode (against staging Supabase)

Requires `.env.stg` with Supabase credentials (ask project owner).

```bash
pnpm dev
```

### Running Tests

```bash
pnpm test                              # All tests (889+)
pnpm --filter @revbrain/server test    # Server tests (579)
pnpm --filter client test              # Client tests (160)
npx playwright test                    # E2E tests (90+)
```

## Environments

| Environment  | Frontend        | Backend               | Database     |
| ------------ | --------------- | --------------------- | ------------ |
| `pnpm local` | localhost:5173  | localhost:3000 (mock) | In-memory    |
| `pnpm dev`   | localhost:5173  | localhost:3000 (real) | Supabase STG |
| Staging      | stg.revbrain.ai | Edge Function STG     | Supabase STG |
| Production   | app.revbrain.ai | Edge Function PRD     | Supabase PRD |

## Architecture

Multi-tenant SaaS with hexagonal architecture:

- **Contract package** — Shared types, Zod schemas, repository interfaces
- **Database package** — Drizzle ORM schema, seeder, migrations
- **Seed-data package** — Curated test data shared by mock mode and DB seeder
- **Server** — Hono REST API with OpenAPI, RBAC, rate limiting, feature gating, alerting
- **Client** — React SPA with i18n (EN/HE + RTL), role-based UI, admin control plane

### User Roles

| Role           | Scope        | Access                                             |
| -------------- | ------------ | -------------------------------------------------- |
| `system_admin` | Global       | Platform super admin — all tenants, users, billing |
| `org_owner`    | Organization | Tenant owner — billing, team, full access          |
| `admin`        | Organization | Full operational access, all projects              |
| `operator`     | Project      | Migration work on assigned projects                |
| `reviewer`     | Project      | View-only + remarks                                |

### CI/CD Pipeline

```
Push to main/staging
  → CI: Lint → Test → Build → Seed Check
  → CI passes → CD triggers
  → CD: Deploy Edge Functions → Deploy Vercel
```

## Documentation

| Document                                                             | Purpose                                   |
| -------------------------------------------------------------------- | ----------------------------------------- |
| [SYSTEM-ADMIN-AUDIT.md](./SYSTEM-ADMIN-AUDIT.md)                     | System admin platform audit & spec (v3.1) |
| [docs/TECH-DEBT.md](./docs/TECH-DEBT.md)                             | Known tech debt and deferred items        |
| [docs/tenant-isolation-audit.md](./docs/tenant-isolation-audit.md)   | Tenant data isolation verification        |
| [docs/spike-jwt-impersonation.md](./docs/spike-jwt-impersonation.md) | JWT approach for impersonation (ADR)      |

## License

MIT
