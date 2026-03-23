# Salesforce Integration — Implementation Plan

> **Spec reference:** [SALESFORCE-INTEGRATION-SPEC.md](./SALESFORCE-INTEGRATION-SPEC.md) (v5-final)
> **Date:** 2026-03-23
> **Purpose:** Step-by-step build guide for the Salesforce integration. Each task has a clear objective, detailed description, test strategy, edge cases, and a quality gate. This is the engineering team's north star.
>
> **Errata vs Spec (v5):**
>
> 1. **`connecting` status vs NOT NULL tokens** — Resolution: derive `connecting` status from `oauth_pending_flows` table, never create a connection row without tokens.
> 2. **Token deletion on disconnect** — Resolution: separate `salesforce_connection_secrets` table (1:1) that can be deleted independently.
> 3. **Execution plane** — The original plan ran extraction/analysis/write-back inside Edge Functions. The high-level architecture spec requires a separate worker plane due to Edge Function limits (~60s). Resolution: introduce `apps/worker/` in Phase 2 (not Phase 6). All long-running Salesforce operations run on the worker. Worker obtains tokens via internal token-mint endpoint — refresh token never leaves the control plane.

---

## How to Use This Document

Each task follows a strict format:

- **(a) Objective** — what this task achieves, how to verify it, and test type (unit/integration/E2E/smoke)
- **(b1) Description** — exactly what to build, which files to touch, which patterns to follow
- **(b2) Tests to write** — specific, numbered test cases
- **(c) Edge cases & gotchas** — things that will bite you if you skip them
- **(d) Quality gate** — every task ends with this gate. Commit and push only after ALL pass:

```bash
pnpm format && pnpm lint && pnpm test && pnpm build
```

### Codebase Patterns (reference)

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
| Audit context             | `apps/server/src/v1/routes/admin/utils/audit-context.ts`                          |
| i18n translations         | `apps/client/src/locales/{en,he}/` (JSON per feature)                             |

### Conventions

- All imports use `.ts` extensions (Deno compatibility)
- Response format: `{ success: true, data: ... }` or `{ success: false, error: { code, message } }`
- CSS: `border border-slate-200`, RTL-safe `ms-*`/`me-*`/`start-*`/`end-*` (never `ml-*`/`mr-*`/`left-*`/`right-*`)
- Every UI string in both `en/*.json` and `he/*.json`
- Use `AppError` with `ErrorCodes`, never raw `throw new Error()` in routes
- Use `getEnv()`, never `process.env` directly
- Audit log all mutations via `buildAuditContext(c)` + `repos.auditLogs.create()`
- Accessibility: ARIA labels on interactive elements, keyboard navigation, screen reader announcements for state changes
- Never log or serialize decrypted tokens. Entity types expose tokens but consumers must treat them as opaque secrets.

---

---

## Phase 1: OAuth Connection & Verification

> Spec ref: §6, §7, §8, §9, §10, §11, §12, §18, §22 Phase 1

### Task 1.1: Salesforce ECA Registration (Manual)

**(a) Objective:** RevBrain's External Client App exists in a Salesforce org we control, with Consumer Key and Consumer Secret available as env vars. **Test:** Smoke — construct the authorize URL manually and open in browser, expect Salesforce login page.

**(b1) Description:**

1. Log into our Salesforce Developer Edition org
2. Setup → External Client App Manager → New
3. Configure per §6: app name "RevBrain", scopes `api refresh_token id`, PKCE required, Distribution State "Packaged", Refresh Token "valid until revoked"
4. Note exact field label for "Require Secret" — may be "Require Secret for Refresh Token Flow" in ECA UI
5. Add callback URLs for localhost, staging, production
6. Copy Consumer Key → `SALESFORCE_CONSUMER_KEY`, Consumer Secret → `SALESFORCE_CONSUMER_SECRET`

**(b2) Tests:** None (manual config). Verify by constructing authorize URL and confirming Salesforce renders login.

**(c) Edge cases & gotchas:**

- Consumer Secret shown only once — copy immediately
- Callback URL must match EXACTLY (no trailing slash differences)
- If ECA creation not available, enable in Setup → Feature Settings

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build` — N/A (manual config only)

---

### Task 1.2: Encryption Utility

**(a) Objective:** `apps/server/src/lib/encryption.ts` provides AES-256-GCM encryption with HKDF-derived keys and per-field IVs. **Test:** Unit — 9 test cases.

**(b1) Description:**
Create `apps/server/src/lib/encryption.ts`:

- `ENCRYPTION_CONTEXTS = { OAUTH_TOKEN: 'oauth_token', BROWSER_CRED: 'browser_cred' } as const`
- `deriveKey(masterKey: Buffer, context: string): Buffer` — HKDF-SHA256, returns 32-byte key
- `encrypt(plaintext: string, masterKey: Buffer, context: string): Buffer` — random 12-byte IV, AES-256-GCM, returns `IV(12) || ciphertext || authTag(16)`
- `decrypt(blob: Buffer, masterKey: Buffer, context: string): string` — splits blob, decrypts
- `generateEncryptionKey(): string` — random 32-byte key as base64

Use Node.js `crypto`. For Deno compatibility, implement parallel Web Crypto API path using `crypto.subtle` selected at runtime (same pattern as `getEnv()`). Both paths must produce identical output.

**(b2) Tests** (`apps/server/src/lib/encryption.test.ts`):

1. Encrypt then decrypt returns original plaintext
2. Different plaintexts → different ciphertexts
3. Same plaintext twice → different ciphertexts (unique IVs)
4. Tampering with ciphertext (one byte) → error on decrypt
5. Wrong master key → error
6. Wrong context string → error (HKDF derives different key)
7. Empty string encrypts and decrypts
8. Long string (10KB) encrypts and decrypts
9. Blob format correct: length = 12 + ciphertext_length + 16

**(c) Edge cases & gotchas:**

- `cipher.getAuthTag()` must be called AFTER `cipher.final()`
- Buffer order: `IV || encrypted || authTag` — reversing breaks decryption
- HKDF context strings are constants — never accept user input
- For Deno: `crypto.subtle.importKey('raw', ...)` + `crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, ...)`

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 1.3: Database Schema — Core Salesforce Tables

**(a) Objective:** Four new tables (`salesforceConnections`, `salesforceConnectionSecrets`, `oauthPendingFlows`, `salesforceConnectionLogs`) + new columns on `projects`. Migration runs against staging. **Test:** Integration — migration applies, constraints work.

**(b1) Description:**
Edit `packages/database/src/schema.ts`:

**`salesforceConnections`** — metadata + state (NO tokens):

- `id` (uuid PK), `projectId` (FK projects cascade), `organizationId` (FK orgs cascade), `connectionRole` (varchar default 'source')
- SF identity: `salesforceOrgId`, `salesforceInstanceUrl`, `customLoginUrl` (nullable), `oauthBaseUrl`, `salesforceUserId` (nullable), `salesforceUsername` (nullable), `instanceType`, `apiVersion` (nullable)
- Metadata: `connectionMetadata` (jsonb typed `$type<ConnectionMetadata>()`)
- State: `status` (varchar default 'active'), `lastUsedAt`, `lastSuccessfulApiCallAt`, `lastError`, `lastErrorAt`
- Audit: `connectedBy`, `disconnectedBy`, `disconnectedAt`, `createdAt`, `updatedAt`
- UNIQUE `(projectId, connectionRole)`, indexes on `organizationId`, `status`, `salesforceOrgId`

**`salesforceConnectionSecrets`** — encrypted tokens, 1:1 with connections:

- `id` (uuid PK), `connectionId` (FK connections cascade, UNIQUE)
- `encryptedAccessToken` (bytea), `encryptedRefreshToken` (bytea)
- `encryptionKeyVersion` (int default 1), `tokenVersion` (int default 1)
- `tokenIssuedAt`, `tokenScopes`, `lastRefreshAt`, `createdAt`, `updatedAt`

> **Why separate?** Spec says "tokens deleted on disconnect" but connection record survives for status/logs. Separate table lets us delete tokens (drop secrets row) without losing metadata. Also reduces accidental exposure — must explicitly join.

**`oauthPendingFlows`** — short-lived PKCE state:

- `nonce` (uuid PK), `projectId`, `organizationId`, `userId`, `connectionRole`, `codeVerifier`, `oauthBaseUrl`, `expiresAt`, `createdAt`
- UNIQUE `(projectId, connectionRole)`, index on `expiresAt`

**`salesforceConnectionLogs`** — audit trail:

- `id` (uuid PK), `connectionId` (FK connections cascade), `event`, `details` (jsonb), `performedBy`, `createdAt`

**Alter `projects`:** add `clientCompanyName`, `contractReference`, `estimatedObjects`, `stakeholders` (jsonb)

Add Zod schema in `packages/contract/src/index.ts`:

```typescript
export const StakeholderSchema = z.object({
  name: z.string(),
  role: z.string(),
  email: z.string().email(),
});
export const StakeholdersSchema = z.array(StakeholderSchema).nullable();
```

Run `pnpm drizzle-kit generate` → `pnpm db:push`.

**(b2) Tests:**

1. Migration applies without errors
2. UNIQUE(projectId, connectionRole) prevents duplicate source connections
3. Allows one source AND one target for same project
4. Cascade: deleting project deletes connections, secrets, and logs
5. UNIQUE(connectionId) on secrets prevents multiple secret rows per connection
6. `salesforceOrgId` index exists

**(c) Edge cases & gotchas:**

- Drizzle `bytea`: test Buffer ↔ bytea conversion before proceeding
- `oauthPendingFlows` has NO RLS — server-side only
- `salesforceConnectionSecrets` needs join-based RLS via parent connection's `organizationId`

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 1.4: RLS Policies for Salesforce Tables

**(a) Objective:** RLS policies exist for all new tables. Tenant A cannot access Tenant B's connections. **Test:** Integration — SQL queries as different tenants verify isolation.

**(b1) Description:**
Create reproducible SQL in `packages/database/src/rls/`:

- `salesforce_connections`: `organization_id = auth.jwt() -> 'organization_id'`
- `salesforce_connection_secrets`: join-based via `salesforce_connections.organization_id`
- `salesforce_connection_logs`: join-based via `salesforce_connections.organization_id`
- `oauth_pending_flows`: NO RLS (server-only, service role key)

**(b2) Tests:**

1. Org A reads Org A's connections ✓
2. Org A CANNOT read Org B's connections
3. Org A CANNOT read Org B's secrets
4. Service role CAN access pending flows
5. Anon key CANNOT access any Salesforce tables

**(c) Edge cases:** Secrets RLS requires JOIN — test performance. Re-apply after table recreation.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 1.5: Repository Interfaces — Contract Package

**(a) Objective:** All four repository interfaces exist in `packages/contract/`. `Repositories` type updated. **Test:** Compile — `pnpm build` succeeds.

**(b1) Description:**
Add to `packages/contract/src/repositories/types.ts`:

**`SalesforceConnectionEntity`** — NO tokens (metadata only).
**`SalesforceConnectionWithSecretsEntity`** — extends with `accessToken`, `refreshToken`, `tokenVersion` (only returned when explicitly needed).

**`SalesforceConnectionRepository`:** `findById`, `findByProjectAndRole`, `findByProject`, `findByOrganization`, `findAllActive`, `create`, `updateStatus`, `updateMetadata`, `disconnect`, `delete`

**`SalesforceConnectionSecretsRepository`:** `findByConnectionId` (returns decrypted), `create`, `updateTokens` (optimistic lock), `deleteByConnectionId`

**`OauthPendingFlowRepository`:** `create`, `findByNonce`, `deleteByNonce`, `upsertForProject` (replace expired, reject if live), `cleanupExpired`, `findLiveByProjectAndRole` (for "connecting" status)

**`SalesforceConnectionLogRepository`:** `create`, `findByConnection`

Update `Repositories` to include all four.

**(b2) Tests:** None — compile-time. `pnpm build` in `packages/contract`.

**(c) Edge cases:** Token access is explicit via `WithSecrets` entity. `updateTokens` returns null on version mismatch. `findLiveByProjectAndRole` checks `expiresAt > now()`.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 1.6: Drizzle Repository Implementations

**(a) Objective:** All four Drizzle repositories, with encryption in secrets repo and optimistic locking. **Test:** Unit — 19 test cases.

**(b1) Description:**
Create in `apps/server/src/repositories/drizzle/`:

- `salesforce-connection.repository.ts` — standard CRUD, no encryption
- `salesforce-connection-secrets.repository.ts` — encrypts on write, decrypts on read. Constructor loads key from `getEnv()` at startup (throws if missing). `updateTokens()` uses `WHERE token_version = expected`.
- `oauth-pending-flow.repository.ts` — `upsertForProject()`: if live → throw, if expired → delete+insert, if none → insert
- `salesforce-connection-log.repository.ts` — insert + find

Register all in `createDrizzleRepositories()`.

**(b2) Tests:**

1. Connection: `create()` returns entity without tokens
2. Connection: `findByProjectAndRole()` filters correctly
3. Connection: `findByProject()` returns both roles
4. Connection: `findAllActive()` returns only active
5. Connection: `disconnect()` sets status/disconnectedBy/disconnectedAt
6. Secrets: `create()` stores encrypted bytes (not plaintext)
7. Secrets: `findByConnectionId()` returns decrypted tokens
8. Secrets: `updateTokens()` correct version → succeeds, increments
9. Secrets: `updateTokens()` stale version → returns null
10. Secrets: `deleteByConnectionId()` removes row
11. Pending: `create()` stores with TTL
12. Pending: `findByNonce()` returns flow
13. Pending: `deleteByNonce()` removes
14. Pending: `upsertForProject()` replaces expired
15. Pending: `upsertForProject()` rejects live
16. Pending: `cleanupExpired()` deletes only expired
17. Pending: `findLiveByProjectAndRole()` returns null for expired
18. Logs: `create()` stores event
19. Logs: `findByConnection()` ordered desc

**(c) Edge cases:** Encryption key loaded once at startup — fail-fast if missing. `upsertForProject` must be atomic (transaction or ON CONFLICT). `updateTokens` also updates `tokenIssuedAt`, `lastRefreshAt`, `updatedAt`.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 1.7: Mock Repository Implementations

**(a) Objective:** All four mock repos for `pnpm local`, with seed data. **Test:** Unit — 8 test cases.

**(b1) Description:**
Create in `apps/server/src/repositories/mock/`. Seed data in `packages/seed-data/src/salesforce-connections.ts` (one source connection for Q1 Migration, `MOCK_IDS`). Register in `createMockRepositories()`.

**(b2) Tests:**

1. `findByProjectAndRole()` returns seeded connection
2. `create()` adds connection
3. Secrets: `findByConnectionId()` returns tokens
4. Secrets: `updateTokens()` correct version succeeds
5. Secrets: `updateTokens()` wrong version → null
6. Pending: `upsertForProject()` replaces expired
7. Pending: `upsertForProject()` rejects live
8. `disconnect()` updates status

**(c) Edge cases:** Must implement exact same interface — missing methods crash `pnpm local`.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 1.8: OAuth Service

**(a) Objective:** `SalesforceOAuthService` handles SSRF validation, URL generation, PKCE, token exchange, refresh, revocation. **Test:** Unit — 22 test cases.

**(b1) Description:**
Create `apps/server/src/services/salesforce-oauth.service.ts`:

- Constructor: `(consumerKey, consumerSecret, callbackUrl, stateSigningSecret)` from `getEnv()`
- `validateLoginUrl(url)` — HTTPS, hostname matches `^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.my\.salesforce\.com$` OR exactly `login.salesforce.com` / `test.salesforce.com` / `*.my.salesforce.mil`. Reject IPs, localhost, RFC1918. Normalize: `new URL(url).origin`.
- `determineOAuthBaseUrl(instanceType, loginUrl?)` → base URL
- `generateAuthorizationUrl(oauthBaseUrl, codeChallenge, state)` → full URL
- `exchangeCodeForTokens(oauthBaseUrl, code, codeVerifier)` → TokenResponse
- `refreshAccessToken(oauthBaseUrl, refreshToken)` → RefreshResponse
- `revokeToken(oauthBaseUrl, token)` → void (POST `/services/oauth2/revoke`, form-encoded)
- `generatePKCE()` → `{ codeVerifier, codeChallenge }`
- `signState(nonce, expiresInSeconds)` → signed JWT `{ nonce, exp }`
- `verifyState(state)` → `{ nonce }`
- `parseOrgAndUserFromIdUrl(idUrl)` → `{ orgId, userId }` (canonical, from token response `id` URL)

**(b2) Tests:**

1. `validateLoginUrl('https://acme.my.salesforce.com')` → origin
2. `validateLoginUrl('https://login.salesforce.com')` → origin
3. `validateLoginUrl('https://test.salesforce.com')` → origin
4. Rejects `http://...` (not HTTPS)
5. Rejects `https://evil.com`
6. Rejects `https://evil.com.my.salesforce.com` (regex: single label only)
7. Rejects `https://127.0.0.1`
8. Rejects `https://localhost`
9. Rejects `https://192.168.1.1`
10. Rejects `https://my.salesforce.com` (no subdomain)
11. `determineOAuthBaseUrl('production')` → login.salesforce.com
12. `determineOAuthBaseUrl('sandbox')` → test.salesforce.com
13. `determineOAuthBaseUrl('production', custom)` → custom URL
14. `generatePKCE()` — verifier 43-128 chars, challenge = base64url SHA256
15. `signState()` → `verifyState()` roundtrip
16. `verifyState()` expired → throws
17. `verifyState()` tampered → throws
18. `exchangeCodeForTokens()` correct POST body (mock fetch)
19. `exchangeCodeForTokens()` returns parsed tokens on 200
20. `exchangeCodeForTokens()` throws on non-200
21. `refreshAccessToken()` correct POST body, same oauthBaseUrl
22. `revokeToken()` form-encoded POST to `/services/oauth2/revoke`

**(c) Edge cases:** SSRF regex `^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.my\.salesforce\.com$` — NOT `.endsWith()`. State signing secret ≠ encryption key. Salesforce returns `instance_url` (underscore). Parse orgId from `id` URL, not token prefix. Revocation: `Content-Type: application/x-www-form-urlencoded`.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 1.9: Rate Limiting for Salesforce Endpoints

**(a) Objective:** Rate limiting on `/connect` (5/min/user) and `/oauth/callback` (10/min/IP). **Test:** Unit — 4 tests.

**(b1) Description:**
Add rate limiter middleware. In-memory for Phase 1 (Redis upgrade in Phase 3 if needed).

**(b2) Tests:**

1. Connect: 5th request succeeds, 6th → 429
2. Callback: 10th succeeds, 11th → 429
3. Different users have independent limits (connect)
4. Different IPs have independent limits (callback)

**(c) Edge cases:** Callback rate limits by IP (no auth). In-memory limiter doesn't work across instances — acceptable for Phase 1.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 1.10: OAuth Route — Connect Endpoint

**(a) Objective:** `POST /v1/projects/:projectId/salesforce/connect` validates input, creates pending flow, returns redirect URL. `org_owner`/`admin` only. Does NOT create connection row. **Test:** Unit — 15 tests.

**(b1) Description:**
Create `apps/server/src/v1/routes/salesforce.ts`. Zod body: `{ instanceType, connectionRole, loginUrl? }`. Middleware: auth + requireRole + rate limiter.

Handler: verify project exists + org match → check existing active connection → check live pending flow via `findLiveByProjectAndRole()` → validate loginUrl → generate PKCE + sign state → store pending flow → return `{ redirectUrl }`.

NOTE: Do NOT create connection row. `connecting` state = live pending flow exists.

**(b2) Tests:**

1. 401 without auth
2. 403 for operator
3. 200 with redirectUrl for admin
4. Error if project doesn't exist
5. Error if wrong org
6. Error if connection already active
7. OK if existing connection is disconnected
8. Error if live pending flow exists
9. OK if pending flow expired
10. redirectUrl has correct client_id, scope, state, code_challenge
11. Uses test.salesforce.com for sandbox
12. Uses custom domain when loginUrl provided
13. Error for invalid loginUrl (SSRF)
14. Pending flow created
15. No connection row created

**(c) Edge cases:** `connecting` = derived from pending flows, not stored. org_owner/admin = org-wide, no projectMembers check.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 1.11: OAuth Route — Callback Endpoint

**(a) Objective:** `GET /v1/salesforce/oauth/callback` completes OAuth: validates state, exchanges code, stores tokens in secrets table, runs audit, renders popup-closing HTML with anti-leak headers + CSP nonce. **Test:** Unit — 17 tests.

**(b1) Description:**
No auth middleware (public, Salesforce redirect). Rate limited.

Handler: extract code+state → verifyState → findByNonce → exchangeCodeForTokens(oauthBaseUrl) → on fail, render error HTML that ALSO posts `{ type: 'sf_error', error: '...' }` to opener before showing error message (so parent page can show error toast). Check for "app not approved" → §7 instructions → parse orgId/userId from `id` URL → create connection row (status='active') → create secrets row (encrypted) → delete pending flow AFTER success → run audit (if audit fails, keep connection active with partial metadata) → log events → render HTML with `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, `CSP: script-src 'nonce-{uuid}'` → script posts message to opener with hardcoded `APP_ORIGIN` or redirects.

**(b2) Tests:**
1-5. Error HTML for: missing code, missing state, invalid signature, expired state, unknown nonce 6. Error HTML on token exchange failure 7. Connection record created (status=active) 8. Secrets record created with encrypted tokens 9. Pending flow deleted 10. Connection log created (event=connected) 11. Audit log created 12. If audit fails: connection still active, partial metadata 13. Header: Referrer-Policy: no-referrer 14. Header: Cache-Control: no-store 15. Header: CSP with nonce 16. HTML: postMessage with APP_ORIGIN 17. HTML: redirect fallback for non-popup

**(c) Edge cases:** No auth middleware. Pending flow deletion AFTER exchange+storage. CSP nonce per-response via `crypto.randomUUID()`. APP_ORIGIN from `getEnv('APP_URL')`. Parent verifies `event.origin`. Salesforce `code` is single-use, ~10min expiry. PKCE+verifier is the validation chain — no additional code origin check needed.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 1.12: Post-Connection Permission Audit

**(a) Objective:** Auto-checks CPQ installation, object access, API budget after OAuth. **Test:** Unit — 9 tests.

**(b1) Description:**
Create `apps/server/src/services/salesforce-audit.service.ts`:
`runPostConnectionAudit(accessToken, instanceUrl, connectionRole)`:

1. `GET /services/data/` → latest API version
2. Tooling: `InstalledSubscriberPackage` WHERE SBQQ → version (fallback Publisher)
3. `describe('SBQQ__Quote__c')` → accessible? 403 → missingPermissions
4. If target: `describe('ProductSellingModel')` → RCA available?
5. `GET /limits` → DailyApiRequests
6. Parse profile from `/id` response
7. 5s timeout per check — skip if slow
   Store in `connectionMetadata`.

**(b2) Tests:**

1. All pass → correct metadata
2. CPQ not installed → cpqInstalled:false
3. 403 on describe → missingPermissions populated
4. RCA available on target
5. RCA not available
6. Tooling blocked → Publisher fallback
7. Both fail → graceful
8. Limits parsed
9. Partial failure → partial results returned

**(c) Edge cases:** Tooling URL: `/services/data/{v}/tooling/query?q=...`. Runs during callback — must be fast.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 1.13: Status, Test, Disconnect, Reconnect Endpoints

**(a) Objective:** View status (with `connecting` from pending flows), test connection, disconnect (delete secrets), reconnect. **Test:** Unit — 16 tests.

**(b1) Description:**

**`GET /connections`** — returns `{ source, target }` with `connecting` derived from live pending flow. NEVER tokens.

**`POST /test`** — get secrets, `GET /services/data/`, 401 → refresh+retry. Update `lastSuccessfulApiCallAt`.

**`POST /disconnect`** — get secrets → `revokeToken(oauthBaseUrl, refreshToken)` (if fails, log+continue) → delete secrets row → set status=disconnected. Idempotent.

**`POST /reconnect`** — stores `reconnect intent (via project+role lookup of existing disconnected connection during callback — no extra schema column needed)` in pending flow → callback updates existing record instead of creating new → new secrets row → re-audit.

**(b2) Tests:**

1. Status: null for missing role
2. Status: active connection metadata
3. Status: 'connecting' when live pending flow
4. Status: NEVER includes tokens
5. Test: healthy=true on success
6. Test: healthy=false on failure
7. Test: refreshes on 401
8. Test: 403 for reviewer
9. Disconnect: 403 for operator
10. Disconnect: revokes at SF
11. Disconnect: deletes secrets
12. Disconnect: sets disconnected
13. Disconnect: idempotent (already disconnected → OK)
14. Disconnect: SF revocation fails → still disconnects locally
15. Reconnect: preserves connection ID
16. Reconnect: creates new secrets

**(c) Edge cases:** `connecting` is derived, not stored. Disconnect idempotent. SF revocation failure → still disconnect. Reconnect passes `reconnect intent (via project+role lookup of existing disconnected connection during callback — no extra schema column needed)` through pending flow.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 1.14: Client UI — Salesforce Connection Components

**(a) Objective:** Project workspace shows Source/Target connection slots with popup OAuth + fallback, status, test, disconnect. **Test:** Component — 12 tests.

**(b1) Description:**
Create `apps/client/src/features/salesforce/`:

- `hooks/use-salesforce-api.ts` — `useSalesforceConnections(projectId)` (polls 30s), `useConnectSalesforce()` (fetch+popup+fallback+postMessage), `useDisconnectSalesforce()`, `useTestSalesforceConnection()`. Query key factory.
- `components/SalesforceConnectionCard.tsx` — states: disconnected (button+selector+MyDomain input+checklist), connecting (spinner), connected (green badge+metadata+Test+Disconnect), error (red+Reconnect)
- `components/SalesforceConnectionsSection.tsx` — two cards
- `components/DisconnectConfirmModal.tsx`

Popup: `fetch /connect` → `window.open(url)` → if null, `location.href` + toast → `addEventListener('message', ...)` with origin check → on `sf_connected`: invalidate cache + success toast → on `sf_error`: show error toast with message. Detect `?sf_connected=true` on mount → toast. Cleanup listener on unmount.

Translations: `en/salesforce.json` + `he/salesforce.json`.

**(b2) Tests:**

1. Renders Connect button when disconnected
2. Shows Production/Sandbox selector
3. Shows connected state with green badge
4. NEVER renders tokens in DOM
5. Disconnect opens confirmation modal
6. Test button shows result
7. Shows "Connecting..." for pending flow
8. Handles popup blocked → redirect toast
9. postMessage verifies origin
10. Detects `?sf_connected=true` → toast
11. Cleanup removeEventListener on unmount
12. Accessible: `role="region"`, `aria-label` on cards

**(c) Edge cases:** postMessage listener cleanup on unmount. RTL: `ms-*`/`me-*`. Focus returns after popup closes. Pre-connection checklist collapsed by default.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 1.15: Mock Mode Support

**(a) Objective:** `pnpm local` works with simulated connections. **Test:** Smoke.

**(b1) Description:**
Mock connect → mock redirect URL → `GET /mock-callback` (guarded by `AUTH_MODE=mock`) creates connection+secrets → popup HTML. Mock test → always healthy.

**(b2) Tests:** 1. Mock connect returns URL. 2. Mock callback creates connection. 3. Mock test healthy.

**(c) Edge cases:** Mock callback ONLY exists when `AUTH_MODE=mock`.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 1.16: Environment Variables

**(a) Objective:** All new env vars documented and in `.env.example`. **Test:** Smoke — `pnpm local` starts.

**(b1) Description:**
New: `SALESFORCE_CONSUMER_KEY`, `SALESFORCE_CONSUMER_SECRET`, `SALESFORCE_TOKEN_ENCRYPTION_KEY`, `SALESFORCE_STATE_SIGNING_SECRET`, `SALESFORCE_CALLBACK_URL`, `APP_URL`. Encryption key ≠ signing secret. Add to `.env.example` + `.env.local`.

**(b2) Tests:** None. Verify startup.

**(c) Edge cases:** Callback URL must match ECA exactly.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 1.17: Pending Flow Cleanup Job

**(a) Objective:** Expired `oauth_pending_flows` cleaned up hourly. **Test:** Unit — 3 tests.

**(b1) Description:**
Scheduled job (setInterval or job queue): calls `cleanupExpired()` hourly, logs count.

**(b2) Tests:** 1. Deletes expired rows. 2. Does NOT delete live rows. 3. Returns correct count.

**(c) Edge cases:** Simple setInterval if no scheduler exists. Don't overengineer.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 1.18: Customer-Facing Setup Guide

**(a) Objective:** `docs/customer/SALESFORCE-SETUP-GUIDE.md` explains what end-client admin does. **Test:** Manual review.

**(b1) Description:**
Step-by-step matching §7. Screenshots (or placeholders). Setup → OAuth Usage → Install → Permitted Users. Common errors. Written for SF admins, not devs.

**(b2) Tests:** None. Peer review.

**(c) Edge cases:** SF UI labels change between releases — note version.

**(d) Quality gate:** N/A for docs.

---

### Task 1.19: Security Checklist Verification — Phase 1

**(a) Objective:** All §18 Phase 1 items verified. **Test:** Manual + automated checks.

**(b1) Description:**
Walk §18 checklist: no plaintext tokens (unit test), encryption key env-only (code search), HKDF contexts (unit test), PKCE in authorize URL, state minimal, verifier server-side (code review), callback headers (unit test), tokens not in client (unit test), RLS (integration test), revocation (unit test), HTTPS callback, rate limiting, SSRF, postMessage origin, connection locking.

**(b2) Tests:** Mostly covered by earlier tasks. This aggregates verification.

**(c) Edge cases:** If any item fails, fix before Phase 2.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

## Phase 2: CPQ Data Extraction & Worker Plane

> Spec ref: §15, §22 Phase 2, High-Level Architecture Spec
>
> **Architecture change:** This phase introduces the **worker plane** (`apps/worker/`). All long-running Salesforce operations (extraction, analysis, write-back) run on the worker, NOT on Edge Functions. The worker obtains Salesforce tokens via an internal token-mint endpoint on the control plane. The user experience is unified under a single "Start CPQ Assessment" action.

### Task 2.0: Worker App Foundation

**(a) Objective:** `apps/worker/` exists as a Node.js app that polls the `jobQueue` table and dispatches jobs to handlers. Runs locally via `pnpm worker`, in Docker for staging/prod. **Test:** Integration — 6 tests.

**(b1) Description:**

Create `apps/worker/`:

- `package.json` — Node.js app, dependencies: `drizzle-orm`, `pg`, shared packages
- `src/index.ts` — startup: connect to DB, start polling loop, register signal handlers for graceful shutdown
- `src/job-poller.ts` — polls `jobQueue` for pending jobs every 2s. Claims a job via atomic `UPDATE ... SET status = 'running' WHERE status = 'queued' AND id = {id} RETURNING *` (prevents duplicate pickup across instances). Dispatches to handler based on `jobType`.
- `src/job-handlers/` — directory for job type handlers. Initially empty; Task 2.5 adds the assessment handler.
- `src/config.ts` — loads env vars: `DATABASE_URL`, `WORKER_SECRET` (for authenticating to token-mint endpoint), `SUPABASE_URL`
- `Dockerfile` — `FROM node:20-slim`, installs deps, runs worker
- Add `pnpm worker` script to root `package.json` (runs `apps/worker/src/index.ts`)

The worker connects directly to Postgres (via `DATABASE_URL`) for job polling and progress writes. It does NOT hold the Salesforce encryption key.

**(b2) Tests:**

1. Worker starts and begins polling
2. Worker picks up a queued job and marks it running
3. Two workers don't pick up the same job (atomic claim)
4. Worker handles unknown job types gracefully (log + skip)
5. Graceful shutdown finishes current job before exiting
6. Worker reconnects to DB after transient connection error

**(c) Edge cases & gotchas:**

- Atomic job claim: `UPDATE jobQueue SET status = 'running', worker_id = {id}, started_at = now() WHERE id = {jobId} AND status = 'queued' RETURNING *`. If 0 rows returned, another worker claimed it.
- Poll interval 2s is a balance between responsiveness and DB load. Make configurable.
- Worker should have its own health check endpoint (`GET /health`) for Docker/Kubernetes liveness probes.
- For `pnpm local`, the worker runs alongside the API server as a separate process (add to `package.json` scripts or use a process manager).

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 2.0.1: Assessment Run Data Model

**(a) Objective:** `cpq_assessment_runs` and `cpq_assessment_run_events` tables exist with Drizzle schema, repositories, and RLS. **Test:** Integration + unit — 8 tests.

**(b1) Description:**

Add to `packages/database/src/schema.ts`:

**`cpqAssessmentRuns`:**

- `id`, `projectId` (FK cascade), `organizationId` (FK cascade), `connectionId` (FK → salesforceConnections)
- `status` (varchar: 'queued'|'running'|'extracting'|'analyzing'|'mapping'|'completed'|'failed'|'cancelled')
- `progressPct` (int, 0-100), `currentStep` (text nullable)
- `resultSummary` (jsonb nullable — coverage stats, complexity scores)
- `artifactPaths` (text array nullable — Supabase Storage paths)
- `lastError` (text nullable)
- `startedBy` (FK users), `startedAt`, `completedAt`, `createdAt`, `updatedAt`
- Index on `(projectId)`, `(status)`

**`cpqAssessmentRunEvents`:**

- `id`, `runId` (FK cascade), `event` (varchar), `message` (text), `details` (jsonb), `createdAt`
- Index on `runId`

Repository interfaces in `packages/contract/`:

- `CpqAssessmentRunRepository`: `create`, `findById`, `findByProject(projectId, options?)`, `updateStatus(id, status, progressPct?, currentStep?)`, `updateResults(id, resultSummary, artifactPaths)`, `findActiveByProject(projectId)` (for duplicate prevention)
- `CpqAssessmentRunEventRepository`: `create`, `findByRun(runId, options?)`

Drizzle + mock implementations. RLS: org-scoped.

**(b2) Tests:**

1. Migration applies
2. Create run with status='queued'
3. Update status to 'running' + progress
4. Update results on completion
5. `findActiveByProject` returns running/queued runs
6. `findActiveByProject` returns null when no active run
7. Events append correctly
8. RLS: org-scoped access

**(c) Edge cases & gotchas:**

- `findActiveByProject` is used by the "Start Assessment" endpoint to prevent duplicate runs
- The `status` progression is: queued → running → extracting → analyzing → mapping → completed. Each transition updates `currentStep`.
- `artifactPaths` stores Supabase Storage paths, not URLs — URLs are generated on-demand via signed URLs

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 2.0.2: Internal Token-Mint Endpoint

**(a) Objective:** `POST /internal/salesforce/access-token` allows the worker to obtain short-lived Salesforce access tokens without holding the encryption key. Refresh token never leaves the control plane. **Test:** Unit — 8 tests.

**(b1) Description:**

Create `apps/server/src/v1/routes/internal/salesforce-tokens.ts`:

- `POST /internal/salesforce/access-token`
- Auth: `Authorization: Bearer {WORKER_SECRET}` — a shared secret between control plane and worker, stored in both environments. NOT user auth — this is server-to-server.
- Body: `{ connectionId: string }`
- Handler:
  1. Validate worker secret
  2. Look up connection + secrets
  3. Decrypt access token
  4. If expired (tokenIssuedAt > 90min): refresh via OAuth service, update DB
  5. Return `{ instanceUrl, apiVersion, accessToken, issuedAt, oauthBaseUrl }`
- NEVER return the refresh token
- Rate limit: 60 requests/min per connection (prevents abuse)
- Log every call for audit

Add `WORKER_SECRET` to env vars (`.env.example`, `.env.local`).

**(b2) Tests:**

1. Returns access token for valid connection
2. Returns 401 for invalid worker secret
3. Returns 404 for unknown connection
4. Refreshes expired token before returning
5. NEVER includes refresh token in response
6. Rate limited (61st request → 429)
7. Logs each call
8. Returns correct instanceUrl and apiVersion

**(c) Edge cases & gotchas:**

- This endpoint is internal — do NOT register it on the public router. Use a separate router or path prefix (`/internal/`).
- In production, this endpoint should be network-restricted (only accessible from the worker's IP/VPC). In dev, the shared secret is sufficient.
- The `WORKER_SECRET` must be different from all other secrets. Generate with `openssl rand -base64 32`.
- Token refresh here uses the same optimistic locking as Task 3.1 — if another process is refreshing simultaneously, read the updated token.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 2.0.3: Start Assessment Endpoint + UI

**(a) Objective:** User clicks "Start CPQ Assessment" → creates assessment run → enqueues job → returns run ID. UI shows live progress. **Test:** Unit — 10 tests + Component — 6 tests.

**(b1) Description:**

**Backend:** `POST /v1/projects/:projectId/cpq-assessment/start`

- Middleware: `authMiddleware`, `requireRole('org_owner', 'admin', 'operator')`
- Handler:
  1. Verify project exists, org match, source connection is active
  2. Check for existing active assessment run → reject if one is running ("Assessment already in progress")
  3. Create `cpqAssessmentRuns` row with status='queued'
  4. Insert job into `jobQueue` with type='cpq_assessment', payload `{ assessmentRunId }`
  5. Return `{ success: true, data: { runId } }`

**Additional endpoints:**

- `GET /v1/projects/:projectId/cpq-assessment/runs` — list assessment runs (history)
- `GET /v1/projects/:projectId/cpq-assessment/runs/:runId` — single run with status/progress
- `GET /v1/projects/:projectId/cpq-assessment/runs/:runId/events` — event timeline

**Frontend:** Create `apps/client/src/features/assessment/`:

- `hooks/use-assessment-api.ts` — `useAssessmentRuns(projectId)`, `useAssessmentRun(runId)` (polls every 5s while running), `useAssessmentEvents(runId)`, `useStartAssessment()` mutation
- `components/StartAssessmentButton.tsx` — disabled if no source connection or assessment running
- `components/AssessmentProgressCard.tsx` — progress bar, current step, percentage, elapsed time
- `components/AssessmentRunHistory.tsx` — list of past runs with status badges
- `components/AssessmentEventTimeline.tsx` — live event feed during run

Translations: `en/assessment.json`, `he/assessment.json`

**(b2) Backend tests:**

1. Returns 401 without auth
2. Returns 403 for reviewer
3. Returns error if no source connection
4. Returns error if assessment already running
5. Creates assessment run with status='queued'
6. Creates job in jobQueue
7. Returns runId
8. GET /runs returns history
9. GET /runs/:id returns status/progress
10. GET /runs/:id/events returns timeline

**(b2) Frontend tests:**

1. Start button enabled when source connected and no active run
2. Start button disabled when assessment running
3. Progress bar shows percentage and step
4. Event timeline renders events
5. History shows past runs with badges
6. Polling stops when run is completed/failed

**(c) Edge cases & gotchas:**

- Duplicate prevention: check for active runs before creating new one
- The job payload contains ONLY `{ assessmentRunId }` — no tokens, no secrets
- Polling interval: 5s while running, stop when completed/failed
- The worker picks up the job from `jobQueue`, not from the assessment runs table

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 2.0.4: Assessment Job Handler (Worker Side)

**(a) Objective:** Worker handles `cpq_assessment` jobs: fetches tokens via token-mint, runs extraction + analysis pipeline, reports progress, stores results. **Test:** Unit — 10 tests.

**(b1) Description:**

Create `apps/worker/src/job-handlers/cpq-assessment.handler.ts`:

1. Receive `{ assessmentRunId }` from job
2. Update run status to 'running'
3. Fetch assessment run details (get connectionId)
4. Call token-mint endpoint: `POST {SUPABASE_URL}/internal/salesforce/access-token` with `WORKER_SECRET`
5. Create `SalesforceClient` with returned access token
   - `onTokenRefresh`: call token-mint again
   - `onApiCall`: log API usage
6. Run pipeline:
   - Phase 1: CPQ Discovery (update status='extracting', progress 0-30%)
   - Phase 2: Data Extraction (progress 30-70%)
   - Phase 3: QCP Analysis (update status='analyzing', progress 70-85%)
   - Phase 4: Mapping Analysis (update status='mapping', progress 85-95%)
   - Phase 5: Generate report + upload artifacts (progress 95-100%)
7. Post events at each step
8. On completion: update status='completed', set resultSummary
9. On error: update status='failed', set lastError, post error event

**(b2) Tests:**

1. Fetches token from token-mint endpoint
2. Refreshes token on 401 via token-mint
3. Updates run progress at each step
4. Posts events at each step
5. Sets status='completed' on success
6. Sets status='failed' on error with lastError
7. Stores resultSummary on completion
8. Handles token-mint endpoint failure (reports error, doesn't crash)
9. Handles Salesforce API failure mid-extraction (reports partial progress)
10. Uploads artifacts to storage

**(c) Edge cases & gotchas:**

- The worker should catch ALL errors and update the run status to 'failed' — never leave a run stuck in 'running'
- If the worker crashes mid-job, the run stays in 'running' forever. Add a stale job detector (Task 3.x) that marks runs as 'failed' if no progress update for >15 minutes.
- The token-mint endpoint is the ONLY way the worker gets Salesforce credentials — if it's down, the job fails with a clear error.
- Progress events should be batched (don't write to DB on every single record — batch every 50 records or every 5 seconds)

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 2.1: Salesforce REST API Client

**(a) Objective:** `SalesforceClient` wraps REST API with pagination, refresh retry, API tracking, SOQL safety. **Test:** Unit — 18 tests.

**(b1) Description:**
Create `apps/server/src/services/salesforce-client.ts`. Constructor: `(instanceUrl, accessToken, { onTokenRefresh?, onApiCall? })`. Methods: `query`, `queryAll` (auto-paginate), `describe`, `describeGlobal`, `getRecord`, `createRecord`, `updateRecord`, `upsertRecord`, `toolingQuery`, `getLimits`. Internal `request()`: auth header, reads `Sforce-Limit-Info`, calls `onApiCall`, 401 → onTokenRefresh → retry ONCE.

**(b2) Tests:**
1-6. Each method sends correct HTTP request 7. `queryAll` follows nextRecordsUrl 8. `queryAll` prepends instanceUrl to relative path 9. `toolingQuery` uses `/tooling/query` 10. On 401: calls refresh, retries once 11. On 401 after retry: throws (no loop) 12. `Sforce-Limit-Info` parsed (`api-usage=42/100000`) 13. `onApiCall` called with metadata 14. Non-2xx → SalesforceApiError 15. Network error → meaningful message
16-18. Edge cases: case-sensitive paths, empty results, large payloads

**(c) Edge cases:** `nextRecordsUrl` is relative. 401 retry once only. Client doesn't build SOQL.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 2.2: Bulk & Composite API Clients

**(a) Objective:** `CompositeApiClient` (batch 25) and `BulkApiClient` (Bulk 2.0 CSV). **Test:** Unit — 12 tests.

**(b1) Description:**
`CompositeApiClient`: `execute(subrequests)` — splits >25 into multiple calls. `BulkApiClient`: `createQueryJob`, `pollJobStatus`, `getResults` (CSV→objects), `queryBulk` (convenience with exponential backoff 2s→30s).

**(b2) Tests:**
1-4. Composite: correct POST, auto-split 30→25+5, merged results, partial failure
5-8. Bulk: create job, poll, CSV parse, convenience method 9. Exponential backoff between polls 10. Job failure handling 11. Job timeout 12. CSV: quoted fields, commas in values, nulls

**(c) Edge cases:** Bulk returns CSV not JSON. Max poll ~10min. CSV null handling.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 2.3: CPQ Object Discovery Service

**(a) Objective:** Detects CPQ version, enumerates SBQQ\_\_ objects, fetches field metadata. **Test:** Unit — 7 tests.

**(b1) Description:**
`discoverCpqSchema(client)`: Tooling InstalledSubscriberPackage (fallback Publisher) → describeGlobal filter SBQQ\_\_ → describe each (batch via Composite). Returns `{ cpqVersion, objects: [{ name, label, fields }] }`.

**(b2) Tests:** 1. Detects version. 2. Publisher fallback. 3. Lists SBQQ objects. 4. Field metadata. 5. No CPQ. 6. Old version. 7. Composite batching.

**(c) Edge cases:** Some objects 403 — skip per-object. Use Composite for batch describes.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 2.4: Extracted Data Schema + Repository

**(a) Objective:** `cpqExtractedData` table with Drizzle schema, repos, migration. **Test:** Integration + unit — 5 tests.

**(b1) Description:**
Table: `id`, `projectId`, `organizationId`, `connectionId`, `objectType`, `salesforceRecordId`, `data` (jsonb), `extractedAt`, `systemModstamp`. Unique: `(projectId, salesforceRecordId)`. Repos: `upsertMany`, `findByProjectAndType`, `deleteByProject`, `countByProjectAndType`. RLS org-scoped.

**(b2) Tests:** 1. Migration. 2. Upsert creates. 3. Upsert updates existing. 4. findByProjectAndType. 5. deleteByProject.

**(c) Edge cases:** Can get large — retention handled in Phase 3 Task 3.8. JSONB stores raw SF records.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 2.5: Data Extraction Engine

**(a) Objective:** Pulls all CPQ data, stores project-scoped, tracks progress, incremental, pauses at API limits, extracts quote snapshots. **Runs on the worker plane, NOT Edge Functions.** **Test:** Unit — 18 tests.

**(b1) Description:**
Create extraction logic as shared services (usable by worker):

- `apps/server/src/services/extraction/extraction.service.ts` (orchestrator — called by worker handler)
- `apps/server/src/services/extraction/soql-builder.ts` (validates field names from describe, escapes values)
- `apps/server/src/services/extraction/extraction-progress.ts`

These services live in `apps/server/` for shared access but are invoked by the worker's assessment job handler (Task 2.0.4), NOT by Edge Function routes directly.

Flow: schema → COUNT per object → Bulk if >10K else REST → incremental via `SystemModstamp >` → track Sforce-Limit-Info → pause at 80% → upsertMany → quote snapshots via `POST /services/apexrest/SBQQ/ServiceRouter`.

**(b2) Tests:**

1. Extracts all records for object type
2. REST for <10K, Bulk for >10K
3. Incremental: only modified since last
4. First extraction: no filter
5. Pauses at 80% API limit
6. Progress updates
7. SOQL builder: only describe-validated fields
8. SOQL builder: rejects unknown fields
9. SOQL builder: escapes single quotes
10. Upserts correctly
11. Empty tables handled
12. 403 per-object: skip+warn
13. Quote snapshots via ServiceRouter POST
14. Tracks total counts
15. SOQL builder: handles relationship fields (e.g., `Account.Name`)
16. SOQL builder: escapes LIKE wildcards (`%`, `_`)
17. SOQL builder: handles unicode in filter values
18. Edge: parallel extraction, error recovery

**(c) Edge cases:** SOQL injection: all fields from describe only. ServiceRouter is POST. SystemModstamp always present.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 2.6: CPQ Explorer UI

**(a) Objective:** CPQ Explorer tab with categories, search/filter tables, detail views, rule visualizer, bundle tree, QCP syntax highlighting. **Test:** Component — 10 tests.

**(b1) Description:**
Create `apps/client/src/features/cpq-explorer/`: `CpqExplorerPage`, `CpqObjectTable`, `CpqRecordDetail`, `CpqRuleVisualizer`, `CpqBundleTree`, `CpqCodeViewer` (prismjs/highlight.js). Hooks: `useCpqData`, `useCpqStats`, `useExtractData`. Translations.

**(b2) Tests:** 1. Sidebar categories. 2. Table loads. 3. Search filters. 4. Detail view. 5. Rule visualizer. 6. Bundle tree. 7. Code highlights JS. 8. Empty state. 9. Loading. 10. Accessible: nav, table roles.

**(c) Edge cases:** QCP can be 131K chars — highlighter must handle. Paginate large datasets. RTL sidebar flips.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 2.7: Extraction Monitoring UI

**(a) Objective:** Progress, API usage, re-extract/refresh buttons, warnings. **Test:** Component — 6 tests.

**(b1) Description:**
Progress bars per object. API usage card. Re-extract All / Refresh Changed buttons. Warning banners at 80%.

**(b2) Tests:** 1. Progress bars. 2. API usage display. 3. Warning at 80%. 4. Re-extract triggers mutation. 5. Refresh Changed triggers incremental. 6. Extraction timestamps.

**(c) Edge cases:** Poll-based progress. API usage from connectionMetadata.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 2.8: Structured API Logging

**(a) Objective:** Every SF API call logged with project, method, endpoint, status, duration, usage. **Test:** Unit — 4 tests.

**(b1) Description:**
`salesforce-api-logger.ts`: implements `onApiCall` callback. Logs via logger. Stores daily counts in metadata. Warns at 80%/90%.

**(b2) Tests:** 1. Logs with all fields. 2. Updates daily count. 3. Warns 80%. 4. Warns 90%.

**(c) Edge cases:** Never log tokens. Daily resets at midnight UTC.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

## Phase 3: Connection Resilience

> Spec ref: §10, §22 Phase 3

### Task 3.1: Token Refresh Service

**(a) Objective:** Proactive heuristic (90min), optimistic locking, retry, permanent failure detection. **Test:** Unit — 10 tests.

**(b1) Description:**
`refreshIfNeeded(connectionId)`: get connection+secrets → if tokenIssuedAt >90min → refresh → updateTokens (optimistic) → if null (lock conflict) → read new token → if `invalid_grant` → mark refresh_failed → network error → retry 3x backoff → update instance_url if changed.

**(b2) Tests:** 1. Skips <90min. 2. Triggers >90min. 3. Updates tokens. 4. Handles lock conflict. 5. Retries network error 3x. 6. Marks refresh_failed on invalid_grant. 7. No retry on invalid_grant. 8. Updates instance_url. 9. Increments tokenVersion. 10. Updates lastRefreshAt.

**(c) Edge cases:** invalid_grant = permanent. Lock failure = normal (read new token). 90min = configurable constant. Uses oauthBaseUrl from connection.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 3.2: Health Monitoring Job

**(a) Objective:** Checks all active connections every 30min. **Test:** Unit — 6 tests.

**(b1) Description:**
Job: findAllActive → for each: GET /services/data/ → success: update lastSuccessfulApiCallAt, refresh limits → 401: attempt refresh → refresh_failed: mark + notify → network error: mark instance_unreachable. Stagger 100ms between connections.

**(b2) Tests:** 1. Checks all active. 2. Updates lastSuccessful on success. 3. Refreshes on 401. 4. Marks refresh_failed. 5. Marks instance_unreachable. 6. Logs results.

**(c) Edge cases:** Don't let one failure block others. One API call per connection — minimal limit impact.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 3.3: In-App Notifications

**(a) Objective:** Project banners alert on connection issues. **Test:** Component — 5 tests.

**(b1) Description:**
Banner above project content: "Connection needs attention — [action]". Color by status. Dismissible, reappears on next poll if unchanged.

**(b2) Tests:** 1. Shows for refresh_failed. 2. Shows for instance_unreachable. 3. Hidden for active. 4. Dismiss works. 5. Reappears on next poll.

**(c) Edge cases:** Don't overlap other banners. Poll-based (no WebSocket).

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 3.4: Email Notifications

**(a) Objective:** Email to connectedBy user on connection failure. Rate limited 1/24h. **Test:** Unit — 4 tests.

**(b1) Description:**
Health monitoring triggers email via Resend. Rate limit: store last notification time, skip if <24h. Template translated (en/he).

**(b2) Tests:** 1. Email on refresh_failed. 2. Email on instance_unreachable. 3. No email for active. 4. Rate limited (no 2nd within 24h).

**(c) Edge cases:** Use existing Resend integration.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 3.5: Reconnect Flow

**(a) Objective:** Re-authorize broken connection, preserve ID+history. **Test:** Unit — 6 tests.

**(b1) Description:**
POST /reconnect: find disconnected/failed connection → start OAuth (store reconnect intent (via project+role lookup of existing disconnected connection during callback — no extra schema column needed) in pending flow) → callback updates existing connection → new secrets row → re-audit.

**(b2) Tests:** 1. Starts OAuth for disconnected. 2. Updates existing (same ID). 3. New secrets. 4. Re-audits. 5. Logs 'reconnected'. 6. Error if active (not disconnected).

**(c) Edge cases:** If reconnects to different SF org, update salesforceOrgId etc.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 3.6: Encryption Key Rotation

**(a) Objective:** Admin endpoint re-encrypts all secrets with new key. **Test:** Unit — 5 tests.

**(b1) Description:**
`POST /v1/admin/salesforce/rotate-encryption-key` (system_admin/security_admin). Re-encrypts all rows in transaction. Increments version. Supports gradual rollover (decrypt tries current then previous). Audit log.

**(b2) Tests:** 1. All re-encrypted. 2. New key decrypts. 3. Old key fails. 4. Version incremented. 5. Audit logged.

**(c) Edge cases:** Transaction — rollback on any failure. Rare operation — correctness over speed.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 3.7: Connection Logs UI

**(a) Objective:** Timeline view of connection events. **Test:** Component — 5 tests.

**(b1) Description:**
`ConnectionTimeline.tsx`: chronological events, icons per type, expandable details, filterable, paginated (20/page).

**(b2) Tests:** 1. Renders chronologically. 2. Correct icons. 3. Expands details. 4. Filter works. 5. Pagination.

**(c) Edge cases:** User timezone for display. RTL timeline.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 3.8: Data Retention — Cleanup Job

**(a) Objective:** Automated weekly purge: extracted data 90d, mappings 180d, logs 1y after project completion. **Test:** Unit — 6 tests.

**(b1) Description:**
Weekly job: query completed/cancelled projects past retention → delete cpqExtractedData >90d → delete mappings >180d → delete connection logs >1y → revoke+delete tokens if exist. Log counts.

**(b2) Tests:** 1. Deletes >90d extracted data. 2. Skips active projects. 3. Skips <90d. 4. Deletes >1y logs. 5. Revokes tokens. 6. Logs counts. 7. Gracefully handles missing Phase 4 tables (no error if `mapping_reports` table doesn't exist yet).

**(c) Edge cases:** Don't delete audit logs (immutable). Revocation failure → log + continue.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 3.9: On-Demand Data Deletion Endpoint

**(a) Objective:** Tenant admin deletes all SF data for a project on demand. **Test:** Unit — 6 tests.

**(b1) Description:**
`POST /v1/projects/:projectId/salesforce/delete-all-data` (org_owner). Revokes tokens → deletes secrets → deletes extracted data → sets connections disconnected → preserves audit logs (redacts salesforceUsername → '[redacted]'). Returns counts.

**(b2) Tests:** 1. Revokes tokens. 2. Deletes secrets. 3. Deletes extracted data. 4. Sets disconnected. 5. Preserves+redacts audit logs. 6. 403 for non-owner.

**(c) Edge cases:** Irreversible. SF revocation failure → still delete locally. PII redaction: username → '[redacted]'.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 3.10: Storage Bucket Setup + Signed URL Service

**(a) Objective:** Supabase Storage bucket configured for project-scoped artifacts (metadata packages, screenshots, reports). Signed URL service provides time-limited download links. **Test:** Integration — 4 tests.

**(b1) Description:**

- Create storage bucket `salesforce-artifacts` in Supabase Storage (or S3-compatible)
- Path convention: `{organizationId}/{projectId}/{type}/{filename}` where type = `metadata-packages`, `screenshots`, `reports`, `quote-snapshots`
- `StorageService` class: `upload(orgId, projectId, type, filename, data)`, `getSignedUrl(path, expiresInSeconds)`, `delete(path)`, `deleteByProject(orgId, projectId)`
- RLS: org-scoped (same pattern as existing file storage)
- Retention: artifacts follow the same retention rules as extracted data (Task 3.8 cleanup job should also purge storage)

**(b2) Tests:**

1. Upload stores file at correct path
2. Signed URL provides time-limited access
3. Signed URL expires after timeout
4. `deleteByProject` removes all project files

**(c) Edge cases:** Signed URLs must expire (default 1 hour). Never serve files directly without signed URLs. Screenshots from Phase 6 use this same service.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

## Phase 4: CPQ Analysis & Migration Mapping

> Spec ref: §22 Phase 4
>
> **Worker plane:** Mapping engine, QCP analyzer, and plan generator run on the worker as part of the CPQ assessment pipeline (Task 2.0.4). They execute after extraction completes, within the same assessment run. The services live in `apps/server/src/services/` for shared access but are invoked by the worker handler.
>
> **Note:** All UI tasks in Phases 4-6 require wireframes/design mockups before implementation. The plan specifies component behavior and states, but visual design (layout, spacing, chart styles) should be finalized in a separate design artifact. Add a note to each UI task ticket.

### Task 4.0: Phase 4/5 Persistence Schema

**(a) Objective:** Tables exist for storing mapping reports, migration plans, deployment runs, validation results, and rollback manifests. **Test:** Integration — migration applies.

**(b1) Description:**

Add to `packages/database/src/schema.ts` (Phase 4/5 Drizzle migration):

**`mappingReports`** — stores analysis results per project:

- `id` (uuid PK), `projectId` (FK), `organizationId` (FK), `connectionId` (FK nullable), `report` (jsonb — full MappingReport), `coverageStats` (jsonb), `createdAt`, `updatedAt`

**`migrationPlans`** — editable plans:

- `id` (uuid PK), `projectId` (FK), `organizationId` (FK), `plan` (jsonb — phases, steps, estimates), `status` ('draft'|'approved'|'in_progress'|'completed'), `approvedBy` (FK users nullable), `approvedAt`, `createdAt`, `updatedAt`

**`deploymentRuns`** — tracks each write-back execution:

- `id` (uuid PK), `projectId` (FK), `organizationId` (FK), `connectionId` (FK — target connection), `status` ('running'|'completed'|'failed'|'rolled_back'), `totalRecords`, `createdRecords`, `updatedRecords`, `failedRecords`, `startedAt`, `completedAt`, `startedBy` (FK users), `createdAt`

**`deploymentRunItems`** — per-record outcomes:

- `id` (uuid PK), `deploymentRunId` (FK cascade), `objectType`, `salesforceRecordId` (nullable — set after creation), `externalIdValue`, `action` ('created'|'updated'|'failed'), `error` (text nullable), `previousData` (jsonb nullable — for rollback), `createdAt`

**`validationRuns`** — tracks validation executions:

- `id` (uuid PK), `deploymentRunId` (FK), `projectId` (FK), `totalScenarios`, `passed`, `failed`, `report` (jsonb — per-scenario results with field diffs), `createdAt`

Repositories: contract interfaces + Drizzle impls + mock impls for all. RLS org-scoped on all tables.

**(b2) Tests:**

1. Migration applies
2. Cascade: deleting project deletes all related records
3. `deploymentRunItems` cascade from `deploymentRuns`
4. RLS: org-scoped access

**(c) Edge cases:** `deploymentRunItems` can be large (thousands of records per run) — index on `deploymentRunId`. `previousData` JSONB is nullable — only captured for updates (not creates). Rollback manifests are derived from `deploymentRunItems` where `action = 'created'` — no separate table needed.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 4.1: Mapping Rules Database

**(a) Objective:** Versioned, data-driven mapping rules (JSON config, not hardcoded). **Test:** Unit — 8 tests.

**(b1) Description:**
`mapping-rules.ts`: all 17 mapping pairs from spec. Each: `{ cpqObject, rcaObject, rcaEquivalent, complexity, minimumRcaRelease, transformationGuide, dependencies }`. `getMappingRules(rcaVersion?)` filters by version.

**(b2) Tests:** 1. Returns 17 rules. 2. Filters by version. 3. All fields present. 4. Valid complexity values. 5. Dependencies exist (no broken refs). 6. New-in-RCA included. 7. QCP split correctly. 8. Serializable.

**(c) Edge cases:** RCA evolves each release — rules must be updatable. Track API names not UI names.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 4.2: Mapping Engine

**(a) Objective:** Applies rules to extracted data, produces report with scores/coverage/gaps. **Test:** Unit — 12 tests.

**(b1) Description:**
`mapping-engine.ts`: `analyzeCpqData(extractedData, rules)` → MappingReport. Complexity scoring (simple=1, moderate=3, complex=7, manual=15). Topological dependency sort. Gap analysis (no rule → manual assessment). Coverage: `{ totalObjects, autoMappable, needsReview, manualOnly }`.

**(b2) Tests:** 1. Simple mapping. 2. Complex scoring. 3. Gap detection. 4. Dependency ordering. 5. Coverage %. 6. Empty data. 7. Unknown objects. 8. Score aggregation. 9. Grouped by complexity. 10. Workaround suggestions. 11. Missing RCA features. 12. Serializable JSON.

**(c) Edge cases:** Topological sort: validate no cycles. Scores = guidance not guarantees.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 4.3: QCP Code Analyzer

**(a) Objective:** Parses QCP JS via AST, identifies methods, detects patterns, classifies complexity. **Test:** Unit — 12 tests.

**(b1) Description:**
`qcp-analyzer.ts`: uses `acorn` (ecmaVersion: 'latest'). Identifies 7 QCP methods. Per-method: LOC, patterns (conn.apex(), conn.query(), arithmetic on price fields, isFieldVisible conditionals). Classification: simple <20 LOC, moderate 20-100, complex >100.

**(b2) Tests:** 1. Parses simple QCP. 2. All 7 methods. 3. Subset (2-3 methods). 4. Detects conn.apex(). 5. Detects conn.query(). 6. Detects arithmetic. 7. Simple classification. 8. Complex classification. 9. Syntax error handling. 10. Large QCP (131K). 11. Multi-file (Static Resources). 12. Empty/missing QCP.

**(c) Edge cases:** Syntax errors — catch, report location. isFieldVisible/isFieldEditable → flag "requires browser automation". ES6+ via acorn ecmaVersion.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 4.4: Migration Plan Generator

**(a) Objective:** Auto-generates phased plan from mapping+QCP analysis. **Test:** Unit — 8 tests.

**(b1) Description:**
`migration-plan.service.ts`: input MappingReport + QcpAnalysis + project details. Output: ordered phases (simple first, complex last), effort estimates, blockers from QCP, prerequisites. Plan stored in DB (editable by operator).

**(b2) Tests:** 1. Correct phase ordering. 2. Simple before complex. 3. Dependencies respected. 4. Effort from scores. 5. Blockers from QCP. 6. No QCP → simpler plan. 7. All manual → all flagged. 8. Serializable.

**(c) Edge cases:** Plan is editable (stored, not regenerated). Effort = guidance. PDF generation deferred.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 4.5: Migration Analysis UI

**(a) Objective:** Workspace shows mapping report, QCP analysis, migration plan. **Test:** Component — 8 tests.

**(b1) Description:**
`apps/client/src/features/migration/`: MigrationAnalysisPage (tabs: Mapping/QCP/Plan). Mapping: pie chart + table + gaps. QCP: method list + badges + snippets. Plan: timeline + effort + blockers + Export. Translations.

**(b2) Tests:** 1. Coverage chart. 2. Mapping table. 3. QCP methods. 4. Plan timeline. 5. Empty state. 6. Export button. 7. Complexity badges. 8. Accessible charts.

**(c) Edge cases:** Alt text for charts. Scrollable timeline.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

## Phase 5: RCA Write-Back & Deployment

> Spec ref: §22 Phase 5
>
> **Worker plane:** Write-back, validation, and rollback run on the worker as a separate job type (`rca_deployment`). The user clicks "Start Deployment" → control plane enqueues job → worker executes using token-mint for target connection credentials. Same pattern as assessment jobs.

### Task 5.1: Coexistence Detection Service

**(a) Objective:** Detects CPQ/RCA coexistence in target org, counts products per system. **Test:** Unit — 6 tests.

**(b1) Description:**
`coexistence.service.ts`: `detectCoexistence(targetClient)` — check SBQQ objects (CPQ?), check ProductSellingModel (RCA?), count Product2 with SBQQ fields vs ProductSellingModel records, identify overlap. Return `{ cpqActive, rcaActive, productsOnCpq, productsOnRca, overlap }`.

**(b2) Tests:** 1. CPQ-only. 2. RCA-only. 3. Both (coexistence). 4. Product counts. 5. Overlap detection. 6. Neither (error).

**(c) Edge cases:** CPQ uses SBQQ**Quote**c, RCA uses native Quote — no conflict. Show before deployment.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 5.2: Deployment Plan Generator

**(a) Objective:** Topologically sorted plan with data/metadata split. **Test:** Unit — 8 tests.

**(b1) Description:**
`deployment-planner.ts`: DAG of RCA object dependencies → Kahn's algorithm sort → categorize: data (REST) vs metadata (artifact). RevBrain_Migration_Key\_\_c creation as first metadata step.

**(b2) Tests:** 1. Parent before child. 2. ProductSellingModel before Option. 3. PricingPlan before Step. 4. Data → REST. 5. Metadata → artifact. 6. Cycle → error. 7. Empty plan. 8. External ID field as first step.

**(c) Edge cases:** External ID field must exist BEFORE upsert. Kahn's for clear cycle error.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 5.3: RCA Object Creation Service

**(a) Objective:** Creates RCA data records via upsert with external IDs, tracks progress, handles errors. **Test:** Unit — 12 tests.

**(b1) Description:**
`rca-creator.service.ts`: upsert via `PATCH /services/data/v66.0/sobjects/{Object}/RevBrain_Migration_Key__c/{key}`. Key: `{projectId}:{sourceOrgId}:{cpqRecordId}`. Dependency order. Soft errors → log+continue. Hard errors → abort. Deployment report.

**(b2) Tests:** 1. Correct PATCH path (with version prefix). 2. External ID format. 3. Dependency order. 4. Soft error → continue. 5. Hard error → abort. 6. Progress per record. 7. Report counts. 8. Empty deploy. 9. Idempotent (re-run updates). 10. DUPLICATE_VALUE handling. 11. Sequential batches. 12. Record IDs tracked for rollback.

**(c) Edge cases:** Path: `/services/data/v66.0/sobjects/...` (version prefix required). External ID field must exist first. Composite for batches (200 DML limit).

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 5.4: Metadata Artifact Generator

**(a) Objective:** Generates Metadata API zip packages for custom fields, permission sets. **Test:** Unit — 8 tests.

**(b1) Description:**
`metadata-generator.service.ts`: generates zip containing custom field XML (RevBrain_Migration_Key\_\_c per object), permission set, package.xml manifest. Also generates markdown instructions for non-automatable metadata (OmniStudio, LWCs).

**(b2) Tests:** 1. Valid zip. 2. package.xml lists components. 3. Field XML correct structure. 4. Permission set includes fields. 5. Zip deployable (schema validation). 6. Instructions cover OmniStudio. 7. Empty metadata → minimal zip. 8. SF naming conventions.

**(c) Edge cases:** Metadata API zip: `src/fields/`, `src/permissionsets/`, `package.xml`. OmniStudio can't be auto-generated → manual instructions. Customer deploys via their CI/CD.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 5.5: Validation & Comparison Engine

**(a) Objective:** Compares RCA pricing against CPQ quote snapshots. **Test:** Unit — 10 tests.

**(b1) Description:**
`validation.service.ts`: for each snapshot → create test quote in target → read calculated → compare field-by-field (unit price, total, discount, net). ±0.01 tolerance. Report: pass/fail per scenario, discrepancies. Clean up test quotes after.

**(b2) Tests:** 1. Pass: fields match. 2. Fail: price discrepancy. 3. Floating-point tolerance (±0.01 for USD). 4. Currency-aware tolerance (JPY: ±1, BHD: ±0.001). 5. Per-field diffs. 6. Missing snapshot → skip+warn. 7. RCA quote creation fail → error. 8. Multiple scenarios. 9. Summary stats. 10. Cleanup test quotes. 11. Multi-currency org with mixed currencies.

**(c) Edge cases:** Tolerance must be currency-aware: USD/EUR = 2 decimals (±0.01), JPY = 0 decimals (±1), BHD = 3 decimals (±0.001). Make configurable per comparison. Normalize currencies before comparing. Clean up test quotes. Pre-captured snapshots = only baseline if CPQ decommissioned.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 5.6: Rollback Service

**(a) Objective:** Tracks deployed records, deletes in reverse dependency order. **Test:** Unit — 7 tests.

**(b1) Description:**
`rollback.service.ts`: deployment manifest (IDs+types+action). `rollback(deploymentId)`: reverse topo order, DELETE created, PATCH updated (if previous data captured). Partial failure → continue+report. Metadata NOT rolled back (documented).

**(b2) Tests:** 1. Reverse order. 2. Children before parents. 3. Partial failure handling. 4. Report results. 5. Empty → no-op. 6. Restores updated records. 7. Metadata limitation documented.

**(c) Edge cases:** Metadata not auto-rolled back. Warn if records modified after deployment.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 5.7: Write-Back UI

**(a) Objective:** Deployment UI: coexistence check, deploy+progress, validate, rollback. **Test:** Component — 10 tests.

**(b1) Description:**
`apps/client/src/features/deployment/`: DeploymentPage (tabs: Coexistence/Deploy/Validate/Rollback). Deploy: plan steps, "Deploy Data" button, progress bar, error log, "Download Metadata Package". Validate: pass/fail badges, field diffs. Rollback: deployment list, confirm modal.

**(b2) Tests:** 1. Coexistence status. 2. Plan steps. 3. Progress bar. 4. Error log. 5. Validation badges. 6. Field diffs. 7. Rollback modal. 8. Download metadata. 9. No target connection → prompt. 10. Accessible: progressbar role+aria.

**(c) Edge cases:** Show coexistence BEFORE deployment. No target → prompt setup.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

## Phase 6: Browser Automation

> Spec ref: §22 Phase 6
>
> **Worker plane:** Phase 6 does NOT create a new worker app. It extends the existing `apps/worker/` (introduced in Phase 2) by adding Playwright/Chromium to the Docker image and registering `browser_automation` as a new job type handler. The worker infrastructure, job queue, and credential access protocol are already in place.
>
> **New dependency:** Phase 6 introduces `otpauth` library for TOTP code generation (used in Task 6.4) and `playwright` for browser automation. Add both to `apps/worker/package.json`. Update the Dockerfile to use the Playwright base image: `FROM mcr.microsoft.com/playwright:v1.x-jammy`.

### Task 6.1: Browser Automation Credentials Table + Repository

**(a) Objective:** `browser_automation_credentials` table with encrypted creds (HKDF context 'browser_cred'), consent tracking. **Test:** Unit — 8 tests.

**(b1) Description:**
Table: `id`, `connectionId` (FK, UNIQUE), `encryptedSfUsername`, `encryptedSfPassword`, `encryptedMfaSecret` (nullable), `status`, `lastLoginAt`, `lastError`, `consentAcceptedAt` (NOT NULL), `consentAcceptedBy` (NOT NULL FK), timestamps. Repos: contract+Drizzle+mock. RLS join-based.

**(b2) Tests:** 1. Creates encrypted. 2. Finds decrypted. 3. Wrong HKDF context fails (browser_cred ≠ oauth_token). 4. Consent required. 5. Delete works. 6. Update re-encrypts. 7. Status tracking. 8. UNIQUE per connection.

**(c) Edge cases:** HKDF context = 'browser_cred'. Consent NOT NULL. Highest-risk data.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 6.2: Browser Credentials UI + Consent Flow

**(a) Objective:** Credential input form with explicit consent, "Test Login" button. **Test:** Component — 7 tests.

**(b1) Description:**
`BrowserCredentialsForm.tsx`: org_owner/admin only. Fields: username, password, MFA secret (optional + helper "TOTP base32 key"). Consent checkbox required. Test Login button. Link to setup guide.

**(b2) Tests:** 1. Form renders. 2. Submit disabled without consent. 3. Username+password required. 4. Test Login calls backend. 5. Shows test result. 6. Hidden from operator/reviewer. 7. Accessible: labels, aria-describedby.

**(c) Edge cases:** MFA helper: "Your TOTP secret key (base32), not the QR code".

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 6.3: Playwright Integration into Existing Worker

**(a) Objective:** The existing `apps/worker/` (from Phase 2) gains Playwright capabilities: browser pool, isolated contexts, `browser_automation` job type handler. **Test:** Integration — 5 tests.

**(b1) Description:**
Extend `apps/worker/` (NOT a new app):

- `src/browser-pool.ts` — manages 1-3 Chromium instances, creates isolated `browser.newContext()` per job
- `src/job-handlers/browser-automation.handler.ts` — registered alongside the existing `cpq-assessment` handler
- Update `Dockerfile` — switch base image to `FROM mcr.microsoft.com/playwright:v1.x-jammy` (includes Chromium)
- Worker uses token-mint endpoint for Salesforce credentials (same pattern as assessment jobs)
- Browser credentials (username/password) fetched from `browser_automation_credentials` table (decrypted server-side in worker — worker DOES need the encryption key for browser creds, unlike OAuth tokens)

**(b2) Tests:** 1. Worker handles `browser_automation` job type. 2. Picks up jobs. 3. Isolated contexts (no cookie leak between jobs). 4. Completes+marks done. 5. Graceful shutdown doesn't kill active browser session.

**(c) Edge cases:** `browser.newContext()` per job, close after. ~300MB per Chromium instance — limit concurrent contexts. Screenshots uploaded to Supabase Storage via signed URLs (Task 3.10). Worker needs the encryption key for browser creds (HKDF context 'browser_cred') — this is a deliberate security tradeoff documented in Phase 6 of the spec.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 6.4: Salesforce Login Automation

**(a) Objective:** Automated login with TOTP MFA, Lightning detection. **Test:** Integration — 6 tests.

**(b1) Description:**
`salesforce-login.ts`: navigate → fill username/password → detect MFA → if TOTP+secret: generate via `otpauth` TOTP → if push: throw "cannot automate" → if SSO redirect: throw → wait for Lightning `oneApp` (30s timeout) → detect Classic → navigate to `/one/one.app`.

**(b2) Tests:** 1. Login without MFA. 2. With TOTP MFA. 3. Invalid credentials error. 4. Unsupported MFA error. 5. Detects Lightning. 6. Session expiry re-login.

**(c) Edge cases:** `otpauth` library: `new TOTP({ secret }).generate()`. SSO → error. Lightning loads async — generous timeout. IP-based MFA exemption may skip MFA.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 6.5: QLE Behavioral Capture

**(a) Objective:** Captures field visibility/editability per field per quote line in QLE. **Test:** Integration — 5 tests.

**(b1) Description:**
`qle-capture.ts`: navigate to quote → "Edit Lines" → wait for QLE → for each field: visible (in DOM), editable (not disabled), value → modify quantity → recalculate → capture changes → screenshots → store `{ quoteId, lineId, fieldName, visible, editable, value }`.

**(b2) Tests:** 1. Opens QLE. 2. Captures visibility. 3. Captures editability. 4. Detects recalculation changes. 5. Screenshots saved.

**(c) Edge cases:** Lightning DOM fragile — selectors may break across releases. QLE 10-30s render. Screenshots for audit.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 6.6: Configurator Behavioral Capture

**(a) Objective:** Captures option visibility and selection dependencies in Product Configurator. **Test:** Integration — 5 tests.

**(b1) Description:**
`configurator-capture.ts`: navigate → "Add Products" → bundle → "Configure" → for each feature group: visible options, required/optional → select option → capture DOM changes → interaction tree: `{ optionSelected, effects: [{ option, became: 'visible'|'hidden' }] }` → screenshots.

**(b2) Tests:** 1. Opens configurator. 2. Initial state. 3. Option changes on selection. 4. Interaction tree. 5. Screenshots.

**(c) Edge cases:** Version-aware selectors. Paginated bundles. Network interception for internal API calls.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 6.7: Behavioral Analysis Results + UI

**(a) Objective:** Store results, display field visibility matrices, interaction trees, screenshots, API-vs-observed comparison. **Test:** Component — 6 tests.

**(b1) Description:**
Table: `browser_automation_results`. UI: field visibility matrix (rows=fields, cols=scenarios), configurator tree (collapsible), screenshot gallery (zoom, signed URLs), comparison highlights.

**(b2) Tests:** 1. Matrix renders. 2. Tree renders. 3. Screenshots load. 4. Comparison highlights. 5. Empty state. 6. Accessible: table headers, image alt text.

**(c) Edge cases:** Screenshots via signed URLs with expiry.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

## Phase 7: Enterprise Hardening & AppExchange

> Spec ref: §22 Phase 7
>
> **Timing note:** The dependency graph says "start 7.1-7.2 with Phase 4-5." To clarify: 7.1 (2GP packaging setup, org config, documentation) can start early, but 7.2 (Checkmarx security scan) requires Phase 1-5 code to be substantially complete — scanners run against actual code. Start the _process_ early (documentation, org setup, initial scan of Phase 1 code) but plan for the full scan after Phase 5.

### Task 7.1: 2GP Package Setup

**(a) Objective:** ECA packaged as 2GP managed package. **Test:** Smoke — installs in test org.

**(b1) Description:**
SFDX project structure → scratch org config → package the ECA → version 1.0.0 → test install → document process.

**(b2) Tests:** 1. Package creates. 2. Installs in test org. 3. OAuth works from installed package. 4. Uninstall clean.

**(c) Edge cases:** ECAs require 2GP only. Namespace is permanent.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 7.2: AppExchange Security Review

**(a) Objective:** Passes Salesforce security review. **Test:** Checkmarx scan + pen test.

**(b1) Description:**
Run Checkmarx. Document data handling, encryption, tokens. Address findings. Submit. Respond to feedback (2-3 rounds, 4-8 weeks).

**(b2) Tests:** 1. Checkmarx no critical. 2. High findings addressed. 3. Docs complete.

**(c) Edge cases:** Start early — reviews are slow. May require code changes.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 7.3: JWT Bearer Flow

**(a) Objective:** Certificate-based auth for enterprise. **Test:** Integration — 5 tests.

**(b1) Description:**
Add to OAuth service: `authenticateWithJwtBearer(privateKey, username, audience)`. JWT assertion: iss=consumerKey, sub=username, aud=audience, signed with key. POST `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`. UI: "Advanced Auth" with cert upload. Store key encrypted (HKDF 'jwt_bearer').

**(b2) Tests:** 1. JWT correct claims. 2. Exchange returns token. 3. Key stored encrypted. 4. Works with ECA. 5. Invalid cert rejected.

**(c) Edge cases:** Customer uploads cert to their ECA. No refresh token — re-authenticate periodically. Audience: login.sf.com or test.sf.com.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 7.4: API Usage Tracking Dashboard

**(a) Objective:** Per-project daily tracking, throttle 80%, alert 90%. **Test:** Unit — 6 + component — 4 tests.

**(b1) Description:**
Backend: aggregate from onApiCall, store daily. Throttle: pause jobs >80%. Alert: notify >90%. Reset midnight UTC.
Frontend: daily chart, per-project breakdown, warning badges, 7-day trend.

**(b2) Tests (backend):** 1. Tracks daily. 2. Throttles 80%. 3. Alerts 90%. 4. Resets midnight. 5. Multiple connections. 6. Limits unavailable.
**(b2) Tests (frontend):** 1. Chart renders. 2. Warning badge 80%. 3. Critical badge 90%. 4. 7-day trend.

**(c) Edge cases:** Different editions = different limits — from /limits endpoint, not hardcoded.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 7.5: RCA Feature Parity Tracking

**(a) Objective:** Version-aware rules, auto-flag new automatable mappings. **Test:** Unit — 4 tests.

**(b1) Description:**
Extend Task 4.1 rules with `minimumRcaRelease`, `becameAvailableIn`. Admin UI for rule updates. Notify when org upgrades RCA.

**(b2) Tests:** 1. Filters by version. 2. Flags on upgrade. 3. Admin add/update. 4. Version comparison.

**(c) Edge cases:** 3 releases/year — UI updates, not code deploys.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

### Task 7.6: Compliance Documentation

**(a) Objective:** SOC 2 ready docs for credential handling, retention, access, incident response. **Test:** Document review.

**(b1) Description:**
`docs/compliance/`: DATA-HANDLING.md, ACCESS-CONTROLS.md, INCIDENT-RESPONSE.md (mass revocation, notification), ENCRYPTION-KEY-ROTATION.md, TOKEN-REVOCATION.md.

**(b2) Tests:** None. Peer + legal review.

**(c) Edge cases:** Keep updated as system evolves.

**(d) Quality gate:** N/A for docs.

---

### Task 7.7: Security Checklist — Full System Verification

**(a) Objective:** All §18 items verified across complete system. **Test:** Automated + manual audit.

**(b1) Description:**
Walk every §18 checklist item. Verify implementation. Write verification tests where possible. This is the final security gate.

**(b2) Tests:** Aggregated from all phases.

**(c) Edge cases:** Any failure blocks launch.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

## Queue Strategy

> Explicit decision per high-level architecture spec requirement.

**Phase 1-3: Postgres `jobQueue` table with worker polling.**

- Cloud-neutral, no additional infrastructure
- Worker polls every 2s with atomic claim (`UPDATE ... WHERE status = 'queued' RETURNING *`)
- Sufficient for <100 concurrent jobs
- Job types: `cpq_assessment`, `rca_deployment`, `browser_automation`, `health_check`, `retention_cleanup`

**Migration trigger to cloud queue (SQS / Cloud Tasks):**

- When Postgres CPU > 70% from polling queries
- When concurrent jobs regularly exceed 50
- When multi-region deployment is needed (workers closer to customer SF instances)

**Migration path:** Replace the worker's `job-poller.ts` with a cloud queue consumer. The control plane's "enqueue job" logic switches from `INSERT INTO jobQueue` to `sqs.sendMessage()` / `cloudTasks.createTask()`. The job handler interface stays unchanged — the handler receives the same `{ assessmentRunId }` payload regardless of queue transport.

---

## Worker Health & Monitoring

**Stale job detection:** A scheduled job (every 5 minutes) checks for runs stuck in `running` status with no progress event for >15 minutes. Marks them as `failed` with `lastError = 'Worker timeout — no progress for 15 minutes'`. This catches worker crashes.

**Worker health endpoint:** `GET /health` returns `{ status: 'ok', activeJobs: N, uptime: seconds }`. Used by Docker/Kubernetes liveness probes.

**Observability:** Worker logs use the same structured logging format as the API server (Task 2.8). Every Salesforce API call from the worker goes through `onApiCall` callback for unified logging.

**Auto-restart:** Docker `restart: unless-stopped` policy. If the worker crashes, Docker restarts it. The stale job detector marks the crashed job as failed; the user can retry.

---

## Quality Gate Reference

Every task MUST pass before commit + push:

```bash
pnpm format && pnpm lint && pnpm test && pnpm build
```

Fix → re-run ALL → commit when all pass → push immediately.

Commit scopes: `feat(salesforce):`, `feat(sf-extract):`, `feat(sf-mapping):`, `feat(sf-deploy):`, `feat(sf-browser):`, `feat(sf-enterprise):`.

---

## Task Dependency Graph

```
Phase 1:
  1.1 (ECA) + 1.16 (env) — first, parallel
  1.2 (encryption) — after 1.16
  1.3 (schema) → 1.4 (RLS) → 1.5 (contract) → 1.6 (Drizzle) → 1.7 (mock)
  1.8 (OAuth service) → 1.9 (rate limit) → 1.10 (connect) → 1.11 (callback) → 1.12 (audit)
  1.13 (status/disconnect) — after 1.6 + 1.8
  1.14 (UI) — after 1.10, 1.11, 1.13
  1.15 (mock mode) — after 1.7, 1.10
  1.17 (cleanup job) — after 1.6
  1.18 (customer guide) — anytime
  1.19 (security check) — last

Phase 2 (after P1):
  2.0 (worker foundation) — FIRST in P2
  2.0.1 (assessment run schema) — after 2.0
  2.0.2 (token-mint endpoint) — after 1.6 + 1.8
  2.0.3 (start assessment endpoint + UI) — after 2.0.1 + 2.0.2
  2.0.4 (assessment job handler) — after 2.0 + 2.0.2 + 2.5
  2.1 → 2.2 → 2.3; 2.4 parallel with 2.1
  2.5 after 2.1-2.4 (runs IN worker via 2.0.4)
  2.6, 2.7 after 2.5; 2.8 with 2.1

Phase 3 (after P2):
  3.1 + 3.2 parallel; 3.3 + 3.4 after 3.2; 3.5 after 3.1; 3.6 after 1.6
  3.7 after 1.13; 3.8 + 3.9 parallel with 3.1-3.7
  3.10 (storage) — after 1.3, used by P5 + P6

Phase 4 (after P2, overlap P3):
  4.0 (persistence schema) — first in P4
  4.1 → 4.2 → 4.3 → 4.4 (run in worker as part of assessment pipeline)
  4.5 (UI) after 4.2-4.4

Phase 5 (after P4):
  5.1 → 5.2 → 5.3 → 5.4 (run in worker as 'rca_deployment' job type)
  5.5 after 5.3; 5.6 after 5.3; 5.7 (UI) after 5.3, 5.5, 5.6

Phase 6 (after P5):
  6.1 → 6.2 → 6.3 (extend existing worker, NOT new app) → 6.4 → 6.5 + 6.6 → 6.7

Phase 7 (start 7.1-7.2 with P4-5):
  7.1 → 7.2 early; 7.3 after 7.1; 7.4 after 2.8; 7.5 after 4.1; 7.6 anytime; 7.7 last
```

## Database Migration Strategy

Each phase with new tables creates its own migration:

- **Phase 1:** salesforceConnections, salesforceConnectionSecrets, oauthPendingFlows, salesforceConnectionLogs + projects alterations
- **Phase 2:** cpqAssessmentRuns, cpqAssessmentRunEvents, cpqExtractedData
- **Phase 4:** mappingReports, migrationPlans, deploymentRuns, deploymentRunItems, validationRuns
- **Phase 6:** browserAutomationCredentials, browserAutomationResults
- **Phase 7:** potential apiUsage table

All migrations backward-compatible. `pnpm drizzle-kit generate` per phase, test on staging before production.

---

## Implementation Progress Tracker

| Task  | Description                                   | Status         | Commit |
| ----- | --------------------------------------------- | -------------- | ------ |
| 1.1   | Salesforce ECA Registration (Manual)          | ⬜ Not Started | —      |
| 1.2   | Encryption Utility                            | ⬜ Not Started | —      |
| 1.3   | Database Schema — Core Salesforce Tables      | ⬜ Not Started | —      |
| 1.4   | RLS Policies for Salesforce Tables            | ⬜ Not Started | —      |
| 1.5   | Repository Interfaces — Contract Package      | ⬜ Not Started | —      |
| 1.6   | Drizzle Repository Implementations            | ⬜ Not Started | —      |
| 1.7   | Mock Repository Implementations               | ⬜ Not Started | —      |
| 1.8   | OAuth Service                                 | ⬜ Not Started | —      |
| 1.9   | Rate Limiting for Salesforce Endpoints        | ⬜ Not Started | —      |
| 1.10  | OAuth Route — Connect Endpoint                | ⬜ Not Started | —      |
| 1.11  | OAuth Route — Callback Endpoint               | ⬜ Not Started | —      |
| 1.12  | Post-Connection Permission Audit              | ⬜ Not Started | —      |
| 1.13  | Status, Test, Disconnect, Reconnect Endpoints | ⬜ Not Started | —      |
| 1.14  | Client UI — Salesforce Connection Components  | ⬜ Not Started | —      |
| 1.15  | Mock Mode Support                             | ⬜ Not Started | —      |
| 1.16  | Environment Variables                         | ⬜ Not Started | —      |
| 1.17  | Pending Flow Cleanup Job                      | ⬜ Not Started | —      |
| 1.18  | Customer-Facing Setup Guide                   | ⬜ Not Started | —      |
| 1.19  | Security Checklist Verification — Phase 1     | ⬜ Not Started | —      |
| 2.0   | Worker App Foundation                         | ⬜ Not Started | —      |
| 2.0.1 | Assessment Run Data Model                     | ⬜ Not Started | —      |
| 2.0.2 | Internal Token-Mint Endpoint                  | ⬜ Not Started | —      |
| 2.0.3 | Start Assessment Endpoint + UI                | ⬜ Not Started | —      |
| 2.0.4 | Assessment Job Handler (Worker Side)          | ⬜ Not Started | —      |
| 2.1   | Salesforce REST API Client                    | ⬜ Not Started | —      |
| 2.2   | Bulk & Composite API Clients                  | ⬜ Not Started | —      |
| 2.3   | CPQ Object Discovery Service                  | ⬜ Not Started | —      |
| 2.4   | Extracted Data Schema + Repository            | ⬜ Not Started | —      |
| 2.5   | Data Extraction Engine                        | ⬜ Not Started | —      |
| 2.6   | CPQ Explorer UI                               | ⬜ Not Started | —      |
| 2.7   | Extraction Monitoring UI                      | ⬜ Not Started | —      |
| 2.8   | Structured API Logging                        | ⬜ Not Started | —      |
| 3.1   | Token Refresh Service                         | ⬜ Not Started | —      |
| 3.2   | Health Monitoring Job                         | ⬜ Not Started | —      |
| 3.3   | In-App Notifications                          | ⬜ Not Started | —      |
| 3.4   | Email Notifications                           | ⬜ Not Started | —      |
| 3.5   | Reconnect Flow                                | ⬜ Not Started | —      |
| 3.6   | Encryption Key Rotation                       | ⬜ Not Started | —      |
| 3.7   | Connection Logs UI                            | ⬜ Not Started | —      |
| 3.8   | Data Retention — Cleanup Job                  | ⬜ Not Started | —      |
| 3.9   | Data Retention — On-Demand Deletion           | ⬜ Not Started | —      |
| 3.10  | Storage Bucket Setup + Signed URL Service     | ⬜ Not Started | —      |
| 4.0   | Phase 4/5 Persistence Schema                  | ⬜ Not Started | —      |
| 4.1   | Mapping Rules Database                        | ⬜ Not Started | —      |
| 4.2   | Mapping Engine                                | ⬜ Not Started | —      |
| 4.3   | QCP Code Analyzer                             | ⬜ Not Started | —      |
| 4.4   | Migration Plan Generator                      | ⬜ Not Started | —      |
| 4.5   | Migration Analysis UI                         | ⬜ Not Started | —      |
| 5.1   | Coexistence Detection Service                 | ⬜ Not Started | —      |
| 5.2   | Deployment Plan Generator                     | ⬜ Not Started | —      |
| 5.3   | RCA Object Creation Service                   | ⬜ Not Started | —      |
| 5.4   | Metadata Artifact Generator                   | ⬜ Not Started | —      |
| 5.5   | Validation & Comparison Engine                | ⬜ Not Started | —      |
| 5.6   | Rollback Service                              | ⬜ Not Started | —      |
| 5.7   | Write-Back UI                                 | ⬜ Not Started | —      |
| 6.1   | Browser Automation Credentials Table + Repo   | ⬜ Not Started | —      |
| 6.2   | Browser Credentials UI + Consent Flow         | ⬜ Not Started | —      |
| 6.3   | Playwright Integration into Existing Worker   | ⬜ Not Started | —      |
| 6.4   | Salesforce Login Automation                   | ⬜ Not Started | —      |
| 6.5   | QLE Behavioral Capture                        | ⬜ Not Started | —      |
| 6.6   | Configurator Behavioral Capture               | ⬜ Not Started | —      |
| 6.7   | Behavioral Analysis Results + UI              | ⬜ Not Started | —      |
| 7.1   | 2GP Package Setup                             | ⬜ Not Started | —      |
| 7.2   | AppExchange Security Review                   | ⬜ Not Started | —      |
| 7.3   | JWT Bearer Flow                               | ⬜ Not Started | —      |
| 7.4   | API Usage Tracking Dashboard                  | ⬜ Not Started | —      |
| 7.5   | RCA Feature Parity Tracking                   | ⬜ Not Started | —      |
| 7.6   | Compliance Documentation                      | ⬜ Not Started | —      |
| 7.7   | Security Checklist — Full System Verification | ⬜ Not Started | —      |
