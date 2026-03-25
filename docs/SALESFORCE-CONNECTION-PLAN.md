# Salesforce Connection — Implementation Plan

> **Purpose:** Port the Salesforce OAuth + CPQ query prototype (FastAPI/Python) to RevBrain's production stack (Hono/TypeScript server + React client). This document provides full context for an external auditor, including the OAuth flow, security model, data flow, and task breakdown.
>
> **Date:** 2026-03-25
> **Author:** Daniel + Claude
> **Reference implementation:** `/Users/danielaviram/Downloads/salesforce-app-backend` (FastAPI prototype by Niv)

---

## 1. What the Prototype Proved

Niv's Python prototype successfully demonstrated:

1. **Salesforce Connected App** configured as an External Client App with PKCE OAuth
2. **PKCE Authorization Code flow** — browser redirects to Salesforce login, backend exchanges code for tokens
3. **Server-side token storage** — access/refresh tokens never sent to browser, only HttpOnly session cookie
4. **Automatic token refresh** — transparent retry on 401, browser unaware
5. **SOQL queries** — fetched CPQ products (`Product2` with `SBQQ__` fields) and quotes (`SBQQ__Quote__c`) via Salesforce REST API v59.0
6. **CSV export** — streamed quote data as downloadable CSV

### What the prototype did NOT do (and we need to add):
- Store credentials in a database (used in-memory dicts)
- Support multiple concurrent Salesforce connections per project
- Handle multi-tenant isolation (org-scoped access)
- Support sandbox vs. production org detection
- Store connection metadata (org name, org type, CPQ version, API version)
- Encrypt tokens at rest

---

## 2. Salesforce Connected App Configuration

The Connected App is already created in the Salesforce org. Here are the exact settings:

### Connected App Settings

| Setting | Value |
|---|---|
| App Name | `revBrainTest` |
| Contact Email | `niv@cpqdemo.com` |
| Distribution State | `Packaged` |
| Callback URL | `http://localhost:3000/api/v1/salesforce/oauth/callback` |
| OAuth Scopes | `id`, `api`, `refresh_token` (offline_access) |
| Enable Authorization Code + Credentials Flow | Yes |
| Require Secret for Web Server Flow | Yes |
| Require Secret for Refresh Token Flow | Yes |
| Require PKCE | Yes |

### Credentials (from prototype .env)

```
SALESFORCE_CLIENT_ID=<Consumer Key from Connected App — stored in .env.local, not in version control>
SALESFORCE_CLIENT_SECRET=<Consumer Secret from Connected App — stored in .env.local, not in version control>
```

> **Note:** The actual credentials are in the developer's `.env` file at `/Users/danielaviram/Downloads/salesforce-app-backend/.env`. Copy them to RevBrain's `.env.local` during setup. Never commit these values to version control.

> **Important:** These are the credentials for the **development/demo org**. Production deployments will need separate Connected Apps per customer org. The client_id and client_secret must be stored encrypted in the database, not in .env files, for the production implementation.

### Login URLs

| Org Type | Auth URL | Token URL |
|---|---|---|
| Production / Developer Edition | `https://login.salesforce.com/services/oauth2/authorize` | `https://login.salesforce.com/services/oauth2/token` |
| Sandbox | `https://test.salesforce.com/services/oauth2/authorize` | `https://test.salesforce.com/services/oauth2/token` |

---

## 3. OAuth Flow — PKCE Authorization Code

### Why PKCE?

PKCE (Proof Key for Code Exchange) prevents authorization code interception attacks. The browser never sees the `code_verifier` — only its SHA256 hash (`code_challenge`) travels through the browser. Even if an attacker intercepts the authorization code, they can't exchange it without the verifier.

### Complete Flow (from prototype, to be replicated)

```
1. Browser → RevBrain Server: GET /api/v1/salesforce/oauth/authorize
   Server generates:
   - code_verifier = random 64-byte URL-safe string
   - code_challenge = base64url(SHA256(code_verifier))
   - state = random 16-byte URL-safe string
   Server stores: state → code_verifier (in-memory in prototype, DB in production)
   Server responds: 307 Redirect to Salesforce authorize URL

2. Browser → Salesforce: Authorization URL with code_challenge
   User logs in, grants permissions
   Salesforce responds: 302 Redirect to callback with code + state

3. Browser → RevBrain Server: GET /api/v1/salesforce/oauth/callback?code=ABC&state=XYZ
   Server looks up code_verifier using state
   Server removes state from store (one-time use)

4. RevBrain Server → Salesforce: POST /oauth2/token
   Body: code + code_verifier + client_id + client_secret + redirect_uri
   Salesforce validates: SHA256(code_verifier) == code_challenge
   Salesforce responds: { access_token, refresh_token, instance_url, id, issued_at }

5. Server stores tokens in database (keyed by session_id or connection_id)
   Server sets HttpOnly cookie with session_id
   Server redirects browser to project workspace

6. Subsequent API calls: browser sends cookie, server uses stored tokens
   If access_token expires (401): server auto-refreshes using refresh_token
   If refresh_token also expired: server deletes session, returns 401
```

### Token Security Model

| Value | Where it lives | Accessible to JavaScript? |
|---|---|---|
| `access_token` | Server-side only (DB) | Never |
| `refresh_token` | Server-side only (DB) | Never |
| `client_secret` | Server-side only (env/DB) | Never |
| `session_id` cookie | Browser cookie (HttpOnly) | No — HttpOnly flag |
| `instance_url` | Returned to browser (non-sensitive) | Yes — display only |
| `code_verifier` | Server-side only (ephemeral) | Never |
| `code` | Passes through browser URL | Useless without verifier |

---

## 4. SOQL Queries — What Data We Fetch

### API Version: `v59.0`

### Products Query
```sql
SELECT Id, Name, ProductCode, Family,
       SBQQ__BillingType__c, SBQQ__ChargeType__c,
       SBQQ__SubscriptionPricing__c, SBQQ__SubscriptionTerm__c,
       IsActive
FROM Product2
WHERE IsActive = true
ORDER BY Name ASC
```

### Quotes Query
```sql
SELECT Id, Name, SBQQ__Status__c, SBQQ__Account__c,
       SBQQ__Opportunity2__c, SBQQ__ExpirationDate__c,
       SBQQ__Primary__c, SBQQ__NetAmount__c,
       SBQQ__GrandTotal__c, CreatedDate, LastModifiedDate
FROM SBQQ__Quote__c
ORDER BY CreatedDate DESC
```

### API Endpoint Pattern
```
GET {instance_url}/services/data/v59.0/query?q={SOQL}
Authorization: Bearer {access_token}
```

### Object Name Note
- Most CPQ orgs use `Product2` (standard object extended with `SBQQ__` fields)
- Some older installs use `SBQQ__Product__c` (custom CPQ product object)
- If query returns `sObject type 'SBQQ__Product__c' is not supported`, switch to `Product2`

---

## 5. Architecture Decisions for RevBrain

### How it maps to our stack

| Prototype (Python) | RevBrain (TypeScript) |
|---|---|
| FastAPI routes | Hono routes in `apps/server/src/v1/routes/` |
| `httpx.AsyncClient` | `node-fetch` or built-in `fetch` (Node 18+) |
| In-memory `_pkce_store` dict | Redis or database table for PKCE state (ephemeral, TTL 5 min) |
| In-memory `_session_store` dict | Database table `salesforce_connections` (encrypted tokens) |
| `.env` credentials | `.env` for dev, database `salesforce_app_credentials` table for multi-tenant |
| `Cookie: session_id` | RevBrain's existing auth session (JWT) — no separate cookie needed |
| Single-user | Multi-tenant, org-scoped, per-project connections |

### Key architectural choices

1. **No separate session cookie.** RevBrain already has JWT-based auth. The Salesforce connection tokens are stored per-project in the database. The user's JWT identifies which project they're accessing, and the project's connection record holds the tokens.

2. **Connection per project, not per user session.** Multiple team members access the same project. The Salesforce tokens belong to the project's connection, not to the individual user session. One person connects, everyone on the project can query.

3. **Tokens encrypted at rest.** `access_token` and `refresh_token` are encrypted before storing in the database. Decrypted only at query time.

4. **Triple adapter pattern.** Mock adapter for testing (returns fake data), real adapter for production (calls Salesforce API). Same interface, runtime-selected.

5. **Callback URL must be registered.** For production, the callback URL must be updated in the Connected App to match the production domain. For staging, a separate callback URL. We'll need to register multiple callback URLs or use a dynamic redirect.

6. **Cloud job for heavy Salesforce interaction.** The API server handles OAuth flow and lightweight queries (connection test, basic metadata). Heavy CPQ data extraction (full object inventory, record scanning, assessment analysis) is executed as a **long-running job on AWS/GCP**, not in the API server. The job receives the `connectionId` (or decrypted session credentials), runs bulk SOQL queries, processes results, and writes back to the database. The API server's role is:
   - **OAuth + token management** — connect, refresh, disconnect
   - **Job orchestration** — trigger extraction job, poll status, return results
   - **Lightweight queries** — connection test, basic org metadata, record counts

   The SOQL product/quote queries in the prototype's `cpq.py` are for testing the connection — not the production extraction path. In production, extraction is a separate service.

---

## 6. Database Schema

### New table: `salesforce_connections`

```sql
CREATE TABLE salesforce_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),

  -- Connection metadata (safe to display)
  org_name TEXT,                       -- e.g. "acme.my.salesforce.com"
  org_type TEXT,                       -- 'production' | 'sandbox' | 'developer'
  instance_url TEXT NOT NULL,          -- e.g. "https://na1.salesforce.com"
  sf_org_id TEXT,                      -- Salesforce org ID (from identity URL)
  sf_user_id TEXT,                     -- Salesforce user ID who connected
  cpq_version TEXT,                    -- Detected CPQ package version
  api_version TEXT DEFAULT 'v59.0',    -- Salesforce API version

  -- Encrypted tokens (NEVER returned to client)
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  token_issued_at TIMESTAMPTZ,

  -- Connection health
  status TEXT DEFAULT 'connected',     -- 'connected' | 'expired' | 'error' | 'disconnected'
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,

  -- Metadata
  connected_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- One active connection per project per direction (source/target)
CREATE UNIQUE INDEX idx_sf_conn_project ON salesforce_connections(project_id)
  WHERE status != 'disconnected';
```

### New table: `salesforce_pkce_state` (ephemeral)

```sql
CREATE TABLE salesforce_pkce_state (
  state TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  project_id UUID NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Auto-expire after 5 minutes
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '5 minutes')
);
```

---

## 7. API Endpoints

### OAuth Flow

| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/projects/:projectId/salesforce/authorize` | Generates PKCE, stores state, redirects to Salesforce login |
| `GET` | `/v1/salesforce/oauth/callback` | Callback from Salesforce — exchanges code for tokens, stores connection |
| `GET` | `/v1/projects/:projectId/salesforce/connection` | Returns connection status (instance_url, org_name, health — no tokens) |
| `POST` | `/v1/projects/:projectId/salesforce/disconnect` | Revokes tokens, marks connection as disconnected |
| `POST` | `/v1/projects/:projectId/salesforce/test` | Tests connection by making a lightweight API call |

### CPQ Data

| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/projects/:projectId/cpq/products` | Fetches active CPQ products via SOQL |
| `GET` | `/v1/projects/:projectId/cpq/quotes` | Fetches CPQ quotes via SOQL |
| `GET` | `/v1/projects/:projectId/cpq/query` | Runs arbitrary SOQL query (admin only) |

---

## 8. Implementation Approach — Two Steps

### Step 1: Replicate the exact prototype flow

First, we port the Python prototype logic to our TypeScript stack **without changing anything in the Salesforce Connected App**. Same callback URL (`http://localhost:3000/api/v1/salesforce/oauth/callback`), same credentials, same PKCE flow, same SOQL queries. The goal is to confirm the identical OAuth flow works from Node/Hono with the existing Connected App configuration.

**Definition of done for Step 1:** A developer can click "Connect Source Org" in RevBrain's local dev mode, get redirected to Salesforce login, authenticate, and see CPQ products returned in the browser — identical to what the FastAPI prototype does today.

### Step 2: Production hardening + Connected App updates

Once the flow is confirmed working, we update the Connected App to add staging/production callback URLs, implement token encryption, database storage, multi-tenant isolation, health monitoring, and the full client-side UI. We may also refactor the callback URL path if a cleaner route structure makes sense — but only after Step 1 is proven.

**Why this order matters:** If we change the Connected App settings and the Node implementation simultaneously, we can't tell whether a failure is a Salesforce config issue or a code bug. By keeping the Connected App untouched for Step 1, we isolate variables.

---

## 9. Workflow Instructions

Each task below has a clear objective and explicit test criteria. A task is considered **complete** only when:

1. The code is implemented and achieves the stated objective
2. Tests are written covering the test criteria listed
3. `pnpm lint` passes (or pre-existing errors only)
4. `pnpm test` passes (all tests green)
5. `pnpm build` passes (TypeScript compiles, client builds)
6. Changes are committed with a descriptive message
7. Changes are pushed to remote and CI passes
8. The task status in the tracker (Section 16) is updated to `✅ Done` with the commit hash

Do NOT proceed to the next task until the current task is fully complete and pushed.

---

## 10. Implementation Tasks

### Phase A: Server-Side Foundation (Step 1 — replicate prototype flow)

---

#### Task A.1: Salesforce connection types and constants

**Objective:** Define all TypeScript types, Zod schemas, and SOQL constants in `@revbrain/contract` so that server and client share the same Salesforce connection interface.

**What to build:**
- `packages/contract/src/salesforce/types.ts` — TypeScript types: `SalesforceConnection`, `SalesforceConnectionStatus` (`connected` | `expired` | `error` | `disconnected`), `SalesforceOrgType` (`production` | `sandbox` | `developer`), `ConnectionHealthResponse`
- `packages/contract/src/salesforce/schemas.ts` — Zod schemas: `createConnectionSchema`, `connectionResponseSchema`
- `packages/contract/src/salesforce/soql.ts` — SOQL field constants for `PRODUCT_FIELDS`, `QUOTE_FIELDS`, `SALESFORCE_API_VERSION` (ported from `cpq.py`)
- Export from `packages/contract/src/index.ts`

**Test criteria:**
- Zod schemas validate correct input and reject invalid input
- SOQL field arrays match the prototype's field lists exactly
- Types compile without errors

**Depends on:** —

---

#### Task A.2: Token encryption helpers

**Objective:** Implement AES-256-GCM encryption/decryption for Salesforce tokens, compatible with both Node.js and Deno (Web Crypto API).

**What to build:**
- `apps/server/src/lib/crypto.ts` — `encryptToken(plaintext, key)` → `{ciphertext, iv, tag}` and `decryptToken(encrypted, key)` → `plaintext`. Use Web Crypto API (`crypto.subtle`) for Deno compatibility. Fallback to Node `crypto` module for local dev.
- Add `SF_TOKEN_ENCRYPTION_KEY` to `.env.local` (generate a 32-byte hex key)

**Test criteria:**
- Encrypt → decrypt round-trip returns original value
- Different plaintexts produce different ciphertexts
- Decryption with wrong key throws an error
- Empty string encryption/decryption works
- IV is unique per encryption call (non-deterministic)

**Depends on:** —

---

#### Task A.3: Database schema for Salesforce connections

**Objective:** Add Drizzle schema and migration for `salesforce_connections` and `salesforce_pkce_state` tables.

**What to build:**
- `packages/database/src/schema/salesforce-connections.ts` — Drizzle table definitions matching the SQL schema in Section 6
- Migration file via `pnpm db:generate`
- `packages/database/src/schema/index.ts` — export new tables
- Seed data: one mock connection for the Q1 Migration project (for local/test mode)

**Test criteria:**
- `pnpm db:generate` produces a valid migration
- Schema types align with `@revbrain/contract` types from A.1
- Seed data loads without errors in mock mode

**Depends on:** A.1

---

#### Task A.4: PKCE OAuth service

**Objective:** Implement the PKCE Authorization Code flow — the exact same logic as `routes/salesforce.py`, ported to TypeScript.

**What to build:**
- `apps/server/src/services/salesforce-oauth.service.ts`
  - `generatePkce()` → `{ codeVerifier, codeChallenge }` (SHA256 + base64url, same as Python's `_generate_pkce`)
  - `generateAuthorizeUrl(projectId, userId)` → redirect URL (stores state → verifier in DB/memory)
  - `handleCallback(code, state)` → exchanges code for tokens, creates connection record
  - `refreshAccessToken(connectionId)` → uses refresh_token to get new access_token
  - `disconnect(connectionId)` → deletes connection record
- For Step 1: use in-memory maps for PKCE state (same as prototype). DB storage comes in Step 2.
- Environment: reads `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET` from env
- Hardcode `REDIRECT_URI` to `http://localhost:3000/api/v1/salesforce/oauth/callback` (same as prototype)
- Hardcode `login.salesforce.com` URLs (same as prototype)

**Test criteria:**
- `generatePkce()`: codeChallenge = base64url(SHA256(codeVerifier)), verified against a known test vector
- `generateAuthorizeUrl()`: returns URL with correct query params (response_type, client_id, redirect_uri, scope, code_challenge, code_challenge_method, state)
- `handleCallback()`: sends correct payload to token endpoint (mocked HTTP), stores tokens
- `handleCallback()`: rejects invalid/expired state
- `handleCallback()`: state is one-time use (second call with same state fails)
- `refreshAccessToken()`: sends refresh_token to token endpoint (mocked HTTP), updates stored access_token
- `refreshAccessToken()`: deletes session on failed refresh (expired refresh_token)
- `disconnect()`: removes connection record

**Depends on:** A.2, A.3

---

#### Task A.5: Salesforce query service

**Objective:** Implement SOQL query execution with automatic token refresh on 401 — same logic as `cpq.py`'s `_query_salesforce`.

**What to build:**
- `apps/server/src/services/salesforce-query.service.ts`
  - `query(connectionId, soql)` — generic SOQL executor. Hits `{instance_url}/services/data/v59.0/query?q={soql}` with Bearer token. On 401, calls `refreshAccessToken` and retries once.
  - `getProducts(connectionId)` — runs the Product2 SOQL query from prototype
  - `getQuotes(connectionId)` — runs the SBQQ__Quote__c SOQL query from prototype
  - `testConnection(connectionId)` — runs a lightweight query (`SELECT Id FROM Organization LIMIT 1`) to verify the connection is alive

**Note:** These query methods are for **connection testing and lightweight metadata retrieval only**. Heavy CPQ extraction (full inventory, scanning, assessment) runs as a separate cloud job (AWS/GCP), not through these endpoints.

**Test criteria:**
- `query()`: sends correct Authorization header and SOQL query param (mocked HTTP)
- `query()`: on 401 response, calls refresh then retries with new token
- `query()`: on second 401 after refresh, throws 401 (session expired)
- `query()`: on network error, throws 502
- `getProducts()`: constructs correct SOQL matching prototype's Product2 query
- `getQuotes()`: constructs correct SOQL matching prototype's SBQQ__Quote__c query
- `testConnection()`: returns true on 200, false on error

**Depends on:** A.4

---

#### Task A.6: Mock Salesforce service

**Objective:** Mock adapter for local/test mode that returns fake Salesforce data without making real API calls. Same interface as the real services.

**What to build:**
- `apps/server/src/services/salesforce-oauth.service.mock.ts` — mock OAuth service (returns fake authorize URL, stores mock connection, skips real token exchange)
- `apps/server/src/services/salesforce-query.service.mock.ts` — mock query service (returns fake products/quotes from seed data)
- Wire into existing mock mode detection (`USE_MOCK_DATA=true`)

**Test criteria:**
- Mock OAuth service returns a valid-looking authorize URL
- Mock callback creates a connection record with mock tokens
- Mock query service returns products array with correct field shape
- Mock and real services implement the same interface (contract test)
- Mock mode does not make any HTTP calls to external services

**Depends on:** A.1

---

#### Task A.7: Salesforce API routes

**Objective:** Expose the OAuth flow and query service via Hono routes, scoped to projects and protected by auth middleware.

**What to build:**
- `apps/server/src/v1/routes/salesforce.ts` — OAuth routes:
  - `GET /v1/projects/:projectId/salesforce/authorize` → calls OAuth service, returns redirect
  - `GET /v1/salesforce/oauth/callback?code=&state=` → calls handleCallback, redirects to project workspace
  - `GET /v1/projects/:projectId/salesforce/connection` → returns connection status (no tokens)
  - `POST /v1/projects/:projectId/salesforce/disconnect` → calls disconnect
  - `POST /v1/projects/:projectId/salesforce/test` → calls testConnection
- `apps/server/src/v1/routes/cpq.ts` — Data routes:
  - `GET /v1/projects/:projectId/cpq/products` → calls getProducts
  - `GET /v1/projects/:projectId/cpq/quotes` → calls getQuotes
- All routes use `requireProjectAccess()` middleware (except callback which uses state to look up project)
- Audit log for connect/disconnect events via `buildAuditContext(c)`

**Test criteria:**
- `/authorize` returns 307 redirect with correct Salesforce URL
- `/callback` with valid code/state creates connection and redirects to project
- `/callback` with invalid state returns 400
- `/connection` returns connection metadata (instance_url, org_name, status) without tokens
- `/disconnect` removes connection and returns success
- `/test` returns connection health status
- `/products` returns product array
- `/quotes` returns quote array
- All routes return 401 for unauthenticated requests
- All routes return 403 for wrong organization

**Depends on:** A.4, A.5, A.6

---

### Phase B: Client-Side Connection UI

---

#### Task B.1: Salesforce connection hooks

**Objective:** React Query hooks for all Salesforce connection operations, following existing hook patterns.

**What to build:**
- `apps/client/src/features/projects/hooks/use-salesforce-connection.ts`
  - `useSalesforceConnection(projectId)` — query hook returning connection status
  - `useConnectSalesforce(projectId)` — mutation that navigates to `/authorize` endpoint
  - `useDisconnectSalesforce(projectId)` — mutation calling `/disconnect`
  - `useTestConnection(projectId)` — mutation calling `/test`
  - Query key hierarchy: `['salesforce', projectId, 'connection']`

**Test criteria:**
- `useSalesforceConnection` fetches from correct endpoint
- `useConnectSalesforce` opens the authorize URL
- `useDisconnectSalesforce` calls disconnect endpoint and invalidates connection cache
- Hook returns loading/error/data states correctly

**Depends on:** A.7

---

#### Task B.2: Connect flow UI

**Objective:** "Connect Source Org" button that initiates the OAuth flow and handles the callback redirect back to RevBrain.

**What to build:**
- Update workspace Overview page: "Connect Source Org" button calls `useConnectSalesforce`
- OAuth popup/redirect flow: opens Salesforce login, after callback the browser returns to the project workspace
- Handle callback page: `/salesforce/oauth/callback` success page that auto-closes or redirects
- Show loading state during OAuth flow
- Error handling: display error message if OAuth fails

**Test criteria:**
- "Connect Source Org" button is visible when no connection exists
- Clicking button navigates to authorize URL
- After successful callback, connection status updates to "connected"
- Error state is displayed when callback returns an error
- Button is hidden when connection already exists

**Depends on:** B.1

---

#### Task B.3: Connection status card

**Objective:** Show the connected Salesforce org info on the workspace Overview, replacing mock data with real API data.

**What to build:**
- Update `ConnectionCardData` to use `useSalesforceConnection` hook
- Display: org name, org type, instance URL, connection health, last sync time
- "Disconnect" button with confirmation dialog
- "Test Connection" button
- "Reconnect" button when connection is expired/error

**Test criteria:**
- Shows "Connected" state with org details when connection exists
- Shows "Not Connected" state with connect button when no connection
- Disconnect button calls disconnect API and updates UI
- Test button calls test API and shows result
- Reconnect button initiates new OAuth flow

**Depends on:** B.1

---

#### Task B.4: Connection health polling

**Objective:** Periodically check connection health and surface warnings proactively.

**What to build:**
- Add `refetchInterval: 5 * 60 * 1000` (5 min) to `useSalesforceConnection` query
- Show warning badge on sidebar when connection is degraded
- Show error state when connection is expired
- Auto-refresh triggers re-auth prompt when refresh token expires

**Test criteria:**
- Connection status refreshes every 5 minutes
- Warning appears when status changes to "degraded" or "error"
- Expired connection shows re-auth prompt

**Depends on:** B.3

---

### Phase C: Environment & Deployment

---

#### Task C.1: Environment configuration

**Objective:** Set up environment variables for all environments and document the setup process.

**What to build:**
- Add `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET`, `SF_TOKEN_ENCRYPTION_KEY` to `.env.local`
- Add placeholder entries to `.env.stg` and `.env.prod` (values stored in CI/CD secrets)
- Add to GitHub Actions secrets configuration
- Update `CLAUDE.md` with Salesforce env var documentation

**Test criteria:**
- Local dev starts successfully with Salesforce env vars
- CI passes with mock mode (no real Salesforce credentials needed)
- Missing env vars produce clear error messages, not cryptic failures

**Depends on:** —

---

#### Task C.2: Callback URL configuration

**Objective:** Register all environment callback URLs in the Salesforce Connected App.

**What to build:**
- Update Connected App in Salesforce: add staging and production callback URLs
- Make callback URL configurable via env var (`SF_OAUTH_CALLBACK_URL`) instead of hardcoded
- Update OAuth service to use the env-based callback URL

**Test criteria:**
- OAuth flow works with env-configured callback URL
- Different environments use different callback URLs
- Missing callback URL env var falls back to localhost default

**Depends on:** C.1, A.4 (proven working in Step 1)

---

#### Task C.3: Edge Function compatibility

**Objective:** Ensure all crypto and HTTP operations work in Deno Edge Functions (Supabase).

**What to build:**
- Verify `crypto.subtle` (Web Crypto API) is used instead of Node `crypto` module
- Verify `fetch` is used instead of `node-fetch` or `httpx`
- Test OAuth service in Deno runtime
- Address any Deno-specific import or API differences

**Test criteria:**
- OAuth service runs in Deno without errors
- Token encryption/decryption works in Deno
- SOQL queries execute successfully from Edge Function

**Depends on:** A.4, C.1

---

## 11. Security Considerations

| Concern | Mitigation |
|---|---|
| Token theft via XSS | Tokens never sent to browser — stored server-side only |
| Token theft from database | Tokens encrypted at rest (AES-256-GCM) |
| Authorization code interception | PKCE — code is useless without code_verifier |
| CSRF on callback | State parameter validated + one-time use |
| Session hijacking | RevBrain's existing JWT auth — no separate session cookie |
| Multi-tenant token leakage | Org-scoped queries — project's organizationId checked on every request |
| Stale connections | Health check polling + automatic disconnect on repeated refresh failures |
| Credential rotation | Connected App credentials stored per-environment, rotatable independently |

---

## 12. Environment-Specific Callback URLs

| Environment | Server URL | Callback URL (register in Connected App) |
|---|---|---|
| Local (mock) | `http://localhost:3000` | `http://localhost:3000/api/v1/salesforce/oauth/callback` |
| Staging | `https://api-stg.revbrain.io` | `https://api-stg.revbrain.io/api/v1/salesforce/oauth/callback` |
| Production | `https://api.revbrain.io` | `https://api.revbrain.io/api/v1/salesforce/oauth/callback` |

All three URLs must be registered as valid callback URLs in the Salesforce Connected App.

---

## 13. Testing Strategy

| Layer | What to test | Approach |
|---|---|---|
| PKCE generation | `code_verifier` is cryptographically random, `code_challenge` = base64url(SHA256(verifier)) | Unit test with known inputs |
| Token exchange | Correct payload sent to Salesforce token endpoint | Unit test with mocked HTTP |
| Token refresh | Auto-retry on 401, session deletion on expired refresh_token | Unit test with mocked HTTP |
| SOQL queries | Correct query construction, response parsing | Unit test with mocked HTTP |
| Connection lifecycle | Create → query → refresh → disconnect | Integration test |
| Encryption round-trip | Encrypt token → store → retrieve → decrypt → original | Unit test |
| Multi-tenant isolation | User A cannot access User B's connection | Route-level test with different auth contexts |
| Mock parity | Mock adapter returns same shape as real adapter | Contract test |

---

## 14. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Connected App callback URL change requires Salesforce admin | Deployment blocker | Register all environment URLs upfront |
| Token encryption key rotation | All connections invalidated | Key versioning — store key version with each encrypted token |
| Salesforce API rate limits | Extraction failures | Track API budget per connection, respect limits, batch queries |
| PKCE state table grows unbounded | DB bloat | TTL-based cleanup (5 min), cron job to purge expired rows |
| Sandbox orgs use different login URL | Auth failures | Auto-detect or let user specify org type during connection |
| CPQ package not installed in target org | SOQL errors | Detect CPQ presence before running CPQ-specific queries |

---

## 15. What Changes from the Prototype

| Prototype | Production |
|---|---|
| Single `.env` with credentials | Per-environment env vars + encrypted DB storage |
| In-memory `_pkce_store` dict | Database table with TTL |
| In-memory `_session_store` dict | Database `salesforce_connections` table with encrypted tokens |
| Single user, single org | Multi-tenant, per-project connections |
| `Cookie: session_id` for auth | RevBrain JWT — no separate cookie |
| Port 3000 hardcoded | Environment-configured |
| `http://localhost:3000` callback | Per-environment callback URLs |
| No audit trail | Audit log for connect/disconnect/re-auth events |
| No health checks | Periodic connection health polling |
| Python `httpx` | Node `fetch` / Hono's built-in fetch |
| `hashlib.sha256` | Web Crypto API (`crypto.subtle.digest`) for Deno compatibility |

---

## 16. Task Tracker

> Track progress here. A task is complete only after lint, test, build pass and changes are pushed.

### Phase A: Server-Side Foundation (Step 1) — ALREADY IMPLEMENTED

> **Discovery (2026-03-25):** The entire server-side Salesforce implementation was already built by a prior sprint. All types, schemas, repositories (mock + Drizzle + PostgREST), OAuth service with PKCE/SSRF/signed state, audit service, routes, mock callback, and 35 unit tests are complete and passing. No server-side work is needed.

| Task | Objective | Status | Commit |
|---|---|---|---|
| A.1 | Salesforce connection types and constants in `@revbrain/contract` | ✅ Pre-existing | `packages/contract/src/index.ts` (Salesforce schemas lines 335-392), `repositories/types.ts` (lines 373-548) |
| A.2 | Token encryption helpers | ✅ Pre-existing | Handled by `salesforce-connection-secrets.repository.ts` (Drizzle adapter encrypts via pgcrypto) |
| A.3 | Database schema for connections + PKCE state | ✅ Pre-existing | `salesforce-connections`, `salesforce_connection_secrets`, `oauth_pending_flows`, `salesforce_connection_logs` tables |
| A.4 | PKCE OAuth service | ✅ Pre-existing | `services/salesforce-oauth.service.ts` — 354 lines, 35 passing tests |
| A.5 | Salesforce query service | ✅ Pre-existing | Test endpoint in routes; heavy extraction delegated to cloud jobs per architecture |
| A.6 | Mock Salesforce service | ✅ Pre-existing | Mock repos in `repositories/mock/salesforce-*.ts` + mock callback route |
| A.7 | Salesforce API routes | ✅ Pre-existing | `v1/routes/salesforce.ts` — connect, callback, list, disconnect, test (1035 lines) |

### Phase B: Client-Side Connection UI

| Task | Objective | Status | Commit |
|---|---|---|---|
| B.1 | Salesforce connection React Query hooks | ⬜ Not Started | — |
| B.2 | Connect flow UI (OAuth popup/redirect with postMessage) | ⬜ Not Started | — |
| B.3 | Connection status card on workspace Overview | ⬜ Not Started | — |
| B.4 | Connection health polling (5-min interval) | ⬜ Not Started | — |

### Phase C: Real Credentials & End-to-End Testing (Step 2)

| Task | Objective | Status | Commit |
|---|---|---|---|
| C.1 | Wire real Salesforce credentials from prototype `.env` into RevBrain `.env.local` | ⬜ Not Started | — |
| C.2 | End-to-end test: connect to real Salesforce org, verify CPQ data returns | ⬜ Not Started | — |
| C.3 | Update Connected App callback URL if needed for production | ⬜ Not Started | — |
