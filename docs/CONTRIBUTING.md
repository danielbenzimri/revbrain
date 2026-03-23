# Contributing to RevBrain

> Development workflow, conventions, and quality standards.

---

## Development Setup

```bash
pnpm install        # Install all dependencies
pnpm local          # Start in mock mode (no setup required)
```

For development against the real staging database:

```bash
# Requires .env.stg with Supabase credentials (ask project owner)
pnpm dev
```

## Commands

| Command        | Purpose                                          |
| -------------- | ------------------------------------------------ |
| `pnpm local`   | Mock mode — offline, no external services        |
| `pnpm dev`     | Dev mode — local server against staging Supabase |
| `pnpm stg`     | Frontend only against staging edge function      |
| `pnpm test`    | All unit + integration tests                     |
| `pnpm lint`    | ESLint across all packages                       |
| `pnpm format`  | Prettier format                                  |
| `pnpm db:seed` | Seed staging database with test data             |

## Git Workflow

### Branches

- `main` — production. Deploys to `app.revbrain.ai` + production Supabase
- `staging` — staging. Deploys to `stg.revbrain.ai` + staging Supabase

### Commit Protocol

1. Make changes
2. `pnpm format` — format all files
3. `pnpm lint` — zero errors
4. `pnpm test` — all tests pass
5. Commit with descriptive message
6. Push — CI runs automatically, then CD deploys if CI passes

Pre-commit hooks (husky + lint-staged) run prettier + eslint on staged files automatically.

### CI/CD Pipeline

```
Push → CI (lint → test → build → seed-check) → CI passes → CD (edge functions → Vercel)
```

- CI failure blocks deployment
- CD deploys to staging or production based on branch

## Code Conventions

### TypeScript

- Strict mode enabled
- All files use `.ts` extension (with `.ts` in imports for Deno compatibility)
- Zod for runtime validation, TypeScript for compile-time types
- Contract package (`@revbrain/contract`) is the single source of truth for shared types

### File Organization

```
Feature code:     apps/client/src/features/{feature}/
  ├── pages/      # Route-level components
  ├── components/ # Feature-specific components
  └── hooks/      # React Query hooks + custom hooks

Server routes:    apps/server/src/v1/routes/
Middleware:       apps/server/src/middleware/
Services:         apps/server/src/services/
```

### API Conventions

- All routes under `/v1/`
- Admin routes under `/v1/admin/`
- Response envelope: `{ success: true, data: ... }` or `{ success: false, error: { code, message } }`
- Pagination: cursor-based for high-volume endpoints, offset for small lists
- Partial updates: PUT (not PATCH)
- Rate limiting on all mutation endpoints
- Correlation ID (`X-Request-Id`) on all responses

### CSS / Styling

- Tailwind CSS with shadcn/ui components
- Violet/purple palette (not amber — amber was a Geometrix leftover)
- RTL support: always use logical properties (`start-*`/`end-*`/`ps-*`/`pe-*`), never `left-*`/`right-*`
- Always include `border` base class before `border-{color}` (Tailwind requires it)

### Localization

- All user-facing strings in translation files (`locales/en/*.json`, `locales/he/*.json`)
- Every new UI component must have both English and Hebrew translations
- RTL is tested — sidebar, drawers, icons must work in both directions

## Testing

### Test Pyramid

| Layer       | Count | Tools      | What It Tests                                   |
| ----------- | ----- | ---------- | ----------------------------------------------- |
| Unit        | ~400  | Vitest     | Functions, utilities, Zod schemas, components   |
| Integration | ~180  | Vitest     | Services + repositories, middleware, API routes |
| E2E         | ~100  | Playwright | Full browser flows, admin pages, auth           |
| Seed data   | 29    | Vitest     | Referential integrity, FK chains, data shapes   |

### Conventions

- Tests live next to the code they test (`*.test.ts`)
- E2E tests in `e2e/` directory
- Mock mode for all CI tests (`USE_MOCK_DATA=true`, `AUTH_MODE=mock`)
- Test names describe behavior, not implementation
- Each new feature needs at minimum integration tests for the API routes

### Running Tests

```bash
pnpm test                              # All tests
pnpm --filter @revbrain/server test    # Server only
pnpm --filter client test              # Client only
pnpm --filter @revbrain/seed-data test # Seed data integrity
npx playwright test                    # E2E (requires running server)
npx playwright test console-health     # Console error checks
```

## Environment Variables

| File         | Purpose                      | Contains Secrets?    |
| ------------ | ---------------------------- | -------------------- |
| `.env`       | Base defaults (VITE_API_URL) | No                   |
| `.env.local` | Local mock mode config       | No                   |
| `.env.stg`   | Staging Supabase credentials | **Yes** — gitignored |
| `.env.prod`  | Production credentials       | **Yes** — gitignored |
| `.env.test`  | Test runner config           | No                   |

**Never commit `.env.stg` or `.env.prod`.** They're gitignored. Ask the project owner for credentials.

Edge function secrets are set via `supabase secrets set` — not in env files.
Vercel env vars are set via `vercel env add` or the Vercel dashboard.

## Adding a New Feature

1. **Contract first** — add types/schemas to `packages/contract/src/`
2. **Server route** — add to `apps/server/src/v1/routes/`
3. **Service logic** — add to `apps/server/src/services/`
4. **Mock data** — add seed data to `packages/seed-data/src/`
5. **Mock repository** — add to `apps/server/src/repositories/mock/`
6. **Client UI** — add to `apps/client/src/features/{feature}/`
7. **Tests** — integration test for route, unit test for service logic
8. **Translations** — add keys to both `en/` and `he/` locales
9. **Audit logging** — add audit event for admin mutations

## Security Checklist

Before merging any PR that touches auth, data access, or admin functionality:

- [ ] No `findById()` calls without org-scoping check
- [ ] Rate limiting on new mutation endpoints
- [ ] Audit log events for admin actions
- [ ] canInviteRole() check on user invitation paths
- [ ] No secrets in error messages or logs
- [ ] CORS origins updated if new domains added
