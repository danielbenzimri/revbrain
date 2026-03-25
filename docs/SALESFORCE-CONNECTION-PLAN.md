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

## 9. Implementation Tasks

### Phase A: Server-Side Foundation

| Task | Description | Depends on |
|---|---|---|
| A.1 | **Salesforce connection types** — Add Zod schemas and TypeScript types to `@revbrain/contract`: `SalesforceConnection`, `SalesforceConnectionStatus`, `CreateConnectionInput`, `ConnectionHealthResponse`. Add SOQL field constants for Products and Quotes. | — |
| A.2 | **Database schema** — Add Drizzle migration for `salesforce_connections` and `salesforce_pkce_state` tables. Add encryption helpers for token storage (AES-256-GCM using a `SF_TOKEN_ENCRYPTION_KEY` env var). | A.1 |
| A.3 | **Salesforce OAuth service** — Implement `SalesforceOAuthService` class with: `generateAuthorizeUrl(projectId, userId)` (PKCE generation + state storage), `handleCallback(code, state)` (token exchange + connection creation), `refreshAccessToken(connectionId)` (token refresh), `disconnect(connectionId)` (token revocation). Port the exact PKCE logic from `routes/salesforce.py`. | A.2 |
| A.4 | **Salesforce query service** — Implement `SalesforceQueryService` class with: `query(connectionId, soql)` (generic SOQL executor with auto-refresh), `getProducts(connectionId)`, `getQuotes(connectionId)`. Port the retry-on-401 pattern from `routes/cpq.py`. | A.3 |
| A.5 | **Mock Salesforce service** — Mock adapter returning fake products/quotes data for local/test mode. Same interface as real service. | A.1 |
| A.6 | **Salesforce routes** — Hono routes for OAuth flow + CPQ data endpoints. All org-scoped via `requireProjectAccess()` middleware. Add audit logging for connect/disconnect events. | A.3, A.4 |
| A.7 | **Tests** — Unit tests for OAuth service (PKCE generation, callback handling, token refresh), query service (SOQL execution, auto-refresh), mock service parity. Contract tests for repository. | A.5, A.6 |

### Phase B: Client-Side Connection UI

| Task | Description | Depends on |
|---|---|---|
| B.1 | **Connection hooks** — React Query hooks: `useSalesforceConnection(projectId)`, `useConnectSalesforce()` (mutation that opens OAuth popup/redirect), `useDisconnectSalesforce()`, `useTestConnection()`. | A.6 |
| B.2 | **Connect flow UI** — "Connect Source Org" button on workspace Overview → opens Salesforce login in new tab/popup → callback URL closes tab and refreshes connection status. Handle the redirect-back flow. | B.1 |
| B.3 | **Connection status card** — Show connected org info (name, type, health, last sync) on workspace Overview. Show "Disconnected" state with reconnect button. Update the existing `ConnectionCardData` mock to use real API. | B.1 |
| B.4 | **Connection health polling** — Periodic background check (every 5 min) that the connection is still valid. Show warning if token is about to expire or connection is degraded. | B.1 |

### Phase C: Environment & Deployment

| Task | Description | Depends on |
|---|---|---|
| C.1 | **Environment variables** — Add `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET`, `SF_TOKEN_ENCRYPTION_KEY` to `.env.local`, `.env.stg`, `.env.prod`. Add to CI/CD secrets. Document the Salesforce Connected App callback URL per environment. | — |
| C.2 | **Callback URL routing** — The OAuth callback URL must work in all environments. Options: (a) register multiple callback URLs in Connected App, (b) use environment-specific callback path, (c) use a single domain with environment routing. Recommend option (a) with per-env URLs. | C.1 |
| C.3 | **Edge Function compatibility** — Ensure the OAuth service works in Deno Edge Functions (Supabase). The `fetch` API is native in Deno, but crypto operations (AES-256-GCM) need the Web Crypto API instead of Node's `crypto` module. | A.3 |

---

## 10. Security Considerations

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

## 11. Environment-Specific Callback URLs

| Environment | Server URL | Callback URL (register in Connected App) |
|---|---|---|
| Local (mock) | `http://localhost:3000` | `http://localhost:3000/api/v1/salesforce/oauth/callback` |
| Staging | `https://api-stg.revbrain.io` | `https://api-stg.revbrain.io/api/v1/salesforce/oauth/callback` |
| Production | `https://api.revbrain.io` | `https://api.revbrain.io/api/v1/salesforce/oauth/callback` |

All three URLs must be registered as valid callback URLs in the Salesforce Connected App.

---

## 12. Testing Strategy

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

## 13. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Connected App callback URL change requires Salesforce admin | Deployment blocker | Register all environment URLs upfront |
| Token encryption key rotation | All connections invalidated | Key versioning — store key version with each encrypted token |
| Salesforce API rate limits | Extraction failures | Track API budget per connection, respect limits, batch queries |
| PKCE state table grows unbounded | DB bloat | TTL-based cleanup (5 min), cron job to purge expired rows |
| Sandbox orgs use different login URL | Auth failures | Auto-detect or let user specify org type during connection |
| CPQ package not installed in target org | SOQL errors | Detect CPQ presence before running CPQ-specific queries |

---

## 14. What Changes from the Prototype

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
