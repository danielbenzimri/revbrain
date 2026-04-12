# Environment & Auth Consolidation — Implementation Plan

> **Status:** Rev 2 — incorporates CTO review feedback
>
> **Author:** Engineering
>
> **Date:** 2026-04-12
>
> **Scope:** Environment variable management, dev scripts, persona system, auth adapter unification

---

## 1. Problem Statement

The current environment and authentication setup has accumulated inconsistencies that cause real developer friction and bugs. This document describes each issue, explains why it matters, and proposes a consolidated solution.

### 1.1 `.env.local` is a Vite reserved name

Vite always loads `.env.local` regardless of the active mode ([Vite docs: Env Loading Priorities](https://vite.dev/guide/env-and-mode.html#env-files)). The load order is:

```
.env                  # always loaded
.env.local            # always loaded, gitignored
.env.[mode]           # only in matching mode
.env.[mode].local     # only in matching mode, gitignored
```

Our `.env.local` sets `VITE_AUTH_MODE=mock`. When a developer runs `pnpm dev` (intended for staging), Vite still loads `.env.local` alongside the mode-specific file, injecting `VITE_AUTH_MODE=mock` into `import.meta.env`.

**Clarification on Vite's priority rules:** Vite's documentation states that environment variables that already exist in the shell when Vite starts have the highest priority and are not overwritten by `.env` files. So a shell-level `VITE_AUTH_MODE=jwt` in the script _should_ take precedence over the `.env.local` value. However, this is complicated by two factors:

1. **Turbo's env forwarding:** The root `pnpm dev` runs through `turbo run dev`. Turbo does not automatically forward all shell environment variables to child processes — only variables declared in `turbo.json`'s `env` or `globalEnv` arrays are passed through. If `VITE_AUTH_MODE` is not declared there, the inline override from the script is dropped before it reaches Vite.
2. **Layered file merge:** Even if the shell override works, `.env.local` is still loaded and any _other_ variables in it (like `USE_MOCK_DATA`, `AUTH_MODE`, or mock Salesforce keys) bleed into every mode. The fundamental problem is that a file named `.env.local` — which Vite treats as "always load" — contains mode-specific configuration that should only apply to mock mode.

**Result:** The dev experience is fragile and mode-dependent behavior leaks across boundaries. Whether the specific `VITE_AUTH_MODE` override works depends on the Turbo configuration, making the system hard to reason about.

> **CTO review note:** The original version of this document incorrectly stated that Vite ignores shell env vars in favor of `.env` files. That was factually wrong — Vite's documented priority order gives shell vars the highest precedence. The root cause is the combination of `.env.local` being a Vite "always load" file and the Turbo/monorepo indirection that may drop inline env vars. The fix (eliminating `.env.local` entirely) addresses all of these vectors regardless of which specific priority conflict is active.

### 1.2 Two independent env loading systems

The server and client load environment variables through completely separate mechanisms:

| Layer      | Mechanism                                                             | File                              |
| ---------- | --------------------------------------------------------------------- | --------------------------------- |
| **Server** | Custom `dotenv` loader that reads `.env.{APP_ENV}` from monorepo root | `apps/server/src/lib/load-env.ts` |
| **Client** | Vite's built-in env loading, driven by `--mode` flag                  | Built into Vite                   |

These two systems use different naming conventions (`APP_ENV` values vs Vite mode names), different loading semantics (dotenv's "first write wins" vs Vite's layered merge), and are configured in different places (server `package.json` scripts vs client `package.json` scripts). There is no single source of truth for "what mode am I in."

### 1.3 Env file proliferation

The repo root currently contains **9 env files**:

| File            | Purpose                     | Used by                                |
| --------------- | --------------------------- | -------------------------------------- |
| `.env`          | Shared defaults             | Both                                   |
| `.env.example`  | Template for new developers | Documentation                          |
| `.env.local`    | Mock mode                   | Both (but poisons client in all modes) |
| `.env.real`     | Mock data + real SF OAuth   | `pnpm local:real`                      |
| `.env.local-db` | Mock auth + real DB         | `pnpm local:db`                        |
| `.env.stg`      | Staging                     | `pnpm dev`                             |
| `.env.stg.bak`  | Backup of staging (stale)   | Nobody                                 |
| `.env.prod`     | Production                  | Edge functions                         |
| `.env.test`     | Test runner                 | CI                                     |

Of these, `.env.real` and `.env.local-db` serve hybrid modes (`local:real` and `local:db`) that are no longer in active use. `.env.stg.bak` is a stale backup. The remaining files use inconsistent key subsets and have no validation that they are complete.

### 1.4 Script naming is counterintuitive

| Current script    | What a developer expects | What it actually does                                    |
| ----------------- | ------------------------ | -------------------------------------------------------- |
| `pnpm local`      | "Local development"      | Mock mode (correct, but the name is non-standard)        |
| `pnpm dev`        | "Local development"      | Staging Supabase + real JWT auth                         |
| `pnpm dev:remote` | Unclear                  | Client-only, pointing at deployed staging edge functions |
| `pnpm stg`        | "Staging"                | Alias for `dev:remote`                                   |
| `pnpm local:real` | Unclear                  | Mock data + real SF OAuth (unused)                       |
| `pnpm local:db`   | Unclear                  | Mock auth + staging DB (unused)                          |

A new developer's first instinct is `pnpm dev` for local development. Instead, they get a staging configuration that requires Supabase credentials they don't have.

### 1.5 Persona selector only works in mock mode

The "Simulate Role" buttons on the login page call `simulateRole()`, which generates a `mock_token_{userId}` and stores it in localStorage. This only works when:

1. The client is in mock mode (`VITE_AUTH_MODE=mock`), so it uses the `LocalAuthAdapter`
2. The server is in mock mode (`AUTH_MODE=mock`), so it parses `mock_token_*` bearer tokens

In staging mode, the persona buttons are hidden behind `isDev` (which checks `import.meta.env.DEV` — true in all Vite dev server modes, not just mock). Even if they were visible, clicking them would produce a `mock_token_*` that the staging server (running with `AUTH_MODE=jwt`) would reject.

**Result:** Testing different roles on staging requires manually signing in and out with real Supabase credentials. This is slow and error-prone, especially when testing role-based access control across 5 roles.

### 1.6 Persona emails use fictional domains

Current mock persona emails (`david@acme.com`, `sarah@acme.com`, etc.) use real-looking domains. These cannot be registered as real Supabase auth accounts without owning those domains. More importantly, there is no visual signal that these are test accounts — a developer inspecting logs or database records cannot immediately distinguish test personas from real users.

---

## 2. Proposed Solution

### 2.1 Four modes, four env files

Replace the current 9 env files with 4, plus the shared base and template:

| File                  | Mode name        | `pnpm` script         | Server                     | Client                     | Auth                                      |
| --------------------- | ---------------- | --------------------- | -------------------------- | -------------------------- | ----------------------------------------- |
| `.env`                | (shared)         | —                     | Shared non-secret defaults | Shared non-secret defaults | —                                         |
| `.env.mock`           | `mock`           | `pnpm dev`            | Local Hono, mock repos     | Local Vite                 | Mock personas (localStorage)              |
| `.env.staging`        | `staging`        | `pnpm dev:stg`        | Local Hono, staging DB     | Local Vite                 | Real JWT (Supabase) + persona quick-login |
| `.env.staging.remote` | `staging-remote` | `pnpm dev:stg-remote` | Deployed edge functions    | Local Vite                 | Real JWT (Supabase) + persona quick-login |
| `.env.example`        | —                | —                     | Template                   | Template                   | —                                         |

**Why these names:**

- `.env.mock` — not `.env.local`, which is a Vite reserved name. The name is explicit about what the mode does.
- `.env.staging` — not `.env.stg`. Abbreviations save 4 characters and cost clarity.
- `.env.staging.remote` — communicates that it's staging with a remote server.
- No `.env.prod` — production credentials are injected by the deployment platform (Supabase Edge Functions, Vercel), never loaded from a local file.

**Files to delete:** `.env.local`, `.env.real`, `.env.local-db`, `.env.stg`, `.env.stg.bak`, `.env.prod`, `.env.test`.

**`.gitignore` update:**

```gitignore
# Environment
.env
.env.*
!.env.example
!.env.mock
```

`.env.mock` is checked into the repo — it contains zero secrets and is the first thing a new developer needs. Checking it in means `git clone && pnpm install && pnpm dev` works out of the box with no manual env file creation.

`.env.staging` and `.env.staging.remote` remain gitignored — they contain real Supabase credentials.

### 2.2 Unified env loading

#### Server: simplify `load-env.ts`

The server's `load-env.ts` currently reads `APP_ENV` to determine which file to load. Rename the variable to `APP_MODE` and align the values with the new file names:

```typescript
// apps/server/src/lib/load-env.ts
const appMode = process.env.APP_MODE || 'mock';
const envFiles = [
  `.env`, // shared defaults (always)
  `.env.${appMode}`, // mode-specific overrides
];
```

The server scripts set `APP_MODE` explicitly:

```json
{
  "dev": "APP_MODE=mock    ... tsx watch src/dev.ts",
  "dev:stg": "APP_MODE=staging ... tsx watch src/dev.ts"
}
```

`APP_MODE` replaces `APP_ENV`. `USE_MOCK_DATA` and `AUTH_MODE` are still read from the env file — they are not set inline in the script. This eliminates the current duplication where inline env vars in the script repeat what's in the file.

#### Client: use Vite `--mode`

Vite's `--mode` flag controls which `.env.[mode]` file is loaded. Align the mode names:

```json
{
  "dev": "vite --mode mock",
  "dev:stg": "vite --mode staging",
  "dev:stg-remote": "vite --mode staging-remote"
}
```

When `--mode mock` is set, Vite loads `.env` + `.env.mock`. When `--mode staging`, Vite loads `.env` + `.env.staging`. Since `.env.local` no longer exists, there is no poison file to conflict.

**Key point:** Both server and client use the same mode name (`mock`, `staging`, `staging-remote`), and both read from the same env files in the monorepo root (the client already has `envDir: path.resolve(__dirname, '../..')` in `vite.config.ts`). One mode name, one file, both systems.

### 2.3 Consolidated `pnpm` scripts

**Root `package.json`:**

```json
{
  "scripts": {
    "dev": "turbo run dev",
    "dev:stg": "turbo run dev:stg",
    "dev:stg-remote": "pnpm --filter client dev:stg-remote",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "test": "turbo run test"
  }
}
```

**`apps/server/package.json`:**

```json
{
  "scripts": {
    "dev": "APP_MODE=mock    tsx watch src/dev.ts",
    "dev:stg": "APP_MODE=staging tsx watch src/dev.ts"
  }
}
```

**`apps/client/package.json`:**

```json
{
  "scripts": {
    "dev": "vite --mode mock",
    "dev:stg": "vite --mode staging",
    "dev:stg-remote": "vite --mode staging-remote"
  }
}
```

**Scripts removed:** `local`, `local:real`, `local:db`, `stg`, `dev:remote`. All gone. Three scripts cover the four modes (the fourth mode, production, is deployed — there is no local script for it).

**What each script does — the one-line version:**

| Script                | One-liner                                                                            |
| --------------------- | ------------------------------------------------------------------------------------ |
| `pnpm dev`            | Offline development. No credentials needed. Works after clone.                       |
| `pnpm dev:stg`        | Local server + client against staging Supabase. Requires `.env.staging`.             |
| `pnpm dev:stg-remote` | Client-only against deployed staging edge functions. Requires `.env.staging.remote`. |

### 2.4 Persona system overhaul

#### 2.4.1 Updated persona table

| Role           | Display Name            | Email               | Org  |
| -------------- | ----------------------- | ------------------- | ---- |
| `system_admin` | System Admin            | `admin@revbrain.ai` | Acme |
| `org_owner`    | David Levy (Org Owner)  | `david@test.org`    | Acme |
| `admin`        | Sarah Cohen (Admin)     | `sarah@test.org`    | Acme |
| `operator`     | Mike Johnson (Operator) | `mike@test.org`     | Acme |
| `reviewer`     | Amy Chen (Reviewer)     | `amy@test.org`      | Acme |

**Changes from current:**

| Field                    | Before         | After                    | Why                                                                                                                       |
| ------------------------ | -------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Email domain (non-admin) | `@acme.com`    | `@test.org`              | Clearly identifies test accounts in logs, DB, and Supabase dashboard                                                      |
| Email domain (admin)     | `@revbrain.io` | `@revbrain.ai`           | Matches the actual product domain                                                                                         |
| Display names            | `David Levy`   | `David Levy (Org Owner)` | Role visible at a glance in the UI header, audit logs, and support tickets without needing to check the user's role field |

**Files that need email/name updates:**

1. `packages/seed-data/src/users.ts` — canonical source (`SEED_USERS` array)
2. `apps/client/src/lib/mock-data.ts` — client-side `MOCK_USERS` record
3. `apps/server/src/repositories/mock/*.ts` — any hardcoded email references
4. `packages/database/src/seed.ts` — if it references emails directly
5. Test files — any assertions on persona emails

#### 2.4.2 Staging Supabase accounts

Create real Supabase Auth accounts in the staging project for each persona. These accounts:

- Are linked to matching rows in the `users` table via the database seeder (`pnpm db:seed`)
- Have passwords managed exclusively on the server side (never exposed to the client)
- Allow real JWT auth with one click from the persona picker via a server-side endpoint

**Provisioning script:** `scripts/create-staging-personas.ts`

A one-time script that:

1. Connects to the staging Supabase project using the service role key
2. For each persona: creates a Supabase Auth user with `email_confirm: true` (skip email verification)
3. Ensures matching rows exist in the `users` table with the correct `supabaseUserId`, role, and organization
4. Generates random 24-character passwords and stores them in `.env.staging` as server-side variables (no `VITE_` prefix — never bundled into client code)

This script is idempotent — re-running it skips existing accounts.

**`.env.staging` persona credentials block (server-side only):**

```env
# ─── Persona Quick-Login (staging only, server-side) ────────────────
# NOT prefixed with VITE_ — these are never exposed to the client.
# Created by: scripts/create-staging-personas.ts
PERSONA_LOGIN_SECRET=<random 32-byte base64>
PERSONA_SYSTEM_ADMIN_PASSWORD=<generated>
PERSONA_ORG_OWNER_PASSWORD=<generated>
PERSONA_ADMIN_PASSWORD=<generated>
PERSONA_OPERATOR_PASSWORD=<generated>
PERSONA_REVIEWER_PASSWORD=<generated>
```

> **CTO review note:** The original Rev 1 design stored persona passwords in `VITE_PERSONA_*` env vars. This was rejected: Vite explicitly bundles all `VITE_*` variables into client-side source code, meaning reusable staging credentials would ship to every browser. The revised design keeps all credentials server-side and uses a staging-only admin endpoint to mint sessions.

#### 2.4.3 Persona picker: server-issued session (staging mode)

The persona picker on the login page currently only works in mock mode. The new design makes it work in both modes, with credentials never leaving the server in staging mode.

**Mock mode (no change):**

1. User clicks a persona button
2. `simulateRole(role)` generates `mock_token_{userId}` in localStorage
3. Server accepts the mock token via `AUTH_MODE=mock`
4. Instant, no network call

**Staging mode — server-issued session (new):**

The client never sees persona passwords. Instead, a staging-only server endpoint performs the authentication on behalf of the developer:

1. User clicks a persona button
2. Client sends `POST /v1/dev/persona-login` with `{ role: "org_owner" }` and an `Authorization: Bearer <PERSONA_LOGIN_SECRET>` header
3. Server verifies the request:
   - Endpoint only registered when `APP_MODE` is not `production` (hard gate, not config-driven)
   - `PERSONA_LOGIN_SECRET` must match the server-side env var (not a `VITE_*` variable — never in client code)
   - The requested role must map to a known persona
4. Server calls `supabase.auth.admin.generateLink({ type: 'magiclink', email })` using the service role key, which returns a one-time token
5. Server exchanges the magic link token for a real session via `supabase.auth.verifyOtp()`, producing an `access_token` and `refresh_token`
6. Server returns the session tokens to the client
7. Client calls `supabase.auth.setSession({ access_token, refresh_token })` to establish the session
8. Real JWT session established — identical to a production login flow, but without credentials touching the browser

**Server endpoint implementation:** `apps/server/src/v1/routes/dev.ts`

```typescript
// POST /v1/dev/persona-login
// Staging-only: issues a real Supabase session for a test persona.
// Guarded by PERSONA_LOGIN_SECRET (server-side, non-VITE_ env var).

devRouter.post('/persona-login', async (c) => {
  const secret = process.env.PERSONA_LOGIN_SECRET;
  if (!secret) return c.json({ success: false, error: 'Persona login not configured' }, 503);

  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token !== secret) return c.json({ success: false, error: 'Unauthorized' }, 401);

  const { role } = await c.req.json<{ role: string }>();
  const persona = PERSONA_MAP[role]; // Maps role → email + server-side password env var
  if (!persona) return c.json({ success: false, error: 'Unknown role' }, 400);

  // Use Supabase Admin API to generate a magic link, then exchange it for a session
  const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: persona.email,
  });

  const { data: session } = await supabaseAdmin.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });

  return c.json({
    success: true,
    data: {
      accessToken: session.session.access_token,
      refreshToken: session.session.refresh_token,
    },
  });
});
```

**Why this approach over alternatives:**

| Alternative                        | Why rejected                                                                                                                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_*` passwords in client env   | Vite bundles `VITE_*` into client JS — credentials ship to every browser. **Rejected by CTO.**                                                                                                                                                          |
| Magic-link via email               | Requires email delivery infrastructure in staging. Not truly "one click" — developer must check inbox.                                                                                                                                                  |
| Server-side `signInWithPassword()` | Viable but requires storing persona passwords and calling `signInWithPassword` server-side. The `generateLink` + `verifyOtp` approach avoids storing passwords entirely — the admin API can mint a session for any user without knowing their password. |
| Client-side impersonation          | The existing impersonation system requires an active session first (chicken-and-egg: you need to be logged in to impersonate someone).                                                                                                                  |

**Simplification:** Since `supabase.auth.admin.generateLink()` can mint a session for any user by email alone (no password needed), the provisioning script does NOT need to store persona passwords at all. The only secret is `PERSONA_LOGIN_SECRET` — a single shared secret that gates access to the endpoint. This eliminates the per-persona password env vars entirely.

**Revised `.env.staging` persona block:**

```env
# ─── Persona Quick-Login (staging only, server-side) ────────────────
# Single secret that gates the /v1/dev/persona-login endpoint.
# NOT prefixed with VITE_ — never exposed to client code.
PERSONA_LOGIN_SECRET=<random 32-byte base64>
```

**Client-side implementation in `LoginPage.tsx`:**

```typescript
const handlePersonaLogin = async (role: UserRole) => {
  if (isMockMode) {
    // Existing behavior — instant, no network
    simulateRole(role);
    navigate(getRedirectPath(role));
    return;
  }

  // Staging mode — request a server-issued session
  const res = await fetch(`${apiUrl}/v1/dev/persona-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });

  if (!res.ok) return;

  const { data } = await res.json();
  await supabase.auth.setSession({
    access_token: data.accessToken,
    refresh_token: data.refreshToken,
  });
};
```

**Note on client auth header:** The client does NOT send `PERSONA_LOGIN_SECRET` in the request. The secret is verified server-side from the env var. The client request is unauthenticated — the endpoint is protected by:

1. Only being registered in non-production modes
2. Rate limiting (same as other dev endpoints)
3. Only accepting known persona roles (not arbitrary emails)

Wait — if the client doesn't send the secret, how is the endpoint protected from abuse on the deployed staging environment? Two options:

**Option A — No client secret (simpler):** The endpoint only accepts the 5 known persona roles, only exists in staging, and only works for emails that are already provisioned test accounts. The attack surface is limited: an attacker who discovers the endpoint can log in as a test persona on staging. If this is acceptable for staging (it's not production), this is the simplest approach.

**Option B — Client sends a non-sensitive gate token:** Store a non-secret "feature flag" like `VITE_PERSONA_LOGIN_ENABLED=true` in the client env. The server checks both this flag (from the client request) AND its own `PERSONA_LOGIN_SECRET`. The client flag is not a credential — it's a feature gate that tells the UI to show the persona picker. The real security boundary is the server-side secret.

**Recommendation:** Option B. The client sends `PERSONA_LOGIN_SECRET` in the Authorization header. This secret is stored in `.env.staging` without a `VITE_` prefix, meaning it's available to the server's `process.env` but NOT bundled into Vite's client build. The client reads it via a proxy: the server exposes a `GET /v1/dev/persona-login/available` endpoint that returns `{ available: true }` if the secret is configured — the client uses this to decide whether to show the persona picker. The actual login request includes the secret in the header, but the client obtains it from... hmm, this circles back to the problem.

**Final recommendation: Option A.** Keep it simple. The endpoint is staging-only, accepts only 5 hardcoded roles, and creates sessions for pre-provisioned test accounts. The risk profile (someone logs into a test account on a staging environment) is acceptable. The persona picker is shown when `VITE_PERSONA_LOGIN_ENABLED=true` is set in the client env — this is a boolean flag, not a credential.

**Visibility rules for the persona picker:**

| Condition                                        | Persona picker visible?       |
| ------------------------------------------------ | ----------------------------- |
| Mock mode (`VITE_AUTH_MODE=mock`)                | Yes — always (all 5 personas) |
| Staging mode + `VITE_PERSONA_LOGIN_ENABLED=true` | Yes — all 5 personas          |
| Staging mode + flag not set                      | No — hidden entirely          |
| Production build (`import.meta.env.PROD`)        | No — never                    |

**`.env.staging` final persona block:**

```env
# ─── Persona Quick-Login ────────────────────────────────────────────
# Enables the /v1/dev/persona-login endpoint and client-side picker.
# The endpoint uses Supabase Admin API to mint sessions — no passwords stored.
PERSONA_LOGIN_SECRET=<random 32-byte base64>
VITE_PERSONA_LOGIN_ENABLED=true
```

### 2.5 Mock mode guard update

The current `validateMockModeConfig()` in `apps/server/src/lib/mock-mode-guard.ts` checks:

1. Mock mode is not enabled in production or staging (`APP_ENV`)
2. `USE_MOCK_DATA` and `AUTH_MODE` are consistent (both mock or both real)
3. Special exception for `APP_ENV=local-db` (hybrid mode)

**Changes:**

- Replace `APP_ENV` references with `APP_MODE`
- Remove the `local-db` exception (that mode is deleted)
- The guard now checks two valid states only: `{ USE_MOCK_DATA=true, AUTH_MODE=mock }` or `{ USE_MOCK_DATA=false, AUTH_MODE=jwt }`
- Block mock mode if `APP_MODE=staging` or `APP_MODE=production`

### 2.6 Service config store simplification

The client's `useServiceConfigStore` (`apps/client/src/stores/service-config-store.ts`) currently manages a `mode` (`offline`/`online`) and granular `targets` (`server`, `database`, `storage` each set to `local`/`remote`). The granular targets were needed for the hybrid modes (`local-db`, `local:real`) that are being removed.

**Changes:**

- Remove `ServiceTarget` and `ServiceTargets` types
- Remove `setServerTarget`, `setDatabaseTarget`, `setStorageTarget`, `setAllTargets`
- Keep `mode: AppMode` (`offline` | `online`) — driven by `VITE_AUTH_MODE`
- The store becomes a simple toggle, not a configuration matrix
- Bump the persist version to force a migration to clean defaults

### 2.7 Updated `.env.example`

The `.env.example` template is updated to reflect the new structure. It documents all three modes, which variables are required for each, and where to get credentials.

---

## 3. Env file contents

### 3.1 `.env` (shared, committed to repo)

```env
# ─── RevBrain — Shared Defaults ──────────────────────────────────────
# Loaded in ALL modes. No secrets here — this file is committed to git.
# Mode-specific overrides go in .env.mock / .env.staging / .env.staging.remote

VITE_API_URL=http://localhost:3000
FRONTEND_URL=http://localhost:5173
APP_URL=http://localhost:5173
```

### 3.2 `.env.mock` (committed to repo)

```env
# ─── RevBrain — Mock Mode ───────────────────────────────────────────
# Fully offline development. No external services, no credentials needed.
# Run with: pnpm dev

NODE_ENV=development
APP_MODE=mock
USE_MOCK_DATA=true
AUTH_MODE=mock
VITE_AUTH_MODE=mock

# Salesforce (mock values — required by server validation, not used for real API calls)
SALESFORCE_CONSUMER_KEY=mock-consumer-key
SALESFORCE_CONSUMER_SECRET=mock-consumer-secret
SALESFORCE_TOKEN_ENCRYPTION_KEY=cmV2YnJhaW4tZW5jcnlwdGlvbi1rZXktMzJieXRlcyE=
SALESFORCE_STATE_SIGNING_SECRET=bW9jay1zdGF0ZS1zaWduaW5nLXNlY3JldC0zMiEh
SALESFORCE_CALLBACK_URL=http://localhost:5173/api/v1/salesforce/oauth/callback
WORKER_SECRET=bW9jay13b3JrZXItc2VjcmV0LTMyLWJ5dGVzISEhIQ==
```

### 3.3 `.env.staging` (gitignored)

```env
# ─── RevBrain — Staging Mode ────────────────────────────────────────
# Local server + client against staging Supabase.
# Run with: pnpm dev:stg
# Get credentials from the project owner or 1Password.

NODE_ENV=development
APP_MODE=staging
USE_MOCK_DATA=false
AUTH_MODE=jwt
VITE_AUTH_MODE=jwt

# Supabase
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=<key>
SUPABASE_SERVICE_ROLE_KEY=<key>
SUPABASE_JWT_SECRET=<secret>
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-1-<region>.pooler.supabase.com:6543/postgres
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<key>

# Salesforce
SALESFORCE_CONSUMER_KEY=<real key>
SALESFORCE_CONSUMER_SECRET=<real secret>
SALESFORCE_TOKEN_ENCRYPTION_KEY=<real 32-byte base64>
SALESFORCE_STATE_SIGNING_SECRET=<real 32-byte base64>
SALESFORCE_CALLBACK_URL=http://localhost:5173/api/v1/salesforce/oauth/callback
WORKER_SECRET=<real secret>

# ─── Persona Quick-Login ────────────────────────────────────────────
# Server-side secret gates the /v1/dev/persona-login endpoint.
# The endpoint uses Supabase Admin API to mint sessions — no passwords stored.
# NOT prefixed with VITE_ — never exposed to client code.
PERSONA_LOGIN_SECRET=<random 32-byte base64>
# Client-side flag — tells the UI to show the persona picker.
# This is a boolean feature flag, not a credential.
VITE_PERSONA_LOGIN_ENABLED=true
```

### 3.4 `.env.staging.remote` (gitignored)

```env
# ─── RevBrain — Staging Remote Mode ─────────────────────────────────
# Client-only, pointing at deployed staging edge functions.
# Run with: pnpm dev:stg-remote
# No local server needed — API calls go to the deployed staging URL.

NODE_ENV=development
APP_MODE=staging-remote
VITE_AUTH_MODE=jwt
VITE_API_URL=https://stg.revbrain.ai/api
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<key>

# ─── Persona Quick-Login ────────────────────────────────────────────
# The deployed staging edge function must also have PERSONA_LOGIN_SECRET set.
VITE_PERSONA_LOGIN_ENABLED=true
```

---

## 4. Migration Checklist

### Phase 1 — Env file restructure (no behavioral change)

| #   | Task                                                                                                    | Files                       |
| --- | ------------------------------------------------------------------------------------------------------- | --------------------------- |
| 1.1 | Create `.env.mock` with contents from current `.env.local`                                              | `.env.mock` (new)           |
| 1.2 | Create `.env.staging` with contents from current `.env.stg` + persona credential placeholders           | `.env.staging` (new)        |
| 1.3 | Create `.env.staging.remote` with client-only staging config                                            | `.env.staging.remote` (new) |
| 1.4 | Update `.env` to contain only shared, non-secret defaults                                               | `.env`                      |
| 1.5 | Update `.gitignore` — un-ignore `.env.mock`, keep ignoring `.env.staging*`                              | `.gitignore`                |
| 1.6 | Update `.env.example` to document the new structure                                                     | `.env.example`              |
| 1.7 | Delete stale files: `.env.local`, `.env.real`, `.env.local-db`, `.env.stg`, `.env.stg.bak`, `.env.prod` | Deleted files               |

### Phase 2 — Server env loading

| #   | Task                                                                                                                | Files                                         |
| --- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 2.1 | Rewrite `load-env.ts` to use `APP_MODE` instead of `APP_ENV`, load `.env` + `.env.{mode}`                           | `apps/server/src/lib/load-env.ts`             |
| 2.2 | Update `mock-mode-guard.ts` — remove `local-db` exception, use `APP_MODE`                                           | `apps/server/src/lib/mock-mode-guard.ts`      |
| 2.3 | Update `mock-mode-guard.test.ts`                                                                                    | `apps/server/src/lib/mock-mode-guard.test.ts` |
| 2.4 | Search-and-replace `APP_ENV` → `APP_MODE` across server codebase                                                    | ~10 files (see §1.2 audit)                    |
| 2.5 | Update server `package.json` scripts — replace inline env vars with `APP_MODE=mock` / `APP_MODE=staging`            | `apps/server/package.json`                    |
| 2.6 | Remove `NODE_OPTIONS='--max-old-space-size=8192'` from scripts and move to `.npmrc` or `turbo.json` if still needed | `apps/server/package.json`                    |

### Phase 3 — Client env loading

| #   | Task                                                                                                               | Files                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| 3.1 | Update client `package.json` scripts — use `vite --mode mock`, `vite --mode staging`, `vite --mode staging-remote` | `apps/client/package.json`                             |
| 3.2 | Remove `VITE_AUTH_MODE=jwt` inline env var from scripts (now comes from env file)                                  | `apps/client/package.json`                             |
| 3.3 | Simplify `service-config-store.ts` — remove `ServiceTarget`/`ServiceTargets`, remove granular target setters       | `apps/client/src/stores/service-config-store.ts`       |
| 3.4 | Update `service-config-store.test.tsx`                                                                             | `apps/client/src/stores/service-config-store.test.tsx` |
| 3.5 | Verify `vite.config.ts` `envDir` still resolves correctly (currently `../..` — should work)                        | `apps/client/vite.config.ts`                           |

### Phase 4 — Root scripts

| #   | Task                                                                                                                                | Files          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 4.1 | Update root `package.json` — replace `local`/`local:real`/`local:db`/`dev`/`dev:remote`/`stg` with `dev`/`dev:stg`/`dev:stg-remote` | `package.json` |
| 4.2 | Update `turbo.json` if task names changed                                                                                           | `turbo.json`   |

### Phase 5 — Persona data update

| #   | Task                                                                                                              | Files                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 5.1 | Update `SEED_USERS` — new emails (`@test.org` / `@revbrain.ai`) and display names with role suffix                | `packages/seed-data/src/users.ts`                     |
| 5.2 | Update `MOCK_USERS` — new emails and display names                                                                | `apps/client/src/lib/mock-data.ts`                    |
| 5.3 | Update `ROLE_DISPLAY_NAMES` if needed (display names now include role in the persona name, not in the role label) | `apps/client/src/types/auth.ts`                       |
| 5.4 | Update translation files if persona names appear in i18n                                                          | `apps/client/src/i18n/en/*.json`, `he/*.json`         |
| 5.5 | Update any test files that assert on persona emails                                                               | Grep for `@acme.com`, `@revbrain.io`, `@beta-ind.com` |

### Phase 6 — Persona quick-login in staging

| #    | Task                                                                                                                                                                             | Files                                               |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 6.1  | Write `scripts/create-staging-personas.ts` — provisions Supabase Auth accounts (email-confirmed, no password needed for admin API flow)                                          | `scripts/create-staging-personas.ts` (new)          |
| 6.2  | Run the provisioning script against staging                                                                                                                                      | Manual                                              |
| 6.3  | Generate `PERSONA_LOGIN_SECRET` and add to `.env.staging`; add `VITE_PERSONA_LOGIN_ENABLED=true` to both `.env.staging` and `.env.staging.remote`                                | `.env.staging`, `.env.staging.remote`               |
| 6.4  | Implement `POST /v1/dev/persona-login` endpoint — accepts `{ role }`, uses Supabase Admin `generateLink` + `verifyOtp` to mint a real session, guarded by `PERSONA_LOGIN_SECRET` | `apps/server/src/v1/routes/dev.ts`                  |
| 6.5  | Gate endpoint registration: only register when `APP_MODE !== 'production'` and `PERSONA_LOGIN_SECRET` is set                                                                     | `apps/server/src/v1/routes/dev.ts`                  |
| 6.6  | Update `LoginPage.tsx` — replace `isDev` with `VITE_PERSONA_LOGIN_ENABLED` check; in staging mode, call `/v1/dev/persona-login` then `supabase.auth.setSession()`                | `apps/client/src/features/auth/pages/LoginPage.tsx` |
| 6.7  | Update `auth-store.ts` — `simulateRole` delegates to the server endpoint when not in mock mode                                                                                   | `apps/client/src/stores/auth-store.ts`              |
| 6.8  | Verify persona picker works in mock mode (regression)                                                                                                                            | Manual                                              |
| 6.9  | Verify persona picker works in staging mode with `pnpm dev:stg` (new)                                                                                                            | Manual                                              |
| 6.10 | Verify persona picker works in staging-remote mode with `pnpm dev:stg-remote` (new)                                                                                              | Manual                                              |

### Phase 7 — Cleanup and documentation

| #   | Task                                                                                                                                                                          | Files                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 7.1 | Update `CLAUDE.md` Quick Reference section with new script names                                                                                                              | `CLAUDE.md`                |
| 7.2 | Update `docs/CONTRIBUTING.md` with new onboarding instructions                                                                                                                | `docs/CONTRIBUTING.md`     |
| 7.3 | Delete `apps/client/src/lib/adapters/local/auth.ts` `simulateRole()` helper if it's no longer called directly (the persona picker now goes through `login()` in staging mode) | Conditional                |
| 7.4 | Run full test suite (`pnpm test`) and fix any failures from `APP_ENV` → `APP_MODE` rename                                                                                     | All test files             |
| 7.5 | Run `pnpm lint` and fix any issues                                                                                                                                            | All files                  |
| 7.6 | Update CI workflow (`.github/workflows/ci.yml`) — replace `APP_ENV` references                                                                                                | `.github/workflows/ci.yml` |

---

## 5. Risk Assessment

| Risk                                                              | Likelihood | Impact | Mitigation                                                                                                                                                                                                                    |
| ----------------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_ENV` → `APP_MODE` rename breaks deployed edge functions      | Medium     | High   | Edge functions don't use `load-env.ts` — they receive env vars from the platform. Verify that `APP_ENV` is not referenced in `supabase/functions/` code. If it is, update there too.                                          |
| Persona provisioning script creates duplicate auth users          | Low        | Low    | Script is idempotent — checks for existing users by email before creating.                                                                                                                                                    |
| `.env.mock` committed to repo is accidentally used in production  | Very low   | Medium | The `mock-mode-guard.ts` hard-blocks mock mode when `APP_MODE` is `staging` or `production`. Additionally, production uses platform-injected env vars, not file-based loading.                                                |
| Removing `ServiceTargets` from the config store breaks a consumer | Low        | Low    | Grep for `useServiceTargets`, `setServerTarget`, `setDatabaseTarget`, `setStorageTarget`. If any consumer exists outside the config store, update it.                                                                         |
| Test suite uses `APP_ENV` in setup/assertions                     | High       | Low    | Several test files reference `APP_ENV`. All must be updated to `APP_MODE`. This is mechanical but must not be missed.                                                                                                         |
| `/v1/dev/persona-login` endpoint accessible on deployed staging   | Low        | Low    | Endpoint only accepts 5 hardcoded persona roles (pre-provisioned test accounts), not arbitrary emails. Attack surface is limited to logging into a test account on a staging environment. Acceptable risk for non-production. |
| Deleting `.env.test` breaks CI test runs                          | Medium     | Medium | Verify what `.env.test` provides to the test runner. If it sets `APP_ENV=test` or similar, ensure the test configuration is replaced explicitly in `vitest.config.ts` or CI workflow env vars before deleting the file.       |

---

## 6. Verification Criteria

After implementation, the following must hold:

1. **`git clone && pnpm install && pnpm dev`** starts the app in mock mode with working persona selection. No manual env file creation required.
2. **`pnpm dev:stg`** starts the app against staging Supabase. Persona picker shows real login buttons. Clicking a persona calls `/v1/dev/persona-login`, receives a real JWT session, and lands on the correct page. No credentials are exposed in client-side source code.
3. **`pnpm dev:stg-remote`** starts only the client, pointing at the deployed staging edge functions. Persona quick-login works (the deployed edge function must have `PERSONA_LOGIN_SECRET` set).
4. **`pnpm test`** passes with no env-related failures.
5. **`pnpm lint`** passes.
6. **CI pipeline** (GitHub Actions) passes — `APP_ENV` references are updated to `APP_MODE`.
7. **No `.env.local` file exists** anywhere in the repo or documentation.
8. **Deployed staging and production** continue to work — the env restructure is local-dev only.
9. **No `VITE_PERSONA_*_PASSWORD` or similar credential variables** exist anywhere in client-accessible env files or code. All persona credentials are server-side only.
