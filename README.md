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

## Quick Start (Mock Mode)

Default local development runs with **in-memory mock data** — no database or external services needed.

```bash
pnpm install
pnpm dev        # Starts in mock mode automatically
```

Open http://localhost:5173 — auto-logged in as org_owner with 4 sample projects.

### Switch Roles

Use the role switcher on the login page (dev mode) to test as: system_admin, org_owner, admin, operator, reviewer.

### Reset Mock Data

```bash
curl -X POST http://localhost:3000/v1/dev/reset-mock-data
```

### Real Mode (requires Supabase)

```bash
cp .env.example .env
# Fill in DATABASE_URL, SUPABASE_URL, etc.
pnpm dev:real
```

> **Hot reload note**: tsx watch resets mock data when the mock module is invalidated. Changes to unrelated files may preserve in-memory state. Use the reset endpoint for deterministic resets.

### Testing

```bash
pnpm test                              # All tests
pnpm --filter @revbrain/server test    # Server tests
pnpm --filter client test              # Client tests
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
