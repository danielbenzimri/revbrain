# Salesforce Integration Spec — Project-Level Connection

> **Status:** Draft v1 — under review
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
14. [Error Handling & Edge Cases](#14-error-handling--edge-cases)
15. [Security Checklist](#15-security-checklist)
16. [Tech Stack & Libraries](#16-tech-stack--libraries)
17. [Open Questions](#17-open-questions)
18. [Implementation Phases](#18-implementation-phases)

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

## 14. Error Handling & Edge Cases

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

## 15. Security Checklist

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

---

## 16. Tech Stack & Libraries

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

## 17. Open Questions

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

## 18. Implementation Phases

### Phase 1: Foundation (MVP)

**Goal:** A user can connect a Salesforce org to a project and verify the connection works.

- [ ] Create `salesforce_connections` table + Drizzle schema
- [ ] Implement token encryption/decryption utility (AES-256-GCM)
- [ ] Build OAuth initiation endpoint (`POST /projects/:id/salesforce/connect`)
- [ ] Build OAuth callback endpoint (`GET /salesforce/oauth/callback`)
- [ ] Build connection status endpoint (`GET /projects/:id/salesforce/connection`)
- [ ] Build disconnect endpoint (`POST /projects/:id/salesforce/disconnect`)
- [ ] Build connection test endpoint (`POST /projects/:id/salesforce/test`)
- [ ] Client UI: "Connect Salesforce" button on project page
- [ ] Client UI: Connection status badge
- [ ] Client UI: Disconnect confirmation modal
- [ ] Mock repository for Salesforce connections (for `pnpm local`)
- [ ] Add `SALESFORCE_CONSUMER_KEY`, `SALESFORCE_CONSUMER_SECRET`, `SALESFORCE_TOKEN_ENCRYPTION_KEY` to env vars
- [ ] Audit logging for connect/disconnect events
- [ ] Tests for encryption, OAuth flow, token refresh

### Phase 2: Resilience & UX

**Goal:** Connection is reliable over weeks of migration work.

- [ ] Automatic token refresh with retry logic
- [ ] Connection health monitoring (periodic health check or on-demand)
- [ ] Proactive notification when connection enters error state
- [ ] Reconnect flow (re-authorize without creating a new connection record)
- [ ] Connection logs UI (show timeline of events)
- [ ] Support sandbox ↔ production switching for the same project
- [ ] Encryption key rotation tooling

### Phase 3: Advanced

**Goal:** Enterprise features and Salesforce AppExchange readiness.

- [ ] JWT Bearer flow as an alternative auth method
- [ ] Salesforce API usage tracking and rate limit awareness
- [ ] Custom domain login URL support
- [ ] Salesforce org metadata caching (object descriptions, field maps)
- [ ] AppExchange security review preparation
- [ ] SOC 2 documentation for credential handling

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
