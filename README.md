# RevBrain

> **Salesforce CPQ to Revenue Cloud Advanced migration platform**

RevBrain is a multi-tenant SaaS platform that enables revenue operations teams to migrate from Salesforce CPQ (Steelbrick) to Revenue Cloud Advanced (RCA) with confidence.

## Tech Stack

| Layer    | Technology                                        |
| -------- | ------------------------------------------------- |
| Frontend | React 19, Vite, TailwindCSS, React Query, Zustand |
| Backend  | Hono (TypeScript), Zod validation, OpenAPI        |
| Database | PostgreSQL via Drizzle ORM                        |
| Auth     | Supabase Auth (JWT, magic links, password reset)  |
| Billing  | Stripe (subscriptions, trials, coupons)           |
| Email    | Resend (transactional emails)                     |
| Monorepo | pnpm workspaces, Turborepo                        |

## Repository Structure

```
revbrain/
├── apps/
│   ├── server/          # Hono API server
│   └── client/          # React frontend (Vite)
├── packages/
│   ├── contract/        # Shared types, Zod schemas, repository interfaces
│   └── database/        # Drizzle ORM schema & migrations
├── supabase/
│   ├── config.toml      # Supabase project config
│   ├── migrations/      # SQL migrations
│   ├── templates/       # Auth email templates
│   └── functions/       # Edge Function adapter
├── e2e/                 # Playwright E2E tests
└── docs/                # Project documentation
```

## Quick Start

### Prerequisites

- Node.js >= 18
- pnpm >= 8
- Supabase CLI
- Docker (for local Supabase)

### Setup

```bash
pnpm install
cp .env.example .env
supabase start
pnpm db:generate
pnpm db:migrate
pnpm dev
```

### Testing

```bash
pnpm test                    # All tests
pnpm --filter @revbrain/server test   # Server only (364 tests)
pnpm --filter client test             # Client only (159 tests)
```

### Linting

```bash
pnpm lint                    # All packages
pnpm format                  # Prettier
pnpm format:check            # Check only
```

## Architecture

Multi-tenant SaaS with hexagonal architecture:

- **Contract package** — Shared types, Zod schemas, repository interfaces
- **Database package** — Drizzle ORM schema, PostgreSQL
- **Server** — Hono REST API with OpenAPI, RBAC, rate limiting, alerting
- **Client** — React SPA with i18n (EN/HE), role-based UI

### User Roles

| Role           | Scope        | Access                                |
| -------------- | ------------ | ------------------------------------- |
| `system_admin` | Global       | Platform super admin                  |
| `org_owner`    | Organization | Tenant owner, billing, full access    |
| `admin`        | Organization | Full operational access, all projects |
| `operator`     | Project      | Migration work on assigned projects   |
| `reviewer`     | Project      | View-only + remarks                   |

### Platform Features

- Multi-tenant org management with seat limits
- Stripe billing (subscriptions, trials, plan upgrades, coupons)
- Support ticket system
- Enterprise lead capture
- Per-project file storage
- Email notifications (Resend)
- Multi-channel alerting (Sentry, Slack, email)
- Rate limiting and security headers

## License

MIT
