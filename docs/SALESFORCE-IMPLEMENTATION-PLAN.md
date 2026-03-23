# Salesforce Integration — Implementation Plan

> **Spec reference:** [SALESFORCE-INTEGRATION-SPEC.md](./SALESFORCE-INTEGRATION-SPEC.md) (v5-final)
> **Date:** 2026-03-23
> **Purpose:** Step-by-step build guide for the Salesforce integration. Each task has a clear objective, detailed description, test strategy, edge cases, and a quality gate. This is the engineering team's north star.

## How to Use This Document

Each task follows a strict format:

- **Objective** — what this task achieves and how to verify it
- **Test strategy** — unit, integration, or E2E, and what to test
- **Description** — exactly what to build, which files to touch, which patterns to follow
- **Tests to write** — specific test cases
- **Edge cases & gotchas** — things that will bite you if you skip them
- **Quality gate** — every task ends with: `pnpm lint && pnpm test && pnpm build` must pass. Commit and push only after all clear.

### Codebase Patterns (reference)

All new code must follow existing conventions. Key files to study before starting:

| Pattern                   | Reference File                                                                    |
| ------------------------- | --------------------------------------------------------------------------------- |
| Drizzle table definition  | `packages/database/src/schema.ts` (see `projects` table)                          |
| Repository interface      | `packages/contract/src/repositories/types.ts`                                     |
| Drizzle repository impl   | `apps/server/src/repositories/drizzle/project.repository.ts`                      |
| Mock repository impl      | `apps/server/src/repositories/mock/project.repository.ts`                         |
| Repository container      | `apps/server/src/repositories/drizzle/index.ts` (`createDrizzleRepositories`)     |
| Hono route                | `apps/server/src/v1/routes/projects.ts` (OpenAPIHono + createRoute)               |
| Service class             | `apps/server/src/services/organization.service.ts`                                |
| Tests                     | `apps/server/src/repositories/drizzle/plan.repository.test.ts` (vitest + vi.mock) |
| Zod schemas               | `packages/contract/src/index.ts`                                                  |
| Seed data                 | `packages/seed-data/src/projects.ts`                                              |
| React page                | `apps/client/src/features/projects/pages/ProjectsPage.tsx`                        |
| React hooks (React Query) | `apps/client/src/features/projects/hooks/use-project-api.ts`                      |
| Env vars                  | `apps/server/src/lib/env.ts` (`getEnv()`)                                         |
| RBAC middleware           | `apps/server/src/middleware/rbac.ts` (`requireRole()`)                            |
| Audit context             | `apps/server/src/v1/routes/admin/utils/audit-context.ts` (`buildAuditContext()`)  |
| i18n translations         | `apps/client/src/locales/{en,he}/` (JSON per feature)                             |

### Conventions

- All imports use `.ts` extensions (Deno compatibility)
- Response format: `{ success: true, data: ... }` or `{ success: false, error: { code, message } }`
- CSS borders: always `border border-slate-200`
- RTL-safe CSS: `start-*`/`end-*` and `ms-*`/`me-*`, never `left-*`/`right-*`/`ml-*`/`mr-*`
- Every UI string in both `en/*.json` and `he/*.json`
- Use `AppError` with `ErrorCodes` for errors, never raw `throw new Error()` in routes
- Use `getEnv()` for environment variables, never `process.env` directly
- Audit log all mutations via `buildAuditContext(c)` + `repos.auditLogs.create()`

---

## Phase 1: OAuth Connection & Verification

> Spec ref: §6, §7, §8, §9, §10, §11, §12, §22 Phase 1

### Task 1.1: Salesforce ECA Registration (Manual)

**Objective:** RevBrain's External Client App exists in a Salesforce org we control, with Consumer Key and Consumer Secret available as env vars.

**Test strategy:** Smoke — manually verify the OAuth authorize URL works by opening it in a browser (expect Salesforce login page).

**Description:**

1. Log into our Salesforce Developer Edition org
2. Setup → External Client App Manager → New
3. Configure per §6 config table: app name "RevBrain", scopes `api refresh_token id`, PKCE required, Distribution State "Packaged", Refresh Token "valid until revoked"
4. Note the exact field name for "Require Secret" — may be labeled "Require Secret for Refresh Token Flow" in ECA UI
5. Add callback URLs: `http://localhost:5173/api/v1/salesforce/oauth/callback`, staging, production
6. Copy Consumer Key → `SALESFORCE_CONSUMER_KEY` in `.env.local`, `.env.stg`, `.env.prod`
7. Copy Consumer Secret → `SALESFORCE_CONSUMER_SECRET` (same files)

**Tests to write:** None (manual config). Verify by constructing the authorize URL and confirming Salesforce renders the login page.

**Edge cases & gotchas:**

- ECA creation UI may differ from Connected App UI — field names aren't identical
- The Consumer Secret is shown only once after creation — copy it immediately
- If the Salesforce org doesn't have ECA creation enabled, you may need to enable it in Setup → Feature Settings

---

### Task 1.2: Encryption Utility

**Objective:** An `encrypt()`/`decrypt()` module exists at `apps/server/src/lib/encryption.ts` that provides AES-256-GCM encryption with HKDF-derived keys and per-field IVs. All tests pass.

**Test strategy:** Unit tests.

**Description:**

Create `apps/server/src/lib/encryption.ts`:

- `deriveKey(masterKey: Buffer, context: string): Buffer` — HKDF-SHA256 with the context string as info parameter. Returns a 32-byte derived key.
- `encrypt(plaintext: string, masterKey: Buffer, context: string): Buffer` — generates random 12-byte IV, encrypts with AES-256-GCM using derived key, returns `IV(12) || ciphertext || authTag(16)` as a single Buffer.
- `decrypt(blob: Buffer, masterKey: Buffer, context: string): string` — splits blob into IV/ciphertext/authTag, decrypts with derived key, returns plaintext string.
- `generateEncryptionKey(): string` — generates a random 32-byte key, returns as base64 string (for initial key generation).

Must be compatible with both Node.js `crypto` and Web Crypto API (Deno). Use Node.js `crypto` as primary with a note about Deno compatibility path.

Add `SALESFORCE_TOKEN_ENCRYPTION_KEY` to `.env.local` (generate with `openssl rand -base64 32`). Add to `.env.example` with placeholder. Access via `getEnv('SALESFORCE_TOKEN_ENCRYPTION_KEY')`.

**Tests to write** (`apps/server/src/lib/encryption.test.ts`):

1. Encrypt then decrypt returns original plaintext
2. Different plaintexts produce different ciphertexts
3. Same plaintext encrypted twice produces different ciphertexts (unique IVs)
4. Tampering with ciphertext throws an error (modify one byte, expect decrypt to fail)
5. Wrong master key throws an error
6. Wrong context string throws an error (HKDF produces different derived key)
7. Empty string encrypts and decrypts correctly
8. Long string (10KB) encrypts and decrypts correctly
9. Blob format is correct: length = 12 (IV) + plaintext.length + overhead + 16 (authTag)

**Edge cases & gotchas:**

- `crypto.randomBytes(12)` for IV — never reuse IVs. Each call to `encrypt()` MUST generate a fresh IV.
- HKDF context strings: use `"oauth_token"` for OAuth tokens, `"browser_cred"` for Phase 6 browser credentials. These are constants — define them in the module.
- The `authTag` from `cipher.getAuthTag()` must be called AFTER `cipher.final()`, not before.
- Buffer concatenation order matters: `IV || encrypted || authTag`. Reversing any of these makes decryption impossible.
- Deno compatibility: `crypto.createCipheriv` exists in Node.js but not in Deno's `std/crypto`. For Deno, you'd use `crypto.subtle`. For now, implement with Node.js crypto and add a `// Deno compatibility: migrate to crypto.subtle` comment.

---

### Task 1.3: Database Schema — Salesforce Tables

**Objective:** Three new tables exist in the Drizzle schema (`salesforceConnections`, `oauthPendingFlows`, `salesforceConnectionLogs`) and new columns are added to `projects`. Migration runs successfully against staging.

**Test strategy:** Integration — run migration against a test database, verify tables exist with correct columns and constraints.

**Description:**

Edit `packages/database/src/schema.ts`:

**Table: `salesforceConnections`** — follow the `projects` table pattern. Include all columns from §11 schema:

- `id`, `projectId` (FK → projects, cascade delete), `organizationId` (FK → organizations, cascade delete), `connectionRole` (varchar, default 'source')
- Salesforce identity: `salesforceOrgId`, `salesforceInstanceUrl`, `customLoginUrl`, `oauthBaseUrl`, `salesforceUserId`, `salesforceUsername`, `instanceType`, `apiVersion`
- Encrypted tokens: `encryptedAccessToken` (bytea), `encryptedRefreshToken` (bytea), `encryptionKeyVersion` (int, default 1), `tokenVersion` (int, default 1)
- Token metadata: `tokenIssuedAt`, `tokenScopes`, `lastRefreshAt`
- Connection metadata: `connectionMetadata` (jsonb)
- State: `status` (varchar, default 'active'), `lastUsedAt`, `lastSuccessfulApiCallAt`, `lastError`, `lastErrorAt`
- Audit: `connectedBy` (FK → users), `disconnectedBy` (FK → users), `disconnectedAt`, `createdAt`, `updatedAt`
- Unique constraint: `(projectId, connectionRole)`
- Indexes: `organizationId`, `status`, `salesforceOrgId`

**Table: `oauthPendingFlows`** — short-lived PKCE state (§11):

- `nonce` (uuid PK), `projectId`, `organizationId`, `userId`, `connectionRole`, `codeVerifier` (text), `oauthBaseUrl` (text), `expiresAt` (timestamptz), `createdAt`
- Unique: `(projectId, connectionRole)`
- Index: `expiresAt`

**Table: `salesforceConnectionLogs`** — audit trail:

- `id` (uuid PK), `connectionId` (FK → salesforceConnections, cascade), `event` (varchar), `details` (jsonb), `performedBy` (FK → users), `createdAt`

**Alter `projects` table** — add columns:

- `clientCompanyName` (text), `contractReference` (text), `estimatedObjects` (int), `stakeholders` (jsonb)

Add Zod schema for stakeholders in `packages/contract/src/index.ts`:

```typescript
export const StakeholderSchema = z.object({
  name: z.string(),
  role: z.string(),
  email: z.string().email(),
});
export const StakeholdersSchema = z.array(StakeholderSchema).nullable();
```

Export `Plan`, `NewPlan`-style types: `SalesforceConnection`, `NewSalesforceConnection`, etc.

Run `pnpm drizzle-kit generate` to create migration, then `pnpm db:push` against staging.

**Tests to write:**

1. Migration applies without errors (integration test or manual verification)
2. Unique constraint `(projectId, connectionRole)` prevents duplicate source connections
3. Unique constraint allows one source AND one target for the same project
4. Cascade delete: deleting a project deletes its connections
5. Cascade delete: deleting a connection deletes its logs
6. `salesforceOrgId` index exists (query plan check)

**Edge cases & gotchas:**

- `bytea` columns in Drizzle: use `customType` or Drizzle's built-in `bytea` type. Check Drizzle docs for the exact syntax — it may be `pgTable` specific.
- The `jsonb` column for `connectionMetadata` should be typed with `$type<ConnectionMetadataType>()` where the type matches the audit output from §8.
- Don't forget RLS policies — add them in Supabase Dashboard after migration. Pattern: `organization_id = auth.jwt() -> 'organization_id'` (same as existing tables).
- The `oauthPendingFlows` table intentionally does NOT have RLS — it's server-side only, never exposed to client queries.

---

### Task 1.4: Salesforce Connection Repository — Contract Interface

**Objective:** `SalesforceConnectionRepository` interface exists in `packages/contract/src/repositories/types.ts` with all necessary methods. `Repositories` type is updated to include it.

**Test strategy:** Compile-time — TypeScript compilation succeeds.

**Description:**

Add to `packages/contract/src/repositories/types.ts`:

```typescript
export interface SalesforceConnectionEntity {
  id: string;
  projectId: string;
  organizationId: string;
  connectionRole: 'source' | 'target';
  salesforceOrgId: string;
  salesforceInstanceUrl: string;
  customLoginUrl: string | null;
  oauthBaseUrl: string;
  salesforceUserId: string | null;
  salesforceUsername: string | null;
  instanceType: 'production' | 'sandbox';
  apiVersion: string | null;
  // Tokens are decrypted when returned from repository
  accessToken: string;
  refreshToken: string;
  encryptionKeyVersion: number;
  tokenVersion: number;
  tokenIssuedAt: Date | null;
  tokenScopes: string | null;
  lastRefreshAt: Date | null;
  connectionMetadata: Record<string, unknown> | null;
  status: string;
  lastUsedAt: Date | null;
  lastSuccessfulApiCallAt: Date | null;
  lastError: string | null;
  lastErrorAt: Date | null;
  connectedBy: string | null;
  disconnectedBy: string | null;
  disconnectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

Repository interface with methods:

- `findById(id: string)` → entity or null
- `findByProjectAndRole(projectId: string, role: 'source' | 'target')` → entity or null
- `findByProject(projectId: string)` → entity[] (returns both source and target)
- `findByOrganization(organizationId: string)` → entity[]
- `create(data: CreateSalesforceConnectionInput)` → entity
- `updateTokens(id: string, accessToken: string, tokenVersion: number)` → entity or null (optimistic lock)
- `updateStatus(id: string, status: string, error?: string)` → entity or null
- `updateMetadata(id: string, metadata: Record<string, unknown>)` → entity or null
- `disconnect(id: string, disconnectedBy: string)` → boolean
- `delete(id: string)` → boolean

Update the `Repositories` interface to include `salesforceConnections: SalesforceConnectionRepository`.

Also add `OauthPendingFlowEntity` and a minimal `OauthPendingFlowRepository` interface:

- `create(data)` → entity
- `findByNonce(nonce: string)` → entity or null
- `deleteByNonce(nonce: string)` → boolean
- `upsertForProject(data)` → entity (handles the expired-row replacement logic from §11)
- `cleanupExpired()` → number (count of deleted rows)

Update `Repositories` to include `oauthPendingFlows: OauthPendingFlowRepository`.

Add `SalesforceConnectionLogEntity` and `SalesforceConnectionLogRepository`:

- `create(data)` → entity
- `findByConnection(connectionId: string, options?: FindManyOptions)` → entity[]

Update `Repositories` to include `salesforceConnectionLogs: SalesforceConnectionLogRepository`.

**Tests to write:** None (type-level — compilation is the test). Verify `pnpm build` in `packages/contract` succeeds.

**Edge cases & gotchas:**

- The entity returns **decrypted** tokens (`accessToken`, `refreshToken` as strings). Encryption/decryption happens inside the Drizzle repository implementation, not in the interface. The mock repository stores plaintext.
- `tokenVersion` is critical for the optimistic locking pattern — the `updateTokens` method must accept the expected version and return null if it doesn't match.

---

### Task 1.5: Salesforce Connection Repository — Drizzle Implementation

**Objective:** `DrizzleSalesforceConnectionRepository` exists, encrypts tokens on write, decrypts on read, supports optimistic locking for token refresh. All tests pass.

**Test strategy:** Unit tests (mock the database).

**Description:**

Create `apps/server/src/repositories/drizzle/salesforce-connection.repository.ts`:

- Constructor takes `DrizzleDB` and the encryption master key (from `getEnv`)
- `create()`: encrypt access token and refresh token using `encrypt(token, masterKey, 'oauth_token')`, store as bytea, return entity with decrypted tokens
- `findById()` / `findByProjectAndRole()`: query DB, decrypt tokens, return entity
- `updateTokens()`: encrypt new access token, UPDATE with `WHERE token_version = expected`, return null if 0 rows affected (optimistic lock failed)
- `disconnect()`: set status='disconnected', disconnectedBy, disconnectedAt
- Private `toEntity()` method: converts DB row to entity, decrypts tokens
- Private `encryptToken()` / `decryptToken()` helpers

Similarly create repositories for `oauthPendingFlows` and `salesforceConnectionLogs`.

Register all three in `apps/server/src/repositories/drizzle/index.ts` → `createDrizzleRepositories()`.

**Tests to write** (`apps/server/src/repositories/drizzle/salesforce-connection.repository.test.ts`):

1. `create()` stores encrypted tokens (verify the stored bytes are not plaintext)
2. `findById()` returns entity with decrypted tokens matching original input
3. `findByProjectAndRole()` returns correct connection for role='source' vs role='target'
4. `findByProjectAndRole()` returns null when no connection exists for that role
5. `updateTokens()` with correct `tokenVersion` succeeds and increments version
6. `updateTokens()` with stale `tokenVersion` returns null (optimistic lock)
7. `disconnect()` sets status, disconnectedBy, disconnectedAt
8. `findByProject()` returns both source and target connections
9. `findByOrganization()` returns only connections for that org

**Tests for `oauthPendingFlows` repository:**

1. `create()` stores flow with correct TTL
2. `findByNonce()` returns flow
3. `deleteByNonce()` removes the flow
4. `upsertForProject()` replaces expired flow for same project+role
5. `upsertForProject()` rejects if existing flow is still live (not expired)
6. `cleanupExpired()` deletes only expired rows

**Edge cases & gotchas:**

- The encryption key must be loaded once at startup, not on every request. Store it as a class property.
- If `getEnv('SALESFORCE_TOKEN_ENCRYPTION_KEY')` is undefined, throw immediately at startup — don't wait for the first connection attempt.
- The `bytea` type in Drizzle PostgreSQL: verify how Drizzle handles `Buffer` ↔ `bytea` conversion. You may need `sql.raw()` or a custom column type.
- `updateTokens` must update `tokenIssuedAt`, `lastRefreshAt`, `updatedAt` along with the token and version.

---

### Task 1.6: Salesforce Connection Repository — Mock Implementation

**Objective:** `MockSalesforceConnectionRepository` exists for `pnpm local` development. Pre-populated with seed data for demo projects.

**Test strategy:** Unit tests (same interface tests as Drizzle, but simpler).

**Description:**

Create `apps/server/src/repositories/mock/salesforce-connection.repository.ts`:

- In-memory array of connections (no encryption — mock mode stores plaintext)
- Follow the pattern in `mock/project.repository.ts` with `ALLOWED_FILTERS`, `applyFilters`, etc.

Create seed data in `packages/seed-data/src/salesforce-connections.ts`:

- One source connection for the Q1 Migration project (status: 'active', fake instance URL)
- Use `MOCK_IDS` constants for deterministic IDs

Similarly create mock repos for `oauthPendingFlows` and `salesforceConnectionLogs`.

Register all in `apps/server/src/repositories/mock/index.ts` → `createMockRepositories()`.

**Tests to write:**

1. `findByProjectAndRole()` returns the seeded connection
2. `create()` adds a new connection to the in-memory store
3. `updateTokens()` with correct version succeeds
4. `updateTokens()` with wrong version returns null
5. `disconnect()` updates status

**Edge cases & gotchas:**

- Mock repos must implement the exact same interface as Drizzle repos — if a method is missing, `pnpm local` will crash at runtime.
- The `upsertForProject()` logic in mock mode must also check `expiresAt` to decide whether to reject or replace.

---

### Task 1.7: OAuth Service — Core Logic

**Objective:** `SalesforceOAuthService` encapsulates all OAuth logic: URL generation, SSRF validation, token exchange, token refresh, and revocation. All tests pass.

**Test strategy:** Unit tests (mock `fetch` and repositories).

**Description:**

Create `apps/server/src/services/salesforce-oauth.service.ts`:

**Methods:**

- `validateLoginUrl(url: string): string` — SSRF prevention. Must be HTTPS, hostname must match `*.my.salesforce.com`, `*.my.salesforce.mil`, `login.salesforce.com`, `test.salesforce.com`. Reject IP literals, localhost, RFC1918. Normalize with `new URL(url).origin`. Return validated origin or throw.
- `determineOAuthBaseUrl(instanceType: 'production' | 'sandbox', loginUrl?: string): string` — returns the base URL for OAuth operations.
- `generateAuthorizationUrl(oauthBaseUrl: string, codeChallenge: string, state: string): string` — constructs the full Salesforce authorize URL with all parameters.
- `exchangeCodeForTokens(oauthBaseUrl: string, code: string, codeVerifier: string): Promise<TokenResponse>` — POST to `{oauthBaseUrl}/services/oauth2/token`, returns parsed response.
- `refreshAccessToken(oauthBaseUrl: string, refreshToken: string): Promise<RefreshResponse>` — POST to token endpoint with `grant_type=refresh_token`.
- `revokeToken(oauthBaseUrl: string, token: string): Promise<void>` — POST to `{oauthBaseUrl}/services/oauth2/revoke`.
- `generatePKCE(): { codeVerifier: string, codeChallenge: string }` — generates PKCE pair.
- `signState(nonce: string, expiresInSeconds: number): string` — creates signed JWT with `{ nonce, exp }` using `jose`.
- `verifyState(state: string): { nonce: string }` — verifies and decodes the signed state JWT.

Constructor takes: `consumerKey`, `consumerSecret`, `callbackUrl`, `stateSigningSecret` (all from env vars).

**Tests to write** (`apps/server/src/services/salesforce-oauth.service.test.ts`):

1. `validateLoginUrl()` accepts `https://acme.my.salesforce.com` → returns origin
2. `validateLoginUrl()` accepts `https://login.salesforce.com`
3. `validateLoginUrl()` accepts `https://test.salesforce.com`
4. `validateLoginUrl()` rejects `http://acme.my.salesforce.com` (not HTTPS)
5. `validateLoginUrl()` rejects `https://evil.com`
6. `validateLoginUrl()` rejects `https://127.0.0.1`
7. `validateLoginUrl()` rejects `https://localhost`
8. `validateLoginUrl()` rejects `https://192.168.1.1`
9. `determineOAuthBaseUrl('production')` → `https://login.salesforce.com`
10. `determineOAuthBaseUrl('sandbox')` → `https://test.salesforce.com`
11. `determineOAuthBaseUrl('production', 'https://acme.my.salesforce.com')` → uses custom URL
12. `generatePKCE()` returns verifier (43-128 chars) and challenge (base64url SHA256 of verifier)
13. `signState()` → `verifyState()` roundtrip returns same nonce
14. `verifyState()` with expired state throws
15. `verifyState()` with tampered state throws
16. `exchangeCodeForTokens()` sends correct POST body (mock fetch, verify request)
17. `exchangeCodeForTokens()` returns parsed token response on 200
18. `exchangeCodeForTokens()` throws on non-200 response
19. `refreshAccessToken()` sends correct POST body
20. `revokeToken()` sends correct POST body

**Edge cases & gotchas:**

- SSRF: `new URL('https://evil.com.my.salesforce.com')` — the hostname check must use `.endsWith('.my.salesforce.com')`, not `.includes()`. Also handle `https://my.salesforce.com` (no subdomain) — should be rejected.
- The state signing secret should be different from the token encryption key. Add `SALESFORCE_STATE_SIGNING_SECRET` to env vars.
- `jose` library: use `new SignJWT()` for signing and `jwtVerify()` for verification. Import from `jose` (already a dependency).
- Salesforce token exchange returns `instance_url` (note the underscore) not `instanceUrl`. Map carefully.
- The revocation endpoint accepts `token` as a form parameter (not JSON body). Content-Type must be `application/x-www-form-urlencoded`.

---

### Task 1.8: OAuth Route — Connect Endpoint

**Objective:** `POST /v1/projects/:projectId/salesforce/connect` validates input, creates a pending flow, and returns a redirect URL. Requires `org_owner` or `admin` role.

**Test strategy:** Unit tests (mock service and repos) + integration test with mock mode.

**Description:**

Create `apps/server/src/v1/routes/salesforce.ts`:

- Use `OpenAPIHono<AppEnv>` router pattern
- Define Zod schemas for request body: `{ instanceType: z.enum(['production', 'sandbox']), connectionRole: z.enum(['source', 'target']), loginUrl: z.string().url().optional() }`
- Middleware: `authMiddleware`, `requireRole('org_owner', 'admin')`
- Handler:
  1. Verify the project exists and belongs to the user's org
  2. Check for existing active connection with same role — if exists, return error "Already connected. Disconnect first."
  3. Validate `loginUrl` if provided (via `SalesforceOAuthService.validateLoginUrl()`)
  4. Determine `oauthBaseUrl`
  5. Generate PKCE pair
  6. Sign state with nonce
  7. Store pending flow via `repos.oauthPendingFlows.upsertForProject()` (handles expired rows)
  8. Set connection status to `connecting` (create a connection record or update status)
  9. Return `{ success: true, data: { redirectUrl } }`

Register the router in the main app.

**Tests to write:**

1. Returns 401 without auth
2. Returns 403 for `operator` role
3. Returns 200 with `redirectUrl` for `admin` role
4. Returns error if project doesn't exist
5. Returns error if project belongs to different org
6. Returns error if connection already active for this role
7. Allows connecting if existing connection is `disconnected`
8. `redirectUrl` contains correct `client_id`, `scope`, `state`, `code_challenge`
9. `redirectUrl` uses `test.salesforce.com` for sandbox
10. `redirectUrl` uses custom domain when `loginUrl` provided
11. Returns error for invalid `loginUrl` (SSRF)
12. Pending flow is created in the repository
13. Connection status is set to `connecting`

**Edge cases & gotchas:**

- The `connecting` status must have a TTL. If the user abandons the flow, the status should auto-reset. Option: check `oauthPendingFlows.expiresAt` — if the pending flow expired, treat the connection as not connecting.
- Project membership check: use `project.organizationId !== user.organizationId` (existing pattern).
- For the project-scoped role check, `org_owner` and `admin` have org-wide access. No need to check `projectMembers` for these roles.

---

### Task 1.9: OAuth Route — Callback Endpoint

**Objective:** `GET /v1/salesforce/oauth/callback` completes the OAuth flow: validates state, exchanges code for tokens, runs permission audit, stores encrypted tokens, renders popup-closing HTML with anti-leak headers.

**Test strategy:** Unit tests (mock everything) + manual E2E smoke test with a real Salesforce org.

**Description:**

Add to `apps/server/src/v1/routes/salesforce.ts`:

- No auth middleware (this is called by Salesforce redirect, not by our frontend)
- Handler:
  1. Extract `code` and `state` from query params
  2. Verify state signature and expiry via `SalesforceOAuthService.verifyState()`
  3. Look up pending flow by nonce via `repos.oauthPendingFlows.findByNonce()`
  4. If not found → render error HTML ("Session expired. Please try connecting again.")
  5. Exchange code for tokens via `SalesforceOAuthService.exchangeCodeForTokens()`
  6. If exchange fails → render error HTML with Salesforce error message. Check specifically for "app not approved" errors → render §7 instructions.
  7. On success: delete pending flow row
  8. Extract `salesforceOrgId` from access token (first 15/18 chars before `!`)
  9. Create or update the `salesforceConnections` record with encrypted tokens, oauthBaseUrl, salesforceOrgId, instanceUrl, etc.
  10. Run post-connection permission audit (see Task 1.10)
  11. Log `connected` event in `salesforceConnectionLogs`
  12. Log audit event in main `auditLogs`
  13. Render HTML response with headers:
      - `Referrer-Policy: no-referrer`
      - `Cache-Control: no-store`
      - `Content-Security-Policy: default-src 'self'; script-src 'nonce-{random}'`
  14. HTML contains `<script nonce="{random}">` that posts message to opener or redirects

**Tests to write:**

1. Returns error HTML for missing `code` or `state`
2. Returns error HTML for invalid state signature
3. Returns error HTML for expired state
4. Returns error HTML for unknown nonce (pending flow not found)
5. Returns error HTML when token exchange fails (mock 400 from Salesforce)
6. On success: pending flow is deleted
7. On success: connection record is created with encrypted tokens
8. On success: connection status is 'active'
9. On success: connection log entry is created with event='connected'
10. On success: audit log entry is created
11. Response headers include `Referrer-Policy: no-referrer`
12. Response headers include `Cache-Control: no-store`
13. Response headers include CSP with nonce
14. Response HTML contains `postMessage` with correct `APP_ORIGIN`
15. Response HTML contains redirect fallback for non-popup case

**Edge cases & gotchas:**

- The callback is a GET endpoint — it's called by a browser redirect from Salesforce. It must NOT have auth middleware.
- Rate limit this endpoint to prevent abuse (it's public-facing).
- The `code` from Salesforce is single-use and expires in ~10 minutes. If the exchange fails with a valid code, it cannot be retried.
- The pending flow deletion must happen AFTER successful token exchange, not before. If exchange fails transiently, the verifier is preserved for retry.
- The CSP nonce must be generated per-response using `crypto.randomUUID()`.
- The `APP_ORIGIN` in the postMessage must be the actual RevBrain frontend URL, not `*`. Read from env var `APP_URL` or `VITE_APP_URL`.
- Salesforce's `id` URL in the token response contains the org ID and user ID. Parse it: `https://login.salesforce.com/id/{orgId}/{userId}`.

---

### Task 1.10: Post-Connection Permission Audit

**Objective:** After a successful OAuth connection, RevBrain automatically checks CPQ installation, object access, API budget, and stores results. The audit results are displayed to the user.

**Test strategy:** Unit tests (mock Salesforce API responses).

**Description:**

Create `apps/server/src/services/salesforce-audit.service.ts`:

**Method:** `runPostConnectionAudit(accessToken: string, instanceUrl: string, apiVersion: string | null, connectionRole: 'source' | 'target'): Promise<ConnectionMetadata>`

Steps:

1. `GET {instanceUrl}/services/data/` → parse available API versions, pick latest
2. Tooling API: query `InstalledSubscriberPackage` for SBQQ namespace → CPQ version. Catch 403/404 → fallback to `Publisher` query. Catch both failing → `cpqInstalled: false`
3. `describe('SBQQ__Quote__c')` → confirms CPQ objects accessible. Catch 403 → add to `missingPermissions`
4. If target connection: `describe('ProductSellingModel')` → confirms RCA available
5. `GET {instanceUrl}/services/data/{version}/limits` → extract `DailyApiRequests` max and remaining
6. `GET {instanceUrl}/id/{orgId}/{userId}` → extract profile name, edition
7. Return `ConnectionMetadata` object

Store result in `connection.connectionMetadata` via `repos.salesforceConnections.updateMetadata()`.

**Tests to write:**

1. Returns correct metadata when all checks pass
2. Detects CPQ not installed (Tooling API returns empty results)
3. Detects CPQ installed but objects inaccessible (describe returns 403)
4. Detects RCA available on target connection
5. Detects RCA not available on target connection
6. Handles Tooling API permission denied (falls back to Publisher)
7. Handles both detection methods failing gracefully
8. Correctly parses API limits from response
9. Returns partial results even if some checks fail (doesn't abort on first error)

**Edge cases & gotchas:**

- The Tooling API query URL is `{instanceUrl}/services/data/{version}/tooling/query?q=...` — note the `/tooling/` prefix.
- Some Salesforce orgs restrict Tooling API access by profile. The fallback to `Publisher` query is essential.
- The `/limits` endpoint may not include all limit types in all editions. Handle missing keys gracefully.
- This audit runs synchronously during the callback — keep it fast. If any check takes >5s, timeout and skip it.

---

### Task 1.11: OAuth Route — Disconnect & Status Endpoints

**Objective:** Users can disconnect a Salesforce connection (tokens are revoked at Salesforce and deleted locally). Users can view connection status. Users can test a connection.

**Test strategy:** Unit tests.

**Description:**

Add to `apps/server/src/v1/routes/salesforce.ts`:

**`POST /v1/projects/:projectId/salesforce/disconnect`**

- Middleware: `authMiddleware`, `requireRole('org_owner', 'admin')`
- Body: `{ connectionRole: 'source' | 'target' }`
- Handler: find connection, decrypt refresh token, call `SalesforceOAuthService.revokeToken()`, update connection status to `disconnected`, log events

**`GET /v1/projects/:projectId/salesforce/connections`**

- Middleware: `authMiddleware` (any project member can view)
- Returns: `{ source: ConnectionStatus | null, target: ConnectionStatus | null }` — NEVER include tokens

**`GET /v1/projects/:projectId/salesforce/connections/:role`**

- Returns detailed status for one connection

**`POST /v1/projects/:projectId/salesforce/test`**

- Middleware: `authMiddleware`, `requireRole('org_owner', 'admin', 'operator')`
- Body: `{ connectionRole: 'source' | 'target' }`
- Decrypts access token, makes `GET {instanceUrl}/services/data/` call, reports health

**`POST /v1/projects/:projectId/salesforce/reconnect`**

- Same as connect but updates existing connection record instead of creating new one

Define `ConnectionStatus` response type — includes all display fields but NEVER tokens.

**Tests to write:**

1. Disconnect: returns 403 for operator
2. Disconnect: revokes token at Salesforce (verify fetch call)
3. Disconnect: updates connection status to 'disconnected'
4. Disconnect: logs event
5. Status: returns null for role with no connection
6. Status: returns status object for active connection
7. Status: NEVER includes `accessToken` or `refreshToken` in response
8. Test: returns `{ healthy: true }` when API call succeeds
9. Test: returns `{ healthy: false, error: '...' }` when API call fails
10. Test: attempts token refresh on 401, retries
11. Reconnect: reuses existing connection record ID

**Edge cases & gotchas:**

- Disconnect should be idempotent — disconnecting an already-disconnected connection should succeed silently.
- If Salesforce revocation fails (network error), still mark as disconnected locally and log the failure. Don't leave the connection in a limbo state.
- The status endpoint must verify `project.organizationId === user.organizationId` before returning data.

---

### Task 1.12: Client UI — Salesforce Connection Component

**Objective:** The project workspace shows a "Salesforce Connections" section with Source and Target slots. Users can connect (popup + fallback), view status, test, and disconnect.

**Test strategy:** Component tests (React Testing Library) + manual E2E smoke test.

**Description:**

Create `apps/client/src/features/salesforce/`:

- `hooks/use-salesforce-api.ts` — React Query hooks:
  - `useSalesforceConnections(projectId)` — polls `GET /salesforce/connections` every 30s
  - `useConnectSalesforce()` — mutation calling `POST /salesforce/connect`, opens popup
  - `useDisconnectSalesforce()` — mutation calling `POST /salesforce/disconnect`
  - `useTestSalesforceConnection()` — mutation calling `POST /salesforce/test`
  - Query key factory: `salesforceKeys.connections(projectId)`, etc.
- `components/SalesforceConnectionCard.tsx` — single connection slot (Source or Target):
  - Disconnected: "Connect Salesforce" button + environment selector (Production/Sandbox) + optional My Domain URL input
  - Connecting: spinner with "Waiting for Salesforce authorization..."
  - Connected: green badge, instance URL, username, CPQ version (from metadata), API budget, "Test" and "Disconnect" buttons
  - Error: red badge with error message, "Reconnect" button
  - Pre-connection checklist (§7 instructions) as expandable accordion
- `components/SalesforceConnectionsSection.tsx` — two cards side by side (Source + Target)
- `components/DisconnectConfirmModal.tsx` — confirmation dialog

Popup flow:

1. `useConnectSalesforce` calls `POST /connect` via fetch, receives `redirectUrl`
2. `window.open(redirectUrl, 'sf_connect', 'width=600,height=700')`
3. If returns `null` → `window.location.href = redirectUrl` + toast "Popup was blocked"
4. `window.addEventListener('message', handler)` — on `{ type: 'sf_connected' }`:
   - Verify `event.origin === APP_ORIGIN`
   - Invalidate React Query cache for connections
   - Show success toast
5. Cleanup: remove listener on unmount

Add translations to `apps/client/src/locales/en/salesforce.json` and `he/salesforce.json`:

- All labels, buttons, statuses, error messages, checklist items

Mount the `SalesforceConnectionsSection` on the project workspace page (likely in the Settings tab or as a new "Connections" tab).

**Tests to write:**

1. Renders "Connect Salesforce" button when disconnected
2. Shows environment selector (Production/Sandbox)
3. Shows connected status with badge when connection is active
4. Never shows tokens in the UI
5. Disconnect button opens confirmation modal
6. Test button calls the test endpoint and shows result
7. Handles popup blocked scenario (shows redirect message)
8. `postMessage` handler verifies origin before trusting
9. Loading state during connection
10. Error state with actionable message

**Edge cases & gotchas:**

- The `postMessage` listener must be cleaned up on unmount to prevent memory leaks and duplicate handlers.
- RTL: use `ms-*`/`me-*` for margins, `start-*`/`end-*` for positioning. Never `ml-*`/`mr-*`.
- The My Domain URL field should show a helper text: "e.g., https://yourcompany.my.salesforce.com"
- The pre-connection checklist should be collapsed by default and expanded when the user hovers/clicks a help icon.

---

### Task 1.13: Mock Mode Support

**Objective:** `pnpm local` works with simulated Salesforce connections. The "Connect" button in mock mode shows a simulated success flow without a real OAuth redirect.

**Test strategy:** Manual smoke test with `pnpm local`.

**Description:**

In mock mode (`AUTH_MODE=mock`):

- The connect endpoint returns a mock `redirectUrl` pointing to a local endpoint
- Create `GET /v1/salesforce/oauth/mock-callback` that simulates a successful connection:
  - Creates a connection record with fake tokens
  - Returns the popup-closing HTML
- The test endpoint returns `{ healthy: true }` always
- The status endpoint returns the seeded mock connection

**Tests to write:**

1. Mock connect returns a redirect URL
2. Mock callback creates a connection
3. Mock test returns healthy

**Edge cases & gotchas:**

- The mock callback endpoint must only exist when `AUTH_MODE=mock`. Guard it with an env check.
- Use the same `MOCK_IDS` constants for consistency with other seed data.

---

### Task 1.14: Env Vars & Configuration

**Objective:** All new environment variables are documented, added to `.env.example`, and accessible via `getEnv()`.

**Test strategy:** Smoke — `pnpm local` starts without errors, all env vars are loaded.

**Description:**

New env vars to add:

- `SALESFORCE_CONSUMER_KEY` — from ECA setup
- `SALESFORCE_CONSUMER_SECRET` — from ECA setup
- `SALESFORCE_TOKEN_ENCRYPTION_KEY` — 32-byte base64 key for AES-256-GCM
- `SALESFORCE_STATE_SIGNING_SECRET` — secret for signing OAuth state JWTs
- `SALESFORCE_CALLBACK_URL` — the OAuth callback URL for this environment
- `APP_URL` — the frontend URL (for postMessage origin locking)

Add all to `.env.example` with placeholders. Add to `.env.local` with mock/dev values. Document in the env section of `CLAUDE.md` if appropriate.

**Tests to write:** None (configuration). Verify startup doesn't crash.

**Edge cases & gotchas:**

- `SALESFORCE_TOKEN_ENCRYPTION_KEY` and `SALESFORCE_STATE_SIGNING_SECRET` must be different values.
- In mock mode, the Salesforce-specific env vars can have dummy values (they won't be used for real API calls).
- The `SALESFORCE_CALLBACK_URL` must match exactly what's registered in the ECA — including trailing slashes (or lack thereof).

---

## Phase 2: CPQ Data Extraction

> Spec ref: §15, §22 Phase 2

### Task 2.1: Salesforce API Client

**Objective:** A thin, runtime-agnostic wrapper around the Salesforce REST API exists at `apps/server/src/services/salesforce-client.ts`. Supports SOQL queries with pagination, describe calls, CRUD, automatic token refresh, API usage tracking, and SOQL injection protection.

**Test strategy:** Unit tests (mock fetch).

**Description:**

Class `SalesforceClient`:

- Constructor: `(instanceUrl, accessToken, options: { onTokenRefresh, onApiCall })`
- `query<T>(soql: string): Promise<QueryResult<T>>` — single page
- `queryAll<T>(soql: string): Promise<T[]>` — auto-paginate via `nextRecordsUrl`
- `describe(objectName: string): Promise<DescribeSObjectResult>`
- `describeGlobal(): Promise<DescribeGlobalResult>`
- `getRecord(objectName: string, id: string): Promise<Record<string, unknown>>`
- `createRecord(objectName: string, data: Record<string, unknown>): Promise<{ id: string }>`
- `updateRecord(objectName: string, id: string, data: Record<string, unknown>): Promise<void>`
- `toolingQuery<T>(soql: string): Promise<QueryResult<T>>` — queries via `/tooling/query`
- `getLimits(): Promise<LimitsResult>`

Internal:

- `request(method, path, body?)` — core HTTP method. Reads `Sforce-Limit-Info` header from every response. Calls `onApiCall` callback with metadata (method, path, duration, status, remaining limits).
- On 401: calls `onTokenRefresh()` callback to get new token, retries once.
- SOQL safety: the client itself doesn't build SOQL — it executes pre-built strings. The SOQL building utilities (Task 2.4) handle field validation.

**Tests to write:** 15-20 tests covering all methods, pagination, 401 refresh retry, error responses, limit header parsing.

**Edge cases & gotchas:**

- Salesforce REST API paths are case-sensitive: `/services/data/v66.0/query` (not `/Query`).
- `Sforce-Limit-Info` header format: `api-usage=42/100000` — parse both numbers.
- `queryAll` pagination: Salesforce returns `nextRecordsUrl` as a relative path (e.g., `/services/data/v66.0/query/01gxx...`). Prepend `instanceUrl`.
- The 401 retry must only happen once to prevent infinite loops.

---

### Task 2.2: Bulk & Composite API Wrappers

**Objective:** `BulkApiClient` and `CompositeApiClient` classes exist for efficient large-scale data extraction.

**Test strategy:** Unit tests.

**Description:**

**`CompositeApiClient`** — wraps `POST /services/data/{version}/composite`:

- `execute(subrequests: SubRequest[]): Promise<SubResponse[]>` — max 25 per call
- Auto-splits larger batches into multiple composite calls

**`BulkApiClient`** — wraps Bulk API 2.0:

- `createQueryJob(soql: string): Promise<string>` — returns job ID
- `pollJobStatus(jobId: string): Promise<JobStatus>` — poll until complete
- `getResults(jobId: string): Promise<Record<string, unknown>[]>` — download results
- `queryBulk(soql: string): Promise<Record<string, unknown>[]>` — convenience: create + poll + download

**Tests to write:** 10-15 tests covering batch splitting, job lifecycle, polling, error states.

**Edge cases & gotchas:**

- Bulk API 2.0 returns CSV, not JSON. You need to parse CSV → objects. Use a lightweight CSV parser.
- Bulk API jobs can take minutes for large tables. Implement polling with exponential backoff (start at 2s, max 30s).
- Composite API has a 25-subrequest limit per call. Enforce this in the client.

---

### Task 2.3: CPQ Object Discovery Service

**Objective:** A service that detects the CPQ package version, enumerates all SBQQ\_\_ objects, and fetches their field metadata. Results are stored in connection metadata.

**Test strategy:** Unit tests.

**Description:**

Create `apps/server/src/services/cpq-discovery.service.ts`:

- `discoverCpqSchema(client: SalesforceClient): Promise<CpqSchema>` — runs Tooling API query for package version, describeGlobal for SBQQ\_\_ objects, describe for each object's fields.
- Returns structured schema with object names, field definitions, picklist values.

**Tests to write:** 5-8 tests covering discovery with various CPQ configurations.

---

### Task 2.4: Data Extraction Engine

**Objective:** An extraction engine that pulls all CPQ configuration data from a connected Salesforce org, stores it project-scoped, tracks progress, and supports incremental extraction.

**Test strategy:** Unit tests + integration test against mock data.

**Description:**

Create `apps/server/src/services/extraction.service.ts`:

- Defines extraction jobs per object category
- Uses `jobQueue` table for async job tracking
- Selects REST vs Bulk API based on record count (`SELECT COUNT() FROM ...`)
- Supports incremental extraction via `SystemModstamp > {lastExtraction}`
- Tracks progress per object type
- Pauses at 80% daily API limit
- Extracts pre-calculated quote snapshots via CPQ ServiceRouter Read Quote API

New table needed: `cpq_extracted_data` — project-scoped storage for extracted records. Schema:

- `id`, `projectId`, `organizationId`, `connectionId`, `objectType` (varchar), `salesforceRecordId` (varchar), `data` (jsonb), `extractedAt`, `systemModstamp`
- Indexes on `(projectId, objectType)`, `(projectId, salesforceRecordId)`

SOQL building utilities — validate object/field names against `describe()` results before inclusion. Never concatenate raw user input.

**Tests to write:** 15-20 tests covering extraction flow, incremental logic, API limit pause, Bulk vs REST selection, SOQL safety.

**Edge cases & gotchas:**

- SOQL injection: ALL object and field names in SOQL queries must come from `describe()` results, never from user input.
- The `cpq_extracted_data` table can get large. Consider partitioning by project or using JSONB compression.
- Quote snapshot extraction via ServiceRouter requires POST, not GET. The endpoint is `POST {instanceUrl}/services/apexrest/SBQQ/ServiceRouter`.

---

### Task 2.5: CPQ Explorer UI

**Objective:** A "CPQ Explorer" tab in the project workspace showing extracted data organized by category with search, filter, detail views, and syntax-highlighted QCP code.

**Test strategy:** Component tests + manual smoke test.

**Description:**

Create `apps/client/src/features/cpq-explorer/`:

- Pages: `CpqExplorerPage.tsx` — sidebar categories + content area
- Components: object table (searchable/filterable), detail view, rule visualizer (condition → action), bundle tree view, QCP code viewer (use a code highlighter library)
- Hooks: `useCpqData(projectId, objectType)`, `useCpqStats(projectId)`, `useExtractData(projectId)` (mutation to trigger extraction)

Add translations for all new UI strings.

**Tests to write:** 8-12 component tests for rendering, filtering, empty states.

---

### Task 2.6: Extraction Monitoring UI

**Objective:** Users can see extraction progress, API usage, trigger re-extraction, and view warnings.

**Test strategy:** Component tests.

**Description:**

Add to CPQ Explorer:

- Extraction progress bar per object type
- API usage dashboard (daily limit, remaining, trend)
- "Re-extract" and "Refresh changed data" buttons
- Warnings for incomplete extractions (API limits hit, permission errors)

**Tests to write:** 5-8 tests for progress display, warning rendering, button actions.

---

## Phase 3: Connection Resilience

> Spec ref: §10, §22 Phase 3

### Task 3.1: Robust Token Refresh

**Objective:** Token refresh handles all edge cases: proactive heuristic, optimistic locking, retry with backoff, permanent failure detection.

**Test strategy:** Unit tests.

**Description:**

Create `apps/server/src/services/token-refresh.service.ts`:

- `refreshIfNeeded(connection: SalesforceConnectionEntity): Promise<void>` — checks `tokenIssuedAt`, refreshes if >90 minutes old
- Uses optimistic locking via `repos.salesforceConnections.updateTokens(id, newToken, expectedVersion)`
- Retries with exponential backoff (3 attempts) on network errors
- Marks `refresh_failed` on `invalid_grant` (permanent failure)

**Tests to write:** 8-10 tests covering heuristic trigger, optimistic lock conflict, retry, permanent failure.

---

### Task 3.2: Health Monitoring Job

**Objective:** A scheduled job checks all active connections every 30 minutes and updates their health status.

**Test strategy:** Unit tests.

**Description:**

Create a health check job that runs via `jobQueue`:

- Queries all connections with status='active'
- For each: lightweight API call, auto-refresh if needed, update last_used_at
- If refresh fails: mark status, notify user
- Update `connectionMetadata` with latest API limits

**Tests to write:** 5-8 tests covering healthy connection, expired token, revoked token, unreachable instance.

---

### Task 3.3-3.6: Notifications, Reconnect, Key Rotation, Logs UI

**Objective:** Users get notified of issues, can reconnect broken connections, admins can rotate encryption keys, and connection event history is visible.

**Test strategy:** Unit tests for backend, component tests for frontend.

**Description:** Follow the same task structure as above for each. Key points:

- Notifications: in-app banner on project page + email to connected_by user
- Reconnect: same OAuth flow but updates existing record (preserves ID and history)
- Key rotation: admin endpoint that re-encrypts all connections, increments key version
- Logs UI: timeline component showing connection events, filterable by type

---

## Phase 4: CPQ Analysis & Migration Mapping

> Spec ref: §22 Phase 4

### Task 4.1: CPQ→RCA Mapping Engine

**Objective:** A mapping rules engine that transforms CPQ objects to RCA equivalents with complexity scoring, dependency analysis, and gap detection. This is the core IP.

**Test strategy:** Unit tests with comprehensive test data.

**Description:**

Create `apps/server/src/services/mapping-engine/`:

- `mapping-rules.ts` — versioned mapping definitions (see §22 Phase 4 expanded table, 17+ rows)
- `mapping-engine.ts` — applies rules to extracted CPQ data, produces mapping report
- `complexity-scorer.ts` — rates each mapping (simple/moderate/complex/manual)
- `dependency-analyzer.ts` — topological sort of mapping dependencies
- `gap-analyzer.ts` — identifies CPQ features with no RCA equivalent

The mapping rules should be data-driven (JSON/config), not hard-coded logic, so they can be updated per RCA release without code changes.

**Tests to write:** 20-30 tests covering all 17 mapping pairs, complexity scoring, dependency ordering, gap detection, version-aware rule filtering.

---

### Task 4.2: QCP Code Analysis

**Objective:** Parse QCP JavaScript via AST to identify implemented methods, detect patterns, and classify complexity.

**Test strategy:** Unit tests with sample QCP code.

**Description:**

Create `apps/server/src/services/qcp-analyzer.ts`:

- Uses `acorn` (lightweight JS parser) to parse QCP source
- Identifies which of the 7 QCP methods are implemented
- Classifies each method's logic by complexity
- Detects patterns: custom calculations, `conn` (JSForce) calls, external lookups

**Tests to write:** 10-15 tests with various QCP code samples (simple pricing, complex multi-method, field visibility).

---

### Task 4.3: Migration Plan Generator + UI

**Objective:** Auto-generates a project-specific migration plan and displays it in the workspace.

**Test strategy:** Unit tests for generation, component tests for display.

---

## Phase 5: RCA Write-Back & Deployment

> Spec ref: §22 Phase 5

### Task 5.1: RCA Deployment Plan Generator

**Objective:** Generates a topologically sorted deployment plan for RCA objects based on dependencies.

**Test strategy:** Unit tests.

**Description:**

Create `apps/server/src/services/deployment/`:

- `dependency-graph.ts` — builds a DAG of RCA object dependencies
- `deployment-planner.ts` — topological sort, produces ordered creation steps
- Handles the metadata vs data split: data records via REST, metadata via artifact generation

---

### Task 5.2: RCA Object Creation Service

**Objective:** Creates RCA data records in the target org via upsert with external IDs.

**Test strategy:** Unit tests + integration test against a Salesforce sandbox.

**Description:**

- Uses `RevBrain_Migration_Key__c` external ID field (naming scheme: `{projectId}:{sourceOrgId}:{cpqRecordId}`)
- Upsert via Salesforce REST API `PATCH /sobjects/{Object}/RevBrain_Migration_Key__c/{key}`
- Progress tracking per record
- Error handling: continue on soft errors, abort on hard errors
- Deployment report

**Tests to write:** 10-15 tests covering upsert, duplicate prevention, error handling, dependency ordering.

---

### Task 5.3: Metadata Artifact Generator

**Objective:** Generates deployable Metadata API packages for custom fields, permission sets, etc.

**Test strategy:** Unit tests.

---

### Task 5.4: Validation & Comparison Engine

**Objective:** Compares RCA pricing output against captured CPQ quote snapshots.

**Test strategy:** Unit tests with sample quote data.

---

### Task 5.5: Rollback Service + UI

**Objective:** Tracks all created records and can delete them in reverse dependency order.

**Test strategy:** Unit tests.

---

### Task 5.6: Write-Back UI

**Objective:** Full deployment UI with progress, reports, validation results, and rollback controls.

**Test strategy:** Component tests.

---

## Phase 6: Browser Automation

> Spec ref: §22 Phase 6

### Task 6.1: Browser Automation Credentials Table + UI

**Objective:** Separate table for storing encrypted browser credentials with consent tracking.

**Test strategy:** Unit tests for backend, component tests for UI.

**Description:**

Create `browser_automation_credentials` table (§22 Phase 6 schema). Create repository (contract + Drizzle + mock). Create UI for credential input with explicit consent flow and "Test Login" button.

---

### Task 6.2: Playwright Worker App

**Objective:** `apps/worker/` — a Node.js worker that polls the job queue and runs Playwright browser sessions.

**Test strategy:** Integration tests.

**Description:**

Create `apps/worker/`:

- `src/index.ts` — job poller, polls `jobQueue` for `type = 'browser_automation'`
- `src/browser-pool.ts` — manages Chromium instances
- `src/session-manager.ts` — Salesforce login with TOTP MFA handling
- `Dockerfile` — Playwright + Chromium pre-installed
- `package.json` with `pnpm worker` script

---

### Task 6.3: Salesforce Login Automation

**Objective:** Reliable login including TOTP MFA, Lightning Experience detection, session management.

**Test strategy:** Integration tests against a Salesforce sandbox.

---

### Task 6.4-6.5: QLE & Configurator Behavioral Capture

**Objective:** Navigate CPQ UI, capture field visibility, configurator behavior, store structured results.

**Test strategy:** Integration tests.

---

### Task 6.6: Behavioral Analysis UI

**Objective:** Display captured behavioral data with field visibility matrices, interaction trees, screenshots, and API-vs-observed comparison.

**Test strategy:** Component tests.

---

## Phase 7: Enterprise Hardening & AppExchange

> Spec ref: §22 Phase 7

### Task 7.1: AppExchange Security Review Preparation

**Objective:** RevBrain passes the Salesforce AppExchange security review.

**Test strategy:** Salesforce security scanner + manual penetration testing.

**Description:**

- 2GP packaging (ECAs only work with 2GP)
- Security review documentation
- Checkmarx/PMD code scanning
- Penetration test
- Review cycles (typically 4-8 weeks)

---

### Task 7.2: JWT Bearer Flow

**Objective:** Enterprise customers can use certificate-based auth as an alternative to OAuth redirect.

**Test strategy:** Integration test against a configured Salesforce org.

---

### Task 7.3: API Usage Tracking Dashboard

**Objective:** Per-project daily API usage tracking with throttling and warnings.

**Test strategy:** Unit tests + component tests.

---

### Task 7.4: RCA Feature Parity Tracking

**Objective:** Versioned mapping rules database that tracks which RCA release supports which features.

**Test strategy:** Unit tests.

---

### Task 7.5: SOC 2 / Compliance Documentation

**Objective:** Documentation for compliance audits covering credential handling, data retention, and access controls.

**Test strategy:** Document review (no code tests).

---

## Quality Gate Reference

Every task must pass this gate before commit:

```bash
pnpm lint && pnpm test && pnpm build
```

If any step fails:

1. Fix the issue
2. Re-run the full gate
3. Only commit when all three pass
4. Push immediately after commit

Commit message format: `feat(salesforce): <description>` or `fix(salesforce): <description>`.

---

## Task Dependency Graph

```
Phase 1 (sequential within, can overlap with nothing):
  1.1 (ECA setup) → 1.14 (env vars)
  1.2 (encryption) → 1.5 (Drizzle repo, needs encryption)
  1.3 (DB schema) → 1.4 (contract interface) → 1.5 (Drizzle repo) → 1.6 (mock repo)
  1.7 (OAuth service) → 1.8 (connect endpoint) → 1.9 (callback endpoint) → 1.10 (audit)
  1.11 (disconnect/status/test) — after 1.5
  1.12 (client UI) — after 1.8, 1.9, 1.11
  1.13 (mock mode) — after 1.6, 1.8

Phase 2 (after Phase 1):
  2.1 (SF client) → 2.2 (Bulk/Composite) → 2.3 (discovery) → 2.4 (extraction) → 2.5 (UI)
  2.6 (monitoring UI) — after 2.4

Phase 3 (after Phase 2):
  3.1 (refresh) + 3.2 (health) can be parallel
  3.3-3.6 after 3.1

Phase 4 (after Phase 2):
  4.1 (mapping engine) → 4.2 (QCP analysis) → 4.3 (plan generator)

Phase 5 (after Phase 4):
  5.1 (deployment planner) → 5.2 (creation) → 5.3 (metadata) → 5.4 (validation) → 5.5 (rollback)
  5.6 (UI) after 5.2

Phase 6 (after Phase 5):
  6.1 (creds) → 6.2 (worker) → 6.3 (login) → 6.4-6.5 (capture) → 6.6 (UI)

Phase 7 (can start in parallel with Phase 4-6):
  7.1 (AppExchange) — start early for security review lead time
```
