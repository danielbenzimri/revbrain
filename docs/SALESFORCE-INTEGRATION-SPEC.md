# Salesforce Integration Spec — Project-Level Connection

> **Status:** Draft v2 — under review
> **Author:** Daniel + Claude
> **Date:** 2026-03-23
> **Audience:** Engineering team, external reviewers, security auditors

---

## Table of Contents

1. [Context & Motivation](#1-context--motivation)
2. [User Story & Flow](#2-user-story--flow)
3. [The Core Problem: Connecting to a Customer's Salesforce](#3-the-core-problem-connecting-to-a-customers-salesforce)
4. [Connection Methods — Analysis](#4-connection-methods--analysis)
5. [Recommended Approach: OAuth 2.0 Web Server Flow](#5-recommended-approach-oauth-20-web-server-flow)
6. [Salesforce Connected App Setup](#6-salesforce-connected-app-setup)
7. [OAuth Flow — Step by Step](#7-oauth-flow--step-by-step)
8. [Token Storage & Security](#8-token-storage--security)
9. [Token Lifecycle Management](#9-token-lifecycle-management)
10. [Data Model Changes](#10-data-model-changes)
11. [API Design](#11-api-design)
12. [Multi-Org Architecture Considerations](#12-multi-org-architecture-considerations)
13. [Scopes & Permissions](#13-scopes--permissions)
14. [The CPQ Data Access Problem — The Bigger Picture](#14-the-cpq-data-access-problem--the-bigger-picture)
15. [Error Handling & Edge Cases](#15-error-handling--edge-cases)
16. [Security Checklist](#16-security-checklist)
17. [Tech Stack & Libraries](#17-tech-stack--libraries)
18. [Open Questions](#18-open-questions)
19. [Implementation Phases — Detailed Breakdown](#19-implementation-phases--detailed-breakdown)

---

## 1. Context & Motivation

### What is RevBrain?

RevBrain is a multi-tenant SaaS that helps Revenue Operations teams migrate from **Salesforce CPQ** (Configure, Price, Quote) to **Revenue Cloud Advanced (RCA)**. The typical customer is a Salesforce consulting partner / SI (Systems Integrator) that manages migrations for multiple end-clients.

### Why Salesforce Integration?

The entire value proposition of RevBrain depends on being able to:

1. **Read** the customer's CPQ configuration (Product2, PricebookEntry, SBQQ**Quote**c, pricing rules, etc.)
2. **Analyze** it to build a migration plan
3. **Write** the equivalent RCA configuration (ProductSellingModel, PSMRelationship, PricingPlan, etc.)

Without a live connection to the customer's Salesforce org, RevBrain is just a project management tool. The Salesforce connection is the product's core enabling capability.

### The Multi-Tenant Dimension

A single RevBrain tenant (e.g., "Acme Consulting") may be running migrations for 5–20 different end-clients simultaneously. Each end-client has their own Salesforce org with its own credentials, security policies, and data. This means:

- **One RevBrain tenant → many Salesforce orgs** (one per project)
- **Each project gets its own isolated Salesforce connection**
- **Credentials must never leak across projects or tenants**

---

## 2. User Story & Flow

### High-Level User Journey

```
Tenant admin creates a new project
  → Names it (e.g., "CPQ→RCA Migration — GlobalCorp Q2")
  → Fills in project details (stakeholders, timeline, contract ref)
  → Clicks "Connect Salesforce"
  → Redirected to Salesforce login page (of the end-client's org)
  → End-client admin logs in and grants access
  → Redirected back to RevBrain with connection confirmed
  → RevBrain can now read/write to that Salesforce org
```

### Who Performs the Connection?

The person connecting Salesforce is typically:

- The **end-client's Salesforce admin** — they own the org and can authorize access
- Or the **consulting partner's admin** who has admin credentials in the client's sandbox/production org

This distinction matters because the OAuth consent happens on the **end-client's Salesforce instance**, not on RevBrain's. The connector must have sufficient permissions in that Salesforce org.

---

## 3. The Core Problem: Connecting to a Customer's Salesforce

Salesforce offers several authentication mechanisms. We need one that:

| Requirement                           | Why                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------- |
| Works with any Salesforce org         | End-clients use different editions, security settings, IP restrictions |
| Doesn't require storing raw passwords | Security baseline — never store user passwords                         |
| Supports token refresh                | Migrations run for weeks/months; can't ask users to re-auth daily      |
| Respects Salesforce security policies | End-client may have MFA, IP allowlists, session policies               |
| Allows granular scope control         | We should request only what we need                                    |
| Works from a server (not browser)     | Data operations happen server-side, not in the user's browser          |
| Provides clear audit trail            | End-client needs to see what was authorized and can revoke it          |
| Supports sandbox and production       | Migrations typically start in sandbox, then move to production         |

---

## 4. Connection Methods — Analysis

### Option A: Username + Password + Security Token

**How it works:** User provides their Salesforce username, password, and security token. RevBrain uses the OAuth 2.0 Resource Owner Password Credentials flow.

| Pros                    | Cons                                                              |
| ----------------------- | ----------------------------------------------------------------- |
| Simple to implement     | Requires storing raw credentials — huge security risk             |
| No redirect flow needed | Breaks when MFA is enabled (increasingly mandatory)               |
|                         | Salesforce is deprecating this flow                               |
|                         | Tied to a specific user — if they leave, connection breaks        |
|                         | No consent screen — end-client can't see what they're authorizing |
|                         | Cannot use with orgs that enforce SSO                             |

**Verdict: Rejected.** Salesforce has announced deprecation. MFA enforcement makes it unreliable. Storing passwords is a liability.

---

### Option B: OAuth 2.0 Web Server Flow (Authorization Code Grant)

**How it works:** User is redirected to Salesforce to log in and grant access. Salesforce redirects back with an authorization code. RevBrain exchanges the code for access + refresh tokens server-side.

| Pros                                                   | Cons                                                  |
| ------------------------------------------------------ | ----------------------------------------------------- |
| Industry standard, well-documented                     | Requires redirect flow (slightly more complex UI)     |
| No passwords stored — only tokens                      | Needs a Salesforce Connected App configured           |
| Supports refresh tokens (long-lived access)            | Refresh tokens can be revoked by the Salesforce admin |
| Works with MFA, SSO, and all security policies         |                                                       |
| Clear consent screen — user sees requested permissions |                                                       |
| Not tied to a single user's credentials                |                                                       |
| Works with sandbox and production instances            |                                                       |
| Salesforce's recommended approach for server-side apps |                                                       |

**Verdict: Recommended.** This is the correct choice. See detailed design below.

---

### Option C: OAuth 2.0 JWT Bearer Flow (Server-to-Server)

**How it works:** RevBrain holds a private key. A Salesforce admin pre-authorizes a Connected App with the corresponding certificate. RevBrain generates JWT assertions signed with the private key to get access tokens without user interaction.

| Pros                                    | Cons                                                     |
| --------------------------------------- | -------------------------------------------------------- |
| No user interaction after initial setup | Complex setup — requires certificate exchange            |
| No refresh tokens to manage             | Requires Salesforce admin to upload certificate manually |
| Good for fully automated integrations   | Private key management is critical — leak = full access  |
|                                         | Less intuitive for non-technical end-clients             |
|                                         | Harder to scope to specific permissions                  |
|                                         | Each Salesforce org needs separate certificate setup     |

**Verdict: Not recommended for initial launch.** The setup burden on end-clients is too high. This is better suited for deep, long-running integrations where the end-client has a dedicated Salesforce admin team. Could be offered as an advanced option later for enterprise clients who prefer certificate-based auth.

---

### Option D: Salesforce CLI (sfdx) Token Forwarding

**How it works:** The user authenticates via the Salesforce CLI on their machine and exports the token for RevBrain to use.

| Pros                           | Cons                                        |
| ------------------------------ | ------------------------------------------- |
| Leverages existing dev tooling | Requires CLI installation on user's machine |
|                                | Token is short-lived, no built-in refresh   |
|                                | Not a web-native flow                       |
|                                | Terrible UX for non-developers              |

**Verdict: Rejected.** Not suitable for a SaaS product.

---

### Option E: Salesforce Connected App with Client Credentials Flow

**How it works:** OAuth 2.0 Client Credentials grant — app authenticates as itself (not as a user). Available since Spring '23.

| Pros                             | Cons                                                                       |
| -------------------------------- | -------------------------------------------------------------------------- |
| No user interaction needed       | Requires Salesforce admin to create & configure Connected App in their org |
| Simple token exchange            | Runs as a dedicated "integration user" — not a real person                 |
| Good for pure service-to-service | Limited adoption — relatively new in Salesforce ecosystem                  |
|                                  | End-client must set up a Connected App + execution user                    |
|                                  | Harder to audit "who did what" since actions run as the integration user   |

**Verdict: Future consideration.** Good for enterprise customers who want a service account pattern. Not suitable as the primary method because it pushes too much setup work to the end-client.

---

### Summary Matrix

| Method              | Security      | UX            | MFA-Safe | Maintainability | Recommendation      |
| ------------------- | ------------- | ------------- | -------- | --------------- | ------------------- |
| Username/Password   | Poor          | Simple        | No       | Deprecated      | Reject              |
| **Web Server Flow** | **Excellent** | **Good**      | **Yes**  | **Excellent**   | **Primary**         |
| JWT Bearer          | Excellent     | Complex setup | Yes      | Good            | Future (enterprise) |
| CLI Token           | Moderate      | Poor          | Yes      | Poor            | Reject              |
| Client Credentials  | Good          | Complex setup | N/A      | Good            | Future (enterprise) |

---

## 5. Recommended Approach: OAuth 2.0 Web Server Flow

### Why This Is Right for RevBrain

1. **Low friction for end-clients** — they just log in and click "Allow". No certificate exchanges, no CLI tools, no Connected App setup on their end.

2. **Security model aligns with our needs** — we get scoped tokens, not passwords. The end-client can see what was authorized and revoke access at any time from their Salesforce setup.

3. **Refresh tokens solve the long-running problem** — CPQ→RCA migrations take weeks or months. Refresh tokens let us maintain access without re-prompting the user.

4. **Battle-tested** — this is the same flow used by Dataloader.io, Ownbackup, Gearset, Copado, and every other Salesforce ISV. Salesforce AppExchange apps are required to use OAuth.

5. **Works everywhere** — production orgs, sandbox orgs, scratch orgs, Developer Edition. Any Salesforce instance with a login URL.

---

## 6. Salesforce Connected App Setup

### What Is a Connected App?

A Connected App is a registration in Salesforce that identifies an external application (RevBrain) and defines what it can do. Think of it as an OAuth client registration.

**Key distinction:** The Connected App is created in **RevBrain's Salesforce org** (or a dedicated Salesforce org we maintain for this purpose), not in each end-client's org. End-clients don't need to configure anything in their Salesforce setup.

### Configuration

We will create a single Connected App in a Salesforce org we control:

| Field                                      | Value                                                           |
| ------------------------------------------ | --------------------------------------------------------------- |
| Connected App Name                         | RevBrain                                                        |
| API Name                                   | RevBrain                                                        |
| Contact Email                              | security@revbrain.com                                           |
| Enable OAuth Settings                      | Yes                                                             |
| Callback URL                               | `https://app.revbrain.com/api/v1/salesforce/oauth/callback`     |
|                                            | `https://staging.revbrain.com/api/v1/salesforce/oauth/callback` |
|                                            | `http://localhost:5173/api/v1/salesforce/oauth/callback` (dev)  |
| Selected OAuth Scopes                      | See [Section 13](#13-scopes--permissions)                       |
| Require Secret for Web Server Flow         | Yes                                                             |
| Require Proof Key for Code Exchange (PKCE) | Yes (recommended)                                               |
| Enable Token Exchange Flow                 | No                                                              |

### Credentials We'll Store

From the Connected App, we get:

- **Consumer Key** (client_id) — public, can be in env vars
- **Consumer Secret** (client_secret) — secret, must be in env vars, never in code

These are **RevBrain's credentials**, not the end-client's. They are the same for all tenants and all projects.

---

## 7. OAuth Flow — Step by Step

### Phase 1: Initiation (RevBrain → Salesforce)

```
User clicks "Connect Salesforce" on their project page
  ↓
RevBrain frontend sends POST /v1/projects/:id/salesforce/connect
  with body: { instanceType: "production" | "sandbox" }
  ↓
Server generates:
  - state = sign({ projectId, orgId, userId, nonce }, secret) // CSRF protection
  - codeVerifier = crypto.randomBytes(64).toString('base64url') // PKCE
  - codeChallenge = sha256(codeVerifier).toString('base64url')
  - Store codeVerifier temporarily (cache/db, keyed by state, 10min TTL)
  ↓
Server returns redirect URL:
  https://login.salesforce.com/services/oauth2/authorize   ← production
  https://test.salesforce.com/services/oauth2/authorize      ← sandbox
  ?response_type=code
  &client_id={CONSUMER_KEY}
  &redirect_uri={CALLBACK_URL}
  &scope=api refresh_token
  &state={signed_state}
  &code_challenge={codeChallenge}
  &code_challenge_method=S256
  &prompt=login consent                    ← Force consent screen
  ↓
User's browser redirects to Salesforce
```

### Phase 2: Consent (Salesforce)

```
User logs in to their Salesforce org (MFA if required)
  ↓
Salesforce shows consent screen:
  "RevBrain is requesting access to:
   - Access and manage your data (api)
   - Perform requests at any time (refresh_token)"
  ↓
User clicks "Allow"
  ↓
Salesforce redirects to:
  {CALLBACK_URL}?code={authorization_code}&state={state}
```

### Phase 3: Token Exchange (RevBrain server-side)

```
GET /v1/salesforce/oauth/callback?code=xxx&state=yyy
  ↓
Server validates state (verify signature, check expiry, extract projectId)
  ↓
Server retrieves stored codeVerifier using state key
  ↓
Server exchanges code for tokens (server-to-server, POST):
  POST https://login.salesforce.com/services/oauth2/token
  Content-Type: application/x-www-form-urlencoded

  grant_type=authorization_code
  &code={authorization_code}
  &client_id={CONSUMER_KEY}
  &client_secret={CONSUMER_SECRET}
  &redirect_uri={CALLBACK_URL}
  &code_verifier={codeVerifier}
  ↓
Salesforce responds:
  {
    "access_token": "00D...",
    "refresh_token": "5Aep...",
    "instance_url": "https://globalcorp.my.salesforce.com",
    "id": "https://login.salesforce.com/id/00Dxx/005xx",
    "token_type": "Bearer",
    "issued_at": "1711152000000",
    "scope": "api refresh_token"
  }
  ↓
Server stores tokens securely (see Section 8)
  ↓
Server redirects user back to project page with success indicator
```

### Phase 4: Using the Connection

```
RevBrain needs to read CPQ data for this project
  ↓
Server retrieves access_token for this project's Salesforce connection
  ↓
Server calls Salesforce REST API:
  GET {instance_url}/services/data/v62.0/query?q=SELECT+Id,Name+FROM+Product2
  Authorization: Bearer {access_token}
  ↓
If 401 (token expired):
  → Use refresh_token to get new access_token (see Section 9)
  → Retry the request
```

---

## 8. Token Storage & Security

### The Challenge

Salesforce tokens are **extremely sensitive**. An access token grants full API access to the end-client's Salesforce org. A refresh token grants the ability to generate new access tokens indefinitely (until revoked). Leaking these tokens could expose the end-client's entire Salesforce data.

### Current State in RevBrain

Today, RevBrain stores no credentials in the database. All secrets (Supabase keys, Stripe keys, etc.) live in environment variables. This works because those are **RevBrain's own credentials** — there's one set per environment.

Salesforce tokens are different: **there's one set per project**. They must be in the database.

### Storage Design

#### Encryption at Rest

All Salesforce tokens will be encrypted before being written to the database using **AES-256-GCM** (authenticated encryption):

```
plaintext token → AES-256-GCM encrypt → { ciphertext, iv, authTag } → stored in DB
```

- **Encryption key**: Stored as an environment variable (`SALESFORCE_TOKEN_ENCRYPTION_KEY`), never in the database
- **Per-record IV**: Each token row gets a unique initialization vector (IV), generated via `crypto.randomBytes(12)`
- **Auth tag**: GCM mode produces an authentication tag that prevents tampering — if someone modifies the ciphertext, decryption fails
- **Key rotation**: Support key versioning (`key_version` column) to allow rotating the encryption key without re-encrypting all tokens at once

#### Why AES-256-GCM Over Alternatives

| Option              | Verdict                                                              |
| ------------------- | -------------------------------------------------------------------- |
| Store plaintext     | Unacceptable — DB breach = full compromise                           |
| Hashing             | Tokens need to be recovered (used in API calls) — hashing is one-way |
| AES-256-CBC         | No built-in integrity check — vulnerable to padding oracle attacks   |
| **AES-256-GCM**     | **Authenticated encryption — confidentiality + integrity + fast**    |
| Vault/KMS (AWS/GCP) | Best for scale, but adds infra dependency. Good future improvement   |

#### Database Table

See [Section 10](#10-data-model-changes) for the full schema. Key security columns:

```sql
encrypted_access_token   BYTEA NOT NULL    -- AES-256-GCM encrypted
encrypted_refresh_token  BYTEA NOT NULL    -- AES-256-GCM encrypted
encryption_iv            BYTEA NOT NULL    -- Unique per row, 12 bytes
encryption_auth_tag      BYTEA NOT NULL    -- GCM authentication tag
encryption_key_version   INTEGER NOT NULL  -- For key rotation
```

#### Access Controls

- Only the **server application** can decrypt tokens (it holds the encryption key)
- Database users (Supabase dashboard, support tools) see only ciphertext
- **Row-Level Security (RLS)**: Supabase RLS policies will prevent cross-tenant access even if someone bypasses the application layer
- **No client-side access**: Tokens are never sent to the browser. The client only sees connection status (connected/disconnected/error)

---

## 9. Token Lifecycle Management

### Access Token

- **Lifespan**: ~2 hours (Salesforce default, configurable per Connected App in the target org)
- **Usage**: Included as `Authorization: Bearer {token}` in every Salesforce API call
- **Refresh**: When a 401 is received, use the refresh token to get a new access token

### Refresh Token

- **Lifespan**: Indefinite by default, but can be configured by the Salesforce admin to expire
- **Usage**: Used only to obtain new access tokens
- **Revocation scenarios**:
  - End-client admin revokes access in Salesforce Setup → Connected Apps → Manage
  - End-client changes their security policy
  - The authorizing user's account is deactivated
  - The Connected App's consumer secret is rotated

### Refresh Flow

```
POST https://login.salesforce.com/services/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token={encrypted_refresh_token}  ← decrypted server-side before sending
&client_id={CONSUMER_KEY}
&client_secret={CONSUMER_SECRET}

Response:
{
  "access_token": "new_token...",
  "instance_url": "https://globalcorp.my.salesforce.com",
  "issued_at": "..."
}
```

Note: Salesforce does **not** return a new refresh token on refresh. The original refresh token remains valid.

### Connection Health Monitoring

RevBrain should track connection health and proactively notify users of issues:

| State                      | Meaning                                           | User Action                    |
| -------------------------- | ------------------------------------------------- | ------------------------------ |
| `active`                   | Tokens valid, API calls succeeding                | None                           |
| `token_expired`            | Access token expired, refresh succeeded           | None (automatic)               |
| `refresh_failed`           | Refresh token was revoked or expired              | User must re-authorize         |
| `instance_unreachable`     | Salesforce org is down or instance URL changed    | Check Salesforce status        |
| `insufficient_permissions` | Token works but user lacks required object access | End-client must adjust profile |
| `disconnected`             | User manually disconnected                        | Reconnect when ready           |

---

## 10. Data Model Changes

### New Table: `salesforce_connections`

This table stores one connection per project. A project can have at most one active Salesforce connection.

```sql
CREATE TABLE salesforce_connections (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id              UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Salesforce org identity
  salesforce_org_id       VARCHAR(18) NOT NULL,    -- e.g., "00Dxx0000001234"
  salesforce_instance_url TEXT NOT NULL,            -- e.g., "https://globalcorp.my.salesforce.com"
  salesforce_user_id      VARCHAR(18),             -- The user who authorized
  salesforce_username     TEXT,                     -- For display only
  instance_type           VARCHAR(10) NOT NULL,     -- "production" | "sandbox"
  api_version             VARCHAR(10) NOT NULL DEFAULT 'v62.0',

  -- Encrypted tokens (AES-256-GCM)
  encrypted_access_token  BYTEA NOT NULL,
  encrypted_refresh_token BYTEA NOT NULL,
  encryption_iv           BYTEA NOT NULL,
  encryption_auth_tag     BYTEA NOT NULL,
  encryption_key_version  INTEGER NOT NULL DEFAULT 1,

  -- Token metadata
  token_issued_at         TIMESTAMPTZ,
  token_scopes            TEXT,                     -- Space-separated scopes granted

  -- Connection state
  status                  VARCHAR(30) NOT NULL DEFAULT 'active',
  last_used_at            TIMESTAMPTZ,
  last_error              TEXT,
  last_error_at           TIMESTAMPTZ,

  -- Audit
  connected_by            UUID REFERENCES users(id),
  disconnected_by         UUID REFERENCES users(id),
  disconnected_at         TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Browser automation credentials (Phase 5, optional)
  encrypted_sf_username   BYTEA,                    -- AES-256-GCM encrypted (for Playwright login)
  encrypted_sf_password   BYTEA,                    -- AES-256-GCM encrypted
  encrypted_mfa_secret    BYTEA,                    -- AES-256-GCM encrypted (TOTP seed)
  browser_auth_status     VARCHAR(20) DEFAULT 'not_configured', -- 'not_configured' | 'active' | 'failed'

  -- Constraints
  UNIQUE (project_id)      -- One connection per project
);

-- Index for org-scoped queries
CREATE INDEX idx_sf_connections_org ON salesforce_connections(organization_id);
-- Index for health monitoring
CREATE INDEX idx_sf_connections_status ON salesforce_connections(status);
```

### New Table: `salesforce_connection_logs`

Audit trail for connection lifecycle events — separate from the main audit log because these are high-frequency and Salesforce-specific.

```sql
CREATE TABLE salesforce_connection_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id   UUID NOT NULL REFERENCES salesforce_connections(id) ON DELETE CASCADE,
  event           VARCHAR(50) NOT NULL,    -- 'connected', 'refreshed', 'refresh_failed', 'disconnected', 'reconnected'
  details         JSONB,                   -- Error messages, metadata
  performed_by    UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Changes to Existing Tables

**`projects` table** — add project detail fields (discussed in user story):

```sql
ALTER TABLE projects ADD COLUMN stakeholders JSONB;           -- [{ name, role, email }]
ALTER TABLE projects ADD COLUMN contract_reference TEXT;       -- External contract ID
ALTER TABLE projects ADD COLUMN client_company_name TEXT;      -- The end-client company
ALTER TABLE projects ADD COLUMN estimated_objects INTEGER;     -- Estimated # of CPQ objects to migrate
```

---

## 11. API Design

### Salesforce Connection Endpoints

All endpoints are org-scoped and require authentication. The user must have `operator` role or higher on the project.

```
# Initiate OAuth flow
POST /v1/projects/:projectId/salesforce/connect
  Body: { instanceType: "production" | "sandbox" }
  Response: { redirectUrl: "https://login.salesforce.com/..." }

# OAuth callback (called by Salesforce redirect)
GET /v1/salesforce/oauth/callback?code=xxx&state=yyy
  → Exchanges code for tokens, stores encrypted, redirects to project page

# Get connection status
GET /v1/projects/:projectId/salesforce/connection
  Response: {
    status: "active",
    instanceUrl: "https://globalcorp.my.salesforce.com",
    salesforceUsername: "admin@globalcorp.com",
    instanceType: "sandbox",
    connectedAt: "2026-03-20T...",
    connectedBy: { id, name, email },
    lastUsedAt: "2026-03-23T..."
  }
  Note: Never returns tokens to the client

# Disconnect
POST /v1/projects/:projectId/salesforce/disconnect
  → Revokes tokens at Salesforce, marks connection as disconnected
  → Logs audit event

# Reconnect (re-initiate OAuth after a revocation)
POST /v1/projects/:projectId/salesforce/reconnect
  Body: { instanceType: "production" | "sandbox" }
  Response: { redirectUrl: "..." }

# Test connection (verify tokens work)
POST /v1/projects/:projectId/salesforce/test
  → Makes a lightweight API call (e.g., GET /services/data/) to verify access
  Response: { healthy: true, apiVersion: "v62.0", orgId: "00Dxx..." }
```

### RBAC for Salesforce Endpoints

| Action                           | Required Role                                |
| -------------------------------- | -------------------------------------------- |
| Connect / Reconnect / Disconnect | `org_owner`, `admin`                         |
| View connection status           | `org_owner`, `admin`, `operator`, `reviewer` |
| Test connection                  | `org_owner`, `admin`, `operator`             |

**Rationale:** Connecting a Salesforce org is a high-trust action (it grants RevBrain access to client data). Only org-level admins should initiate or terminate connections. Operators need to see status and test connectivity to do their work.

---

## 12. Multi-Org Architecture Considerations

### One Connected App, Many Salesforce Orgs

RevBrain maintains **one** Connected App (our OAuth client registration). When a user from any Salesforce org clicks "Allow", they are granting **our** Connected App access to **their** org.

```
RevBrain Connected App (one)
  ├── Project A → GlobalCorp Salesforce Org (tokens A)
  ├── Project B → MegaCorp Salesforce Org (tokens B)
  ├── Project C → GlobalCorp Sandbox (tokens C)      ← Same client, different env
  └── Project D → StartupCo Salesforce Org (tokens D) ← Different tenant's project
```

### Tenant Isolation

- Tokens are stored with `organization_id` — RLS enforces that Tenant X cannot access Tenant Y's connections
- Server-side queries always filter by the authenticated user's organization
- The `project_id` UNIQUE constraint prevents multiple connections per project
- Cross-tenant queries are impossible through the application layer (same pattern as existing repos)

### Sandbox vs Production

Salesforce has different login URLs:

| Environment   | Login URL                            | Use Case                    |
| ------------- | ------------------------------------ | --------------------------- |
| Production    | `https://login.salesforce.com`       | Live data migration         |
| Sandbox       | `https://test.salesforce.com`        | Testing, validation         |
| Custom Domain | `https://{domain}.my.salesforce.com` | Orgs with My Domain enabled |

RevBrain should:

1. Ask the user which environment they're connecting to (production or sandbox)
2. Use the correct login URL for the OAuth flow
3. Store the `instance_type` so it's visible in the UI
4. Optionally support custom domain login URLs in the future

---

## 13. Scopes & Permissions

### Requested OAuth Scopes

| Scope           | Purpose                                    | Required?                    |
| --------------- | ------------------------------------------ | ---------------------------- |
| `api`           | Access Salesforce REST & SOAP APIs         | Yes — core functionality     |
| `refresh_token` | Obtain refresh token for long-lived access | Yes — migrations span weeks  |
| `id`            | Access user identity information           | Yes — display who authorized |

### Scopes We Explicitly Do NOT Request

| Scope         | Why Not                                       |
| ------------- | --------------------------------------------- |
| `full`        | Grants everything including setup. Too broad. |
| `web`         | Browser-based access — we're server-side      |
| `chatter_api` | Social features — irrelevant                  |
| `wave_api`    | Analytics — irrelevant                        |
| `content`     | File management — not needed initially        |

### Principle of Least Privilege

We request only `api` + `refresh_token` + `id`. This gives us:

- CRUD access to standard and custom objects (Product2, PricebookEntry, SBQQ\_\_\* , etc.)
- Query access via SOQL
- Metadata API access (to read field definitions, object schemas)
- Tooling API access (useful for reading CPQ configuration)

We do **not** get:

- Setup/admin access (unless the authorizing user has it)
- The ability to modify security settings
- Access to Salesforce files/content

The actual data access is further limited by the **authorizing user's profile and permission sets** in Salesforce. If the user who authorizes can't see SBQQ**Quote**c, RevBrain can't see it either.

---

## 14. The CPQ Data Access Problem — The Bigger Picture

> **This is the most important section of this document.** OAuth is necessary but not sufficient. CPQ does not have its own standalone API — it's a managed package sitting on top of Salesforce, and accessing its data requires understanding three distinct layers.

### The Uncomfortable Truth About CPQ Data

Salesforce CPQ (formerly Steelbrick) is a **managed package** — it installs custom objects (all prefixed `SBQQ__`) into a standard Salesforce org. Unlike a standalone product with its own API, CPQ piggybacks on Salesforce's standard APIs. This has major implications:

1. **Most CPQ config data IS accessible via standard APIs** — good news
2. **Some CPQ behavior is ONLY observable in a live browser** — bad news
3. **There is NO official Salesforce migration tool** — this is our opportunity

### Layer 1: API-Accessible Data (OAuth is enough)

Everything in this layer can be read via SOQL queries and the Salesforce REST API, using the OAuth tokens we obtain in Section 7. This is the majority of CPQ configuration.

**Core Quoting Objects:**
| Object | What It Stores | API Access |
|---|---|---|
| `SBQQ__Quote__c` | Quote records | Full SOQL/REST |
| `SBQQ__QuoteLine__c` | Individual line items on a quote | Full SOQL/REST |
| `SBQQ__QuoteLineGroup__c` | Groups of quote lines | Full SOQL/REST |
| `SBQQ__QuoteDocument__c` | Generated document records | Full SOQL/REST |

**Rules Engine (all readable via API):**
| Object | What It Stores | API Access |
|---|---|---|
| `SBQQ__PriceRule__c` | Price rules (conditions → actions that modify pricing) | Full SOQL/REST |
| `SBQQ__PriceCondition__c` | Conditions that trigger price rules | Full SOQL/REST |
| `SBQQ__PriceAction__c` | Actions executed when price rule fires | Full SOQL/REST |
| `SBQQ__ProductRule__c` | Product rules (validation, selection, filter, alert) | Full SOQL/REST |
| `SBQQ__ProductAction__c` | Actions for product rules | Full SOQL/REST |
| `SBQQ__ErrorCondition__c` | Error conditions for product rules | Full SOQL/REST |
| `SBQQ__ConfigurationRule__c` | Ties product rules to specific bundles | Full SOQL/REST |
| `SBQQ__LookupQuery__c` | Lookup queries used by rules | Full SOQL/REST |

**Product Configuration:**
| Object | What It Stores | API Access |
|---|---|---|
| `SBQQ__ProductOption__c` | Bundle options (child products in a bundle) | Full SOQL/REST |
| `SBQQ__Feature__c` | Feature groups within bundles | Full SOQL/REST |
| `SBQQ__ConfigurationAttribute__c` | Configuration attributes | Full SOQL/REST |

**Pricing:**
| Object | What It Stores | API Access |
|---|---|---|
| `SBQQ__DiscountSchedule__c` | Volume/tiered discount definitions | Full SOQL/REST |
| `SBQQ__DiscountTier__c` | Individual tiers in a discount schedule | Full SOQL/REST |
| `SBQQ__BlockPrice__c` | Block pricing records | Full SOQL/REST |

**Templates & Documents:**
| Object | What It Stores | API Access |
|---|---|---|
| `SBQQ__QuoteTemplate__c` | Quote document templates (fonts, colors, layout) | Full SOQL/REST |
| `SBQQ__TemplateSection__c` | Sections within a template | Full SOQL/REST |
| `SBQQ__TemplateContent__c` | Content items within sections | Full SOQL/REST |
| `SBQQ__LineColumn__c` | Column definitions for line item tables | Full SOQL/REST |

**Subscriptions & Amendments:**
| Object | What It Stores | API Access |
|---|---|---|
| `SBQQ__Subscription__c` | Active subscriptions | Full SOQL/REST |
| `SBQQ__SubscribedAsset__c` | Subscribed asset records | Full SOQL/REST |

**Custom Actions & QCP Source Code:**
| Object | What It Stores | API Access |
|---|---|---|
| `SBQQ__CustomAction__c` | Custom action button definitions | Full SOQL/REST |
| `SBQQ__CustomScript__c` | **QCP JavaScript source code** (in `SBQQ__Code__c` field) | Full SOQL/REST |

> **Key insight:** The QCP (Quote Calculator Plugin) JavaScript source code is stored in a regular custom object field (`SBQQ__CustomScript__c.SBQQ__Code__c`, a Long Text Area up to 131,072 characters). We CAN retrieve it with a simple SOQL query. When QCPs exceed this character limit, developers put the overflow logic in **Static Resources**, which are also retrievable via the Metadata API.

**What this means for RevBrain:** With just the OAuth connection, we can extract the VAST majority of CPQ configuration — all the rules, all the products, all the pricing, all the templates, and even the QCP source code. This is the foundation of the migration analysis.

### Layer 2: Server-Side CPQ API (OAuth is enough, but specialized calls)

Salesforce provides a dedicated CPQ API via the `SBQQ.ServiceRouter` global Apex class. This is NOT a REST API in the usual sense — it's an Apex REST endpoint that wraps CPQ-specific operations:

| Operation                 | What It Does                                       | Why We Need It                                               |
| ------------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| **Calculate Quote API**   | Triggers full CPQ price calculation on a quote     | Validates that our understanding of pricing rules is correct |
| **Save Quote API**        | Saves a CPQ quote (triggers all rules/QCP)         | Needed to test migration output                              |
| **Generate Document API** | Generates a quote PDF document                     | For comparing migrated quote output vs original              |
| **Read Quote API**        | Reads a quote with all calculated fields populated | Gets the "true" calculated state, not just raw field values  |

These are accessible via the same OAuth tokens — they're just Apex REST callouts. We call them via:

```
POST {instance_url}/services/apexrest/SBQQ/ServiceRouter
```

**What this means for RevBrain:** We can programmatically trigger CPQ calculations to verify our migration mapping is correct. "Does our RCA configuration produce the same price as the original CPQ configuration?" — answerable via API.

### Layer 3: Browser-Only Behavior (OAuth is NOT enough)

This is where it gets hard. Some CPQ behaviors **only exist in the browser** because they depend on:

1. **JavaScript executing in the Quote Line Editor (QLE)** — a Lightning component
2. **Visualforce page rendering** — for document generation
3. **Browser-side plugin execution** — QCP `isFieldVisible()` and `isFieldEditable()` methods that control the UI

#### What ONLY works in a browser:

**1. QCP Runtime Behavior**

The QCP has 7 hook methods. Some run server-side (via the Calculate API), but two are **browser-only**:

| QCP Method            | Runs Where       | What It Does                                  |
| --------------------- | ---------------- | --------------------------------------------- |
| `onInit`              | Server + Browser | Initialization logic                          |
| `onBeforeCalculate`   | Server + Browser | Pre-calculation logic                         |
| `onBeforePriceRules`  | Server + Browser | Runs before price rules evaluate              |
| `onAfterPriceRules`   | Server + Browser | Runs after price rules evaluate               |
| `onAfterCalculate`    | Server + Browser | Post-calculation logic                        |
| **`isFieldVisible`**  | **Browser ONLY** | Controls which fields are visible in the QLE  |
| **`isFieldEditable`** | **Browser ONLY** | Controls which fields are editable in the QLE |

The visibility/editability methods have no API equivalent. They execute in the browser's JavaScript runtime when a user opens the Quote Line Editor. To observe their effects, you need to literally render the QLE in a browser and inspect the DOM.

**2. Product Configurator Interactive Behavior**

The Product Configurator (the guided selling / bundle configuration UI) reads Configuration Rules and Product Options from the database — those are extractable via API. But the **interactive behavior** — which options appear/disappear based on selections, dynamic filtering, constraint validation — renders only in the browser. The rules are data; the experience is code + data + browser.

**3. Custom Action Button Behavior**

Custom Actions (`SBQQ__CustomAction__c`) are buttons that appear in the QLE or Configurator. Their record definitions are API-readable, but their runtime behavior (which may invoke Flows, Apex, or JavaScript) only executes when clicked in the browser.

**4. Quote Document PDF Rendering**

Quote Templates are API-readable (structure, fonts, colors). But the actual PDF rendering — with merge fields resolved, conditional sections shown/hidden, and Visualforce rendering — happens server-side within Salesforce and can only be triggered and viewed as a final output.

#### Why does this matter for migration?

For a **complete** CPQ→RCA migration, RevBrain needs to understand not just "what are the rules?" (API-extractable) but "what does the user actually experience?" (browser-observable). Without understanding the QLE field visibility logic and configurator behavior, the RCA equivalent might be functionally correct but have a completely different user experience — which the end-client will reject.

### The Dedicated User Requirement

To run browser automation against a Salesforce org, we need **actual login credentials** — a username and password that can authenticate through the Salesforce login page in a real browser. OAuth tokens cannot be used to log into the Salesforce UI; they only work for API calls.

#### Why a Dedicated "RevBrain Integration User"

The end-client should create a **dedicated Salesforce user** for RevBrain's browser automation. Here's why:

| Reason                             | Explanation                                                                                                                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Audit trail**                    | All actions in Salesforce are attributed to a user. A dedicated user (e.g., `revbrain-integration@globalcorp.com`) makes it clear which actions were automated vs. human.                                      |
| **Permission control**             | The end-client can assign a specific Profile and Permission Sets that grant exactly the access RevBrain needs — no more, no less.                                                                              |
| **No personal credential sharing** | Nobody's personal password is stored in RevBrain. The integration user's password is purpose-built.                                                                                                            |
| **Revocable**                      | The end-client can deactivate the integration user at any time to instantly cut off all RevBrain access (both API and browser).                                                                                |
| **MFA consideration**              | The integration user can be configured with a specific MFA policy. Salesforce allows IP-based MFA exemptions for trusted IP ranges, or the end-client can use a TOTP app whose secret is shared with RevBrain. |
| **Session management**             | Dedicated user sessions won't conflict with real users' sessions.                                                                                                                                              |

#### Credential Storage for Browser Automation

These credentials (username + password, optionally MFA seed) require a **different storage model** than OAuth tokens:

```
┌─────────────────────────────────────────────────────┐
│           salesforce_connections (per project)       │
│                                                     │
│  OAuth Tokens (Layer 1 & 2):                       │
│    encrypted_access_token   ← AES-256-GCM          │
│    encrypted_refresh_token  ← AES-256-GCM          │
│                                                     │
│  Browser Credentials (Layer 3) — OPTIONAL:          │
│    encrypted_username       ← AES-256-GCM          │
│    encrypted_password       ← AES-256-GCM          │
│    encrypted_mfa_secret     ← AES-256-GCM (TOTP)   │
│    browser_auth_status      ← active/inactive       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

> **Critical security note:** Storing passwords is fundamentally riskier than storing OAuth tokens. OAuth tokens can be scoped and the end-client can revoke them from their admin console. A password, if leaked, gives full login access. This is why the dedicated integration user with minimal permissions is essential — it limits the blast radius.

### Browser Automation Architecture

For the features that require a live browser, RevBrain will use **Playwright** (headless Chromium) running server-side:

```
RevBrain Server
  ↓
Playwright (headless Chrome)
  ↓ logs in as integration user
Salesforce UI
  ↓ navigates to QLE / Configurator
  ↓ executes interactions
  ↓ captures DOM state, screenshots, field visibility
  ↓
RevBrain extracts behavioral data
```

#### Why Playwright specifically?

| Feature                  | Why It Matters                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| Headless Chromium        | No GPU/display needed — runs on any server                                                    |
| Multi-browser support    | Chromium, Firefox, WebKit — but we only need Chromium                                         |
| Auto-wait                | Automatically waits for elements to be ready — critical for Salesforce's slow Lightning UI    |
| Network interception     | Can capture Salesforce API calls the UI makes internally — useful for understanding data flow |
| Screenshot/video capture | Can record the session for debugging and audit                                                |
| TypeScript-native        | First-class TypeScript support — fits our stack                                               |
| Battle-tested in CI      | Used by our existing E2E tests (Playwright is already in the monorepo)                        |

#### Where Does Playwright Run?

Playwright requires a **real server** — it cannot run in Deno Edge Functions or serverless environments. This is an architectural consideration:

| Option                               | Pros                                                               | Cons                                                    | Recommendation            |
| ------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------- |
| **Dedicated worker server**          | Full control, persistent browser sessions, predictable performance | Infra cost, need to manage scaling                      | Best for production       |
| **Job queue + ephemeral containers** | Scale to zero when idle, cost-efficient                            | Cold start time (~5-10s for browser launch), complexity | Good for intermittent use |
| **User's local machine**             | No infra cost, natural for developer workflows                     | Security (code runs locally), not a SaaS experience     | Reject for SaaS           |

**Recommendation:** Use the existing `jobQueue` table to schedule browser automation tasks. A dedicated worker process (Node.js, not Deno) picks up jobs, launches Playwright, executes the automation, stores results, and marks the job complete. This worker can run on a VPS, a container (Docker), or a dedicated cloud VM.

### The Two-Connection Model

Putting it all together, each project has **two types of Salesforce connection**:

```
Project "CPQ→RCA Migration — GlobalCorp"
│
├── Connection Type 1: OAuth (required)
│   ├── Used for: API data extraction (Layer 1 & 2)
│   ├── How established: OAuth 2.0 Web Server Flow
│   ├── Credentials: access_token + refresh_token
│   ├── Who authorizes: Any Salesforce admin (one-click)
│   └── Covers: ~85% of migration data needs
│
└── Connection Type 2: Browser Credentials (optional, for advanced analysis)
    ├── Used for: UI behavior capture (Layer 3)
    ├── How established: End-client creates dedicated user, enters creds in RevBrain
    ├── Credentials: username + password + MFA secret
    ├── Who provides: End-client's Salesforce admin
    └── Covers: QLE field visibility, configurator behavior, custom action testing
```

**Phase 1 of the product does NOT need browser automation.** The OAuth-based API access covers the vast majority of migration analysis. Browser automation is a Phase 3+ feature for customers who need behavioral analysis of complex QCP and configurator setups.

---

## 15. Error Handling & Edge Cases

### OAuth Flow Errors

| Error                             | Cause                                        | Handling                                            |
| --------------------------------- | -------------------------------------------- | --------------------------------------------------- |
| `state` mismatch                  | CSRF attempt or expired session              | Show error, ask user to retry                       |
| User denies consent               | Clicked "Deny" on Salesforce consent screen  | Show friendly message, explain why access is needed |
| Invalid authorization code        | Code expired (10-min window) or already used | Ask user to retry                                   |
| `invalid_grant` on token exchange | Org security policy blocked it               | Surface Salesforce error message                    |

### Runtime Errors

| Error                    | Cause                                | Handling                                         |
| ------------------------ | ------------------------------------ | ------------------------------------------------ |
| 401 on API call          | Access token expired                 | Auto-refresh, retry once                         |
| 401 after refresh        | Refresh token revoked                | Mark connection as `refresh_failed`, notify user |
| 403 on specific object   | Insufficient permissions             | Log which object, surface to user with guidance  |
| `UNABLE_TO_LOCK_ROW`     | Salesforce record locking            | Retry with exponential backoff (max 3 attempts)  |
| `REQUEST_LIMIT_EXCEEDED` | Hit Salesforce API limits            | Back off, surface to user, suggest scheduling    |
| Network timeout          | Salesforce downtime or network issue | Retry with backoff, mark connection health       |

### Edge Cases

1. **User revokes access mid-migration** — The next API call fails. RevBrain detects the revoked token, marks the connection as `refresh_failed`, and notifies the project team. Work in progress is preserved in RevBrain; only the live connection is lost.

2. **Salesforce org is migrated to a new instance** — The `instance_url` changes. Salesforce's OAuth flow handles this: token refresh returns the new `instance_url`. RevBrain should update the stored URL on each refresh.

3. **Same Salesforce org connected to two different projects** — Allowed (different project = different migration scope). Each project gets its own tokens. This supports the scenario where a client has a sandbox project and a production project for the same org.

4. **Connected App secret is rotated** — All existing refresh tokens continue to work with the old secret for a grace period (Salesforce supports this). RevBrain should plan for a rotation procedure documented in runbooks.

5. **User who authorized the connection leaves the company** — Their Salesforce account may be deactivated, which revokes the refresh token. RevBrain detects this and prompts another admin to re-authorize.

---

## 16. Security Checklist

- [ ] **No plaintext tokens in database** — all tokens AES-256-GCM encrypted
- [ ] **Encryption key in env vars only** — never in code, DB, or logs
- [ ] **PKCE enforced** — prevents authorization code interception
- [ ] **State parameter signed** — prevents CSRF on OAuth callback
- [ ] **Tokens never sent to client** — browser only sees connection status
- [ ] **RLS on salesforce_connections** — org-scoped, no cross-tenant access
- [ ] **Audit logging** — all connect/disconnect/refresh events logged
- [ ] **Token revocation on disconnect** — actively revoke at Salesforce, don't just delete locally
- [ ] **HTTPS only** — callback URL must be HTTPS (except localhost dev)
- [ ] **Refresh token rotation** — if Salesforce enables it, store the new refresh token
- [ ] **Secrets scanning** — CI pipeline checks for leaked tokens in code
- [ ] **Access logging** — log which user/project triggered each Salesforce API call
- [ ] **Rate limiting** — prevent abuse of the OAuth initiation endpoint
- [ ] **Browser credentials encrypted** — username, password, MFA secret all AES-256-GCM encrypted (Phase 5)
- [ ] **Dedicated integration user guidance** — documented instructions for end-clients on creating a least-privilege user
- [ ] **Playwright sessions isolated** — each project's browser session runs in an isolated context, no cookie/state leakage between projects
- [ ] **Browser sessions short-lived** — Playwright sessions are closed after each job, not left running
- [ ] **Screenshots access-controlled** — captured screenshots are stored in project-scoped storage, never publicly accessible

---

## 17. Tech Stack & Libraries

### Server-Side (Hono API)

| Purpose                        | Library                              | Why                                                                            |
| ------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------ |
| HTTP client for Salesforce API | `undici` or native `fetch`           | Both available in Node + Deno; no external dependency needed                   |
| Encryption (AES-256-GCM)       | Node.js `crypto` / Web Crypto API    | Built-in, no dependencies. `crypto.subtle` for Deno compat                     |
| PKCE code verifier/challenge   | Node.js `crypto`                     | `randomBytes` + `createHash('sha256')`                                         |
| State token signing            | `jose` (already likely used for JWT) | Lightweight, works in both runtimes                                            |
| Salesforce REST API wrapper    | `jsforce` (optional)                 | Popular, typed, handles auth — but adds dependency. Consider raw `fetch` first |

### Recommendation: Start with raw `fetch`

`jsforce` is convenient but large (~200KB) and Node-centric. Since RevBrain runs on Deno edge functions, raw `fetch` with a thin wrapper is safer:

```typescript
// packages/contract/src/salesforce/client.ts
class SalesforceClient {
  constructor(private instanceUrl: string, private accessToken: string) {}

  async query<T>(soql: string): Promise<QueryResult<T>> { ... }
  async sobject(name: string): SObjectAPI { ... }
  async describe(objectName: string): DescribeResult { ... }
}
```

This keeps the Salesforce interaction layer runtime-agnostic and testable.

### Client-Side (React)

| Purpose                     | Approach                                              |
| --------------------------- | ----------------------------------------------------- |
| "Connect Salesforce" button | Opens popup or redirects to the OAuth URL             |
| Connection status display   | React Query hook polling `GET /salesforce/connection` |
| Disconnect confirmation     | Modal with clear warning about losing access          |

---

## 18. Open Questions

> These need team discussion before implementation.

1. **Popup vs redirect for OAuth flow?**
   - **Popup**: Better UX (user stays on project page, popup closes after auth). More complex to implement (postMessage coordination).
   - **Redirect**: Simpler. User leaves RevBrain, comes back after auth. Slight UX friction.
   - **Recommendation**: Start with redirect, consider popup later.

2. **Should we support My Domain login URLs?**
   - Some Salesforce orgs use custom login URLs (e.g., `https://globalcorp.my.salesforce.com`). The standard `login.salesforce.com` should work for all orgs, but custom domains offer a more familiar login experience.
   - **Recommendation**: Start with standard URLs, add custom domain support if requested.

3. **Should the JWT Bearer flow be offered as an alternative for enterprise tenants?**
   - Some enterprise clients may prefer certificate-based auth for security compliance.
   - **Recommendation**: Defer to Phase 2 or 3.

4. **How do we handle Salesforce API rate limits?**
   - Salesforce enforces API call limits per 24-hour period (varies by edition).
   - Should RevBrain track usage? Show warnings? Implement client-side throttling?
   - **Recommendation**: Track usage, surface in UI, implement server-side throttling.

5. **Should we use Supabase Vault for token encryption?**
   - Supabase has a Vault extension (built on `pgsodium`) for encrypting sensitive data.
   - Pro: Database-native encryption, key management handled by Supabase.
   - Con: Vendor lock-in, less portable, newer feature.
   - **Recommendation**: Evaluate Supabase Vault vs application-level AES-256-GCM. Both are valid. Application-level gives us more control and portability.

6. **What Salesforce API version should we target?**
   - Salesforce releases 3 API versions per year. Older versions are eventually retired.
   - **Recommendation**: Default to latest stable (v62.0 as of early 2026), store per-connection, allow override.

7. **Do we need to handle Salesforce DX scratch orgs?**
   - Scratch orgs are ephemeral and typically used by developers, not migration targets.
   - **Recommendation**: Not in initial scope.

---

## 19. Implementation Phases — Detailed Breakdown

> This section is written so anyone — including non-technical stakeholders — can understand what each phase delivers, what work is involved, and how long it should realistically take.

---

### Phase 1: OAuth Connection & Verification

**What the user gets:** "I can connect my project to a Salesforce org and see that it works."

**Why this first:** Everything else depends on having a working, secure connection to Salesforce. Without this, we cannot read any data, run any analysis, or provide any value beyond project management.

#### Step 1.1: Salesforce Connected App Registration

**What:** Register RevBrain as a Connected App in a Salesforce org we control. This is a one-time manual setup in Salesforce Setup UI — not code.

**Who does it:** One team member with Salesforce admin access.

**Detailed steps:**

1. Log into our Salesforce Developer Edition org (or create one — it's free)
2. Go to Setup → App Manager → New Connected App
3. Fill in app name ("RevBrain"), contact email, enable OAuth
4. Add callback URLs for localhost, staging, and production
5. Select scopes: `api`, `refresh_token`, `id`
6. Enable PKCE, require client secret for web server flow
7. Save — Salesforce generates the Consumer Key and Consumer Secret
8. Copy Consumer Key and Consumer Secret into our env vars

**Output:** `SALESFORCE_CONSUMER_KEY` and `SALESFORCE_CONSUMER_SECRET` environment variables configured in `.env.local`, `.env.stg`, and `.env.prod`.

**Effort:** ~1 hour. This is a configuration task, not a development task.

#### Step 1.2: Database Schema — `salesforce_connections` Table

**What:** Create the Drizzle schema and migration for storing Salesforce connections.

**Detailed steps:**

1. Add the `salesforceConnections` table definition to `packages/database/src/schema.ts` — following the existing pattern (see `projects` table for reference)
2. Add the `salesforceConnectionLogs` table for audit events
3. Add new columns to the `projects` table: `stakeholders`, `contractReference`, `clientCompanyName`, `estimatedObjects`
4. Generate the Drizzle migration: `pnpm drizzle-kit generate`
5. Run against staging: `pnpm db:push`
6. Add RLS policies in Supabase Dashboard (org-scoped, same pattern as existing tables)

**Output:** Tables exist in the database, queryable via Drizzle, protected by RLS.

**Effort:** ~3-4 hours including migration testing.

#### Step 1.3: Token Encryption Utility

**What:** A utility module that encrypts and decrypts Salesforce tokens using AES-256-GCM. This is the most security-critical piece of code in the entire integration.

**Detailed steps:**

1. Create `apps/server/src/lib/encryption.ts`
2. Implement `encrypt(plaintext, key) → { ciphertext, iv, authTag }` using Node.js `crypto` module
3. Implement `decrypt(ciphertext, iv, authTag, key) → plaintext`
4. Ensure compatibility with Web Crypto API (for Deno edge function runtime)
5. Generate a 256-bit encryption key: `openssl rand -base64 32` → set as `SALESFORCE_TOKEN_ENCRYPTION_KEY` env var
6. Write comprehensive tests (encrypt → decrypt roundtrip, tamper detection, different key rejection)

**Output:** `encrypt()` and `decrypt()` functions with full test coverage. A generated encryption key in env vars.

**Effort:** ~3-4 hours including thorough testing.

#### Step 1.4: Salesforce Connection Repository

**What:** The repository layer (contract interface + Drizzle implementation + mock implementation) for CRUD operations on Salesforce connections. Follows the existing dual-adapter pattern.

**Detailed steps:**

1. Define `SalesforceConnectionEntity` and `SalesforceConnectionRepository` interface in `packages/contract/src/repositories/types.ts`
2. Implement `DrizzleSalesforceConnectionRepository` in `apps/server/src/repositories/drizzle/`
   - `create()` — encrypts tokens before storing
   - `findByProjectId()` — decrypts tokens after reading
   - `update()` — handles re-encryption on token refresh
   - `delete()` — hard delete (we have the audit log table for history)
3. Implement `MockSalesforceConnectionRepository` in `apps/server/src/repositories/mock/`
   - In-memory store, no actual encryption (mock mode doesn't need it)
   - Pre-populated with a mock connection for the seed projects
4. Add mock seed data in `packages/seed-data/src/salesforce-connections.ts`
5. Register the new repository in the `Repositories` container
6. Write tests for both implementations

**Output:** Full CRUD repository for Salesforce connections, testable in mock mode.

**Effort:** ~6-8 hours.

#### Step 1.5: OAuth Flow Endpoints

**What:** Three server endpoints that implement the OAuth 2.0 Web Server Flow with PKCE.

**Endpoint 1: `POST /v1/projects/:projectId/salesforce/connect`**

- Validates the user has `org_owner` or `admin` role on the project
- Validates no existing active connection (or prompts to disconnect first)
- Generates PKCE code verifier + challenge
- Signs a `state` parameter containing `{ projectId, orgId, userId, nonce, exp }`
- Stores the code verifier temporarily (in the `jobQueue` table or a short-lived DB row, keyed by nonce, 10-minute TTL)
- Returns the Salesforce authorization URL

**Endpoint 2: `GET /v1/salesforce/oauth/callback`**

- Receives `code` and `state` from Salesforce redirect
- Validates and decodes the `state` (checks signature, expiry)
- Retrieves the stored code verifier
- Exchanges the authorization code for tokens (server-to-server POST to Salesforce)
- Extracts org ID, instance URL, user ID from the token response
- Encrypts the access token and refresh token
- Stores everything in `salesforce_connections`
- Logs a `connected` event in `salesforce_connection_logs`
- Logs an audit event in the main `audit_logs` table
- Redirects the user's browser back to the project page with `?sf_connected=true`

**Endpoint 3: `POST /v1/projects/:projectId/salesforce/disconnect`**

- Validates `org_owner` or `admin` role
- Decrypts the refresh token
- Calls Salesforce's token revocation endpoint to actively revoke access
- Updates the connection record: `status = 'disconnected'`, `disconnected_by`, `disconnected_at`
- Logs events in both audit tables

**Detailed steps:**

1. Create `apps/server/src/v1/routes/salesforce.ts` with the Hono router
2. Implement the three endpoints above
3. Create a `SalesforceOAuthService` in `apps/server/src/services/salesforce-oauth.ts` to encapsulate the token exchange logic (keeps routes thin)
4. Add Zod schemas for request validation in `packages/contract/`
5. Register the router in the main app
6. Write tests (mocking the Salesforce token endpoint)

**Output:** A user can click "Connect Salesforce", get redirected to Salesforce, log in, grant access, and come back to RevBrain with a working connection.

**Effort:** ~8-10 hours (this is the core of Phase 1).

#### Step 1.6: Connection Status & Test Endpoints

**What:** Endpoints for checking and testing the Salesforce connection.

**Endpoint 4: `GET /v1/projects/:projectId/salesforce/connection`**

- Returns connection status, instance URL, connected user, timestamps
- **Never returns tokens** — only metadata
- Accessible by any project member (operator, reviewer, admin, owner)

**Endpoint 5: `POST /v1/projects/:projectId/salesforce/test`**

- Decrypts the access token
- Makes a lightweight Salesforce API call: `GET {instance_url}/services/data/` (returns API version info)
- If 401, attempts a token refresh and retries
- Returns `{ healthy: true/false, apiVersion, orgId, error? }`

**Effort:** ~3-4 hours.

#### Step 1.7: Client UI — Connection Flow

**What:** React components for initiating, viewing, and managing the Salesforce connection on the project page.

**Detailed steps:**

1. Add a "Salesforce Connection" section to the project settings or workspace page
2. **Disconnected state:** Shows a "Connect Salesforce" button + environment selector (Production/Sandbox)
3. **Connecting state:** Loading indicator during OAuth redirect
4. **Connected state:** Shows green badge, instance URL, connected user, last used time, "Test Connection" button, "Disconnect" button
5. **Error state:** Shows red badge with error message and "Reconnect" button
6. Use React Query to poll connection status
7. Add disconnect confirmation modal ("This will revoke RevBrain's access to GlobalCorp's Salesforce. Are you sure?")
8. Handle the `?sf_connected=true` query param after OAuth redirect (show success toast)
9. Add translations for all new strings (English + Hebrew)

**Output:** Full UI for managing the Salesforce connection within a project.

**Effort:** ~6-8 hours.

#### Step 1.8: Mock Mode Support

**What:** Make `pnpm local` (mock mode) work with a simulated Salesforce connection.

**Detailed steps:**

1. Mock repository returns pre-configured connection data for seed projects
2. The "Connect Salesforce" button in mock mode shows a simulated success flow (no actual OAuth redirect)
3. The "Test Connection" endpoint in mock mode always returns healthy
4. This lets us develop the UI and test flows without a real Salesforce org

**Effort:** ~2-3 hours.

#### Step 1.9: Tests

**What:** Comprehensive test coverage for all Phase 1 code.

**What to test:**

1. Encryption roundtrip (encrypt → decrypt = original)
2. Encryption tamper detection (modified ciphertext → error)
3. OAuth state signing and validation
4. PKCE code verifier/challenge generation
5. Token exchange (mock the Salesforce HTTP responses)
6. Connection CRUD operations
7. RBAC enforcement (operator can't connect, admin can)
8. Token refresh logic
9. Disconnect + Salesforce revocation

**Effort:** ~4-6 hours.

#### Phase 1 Total

| Component             | Effort                               |
| --------------------- | ------------------------------------ |
| Connected App setup   | ~1 hour                              |
| Database schema       | ~3-4 hours                           |
| Token encryption      | ~3-4 hours                           |
| Repository layer      | ~6-8 hours                           |
| OAuth flow endpoints  | ~8-10 hours                          |
| Status/test endpoints | ~3-4 hours                           |
| Client UI             | ~6-8 hours                           |
| Mock mode             | ~2-3 hours                           |
| Tests                 | ~4-6 hours                           |
| **Total**             | **~36-48 hours of focused dev work** |

> **What this means practically:** For a single developer working full-time, Phase 1 is achievable in **1-2 weeks**. For a team of 2 splitting frontend/backend, **~1 week**.

---

### Phase 2: CPQ Data Extraction

**What the user gets:** "I can see all my CPQ configuration data inside RevBrain — products, rules, pricing, templates, everything."

**Why this second:** The connection is useless if we can't do anything with it. This phase turns "connected" into "useful" by extracting and displaying the CPQ data that's accessible via API.

#### Step 2.1: Salesforce API Client

**What:** A thin, runtime-agnostic wrapper around the Salesforce REST API.

**Detailed steps:**

1. Create `apps/server/src/services/salesforce-client.ts`
2. Implement core methods:
   - `query<T>(soql: string)` — SOQL queries with pagination (Salesforce returns max 2000 records per response, with `nextRecordsUrl` for pagination)
   - `queryAll<T>(soql: string)` — Auto-paginating version that fetches all records
   - `describe(objectName: string)` — Object metadata (fields, types, relationships)
   - `describeGlobal()` — List all objects in the org
   - `getRecord(objectName, id)` — Single record by ID
   - `createRecord(objectName, data)` — Create a record (needed later for RCA write-back)
   - `updateRecord(objectName, id, data)` — Update a record
3. Built-in token refresh: if any call returns 401, automatically refresh the token, update the stored encrypted token, and retry
4. Rate limiting awareness: read the `Sforce-Limit-Info` response header (Salesforce includes remaining API calls in every response)
5. Request logging: log every Salesforce API call with project ID, method, and duration (for debugging and billing)
6. Error classification: translate Salesforce error codes into RevBrain-friendly errors

**Why raw `fetch` and not `jsforce`:** The `jsforce` library is popular but it's ~200KB, Node.js-centric, and has its own auth management that conflicts with our encrypted token storage. A thin wrapper using native `fetch` (available in both Node and Deno) gives us full control and keeps the bundle small for edge functions.

**Effort:** ~6-8 hours.

#### Step 2.2: CPQ Object Discovery

**What:** Automatically detect which CPQ objects exist in the connected Salesforce org and what version of CPQ is installed.

**Why this matters:** Not every org has every CPQ object. Some orgs have CPQ features disabled. Some have older versions of the managed package. RevBrain needs to dynamically discover what's available rather than assuming a fixed schema.

**Detailed steps:**

1. Query `SELECT Id, NamespacePrefix, MajorVersion, MinorVersion FROM Publisher WHERE NamespacePrefix = 'SBQQ'` to detect CPQ package version
2. Use `describeGlobal()` to get all objects, filter for `SBQQ__` prefix
3. For each discovered CPQ object, call `describe()` to get field metadata (field names, types, picklist values, required fields)
4. Store the discovered schema in RevBrain (in the `salesforce_connections` metadata or a dedicated `cpq_schemas` table)
5. Present a "CPQ Inventory" view showing what was discovered

**Effort:** ~4-6 hours.

#### Step 2.3: Data Extraction Engine

**What:** Extract all CPQ configuration data from the connected org and store it in RevBrain for analysis.

**Detailed steps:**

1. Define extraction jobs — one per object category (products, rules, pricing, templates, etc.)
2. Use the `jobQueue` table to track extraction progress
3. For each object, run SOQL queries to fetch all records with all fields
4. Store extracted data in a `cpq_extracted_data` table (or project-scoped JSONB storage)
5. Handle Salesforce query limits: batch queries, respect API call limits, implement backoff
6. Show extraction progress in the UI (progress bar with "Extracting Price Rules... 245/312")
7. Support incremental extraction (only fetch records modified since last extraction)

**Key SOQL queries:**

```sql
-- Products with CPQ extensions
SELECT Id, Name, ProductCode, IsActive, SBQQ__AssetConversion__c,
       SBQQ__BillingFrequency__c, SBQQ__BillingType__c, SBQQ__ChargeType__c,
       SBQQ__SubscriptionPricing__c, SBQQ__SubscriptionTerm__c, SBQQ__SubscriptionType__c
FROM Product2

-- Bundle structure
SELECT Id, SBQQ__ConfiguredSKU__c, SBQQ__OptionalSKU__c, SBQQ__Feature__c,
       SBQQ__Number__c, SBQQ__Quantity__c, SBQQ__Required__c, SBQQ__Selected__c,
       SBQQ__Type__c, SBQQ__QuantityEditable__c
FROM SBQQ__ProductOption__c

-- Price Rules (the core of pricing logic)
SELECT Id, Name, SBQQ__Active__c, SBQQ__ConditionsMet__c,
       SBQQ__EvaluationEvent__c, SBQQ__EvaluationOrder__c,
       SBQQ__TargetObject__c
FROM SBQQ__PriceRule__c

-- QCP source code
SELECT Id, Name, SBQQ__Code__c, SBQQ__GroupFields__c,
       SBQQ__QuoteFields__c, SBQQ__QuoteLineFields__c
FROM SBQQ__CustomScript__c
```

**Effort:** ~10-14 hours (this is the meatiest step in Phase 2).

#### Step 2.4: CPQ Data Visualization UI

**What:** Display the extracted CPQ data in a structured, navigable UI within the project workspace.

**Detailed steps:**

1. Add a "CPQ Explorer" tab/page to the project workspace
2. Show object categories in a sidebar (Products, Bundles, Price Rules, Product Rules, Templates, QCP)
3. For each category, show a searchable/filterable table of records
4. For each record, show a detail view with all fields
5. For rules, show a visual representation (condition → action)
6. For bundles, show a tree view (parent product → features → options)
7. For QCP, show the JavaScript source code with syntax highlighting
8. Show relationship maps (which rules reference which products, etc.)

**Effort:** ~10-14 hours.

#### Step 2.5: Extraction Health & Monitoring

**What:** Track and display the health of the data extraction process.

**What to build:**

1. Last extraction timestamp per object type
2. Record counts and change detection
3. Warnings for incomplete extractions (API limits hit, permission errors)
4. "Re-extract" button to refresh data on demand
5. Connection status integrated with extraction status

**Effort:** ~4-6 hours.

#### Phase 2 Total

| Component                      | Effort                               |
| ------------------------------ | ------------------------------------ |
| Salesforce API client          | ~6-8 hours                           |
| CPQ object discovery           | ~4-6 hours                           |
| Data extraction engine         | ~10-14 hours                         |
| CPQ data visualization UI      | ~10-14 hours                         |
| Extraction health & monitoring | ~4-6 hours                           |
| **Total**                      | **~34-48 hours of focused dev work** |

> **Practically:** 1-2 weeks for one developer. ~1 week for a team of 2.

---

### Phase 3: Connection Resilience & Token Management

**What the user gets:** "My Salesforce connection stays healthy for weeks without me thinking about it. If something goes wrong, I know immediately and can fix it easily."

**Why this third (and not sooner):** Phases 1 and 2 establish a working connection with basic token refresh. Phase 3 hardens it for production use over the multi-week/multi-month duration of a real migration project.

#### Step 3.1: Robust Token Refresh

**What:** Production-grade token refresh that handles every edge case.

**What to build:**

1. Proactive refresh — refresh the access token BEFORE it expires (e.g., at 75% of TTL), not just on 401
2. Mutex on refresh — prevent multiple concurrent refresh attempts for the same connection (race condition when multiple API calls hit 401 simultaneously)
3. Retry with backoff — if refresh fails due to network issues, retry 3 times with exponential backoff
4. Permanent failure detection — if refresh returns `invalid_grant` (token revoked), stop retrying and mark the connection as `refresh_failed`
5. Update stored tokens atomically — encrypt new access token and update DB in a single transaction

**Effort:** ~4-6 hours.

#### Step 3.2: Connection Health Monitoring

**What:** Periodic background health checks for all active Salesforce connections.

**What to build:**

1. A scheduled job (cron or `jobQueue`) that runs every 30 minutes
2. For each active connection: attempt a lightweight API call (`GET /services/data/`)
3. If healthy: update `last_used_at`, log success
4. If token expired: auto-refresh, log refresh event
5. If refresh failed: mark connection as `refresh_failed`, send notification
6. If Salesforce unreachable: mark as `instance_unreachable`, send notification
7. Dashboard showing connection health across all projects (for tenant admins)

**Effort:** ~4-6 hours.

#### Step 3.3: User Notifications

**What:** Alert project members when their Salesforce connection needs attention.

**What to build:**

1. In-app notification when connection enters error state
2. Email notification to the user who originally connected (they need to re-authorize)
3. Project-level banner showing connection issues
4. Notification preferences (opt-out for non-critical events)

**Effort:** ~4-6 hours.

#### Step 3.4: Reconnect Flow

**What:** One-click re-authorization when a connection breaks.

**What to build:**

1. "Reconnect" button that initiates a new OAuth flow
2. Update the EXISTING connection record (don't create a new one) — preserves the connection ID, logs, and extracted data references
3. Re-encryption with new tokens
4. Automatic re-test after reconnection

**Effort:** ~3-4 hours.

#### Step 3.5: Encryption Key Rotation

**What:** Tooling to rotate the `SALESFORCE_TOKEN_ENCRYPTION_KEY` without downtime.

**What to build:**

1. Admin CLI command or admin API endpoint: `POST /admin/encryption/rotate`
2. Takes new key, re-encrypts all connections with new key, increments `encryption_key_version`
3. Supports gradual rollover: old key still valid for decryption during rotation
4. Audit log for rotation events

**Effort:** ~4-6 hours.

#### Step 3.6: Connection Logs UI

**What:** A timeline view showing all events for a Salesforce connection.

**What to build:**

1. Timeline component on the project page showing: connected, token refreshed, test passed, extraction started, error occurred, disconnected, reconnected
2. Filterable by event type
3. Useful for debugging ("when did the connection break?") and auditing

**Effort:** ~3-4 hours.

#### Phase 3 Total

| Component               | Effort                               |
| ----------------------- | ------------------------------------ |
| Robust token refresh    | ~4-6 hours                           |
| Health monitoring       | ~4-6 hours                           |
| User notifications      | ~4-6 hours                           |
| Reconnect flow          | ~3-4 hours                           |
| Encryption key rotation | ~4-6 hours                           |
| Connection logs UI      | ~3-4 hours                           |
| **Total**               | **~22-32 hours of focused dev work** |

> **Practically:** ~1 week for one developer.

---

### Phase 4: CPQ Analysis & Migration Mapping

**What the user gets:** "RevBrain tells me exactly how my CPQ configuration maps to RCA, what can be auto-migrated, and what needs manual work."

**Why this fourth:** This is where RevBrain goes from "data viewer" to "migration tool". It requires the extracted data from Phase 2 and the reliable connection from Phase 3.

#### Step 4.1: CPQ→RCA Object Mapping Engine

**What:** The core intelligence that maps CPQ concepts to their RCA equivalents.

**Background for non-Salesforce readers:** CPQ and RCA are architecturally different. CPQ is a managed package with its own custom objects (`SBQQ__*`). RCA is built natively into Salesforce Core. There is NO 1:1 object mapping — it's a fundamental re-architecture. For example:

| CPQ Concept       | CPQ Object                    | RCA Equivalent            | RCA Object                         |
| ----------------- | ----------------------------- | ------------------------- | ---------------------------------- |
| Product           | `Product2` + `SBQQ__*` fields | Product + Selling Model   | `Product2` + `ProductSellingModel` |
| Bundle            | `SBQQ__ProductOption__c`      | Product Relationship      | `ProductRelationship`              |
| Price Rule        | `SBQQ__PriceRule__c`          | Pricing Plan / Adjustment | `PricingPlan` + `PricingPlanStep`  |
| Discount Schedule | `SBQQ__DiscountSchedule__c`   | Pricing Adjustment        | `PricingAdjustment`                |
| Quote Template    | `SBQQ__QuoteTemplate__c`      | OmniStudio Document       | OmniStudio FlexCard                |
| QCP (JS plugin)   | `SBQQ__CustomScript__c`       | Pricing Procedure / Apex  | Custom pricing logic               |

**What to build:**

1. A mapping rules engine that defines the transformation for each object pair
2. Complexity scoring for each mapping (simple, moderate, complex, manual-only)
3. Dependency analysis (which mappings depend on other mappings being done first)
4. Gap analysis ("these 3 CPQ features have no RCA equivalent — here's the workaround")
5. Coverage report ("85% of your CPQ config can be auto-mapped, 10% needs review, 5% needs manual implementation")

**Effort:** ~20-30 hours (this is the core IP of the product).

#### Step 4.2: QCP Code Analysis

**What:** Parse and analyze the QCP JavaScript to understand what it does and how to replicate it in RCA.

**What to build:**

1. Parse the QCP JavaScript source code (retrieved via API in Phase 2)
2. Identify which QCP methods are implemented (some orgs only use a subset)
3. Detect patterns: custom pricing calculations, external data lookups, field visibility rules
4. Classify each QCP method's logic by complexity and RCA-equivalent approach
5. Generate a migration recommendation for each QCP method

**Note:** The QCP code is just JavaScript — we can parse it with standard tools (AST parsing via `acorn` or similar). We don't need to execute it to analyze it.

**Effort:** ~10-14 hours.

#### Step 4.3: Migration Plan Generator

**What:** Auto-generate a project-specific migration plan based on the analysis.

**What to build:**

1. Take the mapping results and QCP analysis
2. Generate a phased migration plan with recommended order
3. Estimate effort for each step (based on complexity scoring)
4. Identify blockers and prerequisites
5. Generate a shareable report (PDF or web view) for end-client stakeholders
6. Allow the RevBrain operator to customize the plan

**Effort:** ~8-12 hours.

#### Phase 4 Total

| Component                | Effort                               |
| ------------------------ | ------------------------------------ |
| Object mapping engine    | ~20-30 hours                         |
| QCP code analysis        | ~10-14 hours                         |
| Migration plan generator | ~8-12 hours                          |
| **Total**                | **~38-56 hours of focused dev work** |

> **Practically:** 2-3 weeks for one developer. This is the most intellectually demanding phase — it requires deep Salesforce CPQ and RCA domain knowledge.

---

### Phase 5: Browser Automation (Advanced Behavioral Analysis)

**What the user gets:** "RevBrain can observe how the CPQ UI actually behaves — field visibility, configurator interactions, custom actions — and capture that behavior for accurate migration."

**Why this late:** This is the most complex, infrastructure-heavy phase. It requires a dedicated worker server, credential storage, and careful security design. Most customers can get a successful migration from Phases 1-4 alone (API data + code analysis). Phase 5 is for complex CPQ implementations where the UI behavior diverges significantly from what the rules data suggests.

#### Step 5.1: Dedicated User Onboarding Flow

**What:** UI and backend for the end-client to provide browser automation credentials.

**What the end-client does:**

1. Creates a Salesforce user: `revbrain-integration@theircompany.com`
2. Assigns appropriate Profile (e.g., "System Administrator" or a custom profile with CPQ access)
3. Sets a password
4. Optionally configures MFA (TOTP-based, so RevBrain can auto-complete MFA challenges)
5. Enters the username, password, and optional MFA secret into RevBrain's project settings

**What RevBrain builds:**

1. "Browser Access" section in project settings (only visible to org_owner/admin)
2. Credential input form (username, password, MFA secret)
3. Encrypt all credentials using AES-256-GCM (same encryption module from Phase 1)
4. Store in the `salesforce_connections` table (new columns)
5. "Test Browser Login" button that launches a quick Playwright session to verify the credentials work
6. Clear explanation of why this is needed and what permissions the user needs
7. Guidance document for end-clients on how to create the integration user

**Effort:** ~6-8 hours.

#### Step 5.2: Playwright Worker Infrastructure

**What:** A Node.js worker process that runs Playwright browser sessions for Salesforce UI interaction.

**Why it can't run on Edge Functions:** Playwright requires Chromium (~300MB binary), persistent processes, and significant memory. This is a traditional server workload, not a serverless one.

**Architecture:**

```
┌─────────────────────┐      ┌──────────────────────┐
│ RevBrain API Server │      │ Playwright Worker    │
│ (Hono, Edge/Node)   │      │ (Node.js only)       │
│                     │      │                      │
│ Schedules jobs →    │ ───→ │ Polls jobQueue table │
│ via jobQueue table  │      │ Launches Chromium    │
│                     │ ←─── │ Stores results       │
│ ← Reads results     │      │ Captures screenshots │
└─────────────────────┘      └──────────────────────┘
```

**Detailed steps:**

1. Create `apps/worker/` — a new Node.js app in the monorepo
2. Job poller: queries `jobQueue` for `type = 'browser_automation'` jobs
3. Browser pool: maintain 1-3 Chromium instances (reuse across jobs for the same Salesforce org)
4. Session manager: log into Salesforce, handle MFA, maintain session cookies
5. Graceful shutdown: finish current job before exiting
6. Docker image: `Dockerfile` with Playwright + Chromium pre-installed
7. Health endpoint: `GET /health` for monitoring

**Deployment options:**

- **Dev:** `pnpm worker` runs locally on the developer's machine
- **Staging/Prod:** Docker container on a VPS (DigitalOcean, Railway, Fly.io), or a dedicated cloud VM
- **Scaling:** Start with a single worker instance. Add more if job queue grows.

**Effort:** ~12-16 hours.

#### Step 5.3: Salesforce Login Automation

**What:** Reliable automation for logging into Salesforce through the browser, including MFA handling.

**Why this is tricky:** Salesforce's login page has evolved over the years and can vary by org configuration:

- Some orgs use the standard Salesforce login page
- Some redirect to a custom SSO provider
- Some enforce MFA via Salesforce Authenticator, TOTP app, or SMS
- Some have IP-based MFA exemptions (login from trusted IP = no MFA)
- Lightning Experience and Classic have different post-login navigation

**What to build:**

1. Navigate to `{instance_url}/login.jsp` or `{instance_url}/`
2. Fill in username and password
3. Handle MFA challenge:
   - **TOTP:** If MFA secret is configured, generate TOTP code using `otpauth` library and enter it
   - **No MFA configured:** Skip (some orgs exempt certain IPs or users)
   - **Unsupported MFA:** Error with clear message ("This org requires Salesforce Authenticator, which cannot be automated. Please configure TOTP for the integration user.")
4. Wait for Lightning Experience to fully load (detect `oneApp` or similar Lightning container)
5. Handle session expiry and re-login
6. Capture and store session cookies for reuse within a job

**Effort:** ~8-10 hours (MFA handling is the complex part).

#### Step 5.4: QLE Behavioral Capture

**What:** Navigate to the Quote Line Editor, open quotes, and capture field visibility/editability behavior.

**What to build:**

1. Navigate to a quote record → click "Edit Lines" to open the QLE
2. Wait for QLE Lightning component to render
3. For each field in the QLE: check if visible, check if editable, capture the value
4. Trigger recalculation by modifying a quantity → capture which fields change
5. Compare against QCP `isFieldVisible`/`isFieldEditable` expectations
6. Take screenshots at each step for the audit trail
7. Store results as structured data: `{ quoteId, lineId, fieldName, visible, editable, value }`
8. Run across multiple quotes to capture different scenarios (different products, different quantities, different discount levels)

**Effort:** ~10-14 hours.

#### Step 5.5: Configurator Behavioral Capture

**What:** Navigate to the Product Configurator and capture bundle configuration behavior.

**What to build:**

1. Navigate to a quote → click "Add Products" → select a bundle product → "Configure"
2. Wait for the Configurator to render
3. For each feature group: capture visible options, required/optional status, pre-selected state
4. Select an option → capture what other options change (appear, disappear, become required)
5. Validate against the Configuration Rules extracted via API
6. Capture the full interaction tree: "if I select Option A, Options B and C appear, Option D disappears"
7. Store as structured data + screenshots

**Effort:** ~10-14 hours.

#### Step 5.6: Results Storage & Visualization

**What:** Store and display browser automation results in the project workspace.

**What to build:**

1. Store results in a `browser_automation_results` table (project-scoped)
2. Add a "Behavioral Analysis" tab to the project workspace
3. Show field visibility matrix (quote × field → visible/editable)
4. Show configurator interaction tree
5. Show screenshots with annotations
6. Compare API-extracted rules vs observed behavior ("Rule says X should be visible, but browser shows it's hidden — possible QCP override")

**Effort:** ~8-12 hours.

#### Phase 5 Total

| Component                        | Effort                               |
| -------------------------------- | ------------------------------------ |
| Dedicated user onboarding        | ~6-8 hours                           |
| Playwright worker infrastructure | ~12-16 hours                         |
| Salesforce login automation      | ~8-10 hours                          |
| QLE behavioral capture           | ~10-14 hours                         |
| Configurator behavioral capture  | ~10-14 hours                         |
| Results storage & visualization  | ~8-12 hours                          |
| **Total**                        | **~54-74 hours of focused dev work** |

> **Practically:** 3-4 weeks for one developer. This phase requires Playwright expertise and deep knowledge of Salesforce CPQ's UI structure. The Salesforce Lightning DOM is complex and changes across releases — expect some fragility in selectors that will need ongoing maintenance.

---

### Phase 6: Enterprise Hardening

**What the user gets:** "RevBrain is production-grade — alternative auth methods, API limit management, AppExchange-ready."

#### Step 6.1: JWT Bearer Flow (Alternative Auth)

For enterprise clients who prefer certificate-based authentication over OAuth redirect. The end-client uploads RevBrain's public certificate to their Connected App. RevBrain signs JWT assertions with its private key.

**Effort:** ~6-8 hours.

#### Step 6.2: Salesforce API Usage Tracking

Track per-project API call counts against Salesforce's daily limits. Show usage dashboard, implement throttling, send warnings at 80% usage.

**Effort:** ~6-8 hours.

#### Step 6.3: Custom Domain Login URL Support

Some orgs use `https://globalcorp.my.salesforce.com` instead of `login.salesforce.com`. Add a text field for custom login URL during connection setup.

**Effort:** ~2-3 hours.

#### Step 6.4: Org Metadata Caching

Cache Salesforce object descriptions locally to reduce API calls and speed up the UI. Invalidate on schema changes.

**Effort:** ~4-6 hours.

#### Step 6.5: AppExchange Security Review Preparation

If RevBrain wants to be listed on the Salesforce AppExchange, it must pass a security review. This includes documentation, penetration testing, and compliance with Salesforce's security requirements.

**Effort:** ~20-40 hours (depends on scope — includes documentation, code hardening, and review cycles).

#### Phase 6 Total: ~38-65 hours

---

### Timeline Summary

| Phase       | What You Get                           | Dev Effort   | Calendar Time (1 dev) | Calendar Time (2 devs) |
| ----------- | -------------------------------------- | ------------ | --------------------- | ---------------------- |
| **Phase 1** | Connect to Salesforce, verify it works | ~36-48 hours | ~1-2 weeks            | ~1 week                |
| **Phase 2** | Extract and view all CPQ data          | ~34-48 hours | ~1-2 weeks            | ~1 week                |
| **Phase 3** | Reliable long-running connections      | ~22-32 hours | ~1 week               | ~3-4 days              |
| **Phase 4** | CPQ→RCA mapping and migration plan     | ~38-56 hours | ~2-3 weeks            | ~1-2 weeks             |
| **Phase 5** | Browser-based behavioral analysis      | ~54-74 hours | ~3-4 weeks            | ~2-3 weeks             |
| **Phase 6** | Enterprise features, AppExchange       | ~38-65 hours | ~2-3 weeks            | ~1-2 weeks             |

**Total: ~222-323 hours (~6-8 weeks solo, ~3-4 weeks with 2 devs)**

**Recommended launch plan:**

- **Phases 1-2** together → first usable product (connect + see data). ~2-3 weeks.
- **Phase 3** → production-ready connections. +1 week.
- **Phase 4** → the real product differentiator (migration intelligence). +2-3 weeks.
- **Phase 5** → premium feature for complex CPQ setups. +3-4 weeks.
- **Phase 6** → when pursuing enterprise / AppExchange. +2-3 weeks.

---

## Appendix A: Salesforce OAuth Token Format

For reference, Salesforce tokens look like:

```
Access Token:  00D5g00000XXXXX!AQEAQ... (starts with org ID, ~120 chars)
Refresh Token: 5Aep861... (~40 chars, opaque)
Instance URL:  https://globalcorp.my.salesforce.com
Org ID:        00D5g00000XXXXX (15 or 18 char Salesforce ID)
User ID:       0055g00000YYYYY
```

## Appendix B: Relevant Salesforce Documentation

- [OAuth 2.0 Web Server Flow](https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/intro_understanding_web_server_oauth_flow.htm)
- [Connected App Overview](https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/intro_connected_apps.htm)
- [OAuth Scopes](https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_tokens_scopes.htm)
- [Token Refresh](https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/intro_understanding_refresh_token_oauth.htm)
- [PKCE for Salesforce](https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_PKCE.htm)

## Appendix C: RevBrain Architecture Context

For reviewers unfamiliar with the codebase:

- **Monorepo** with `apps/server` (Hono API), `apps/client` (React SPA), `packages/contract` (shared types), `packages/database` (Drizzle ORM)
- **Dual-adapter pattern**: every repository has a mock (in-memory) and a Drizzle (PostgreSQL) implementation sharing the same interface
- **Multi-runtime**: server runs on Node.js locally and Deno on Supabase Edge Functions — libraries must be compatible with both
- **Auth**: JWT-based (Supabase Auth), decode-only on edge (gateway already verified)
- **Existing project model**: projects already have CRUD, members, files, status tracking — Salesforce connection extends this
