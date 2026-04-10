# Salesforce Integration — Unified Specification

> Combined from 3 source documents: `SALESFORCE-INTEGRATION-SPEC.md` (v5-final), `SALESFORCE-IMPLEMENTATION-PLAN.md`, and `SALESFORCE-CONNECTION-PLAN.md`. Consolidated 2026-04-09.
>
> **Authors:** Daniel + Claude
> **Audience:** Engineering team, external reviewers, security auditors

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [OAuth Flow](#3-oauth-flow)
4. [Token Management](#4-token-management)
5. [Implementation Plan](#5-implementation-plan)
6. [Connection Plan](#6-connection-plan)
7. [Security](#7-security)

---

## 1. Overview

### What is RevBrain?

RevBrain is a multi-tenant SaaS that helps Revenue Operations teams migrate from **Salesforce CPQ** (Configure, Price, Quote) to **Revenue Cloud Advanced (RCA)**, now being rebranded by Salesforce as **Agentforce Revenue Management (ARM)**. The typical customer is a Salesforce consulting partner / SI (Systems Integrator) that manages migrations for multiple end-clients.

> **Terminology note:** Salesforce is actively rebranding RCA as "Agentforce Revenue Management" (ARM). This spec uses "RCA" throughout as it remains the widely recognized term. The RevBrain UI should make naming configurable — some customers will say "RCA", others "ARM", others "Revenue Cloud". API object names (e.g., `ProductSellingModel`) remain unchanged regardless of branding.

### Why Salesforce Integration?

The entire value proposition of RevBrain depends on being able to:

1. **Read** the customer's CPQ configuration (Product2, PricebookEntry, SBQQ**Quote**c, pricing rules, etc.)
2. **Analyze** it to build a migration plan
3. **Write** the equivalent RCA configuration (ProductSellingModel, PSMRelationship, PricingPlan, etc.)

Without a live connection to the customer's Salesforce org, RevBrain is just a project management tool. The Salesforce connection is the product's core enabling capability.

### Market Context: CPQ End-of-Sale

Salesforce ecosystem reporting (including confirmation from Salesforce spokespeople via Salesforce Ben and partner channels) indicates that CPQ has entered **end-of-sale** status — new customers can no longer purchase CPQ licenses. Existing customers retain support and can renew, but no major new features are being developed. Salesforce's entire innovation roadmap is centered on RCA/ARM. This makes CPQ-to-RCA migration **inevitable** for the entire installed base, not just an optional upgrade.

### OAuth 2.0 External Client App (ECA) Approach

RevBrain uses **OAuth 2.0 Authorization Code Grant with PKCE** via a Salesforce **External Client App** (ECA). This is the modern, Salesforce-recommended approach for third-party integrations. ECAs replace legacy Connected Apps and offer:

- Modern OAuth-only support (no legacy/deprecated flows)
- Built-in PKCE support
- Better metadata compliance and packaging (required for AppExchange)
- Improved governance and security boundaries

### Connection Methods — Analysis Summary

| Method              | Security      | UX            | MFA-Safe | Maintainability | Recommendation      |
| ------------------- | ------------- | ------------- | -------- | --------------- | ------------------- |
| Username/Password   | Poor          | Simple        | No       | Deprecated      | Reject              |
| **Web Server Flow** | **Excellent** | **Good**      | **Yes**  | **Excellent**   | **Primary**         |
| JWT Bearer          | Excellent     | Complex setup | Yes      | Good            | Future (enterprise) |
| CLI Token           | Moderate      | Poor          | Yes      | Poor            | Reject              |
| Client Credentials  | Good          | Complex setup | N/A      | Good            | Future (enterprise) |

### Why OAuth 2.0 Web Server Flow

1. **Low friction for end-clients** — they log in and click "Allow". No certificate exchanges, no CLI tools.
2. **Security model aligns with our needs** — we get scoped tokens, not passwords. The end-client can see what was authorized and revoke access at any time.
3. **Refresh tokens solve the long-running problem** — CPQ-to-RCA migrations take weeks or months.
4. **Battle-tested** — same flow used by Dataloader.io, Ownbackup, Gearset, Copado, and every other Salesforce ISV.
5. **Works everywhere** — production orgs, sandbox orgs, scratch orgs, Developer Edition.
6. **Future-proof** — fully supported by External Client Apps.

### User Story

```
Tenant admin creates a new project
  → Names it (e.g., "CPQ→RCA Migration — GlobalCorp Q2")
  → Clicks "Connect Salesforce (Source)"
  → PREREQUISITE: End-client must approve RevBrain's External Client App first
  → Redirected to Salesforce login page (of the end-client's org)
  → End-client admin logs in and grants access
  → Redirected back to RevBrain with connection confirmed
  → RevBrain can now read CPQ data from that Salesforce org
  → Later: "Connect Salesforce (Target)" for RCA write-back
```

---

## 2. Architecture

### Multi-Org Model

A single RevBrain tenant (e.g., "Acme Consulting") may be running migrations for 5-20 different end-clients simultaneously. Each end-client has their own Salesforce org with its own credentials, security policies, and data.

- **One RevBrain tenant → many Salesforce orgs** (one per project)
- **Each project gets its own isolated Salesforce connection(s)**
- **Credentials must never leak across projects or tenants**

### The Source/Target Pattern

```
Source Org (CPQ data lives here)  →  RevBrain analyzes & maps  →  Target Org (RCA config is written here)
```

Common patterns:

- Read CPQ from **Production** → Write RCA to **Sandbox** (test) → Validate → Deploy to Production
- Read CPQ from **Sandbox copy** → Write RCA to **separate Sandbox** → Validate
- Same org for both (Production→Production) — less common, higher risk

### One External Client App, Many Salesforce Orgs

RevBrain maintains **one** ECA (our OAuth client registration). When a user from any Salesforce org clicks "Allow", they are granting **our** ECA access to **their** org.

```
RevBrain External Client App (one)
  ├── Project A (source) → GlobalCorp Production (tokens A1)
  ├── Project A (target) → GlobalCorp Sandbox (tokens A2)
  ├── Project B (source) → MegaCorp Production (tokens B1)
  └── Project C (source) → StartupCo Sandbox (tokens C1)
```

### Tenant Isolation

- Tokens are stored with `organization_id` — RLS enforces that Tenant X cannot access Tenant Y's connections
- Server-side queries always filter by the authenticated user's organization
- The `UNIQUE (project_id, connection_role)` constraint prevents duplicate connections per role
- Cross-tenant queries are impossible through the application layer

### ECA Configuration

| Field                              | Value                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------- |
| App Name                           | RevBrain                                                                |
| Contact Email                      | security@revbrain.com                                                   |
| OAuth Enabled                      | Yes                                                                     |
| Callback URLs                      | Production, staging, and localhost (see Environment section)            |
| Selected OAuth Scopes              | `api`, `refresh_token`, `id`                                            |
| Require PKCE                       | Yes                                                                     |
| Require Secret for Web Server Flow | Yes                                                                     |
| Distribution State                 | **Packaged** (required for future AppExchange listing — set from Day 1) |
| Refresh Token Policy               | **Refresh token is valid until revoked**                                |

### Why Not Legacy Connected App?

| Factor                | Legacy Connected App                               | External Client App                     |
| --------------------- | -------------------------------------------------- | --------------------------------------- |
| New creation          | Restricted — requires Salesforce Support exception | Available by default                    |
| OAuth flows           | All (including deprecated)                         | Modern only (Authorization Code + PKCE) |
| AppExchange packaging | Manual                                             | Built-in metadata compliance            |
| Governance            | Org-level                                          | Namespace-level                         |
| Future support        | Maintenance mode                                   | Active development                      |

### Pre-Connection Setup — What the End-Client Must Do

Since September 2025, Salesforce blocks uninstalled/unapproved external apps for most users. The end-client's Salesforce admin must approve RevBrain's ECA BEFORE any user can authorize it via OAuth.

**Steps for end-client admin (one-time):**

1. Go to Setup → Connected Apps OAuth Usage (or External Client App OAuth Usage)
2. Find "RevBrain" in the list
3. Click "Install" or "Approve"
4. Set Permitted Users: "All users may self-authorize" or "Admin approved users are pre-authorized"
5. Optionally: assign specific profiles or permission sets

**RevBrain's responsibility:**

- In-app guide with pre-flight checklist
- Clear error handling for unapproved-app errors
- Customer-facing setup guide with screenshots
- AppExchange listing (Phase 7) to eliminate this friction entirely

### Execution Architecture — Control Plane vs Worker Plane

CPQ extraction, analysis, mapping, and write-back are **long-running, resource-intensive operations** (5-30 minutes). Supabase Edge Functions have a ~60s execution limit.

```
Control Plane (Supabase Edge Functions / Hono API):
  ├── User auth, project CRUD, Salesforce OAuth — short-lived, fits Edge Functions
  ├── "Start Assessment" / "Start Deployment" API — creates run record, enqueues job
  ├── Status/progress polling — reads from DB
  └── Internal token-mint endpoint — provides short-lived Salesforce tokens to worker

Worker Plane (apps/worker/ — Node.js container):
  ├── CPQ extraction (Bulk API, pagination, 10-30 min)
  ├── CPQ analysis + mapping (AST parsing, rule evaluation)
  ├── RCA write-back + validation (deployment, comparison)
  └── Browser automation (Playwright, Phase 6)
```

**Queue strategy:** Phase 1-3 uses Postgres `jobQueue` table with worker polling (cloud-neutral, sufficient for <100 concurrent jobs). Migration to Cloud Tasks / SQS when scaling demands it.

### Stack Mapping (Prototype → Production)

| Prototype (Python/FastAPI)      | RevBrain (TypeScript/Hono)                                     |
| ------------------------------- | -------------------------------------------------------------- |
| FastAPI routes                  | Hono routes in `apps/server/src/v1/routes/`                    |
| `httpx.AsyncClient`             | Native `fetch` (Node 18+ / Deno)                               |
| In-memory `_pkce_store` dict    | Database table `oauth_pending_flows` with 10-min TTL           |
| In-memory `_session_store` dict | Database table `salesforce_connections` (encrypted tokens)     |
| `.env` credentials              | `.env` for dev, per-environment env vars for staging/prod      |
| `Cookie: session_id`            | RevBrain's existing JWT auth — no separate cookie needed       |
| Single-user                     | Multi-tenant, org-scoped, per-project connections              |
| `hashlib.sha256`                | Web Crypto API (`crypto.subtle.digest`) for Deno compatibility |

### Data Model

#### `salesforce_connections` — metadata + state (NO tokens in production schema)

```sql
CREATE TABLE salesforce_connections (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id              UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_role          VARCHAR(10) NOT NULL DEFAULT 'source',  -- 'source' | 'target'

  -- Salesforce org identity
  salesforce_org_id       VARCHAR(18) NOT NULL,
  salesforce_instance_url TEXT NOT NULL,
  custom_login_url        TEXT,
  oauth_base_url          TEXT NOT NULL,
  salesforce_user_id      VARCHAR(18),
  salesforce_username     TEXT,
  instance_type           VARCHAR(10) NOT NULL,  -- 'production' | 'sandbox'
  api_version             VARCHAR(10),           -- Auto-detected

  -- Connection audit metadata
  connection_metadata     JSONB,

  -- Connection state
  status                  VARCHAR(30) NOT NULL DEFAULT 'active',
  last_used_at            TIMESTAMPTZ,
  last_successful_api_call_at TIMESTAMPTZ,
  last_error              TEXT,
  last_error_at           TIMESTAMPTZ,

  -- Audit
  connected_by            UUID REFERENCES users(id),
  disconnected_by         UUID REFERENCES users(id),
  disconnected_at         TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (project_id, connection_role)
);

CREATE INDEX idx_sf_connections_org ON salesforce_connections(organization_id);
CREATE INDEX idx_sf_connections_status ON salesforce_connections(status);
CREATE INDEX idx_sf_connections_sf_org ON salesforce_connections(salesforce_org_id);
```

#### `salesforce_connection_secrets` — encrypted tokens, 1:1 with connections

```sql
CREATE TABLE salesforce_connection_secrets (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id           UUID NOT NULL REFERENCES salesforce_connections(id) ON DELETE CASCADE,

  encrypted_access_token  BYTEA NOT NULL,
  encrypted_refresh_token BYTEA NOT NULL,
  encryption_key_version  INTEGER NOT NULL DEFAULT 1,
  token_version           INTEGER NOT NULL DEFAULT 1,  -- Optimistic locking for refresh

  token_issued_at         TIMESTAMPTZ,
  token_scopes            TEXT,
  last_refresh_at         TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (connection_id)
);
```

> **Why separate?** Tokens are deleted on disconnect but the connection record survives for status/logs. Separate table lets us delete tokens without losing metadata. Also reduces accidental exposure — must explicitly join.

#### `oauth_pending_flows` — short-lived PKCE state

```sql
CREATE TABLE oauth_pending_flows (
  nonce               UUID PRIMARY KEY,
  project_id          UUID NOT NULL REFERENCES projects(id),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  user_id             UUID NOT NULL REFERENCES users(id),
  connection_role     VARCHAR(10) NOT NULL,
  code_verifier       TEXT NOT NULL,
  oauth_base_url      TEXT NOT NULL,
  expires_at          TIMESTAMPTZ NOT NULL,  -- created_at + 10 minutes
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (project_id, connection_role)
);

CREATE INDEX idx_oauth_pending_expires ON oauth_pending_flows(expires_at);
```

**Lifecycle:**

1. Created when `POST /connect` is called (10-minute TTL). If expired row exists → UPSERT overwrite.
2. Looked up by nonce during callback.
3. Deleted after successful token exchange (not before — preserves retry window).
4. Cleanup job runs hourly, deletes expired rows.

#### `salesforce_connection_logs` — audit trail

```sql
CREATE TABLE salesforce_connection_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id   UUID NOT NULL REFERENCES salesforce_connections(id) ON DELETE CASCADE,
  event           VARCHAR(50) NOT NULL,
  details         JSONB,
  performed_by    UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Events: 'connected', 'refreshed', 'refresh_failed', 'disconnected', 'reconnected',
--         'permission_audit', 'app_not_approved_error', 'api_limit_warning'
```

#### `cpq_assessment_runs` and `cpq_assessment_run_events`

```sql
CREATE TABLE cpq_assessment_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_id     UUID NOT NULL REFERENCES salesforce_connections(id),
  status            VARCHAR(30) NOT NULL DEFAULT 'queued',
  progress_pct      INTEGER NOT NULL DEFAULT 0,
  current_step      TEXT,
  result_summary    JSONB,
  artifact_paths    TEXT[],
  last_error        TEXT,
  started_by        UUID NOT NULL REFERENCES users(id),
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cpq_assessment_run_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID NOT NULL REFERENCES cpq_assessment_runs(id) ON DELETE CASCADE,
  event           VARCHAR(50) NOT NULL,
  message         TEXT,
  details         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### Changes to `projects` table

```sql
ALTER TABLE projects ADD COLUMN client_company_name TEXT;
ALTER TABLE projects ADD COLUMN contract_reference TEXT;
ALTER TABLE projects ADD COLUMN estimated_objects INTEGER;
ALTER TABLE projects ADD COLUMN stakeholders JSONB;
```

### API Design

#### Salesforce Connection Endpoints

```
POST /v1/projects/:projectId/salesforce/connect
  Body: { instanceType, connectionRole, loginUrl? }
  Response: { redirectUrl }

GET /v1/salesforce/oauth/callback?code=xxx&state=yyy
  → Exchanges code, runs permission audit, stores encrypted, renders popup-closing HTML

GET /v1/projects/:projectId/salesforce/connections
  Response: { source: {...} | null, target: {...} | null }
  Note: Never returns tokens

GET /v1/projects/:projectId/salesforce/connections/:role

POST /v1/projects/:projectId/salesforce/disconnect
  Body: { connectionRole }

POST /v1/projects/:projectId/salesforce/reconnect
  Body: { connectionRole, instanceType, loginUrl? }

POST /v1/projects/:projectId/salesforce/test
  Body: { connectionRole }
  Response: { healthy, apiVersion, orgId, cpqVersion?, error? }
```

#### RBAC

| Action                           | Required Role                                |
| -------------------------------- | -------------------------------------------- |
| Connect / Reconnect / Disconnect | `org_owner`, `admin`                         |
| View connection status           | `org_owner`, `admin`, `operator`, `reviewer` |
| Test connection                  | `org_owner`, `admin`, `operator`             |

### Scopes & Permissions

#### Requested OAuth Scopes

| Scope           | Purpose                                                  | Required?                    |
| --------------- | -------------------------------------------------------- | ---------------------------- |
| `api`           | Access Salesforce REST, SOAP, Tooling, and Metadata APIs | Yes — core functionality     |
| `refresh_token` | Obtain refresh token for long-lived access               | Yes — migrations span weeks  |
| `id`            | Access user identity information                         | Yes — display who authorized |

> The `api` scope provides access to the Tooling API and Metadata API endpoints, needed for CPQ package version detection, custom field metadata, and Static Resource extraction.

#### Scopes NOT Requested

| Scope         | Why Not                                       |
| ------------- | --------------------------------------------- |
| `full`        | Grants everything including setup. Too broad. |
| `web`         | Browser-based access — we're server-side      |
| `chatter_api` | Social features — irrelevant                  |
| `wave_api`    | Analytics — irrelevant                        |
| `content`     | File management — not needed initially        |

#### Principle of Least Privilege

Actual data access is further limited by the **authorizing user's profile and permission sets** in Salesforce. If the user who authorizes can't see SBQQ**Quote**c, RevBrain can't see it either. This is why the post-connection permission audit is critical.

### The CPQ Data Access Problem

CPQ is a **managed package** — it installs custom objects (all prefixed `SBQQ__`) into a standard Salesforce org. Accessing its data requires understanding three distinct layers.

#### Layer 1: API-Accessible Data (OAuth is enough)

Everything readable via SOQL and REST API. This is the majority of CPQ configuration.

**Core Quoting Objects:** `SBQQ__Quote__c`, `SBQQ__QuoteLine__c`, `SBQQ__QuoteLineGroup__c`, `SBQQ__QuoteDocument__c`

**Rules Engine:** `SBQQ__PriceRule__c`, `SBQQ__PriceCondition__c`, `SBQQ__PriceAction__c`, `SBQQ__ProductRule__c`, `SBQQ__ProductAction__c`, `SBQQ__ErrorCondition__c`, `SBQQ__ConfigurationRule__c`, `SBQQ__LookupQuery__c`

**Product Configuration:** `SBQQ__ProductOption__c`, `SBQQ__Feature__c`, `SBQQ__ConfigurationAttribute__c`

**Pricing:** `SBQQ__DiscountSchedule__c`, `SBQQ__DiscountTier__c`, `SBQQ__BlockPrice__c`

**Templates:** `SBQQ__QuoteTemplate__c`, `SBQQ__TemplateSection__c`, `SBQQ__TemplateContent__c`, `SBQQ__LineColumn__c`

**Subscriptions:** `SBQQ__Subscription__c`, `SBQQ__SubscribedAsset__c`

**Custom Actions & QCP:** `SBQQ__CustomAction__c`, `SBQQ__CustomScript__c` (QCP JavaScript in `SBQQ__Code__c` field)

> QCP source code is stored in `SBQQ__CustomScript__c.SBQQ__Code__c` (Long Text Area, up to 131,072 characters). When QCPs exceed this limit, developers put overflow logic in Static Resources, retrievable via the Metadata API.

#### Layer 2: Server-Side CPQ API (OAuth is enough, specialized calls)

Via `SBQQ.ServiceRouter` global Apex class: Calculate Quote, Save Quote, Generate Document, Read Quote APIs.

#### Layer 3: Browser-Only Behavior (OAuth is NOT enough)

Some CPQ behaviors only exist in the browser: QCP `isFieldVisible`/`isFieldEditable` (browser-only methods), Product Configurator interactive behavior, Custom Action button runtime behavior, Quote Document PDF rendering. Covered by Phase 6 (Browser Automation).

### RCA Target Objects Reference

| RCA Object                  | Purpose                                                                |
| --------------------------- | ---------------------------------------------------------------------- |
| `ProductSellingModel`       | Defines how a product is sold (one-time, evergreen, termed)            |
| `ProductSellingModelOption` | Options within a selling model                                         |
| `ProductRelationship`       | Replaces CPQ bundles — parent/child product relationships              |
| `PricingPlan`               | Defines the pricing structure for a product                            |
| `PricingPlanStep`           | Individual steps within a pricing plan                                 |
| `PricingProcedure`          | Replaces both CPQ Price Rules AND QCP                                  |
| `PricingProcedureStep`      | Steps within a pricing procedure                                       |
| `PricingAdjustment`         | Discounts, surcharges, adjustments                                     |
| `PricingAdjustmentTier`     | Tiers within an adjustment (volume pricing)                            |
| `ContextDefinition`         | New data mapping layer — no CPQ equivalent                             |
| `ContextMapping`            | Maps data between objects within a context definition                  |
| `Quote` (native)            | Standard Salesforce Quote object — RCA uses this, NOT `SBQQ__Quote__c` |
| `QuoteLineItem` (native)    | Standard quote line items                                              |

### Data Retention & Cleanup Policy

| Data               | Retention Policy                         | Trigger                                     |
| ------------------ | ---------------------------------------- | ------------------------------------------- |
| OAuth tokens       | Deleted on disconnect; encrypted at rest | User action or project deletion             |
| Extracted CPQ data | 90 days after project completion         | Project status → `completed` or `cancelled` |
| QCP source code    | Same as extracted data                   | Same                                        |
| Migration mappings | 180 days after project completion        | Same                                        |
| Connection logs    | 1 year                                   | Rolling window                              |
| Audit log entries  | Per existing audit log policy            | N/A (immutable)                             |

Right-to-deletion: tenant admin can trigger "Delete all Salesforce data" at any time — revokes tokens, deletes encrypted tokens, deletes extracted data, preserves audit logs with PII redacted.

### Sandbox vs Production

| Environment   | Login URL                            | Use Case                                        |
| ------------- | ------------------------------------ | ----------------------------------------------- |
| Production    | `https://login.salesforce.com`       | Live data migration                             |
| Sandbox       | `https://test.salesforce.com`        | Testing, validation                             |
| Custom Domain | `https://{domain}.my.salesforce.com` | Orgs with My Domain (now required for all orgs) |

### Environment-Specific Callback URLs

| Environment  | Callback URL                                                   |
| ------------ | -------------------------------------------------------------- |
| Local (mock) | `http://localhost:3000/api/v1/salesforce/oauth/callback`       |
| Staging      | `https://api-stg.revbrain.io/api/v1/salesforce/oauth/callback` |
| Production   | `https://api.revbrain.io/api/v1/salesforce/oauth/callback`     |

### Tech Stack & Libraries

**Server-Side:**

| Purpose                         | Library                           | Why                                                   |
| ------------------------------- | --------------------------------- | ----------------------------------------------------- |
| HTTP client for Salesforce API  | Native `fetch`                    | Available in Node + Deno; no external dependency      |
| Encryption (AES-256-GCM + HKDF) | Node.js `crypto` / Web Crypto API | Built-in, `crypto.subtle` for Deno compat             |
| PKCE code verifier/challenge    | Node.js `crypto`                  | `randomBytes` + `createHash('sha256')`                |
| State token signing             | `jose`                            | Lightweight, works in both runtimes                   |
| Salesforce REST API wrapper     | Raw `fetch` with thin wrapper     | `jsforce` is ~200KB and Node-centric; raw is agnostic |
| SOQL escaping                   | Custom utility (~20 lines)        | Too simple to need a library                          |

**Client-Side:**

| Purpose                    | Approach                                                  |
| -------------------------- | --------------------------------------------------------- |
| Connect Salesforce button  | Opens popup via `window.open(oauthUrl)`                   |
| OAuth completion detection | `window.addEventListener('message', ...)` for postMessage |
| Connection status display  | React Query hook polling `GET /salesforce/connections`    |
| Disconnect confirmation    | Modal with clear warning about losing access              |

---

## 3. OAuth Flow

### Phase 1: Initiation (RevBrain → Salesforce)

```
User clicks "Connect Salesforce" on their project page
  ↓
RevBrain frontend calls POST /v1/projects/:id/salesforce/connect via fetch()
  with body: { instanceType: "production" | "sandbox", connectionRole: "source" | "target",
               loginUrl?: "https://globalcorp.my.salesforce.com" }
  ↓
Server validates loginUrl if provided (SSRF prevention):
  - Must be HTTPS
  - Hostname must match Salesforce-owned patterns: *.my.salesforce.com, *.my.salesforce.mil,
    login.salesforce.com, test.salesforce.com
  - Reject IP literals, localhost, private RFC1918 ranges
  - Normalize to origin: new URL(loginUrl).origin
  ↓
Server determines the OAuth base URL:
  - Custom domain (if provided and validated): https://globalcorp.my.salesforce.com
  - Production (default):                      https://login.salesforce.com
  - Sandbox:                                   https://test.salesforce.com
  ↓
Server generates:
  - nonce = crypto.randomUUID()
  - codeVerifier = crypto.randomBytes(64).toString('base64url')
  - codeChallenge = sha256(codeVerifier).toString('base64url')
  - state = sign({ nonce, exp }, secret)    ← minimal data only
  - Server stores: { nonce → projectId, orgId, userId, connectionRole, codeVerifier, oauthBaseUrl }
    in `oauth_pending_flows` table with 10-minute TTL
  ↓
Server returns: { redirectUrl: "{oauthBaseUrl}/services/oauth2/authorize?..." }
  ↓
Frontend opens popup: window.open(redirectUrl, 'sf_connect', 'width=600,height=700')
  If window.open() returns null (popup blocked):
    → Fall back to redirect: window.location.href = redirectUrl
  ↓
Popup/browser navigates to Salesforce login:
  {oauthBaseUrl}/services/oauth2/authorize
  ?response_type=code
  &client_id={CONSUMER_KEY}
  &redirect_uri={CALLBACK_URL}
  &scope=api refresh_token id
  &state={signed_state}
  &code_challenge={codeChallenge}
  &code_challenge_method=S256
  &prompt=login consent
```

**Key design decisions:**

- **Stateful PKCE** — code verifier stored server-side, never transmitted through user agent (RFC 7636 compliant)
- **Data minimization in `state`** — only `{ nonce, exp }`. All internal identifiers stored server-side.
- **Consistent OAuth base URL** — same URL for authorize, token exchange, refresh, and revocation
- **My Domain support from Day 1** — users can optionally provide their custom login URL

### Phase 2: Consent (Salesforce)

```
User logs in to their Salesforce org (MFA if required)
  ↓
Salesforce shows consent screen:
  "RevBrain is requesting access to:
   - Access and manage your data (api)
   - Perform requests at any time (refresh_token)
   - Access your basic information (id)"
  ↓
User clicks "Allow"
  ↓
Salesforce redirects to:
  {CALLBACK_URL}?code={authorization_code}&state={state}
```

**Error: App not approved** — If the end-client hasn't approved RevBrain, Salesforce returns an error. RevBrain detects this and shows pre-connection setup instructions.

### Phase 3: Token Exchange (RevBrain server-side)

```
GET /v1/salesforce/oauth/callback?code=xxx&state=yyy
  ↓
Server validates state (verify signature, check expiry, extract nonce)
Server looks up pending flow by nonce → retrieves projectId, orgId, userId,
  connectionRole, codeVerifier, oauthBaseUrl
  ↓
Server exchanges code for tokens using the SAME oauthBaseUrl (POST):
  POST {oauthBaseUrl}/services/oauth2/token
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
    "scope": "api refresh_token id"
  }
  ↓
Server deletes the pending flow row (AFTER successful exchange)
Server stores oauthBaseUrl with the connection
Server runs post-connection permission audit
Server stores tokens securely (encrypted)
  ↓
Server renders a minimal HTML callback page with anti-leak headers:
  Referrer-Policy: no-referrer
  Cache-Control: no-store
  Content-Security-Policy: default-src 'self'; script-src 'nonce-{random}'
  ↓
Callback page JavaScript:
  const APP_ORIGIN = 'https://app.revbrain.com';  // hardcoded
  if (window.opener) {
    window.opener.postMessage(
      { type: 'sf_connected', role: '{connectionRole}' },
      APP_ORIGIN  // locked target origin
    );
    window.close();
  } else {
    window.location.href = '/projects/{projectId}?sf_connected=true&role={connectionRole}';
  }
```

### Post-Connection Permission Audit

Automatically runs after token exchange:

1. `GET {instance_url}/services/data/` → confirms API access, auto-detects latest API version
2. Tooling API: `InstalledSubscriberPackage` WHERE SBQQ → CPQ version (fallback to Publisher query)
3. `describe('SBQQ__Quote__c')` → confirms CPQ objects are accessible
4. If target connection: `describe('ProductSellingModel')` → confirms RCA is available
5. `GET /services/data/{version}/limits` → captures API budget
6. Parse authorizing user's profile from `/id` response

Results stored in `connectionMetadata`:

```json
{
  "cpqInstalled": true,
  "cpqVersion": "242.1",
  "rcaAvailable": false,
  "apiVersion": "v66.0",
  "dailyApiLimit": 100000,
  "dailyApiRemaining": 99850,
  "authorizingUserProfile": "System Administrator",
  "missingPermissions": []
}
```

### Phase 4: Using the Connection

```
Server retrieves access_token for this project's connection
  ↓
Server calls Salesforce REST API:
  GET {instance_url}/services/data/{api_version}/query?q=SELECT+Id,Name+FROM+Product2
  Authorization: Bearer {access_token}
  ↓
Server reads Sforce-Limit-Info header → updates API usage tracking
  ↓
If 401 (token expired):
  → Use refresh_token to get new access_token
  → Update stored instance_url if it changed (Hyperforce migrations)
  → Retry the request
```

### SOQL Queries (from prototype, for connection testing)

```sql
-- Products
SELECT Id, Name, ProductCode, Family,
       SBQQ__BillingType__c, SBQQ__ChargeType__c,
       SBQQ__SubscriptionPricing__c, SBQQ__SubscriptionTerm__c,
       IsActive
FROM Product2
WHERE IsActive = true
ORDER BY Name ASC

-- Quotes
SELECT Id, Name, SBQQ__Status__c, SBQQ__Account__c,
       SBQQ__Opportunity2__c, SBQQ__ExpirationDate__c,
       SBQQ__Primary__c, SBQQ__NetAmount__c,
       SBQQ__GrandTotal__c, CreatedDate, LastModifiedDate
FROM SBQQ__Quote__c
ORDER BY CreatedDate DESC
```

> These query methods are for **connection testing and lightweight metadata retrieval only**. Heavy CPQ extraction runs as a separate cloud job.

---

## 4. Token Management

### Token Storage — Encryption at Rest

All Salesforce tokens are encrypted before being written to the database using **AES-256-GCM** (authenticated encryption):

```
plaintext token → AES-256-GCM encrypt → IV(12) || ciphertext || authTag(16) → stored as single BYTEA
```

- **Encryption key**: Stored as an environment variable (`SALESFORCE_TOKEN_ENCRYPTION_KEY`), never in the database
- **Per-field IV**: Every `encrypt()` call generates a fresh 12-byte IV via `crypto.randomBytes(12)`
- **Auth tag**: GCM mode produces a 16-byte authentication tag that prevents tampering
- **Key rotation**: Support key versioning (`encryption_key_version` column)
- **Derived keys**: Use HKDF from the master key with different context strings for different data classes (OAuth tokens vs browser credentials)

```typescript
function encrypt(plaintext: string, masterKey: Buffer, context: string): Buffer {
  const derivedKey = hkdf(masterKey, context);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, authTag]);
}

function decrypt(blob: Buffer, masterKey: Buffer, context: string): string {
  const derivedKey = hkdf(masterKey, context);
  const iv = blob.subarray(0, 12);
  const authTag = blob.subarray(blob.length - 16);
  const ciphertext = blob.subarray(12, blob.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}
```

### Token Security Model

| Value           | Where it lives            | Accessible to JavaScript? |
| --------------- | ------------------------- | ------------------------- |
| `access_token`  | Server-side only (DB)     | Never                     |
| `refresh_token` | Server-side only (DB)     | Never                     |
| `client_secret` | Server-side only (env/DB) | Never                     |
| `instance_url`  | Returned to browser       | Yes — display only        |
| `code_verifier` | Server-side only          | Never                     |
| `code`          | Passes through browser    | Useless without verifier  |

### Access Token Lifecycle

- **Lifespan**: ~2 hours (Salesforce default)
- **Usage**: `Authorization: Bearer {token}` in every Salesforce API call
- **Refresh**: Reactively on 401 (primary), proactively as best-effort (refresh if `now - issued_at > 90 minutes`). Salesforce does not consistently return `expires_in`, so proactive refresh uses a configurable heuristic.

### Refresh Token Lifecycle

- **Lifespan**: Indefinite by default (configurable by Salesforce admin)
- **Usage**: Used only to obtain new access tokens
- **Revocation scenarios**: admin revokes in Setup, security policy change, user account deactivated, consumer secret rotated

### Refresh Flow

```
POST {oauthBaseUrl}/services/oauth2/token    ← same base URL from initial connection
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token={decrypted_refresh_token}
&client_id={CONSUMER_KEY}
&client_secret={CONSUMER_SECRET}

Response:
{
  "access_token": "new_token...",
  "instance_url": "https://globalcorp.my.salesforce.com",   ← may have changed (Hyperforce)
  "issued_at": "..."
}
```

Note: Salesforce does **not** return a new refresh token on refresh. The original remains valid. Always update stored `instance_url` from refresh response (Hyperforce URL changes).

### Concurrent Refresh Handling

Optimistic locking via `token_version` counter:

```sql
UPDATE salesforce_connection_secrets
SET encrypted_access_token = {new}, token_version = token_version + 1, updated_at = now()
WHERE connection_id = {id} AND token_version = {expected}
```

If 0 rows affected, another process already refreshed — read the new token from DB.

### Token Revocation

On disconnect:

```
POST {oauthBaseUrl}/services/oauth2/revoke
Content-Type: application/x-www-form-urlencoded
token={refresh_token}
```

If revocation fails, still disconnect locally (log the failure).

### Worker Credential Access Protocol

The worker plane needs Salesforce tokens to execute jobs, but the refresh token must never leave the control plane.

**Internal token-mint endpoint:** `POST /internal/salesforce/access-token`

- Input: `{ connectionId }`
- Auth: worker identity (shared secret, restricted to internal network)
- Behavior:
  1. Look up connection + secrets
  2. Decrypt refresh token server-side
  3. If access token expired, refresh it (update DB)
  4. Return `{ instanceUrl, apiVersion, accessToken, issuedAt }` (short-lived token only)
- NEVER returns the refresh token
- Rate limited and logged

### Connection Health States

| State                      | Meaning                                        | User Action                    |
| -------------------------- | ---------------------------------------------- | ------------------------------ |
| `active`                   | Tokens valid, API calls succeeding             | None                           |
| `connecting`               | OAuth flow in progress (10-min TTL lock)       | Wait for completion            |
| `token_expired`            | Access token expired, refresh succeeded        | None (automatic)               |
| `refresh_failed`           | Refresh token was revoked or expired           | User must re-authorize         |
| `instance_unreachable`     | Salesforce org is down or instance URL changed | Check Salesforce status        |
| `insufficient_permissions` | Token works but user lacks required access     | End-client must adjust profile |
| `disconnected`             | User manually disconnected                     | Reconnect when ready           |

### Error Handling

#### OAuth Flow Errors

| Error                         | Cause                                 | Handling                                         |
| ----------------------------- | ------------------------------------- | ------------------------------------------------ |
| `state` mismatch              | CSRF attempt or expired session       | Show error, ask user to retry                    |
| User denies consent           | Clicked "Deny"                        | Friendly message explaining why access is needed |
| Invalid authorization code    | Code expired or already used          | Ask user to retry                                |
| `invalid_grant`               | Org security policy blocked it        | Surface Salesforce error message                 |
| App not approved / blocked    | ECA not installed in end-client's org | Show pre-connection setup instructions           |
| Concurrent connection attempt | Another user started OAuth            | Show "Connection in progress" message            |

#### Runtime Errors

| Error                    | Cause                     | Handling                                   |
| ------------------------ | ------------------------- | ------------------------------------------ |
| 401 on API call          | Access token expired      | Auto-refresh (optimistic lock), retry once |
| 401 after refresh        | Refresh token revoked     | Mark `refresh_failed`, notify user         |
| 403 on specific object   | Insufficient permissions  | Log which object, surface guidance         |
| `UNABLE_TO_LOCK_ROW`     | Salesforce record locking | Retry with exponential backoff (max 3)     |
| `REQUEST_LIMIT_EXCEEDED` | Hit Salesforce API limits | Back off, surface usage dashboard          |
| Network timeout          | Salesforce downtime       | Retry with backoff, mark connection health |
| Instance URL changed     | Hyperforce migration      | Update stored URL from refresh response    |

#### Edge Cases

1. **User revokes access mid-migration** — next API call fails, connection marked `refresh_failed`, in-progress work preserved
2. **Salesforce org migrated to new instance** — token refresh returns new `instance_url`, auto-updated
3. **Same SF org connected to two different projects** — allowed, each gets own tokens
4. **App secret is rotated** — existing refresh tokens work with old secret during grace period
5. **Authorizing user leaves company** — account deactivation revokes refresh token, prompts re-auth
6. **Same org as source AND target** — allowed, two connections with same `salesforce_org_id` but different `connection_role`
7. **Sandbox cloning and ECA approvals** — pre-AppExchange: manual approval doesn't copy; post-AppExchange: managed packages copy
8. **Multiple target sandboxes** — known v1 limitation (one target per project), future enhancement

---

## 5. Implementation Plan

> Preserved from SALESFORCE-IMPLEMENTATION-PLAN.md. Each task has: (a) Objective, (b1) Description, (b2) Tests, (c) Edge cases, (d) Quality gate.

### Codebase Patterns (reference)

| Pattern                   | Reference File                                               |
| ------------------------- | ------------------------------------------------------------ |
| Drizzle table definition  | `packages/database/src/schema.ts`                            |
| Repository interface      | `packages/contract/src/repositories/types.ts`                |
| Drizzle repository impl   | `apps/server/src/repositories/drizzle/project.repository.ts` |
| Mock repository impl      | `apps/server/src/repositories/mock/project.repository.ts`    |
| Hono route                | `apps/server/src/v1/routes/projects.ts`                      |
| Service class             | `apps/server/src/services/organization.service.ts`           |
| Zod schemas               | `packages/contract/src/index.ts`                             |
| Seed data                 | `packages/seed-data/src/projects.ts`                         |
| React hooks (React Query) | `apps/client/src/features/projects/hooks/use-project-api.ts` |

### Conventions

- All imports use `.ts` extensions (Deno compatibility)
- Response format: `{ success: true, data: ... }` or `{ success: false, error: { code, message } }`
- CSS: `border border-slate-200`, RTL-safe `ms-*`/`me-*`/`start-*`/`end-*`
- Every UI string in both `en/*.json` and `he/*.json`
- Use `AppError` with `ErrorCodes`, never raw `throw new Error()` in routes
- Use `getEnv()`, never `process.env` directly
- Audit log all mutations via `buildAuditContext(c)` + `repos.auditLogs.create()`
- Never log or serialize decrypted tokens

---

### Phase 1: OAuth Connection & Verification

> Spec ref: Sections 6-12, 18

#### Task 1.1: Salesforce ECA Registration (Manual)

**(a) Objective:** RevBrain's External Client App exists in a Salesforce org we control, with Consumer Key and Consumer Secret available as env vars. **Test:** Smoke.

**(b1) Description:** Log into SF Dev org → External Client App Manager → New → Configure per spec: scopes `api refresh_token id`, PKCE required, Distribution State "Packaged", add callback URLs → Copy Consumer Key/Secret to env vars.

**(b2) Tests:** None (manual config). Verify by constructing authorize URL and confirming SF renders login.

**(c) Edge cases:** Consumer Secret shown only once. Callback URL must match EXACTLY (no trailing slash).

**(d) Quality gate:** N/A (manual config only)

---

#### Task 1.2: Encryption Utility

**(a) Objective:** AES-256-GCM encryption with HKDF-derived keys and per-field IVs. **Test:** Unit — 9 test cases.

**(b1) Description:** Create `apps/server/src/lib/encryption.ts` with `ENCRYPTION_CONTEXTS`, `deriveKey`, `encrypt`, `decrypt`, `generateEncryptionKey`. Node.js `crypto` primary, Web Crypto API path for Deno.

**(b2) Tests:**

1. Encrypt then decrypt returns original
2. Different plaintexts → different ciphertexts
3. Same plaintext twice → different ciphertexts (unique IVs)
4. Tampered ciphertext → error
5. Wrong master key → error
6. Wrong context string → error
7. Empty string works
8. Long string (10KB) works
9. Blob format: length = 12 + ciphertext_length + 16

**(c) Edge cases:** `cipher.getAuthTag()` after `cipher.final()`. Buffer order: `IV || encrypted || authTag`. HKDF context strings are constants.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 1.3: Database Schema — Core Salesforce Tables

**(a) Objective:** Four new tables + project alterations. Migration runs against staging. **Test:** Integration.

**(b1) Description:** Add `salesforceConnections`, `salesforceConnectionSecrets`, `oauthPendingFlows`, `salesforceConnectionLogs` tables plus `stakeholders`/`clientCompanyName`/`contractReference`/`estimatedObjects` columns on `projects`. Run `pnpm drizzle-kit generate` → `pnpm db:push`.

**(b2) Tests:**

1. Migration applies without errors
2. UNIQUE(projectId, connectionRole) prevents duplicates
3. Allows one source AND one target per project
4. Cascade: deleting project deletes connections, secrets, logs
5. UNIQUE(connectionId) on secrets prevents multiple secret rows
6. `salesforceOrgId` index exists

**(c) Edge cases:** Drizzle `bytea` Buffer conversion. `oauthPendingFlows` has NO RLS — server-side only.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 1.4: RLS Policies for Salesforce Tables

**(a) Objective:** RLS policies exist for all new tables. **Test:** Integration.

**(b1) Description:** `salesforce_connections`: org-scoped. `salesforce_connection_secrets`: join-based. `salesforce_connection_logs`: join-based. `oauth_pending_flows`: NO RLS (server-only).

**(b2) Tests:**

1. Org A reads own connections
2. Org A CANNOT read Org B's connections/secrets
3. Service role CAN access pending flows
4. Anon key CANNOT access any Salesforce tables

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 1.5: Repository Interfaces — Contract Package

**(a) Objective:** All four repository interfaces in `packages/contract/`. **Test:** Compile.

**(b1) Description:** `SalesforceConnectionEntity` (no tokens), `SalesforceConnectionWithSecretsEntity`, `SalesforceConnectionRepository`, `SalesforceConnectionSecretsRepository`, `OauthPendingFlowRepository`, `SalesforceConnectionLogRepository`. Update `Repositories` type.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 1.6: Drizzle Repository Implementations

**(a) Objective:** All four Drizzle repositories, with encryption in secrets repo and optimistic locking. **Test:** Unit — 19 tests.

**(b1) Description:** `salesforce-connection.repository.ts` (standard CRUD), `salesforce-connection-secrets.repository.ts` (encrypts on write, decrypts on read, optimistic lock), `oauth-pending-flow.repository.ts` (upsert-if-expired), `salesforce-connection-log.repository.ts`.

**(b2) Tests:**
1-5. Connection CRUD and disconnect
6-10. Secrets encrypt/decrypt, optimistic lock, delete
11-17. Pending flow CRUD, upsert-if-expired, cleanup
18-19. Log create and find ordered desc

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 1.7: Mock Repository Implementations

**(a) Objective:** All four mock repos for `pnpm local`, with seed data. **Test:** Unit — 8 tests.

**(b1) Description:** Mock repos in `apps/server/src/repositories/mock/`. Seed data in `packages/seed-data/src/salesforce-connections.ts`.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 1.8: OAuth Service

**(a) Objective:** `SalesforceOAuthService` handles SSRF validation, URL generation, PKCE, token exchange, refresh, revocation. **Test:** Unit — 22 tests.

**(b1) Description:** Create `apps/server/src/services/salesforce-oauth.service.ts` with `validateLoginUrl`, `determineOAuthBaseUrl`, `generateAuthorizationUrl`, `exchangeCodeForTokens`, `refreshAccessToken`, `revokeToken`, `generatePKCE`, `signState`, `verifyState`, `parseOrgAndUserFromIdUrl`.

**(b2) Tests:**
1-10. SSRF validation (valid URLs accepted, invalid rejected)
11-13. OAuth base URL determination 14. PKCE generation
15-17. State sign/verify roundtrip, expiry, tampering
18-20. Token exchange 21. Refresh 22. Revocation

**(c) Edge cases:** SSRF regex `^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.my\.salesforce\.com$` — NOT `.endsWith()`. State signing secret is different from encryption key.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 1.9: Rate Limiting for Salesforce Endpoints

**(a) Objective:** Rate limiting on `/connect` (5/min/user) and `/oauth/callback` (10/min/IP). **Test:** Unit — 4 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 1.10: OAuth Route — Connect Endpoint

**(a) Objective:** `POST /v1/projects/:projectId/salesforce/connect` validates input, creates pending flow, returns redirect URL. `org_owner`/`admin` only. Does NOT create connection row. **Test:** Unit — 15 tests.

**(b2) Tests:**
1-2. Auth (401/403) 3. 200 with redirectUrl for admin
4-5. Error for missing/wrong-org project
6-7. Error if active connection exists, OK if disconnected
8-9. Error if live pending flow, OK if expired 10. redirectUrl has correct params
11-13. Sandbox/custom domain/SSRF handling
14-15. Pending flow created, no connection row

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 1.11: OAuth Route — Callback Endpoint

**(a) Objective:** `GET /v1/salesforce/oauth/callback` completes OAuth with anti-leak headers + CSP nonce. **Test:** Unit — 17 tests.

**(b1) Description:** No auth middleware (public). Validates state → finds pending flow → exchanges code → creates connection (status=active) → creates secrets (encrypted) → deletes pending flow → runs audit → logs events → renders HTML with `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, nonce-based CSP → postMessage to opener.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 1.12: Post-Connection Permission Audit

**(a) Objective:** Auto-checks CPQ installation, object access, API budget after OAuth. **Test:** Unit — 9 tests.

**(b1) Description:** `salesforce-audit.service.ts`: API version detection, CPQ version (Tooling with Publisher fallback), describe SBQQ objects, RCA check on target, limits, profile parsing. 5s timeout per check.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 1.13: Status, Test, Disconnect, Reconnect Endpoints

**(a) Objective:** View status (with `connecting` from pending flows), test connection, disconnect (delete secrets + revoke), reconnect. **Test:** Unit — 16 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 1.14: Client UI — Salesforce Connection Components

**(a) Objective:** Project workspace shows Source/Target connection slots with popup OAuth + fallback. **Test:** Component — 12 tests.

**(b1) Description:** Hooks (`useSalesforceConnections` with 30s poll, `useConnectSalesforce` with popup+fallback+postMessage, `useDisconnectSalesforce`, `useTestSalesforceConnection`). Components: `SalesforceConnectionCard`, `SalesforceConnectionsSection`, `DisconnectConfirmModal`. Translations in `en/salesforce.json` + `he/salesforce.json`.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 1.15: Mock Mode Support

**(a) Objective:** `pnpm local` works with simulated connections. **Test:** Smoke.

Mock callback guarded by `AUTH_MODE=mock`.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 1.16: Environment Variables

**(a) Objective:** All new env vars documented. **Test:** Smoke — `pnpm local` starts.

New vars: `SALESFORCE_CONSUMER_KEY`, `SALESFORCE_CONSUMER_SECRET`, `SALESFORCE_TOKEN_ENCRYPTION_KEY`, `SALESFORCE_STATE_SIGNING_SECRET`, `SALESFORCE_CALLBACK_URL`, `APP_URL`.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 1.17: Pending Flow Cleanup Job

**(a) Objective:** Expired `oauth_pending_flows` cleaned up hourly. **Test:** Unit — 3 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 1.18: Customer-Facing Setup Guide

**(a) Objective:** `docs/customer/SALESFORCE-SETUP-GUIDE.md` for end-client admins. **Test:** Manual review.

---

#### Task 1.19: Security Checklist Verification — Phase 1

**(a) Objective:** All Phase 1 security checklist items verified. **Test:** Manual + automated.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Phase 1 Total

| Component                     | Effort           |
| ----------------------------- | ---------------- |
| ECA setup                     | ~1-2 hours       |
| Database schema               | ~4-6 hours       |
| Token encryption (with HKDF)  | ~5-6 hours       |
| Repository layer              | ~8-10 hours      |
| OAuth flow + permission audit | ~12-15 hours     |
| Status/test endpoints         | ~3-4 hours       |
| Client UI (popup flow)        | ~8-10 hours      |
| Mock mode + tests             | ~6-8 hours       |
| **Total**                     | **~47-61 hours** |

---

### Phase 2: CPQ Data Extraction & Worker Plane

> Introduces the worker plane (`apps/worker/`). All long-running Salesforce operations run on the worker, NOT on Edge Functions.

#### Task 2.0: Worker App Foundation

**(a) Objective:** `apps/worker/` exists as a Node.js app with job polling and graceful shutdown. **Test:** Integration — 6 tests.

**(b1) Description:** `package.json`, `src/index.ts` (startup/polling/shutdown), `src/job-poller.ts` (atomic claim via `UPDATE ... WHERE status = 'queued' RETURNING *`), `src/config.ts`, `Dockerfile`. Add `pnpm worker` script.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 2.0.1: Assessment Run Data Model

**(a) Objective:** `cpqAssessmentRuns` and `cpqAssessmentRunEvents` tables. **Test:** Integration + unit — 8 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 2.0.2: Internal Token-Mint Endpoint

**(a) Objective:** `POST /internal/salesforce/access-token` for worker credential access. **Test:** Unit — 8 tests.

**(b1) Description:** Auth via `WORKER_SECRET`. Returns `{ instanceUrl, apiVersion, accessToken, issuedAt }`. NEVER returns refresh token. Rate limited 60/min per connection.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 2.0.3: Start Assessment Endpoint + UI

**(a) Objective:** User clicks "Start CPQ Assessment" → creates run → enqueues job. **Test:** Unit — 10 + Component — 6 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 2.0.4: Assessment Job Handler (Worker Side)

**(a) Objective:** Worker handles `cpq_assessment` jobs. **Test:** Unit — 10 tests.

**(b1) Description:** Fetches token via token-mint → runs extraction/analysis/mapping pipeline → reports progress → stores results. Catches ALL errors and updates run status.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 2.1: Salesforce REST API Client

**(a) Objective:** `SalesforceClient` with pagination, refresh retry, API tracking. **Test:** Unit — 18 tests.

**(b1) Description:** Methods: `query`, `queryAll`, `describe`, `describeGlobal`, `getRecord`, `createRecord`, `updateRecord`, `upsertRecord`, `toolingQuery`, `getLimits`. Internal `request()` with 401 → refresh → retry once.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 2.2: Bulk & Composite API Clients

**(a) Objective:** Composite (batch 25) and Bulk 2.0 (CSV). **Test:** Unit — 12 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 2.3: CPQ Object Discovery Service

**(a) Objective:** Detects CPQ version, enumerates SBQQ objects, fetches field metadata. **Test:** Unit — 7 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 2.4: Extracted Data Schema + Repository

**(a) Objective:** `cpqExtractedData` table. **Test:** Integration + unit — 5 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 2.5: Data Extraction Engine

**(a) Objective:** Pulls all CPQ data with progress, incremental support, API limit awareness. **Runs on worker plane.** **Test:** Unit — 18 tests.

**(b1) Description:** Orchestrator, SOQL builder (validates fields from describe), progress tracker. REST for <10K records, Bulk for >10K. Incremental via `SystemModstamp`. Pauses at 80% API limit.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 2.6: CPQ Explorer UI

**(a) Objective:** CPQ Explorer tab with categories, search/filter, rule visualizer, bundle tree, QCP syntax highlighting. **Test:** Component — 10 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 2.7: Extraction Monitoring UI

**(a) Objective:** Progress bars, API usage, re-extract/refresh buttons. **Test:** Component — 6 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 2.8: Structured API Logging

**(a) Objective:** Every SF API call logged with project, method, endpoint, status, duration, usage. **Test:** Unit — 4 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Phase 2 Total: **~50-66 hours** (~2-3 weeks solo, ~1-2 weeks with 2 devs)

---

### Phase 3: Connection Resilience & Token Management

#### Task 3.1: Token Refresh Service

**(a) Objective:** Proactive heuristic (90min), optimistic locking, retry, permanent failure detection. **Test:** Unit — 10 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 3.2: Health Monitoring Job

**(a) Objective:** Checks all active connections every 30min. **Test:** Unit — 6 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 3.3: In-App Notifications

**(a) Objective:** Project banners for connection issues. **Test:** Component — 5 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 3.4: Email Notifications

**(a) Objective:** Email to connectedBy user on failure. Rate limited 1/24h. **Test:** Unit — 4 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 3.5: Reconnect Flow

**(a) Objective:** Re-authorize broken connection, preserve ID+history. **Test:** Unit — 6 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 3.6: Encryption Key Rotation

**(a) Objective:** Admin endpoint re-encrypts all secrets with new key. **Test:** Unit — 5 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 3.7: Connection Logs UI

**(a) Objective:** Timeline view of connection events. **Test:** Component — 5 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 3.8: Data Retention — Cleanup Job

**(a) Objective:** Weekly purge: extracted data 90d, mappings 180d, logs 1y after project completion. **Test:** Unit — 6 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 3.9: On-Demand Data Deletion Endpoint

**(a) Objective:** Tenant admin deletes all SF data for a project. **Test:** Unit — 6 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 3.10: Storage Bucket Setup + Signed URL Service

**(a) Objective:** Supabase Storage bucket for project-scoped artifacts. **Test:** Integration — 4 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Phase 3 Total: **~26-38 hours** (~1-2 weeks solo)

---

### Phase 4: CPQ Analysis & Migration Mapping

> Worker plane: mapping engine, QCP analyzer, and plan generator run on the worker as part of the CPQ assessment pipeline.

#### Task 4.0: Phase 4/5 Persistence Schema

**(a) Objective:** Tables for mapping reports, migration plans, deployment runs, validation results. **Test:** Integration.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 4.1: Mapping Rules Database

**(a) Objective:** Versioned, data-driven mapping rules (17 mapping pairs). **Test:** Unit — 8 tests.

**CPQ→RCA Mapping Table:**

| CPQ Concept             | CPQ Object                         | RCA Equivalent                | RCA Object                               | Complexity |
| ----------------------- | ---------------------------------- | ----------------------------- | ---------------------------------------- | ---------- |
| Product                 | `Product2` + `SBQQ__*` fields      | Product + Selling Model       | `Product2` + `ProductSellingModel`       | Simple     |
| Bundle                  | `SBQQ__ProductOption__c`           | Product Relationship          | `ProductRelationship`                    | Moderate   |
| Features                | `SBQQ__Feature__c`                 | Product Relationship Groups   | Native grouping                          | Moderate   |
| Price Rule              | `SBQQ__PriceRule__c`               | Pricing Procedure             | `PricingProcedure` + Steps               | Complex    |
| Price Condition/Action  | `SBQQ__PriceCondition/Action__c`   | Pricing Procedure Steps       | `PricingProcedureStep`                   | Complex    |
| Discount Schedule       | `SBQQ__DiscountSchedule__c`        | Pricing Adjustment            | `PricingAdjustment` + Tiers              | Moderate   |
| Block Price             | `SBQQ__BlockPrice__c`              | Pricing Plan                  | `PricingPlan` + Steps                    | Moderate   |
| Product Rule            | `SBQQ__ProductRule__c`             | Constraint Modeling Language  | Constraint rules                         | Complex    |
| Configuration Rule      | `SBQQ__ConfigurationRule__c`       | Product Configurator (native) | Native configurator rules                | Complex    |
| Configuration Attribute | `SBQQ__ConfigurationAttribute__c`  | Dynamic Attributes            | Dynamic attribute definitions            | Complex    |
| QCP (JS calculations)   | `SBQQ__CustomScript__c`            | Pricing Procedure             | Custom pricing logic                     | Manual     |
| QCP (field visibility)  | `isFieldVisible`/`isFieldEditable` | OmniStudio / LWC              | Custom LWC components                    | Manual     |
| Quote Template          | `SBQQ__QuoteTemplate__c`           | OmniStudio Doc Generation     | OmniStudio FlexCard / Document Template  | Complex    |
| Custom Action           | `SBQQ__CustomAction__c`            | Flow / LWC Action             | Platform Flows + LWC                     | Complex    |
| Guided Selling          | CPQ Guided Selling Flow            | OmniStudio Guided Selling     | OmniStudio FlexCards + Integration Procs | Complex    |
| N/A (new in RCA)        | —                                  | Context Definition Service    | `ContextDefinition`                      | New        |
| N/A (new in RCA)        | —                                  | Dynamic Revenue Orchestration | Order decomposition engine               | New        |

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 4.2: Mapping Engine

**(a) Objective:** Applies rules to extracted data, produces report with scores/coverage/gaps. **Test:** Unit — 12 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 4.3: QCP Code Analyzer

**(a) Objective:** Parses QCP JS via AST (`acorn`), identifies methods, classifies complexity. **Test:** Unit — 12 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 4.4: Migration Plan Generator

**(a) Objective:** Auto-generates phased plan from mapping+QCP analysis. **Test:** Unit — 8 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 4.5: Migration Analysis UI

**(a) Objective:** Workspace shows mapping report, QCP analysis, migration plan. **Test:** Component — 8 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Phase 4 Total: **~47-65 hours** (~2-3 weeks solo)

---

### Phase 5: RCA Write-Back & Deployment

> Worker plane: write-back, validation, and rollback run on the worker as `rca_deployment` job type.

#### Task 5.1: Coexistence Detection Service

**(a) Objective:** Detects CPQ/RCA coexistence in target org. **Test:** Unit — 6 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 5.2: Deployment Plan Generator

**(a) Objective:** Topologically sorted plan with data/metadata split. **Test:** Unit — 8 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 5.3: RCA Object Creation Service

**(a) Objective:** Creates RCA records via upsert with external IDs (`RevBrain_Migration_Key__c`). **Test:** Unit — 12 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 5.4: Metadata Artifact Generator

**(a) Objective:** Generates Metadata API zip packages for custom fields, permission sets. **Test:** Unit — 8 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 5.5: Validation & Comparison Engine

**(a) Objective:** Compares RCA pricing against CPQ quote snapshots. **Test:** Unit — 10 tests.

**(c) Edge cases:** Currency-aware tolerance: USD/EUR = +-0.01, JPY = +-1, BHD = +-0.001.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 5.6: Rollback Service

**(a) Objective:** Tracks deployed records, deletes in reverse dependency order. **Test:** Unit — 7 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 5.7: Write-Back UI

**(a) Objective:** Deployment UI with coexistence check, deploy+progress, validate, rollback. **Test:** Component — 10 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Phase 5 Total: **~50-70 hours** (~2-3 weeks solo)

---

### Phase 6: Browser Automation

> Extends existing `apps/worker/` with Playwright/Chromium. NOT a new worker app.

#### Task 6.1: Browser Automation Credentials Table + Repository

**(a) Objective:** `browser_automation_credentials` table with encrypted creds (HKDF context 'browser_cred'). **Test:** Unit — 8 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 6.2: Browser Credentials UI + Consent Flow

**(a) Objective:** Credential input form with explicit consent. **Test:** Component — 7 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 6.3: Playwright Integration into Existing Worker

**(a) Objective:** Browser pool, isolated contexts, `browser_automation` job type. **Test:** Integration — 5 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 6.4: Salesforce Login Automation

**(a) Objective:** Automated login with TOTP MFA. **Test:** Integration — 6 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 6.5: QLE Behavioral Capture

**(a) Objective:** Captures field visibility/editability in QLE. **Test:** Integration — 5 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 6.6: Configurator Behavioral Capture

**(a) Objective:** Captures option visibility and selection dependencies. **Test:** Integration — 5 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 6.7: Behavioral Analysis Results + UI

**(a) Objective:** Store results, display field visibility matrices, screenshots. **Test:** Component — 6 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Phase 6 Total: **~64-84 hours** (~3-4 weeks solo)

---

### Phase 7: Enterprise Hardening & AppExchange

#### Task 7.1: 2GP Package Setup

**(a) Objective:** ECA packaged as 2GP managed package. **Test:** Smoke.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 7.2: AppExchange Security Review

**(a) Objective:** Passes Salesforce security review. **Test:** Checkmarx scan + pen test.

---

#### Task 7.3: JWT Bearer Flow

**(a) Objective:** Certificate-based auth for enterprise. **Test:** Integration — 5 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 7.4: API Usage Tracking Dashboard

**(a) Objective:** Per-project daily tracking, throttle 80%, alert 90%. **Test:** Unit — 6 + Component — 4 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 7.5: RCA Feature Parity Tracking

**(a) Objective:** Version-aware rules, auto-flag new automatable mappings. **Test:** Unit — 4 tests.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Task 7.6: Compliance Documentation

**(a) Objective:** SOC 2 ready docs. **Test:** Document review.

---

#### Task 7.7: Security Checklist — Full System Verification

**(a) Objective:** All security checklist items verified. **Test:** Automated + manual audit.

**(d) Quality gate:** `pnpm format && pnpm lint && pnpm test && pnpm build`

---

#### Phase 7 Total: **~67-103 hours**

---

### Timeline Summary

| Phase       | What You Get                        | Dev Effort         | Calendar (1 dev) | Calendar (2 devs) |
| ----------- | ----------------------------------- | ------------------ | ---------------- | ----------------- |
| **Phase 1** | Connect + verify + permission audit | ~47-61 hrs         | ~2-3 weeks       | ~1-2 weeks        |
| **Phase 2** | Extract and view all CPQ data       | ~50-66 hrs         | ~2-3 weeks       | ~1-2 weeks        |
| **Phase 3** | Reliable long-running connections   | ~26-38 hrs         | ~1-2 weeks       | ~1 week           |
| **Phase 4** | CPQ→RCA mapping and migration plan  | ~47-65 hrs         | ~2-3 weeks       | ~1-2 weeks        |
| **Phase 5** | RCA write-back and validation       | ~50-70 hrs         | ~2-3 weeks       | ~1-2 weeks        |
| **Phase 6** | Browser-based behavioral analysis   | ~64-84 hrs         | ~3-4 weeks       | ~2-3 weeks        |
| **Phase 7** | AppExchange, enterprise, compliance | ~67-103 hrs        | ~3-5 weeks       | ~2-3 weeks        |
| **Total**   |                                     | **~355-489 hours** |                  |                   |

### Task Dependency Graph

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
  6.1 → 6.2 → 6.3 (extend existing worker) → 6.4 → 6.5 + 6.6 → 6.7

Phase 7 (start 7.1-7.2 with P4-5):
  7.1 → 7.2 early; 7.3 after 7.1; 7.4 after 2.8; 7.5 after 4.1; 7.6 anytime; 7.7 last
```

### Implementation Progress Tracker

| Task  | Description                                   | Status         | Commit    |
| ----- | --------------------------------------------- | -------------- | --------- |
| 1.1   | Salesforce ECA Registration (Manual)          | ⬜ Not Started | —         |
| 1.2   | Encryption Utility                            | ✅ Done        | `7c94a81` |
| 1.3   | Database Schema — Core Salesforce Tables      | ✅ Done        | `472fb28` |
| 1.4   | RLS Policies for Salesforce Tables            | ⬜ Not Started | —         |
| 1.5   | Repository Interfaces — Contract Package      | ✅ Done        | `e3f258f` |
| 1.6   | Drizzle Repository Implementations            | ✅ Done        | `1eb9333` |
| 1.7   | Mock Repository Implementations               | ✅ Done        | `ed42ef1` |
| 1.8   | OAuth Service                                 | ✅ Done        | `0e3625b` |
| 1.9   | Rate Limiting for Salesforce Endpoints        | ✅ Done        | `ac54c24` |
| 1.10  | OAuth Route — Connect Endpoint                | ✅ Done        | `1930084` |
| 1.11  | OAuth Route — Callback Endpoint               | ✅ Done        | `1930084` |
| 1.12  | Post-Connection Permission Audit              | ✅ Done        | `1930084` |
| 1.13  | Status, Test, Disconnect, Reconnect Endpoints | ✅ Done        | `1930084` |
| 1.14  | Client UI — Salesforce Connection Components  | ⬜ Not Started | —         |
| 1.15  | Mock Mode Support                             | ✅ Done        | `338c8ad` |
| 1.16  | Environment Variables                         | ✅ Done        | `87d3c4b` |
| 1.17  | Pending Flow Cleanup Job                      | ✅ Done        | `338c8ad` |
| 1.18  | Customer-Facing Setup Guide                   | ✅ Done        | `338c8ad` |
| 1.19  | Security Checklist Verification — Phase 1     | ⬜ Not Started | —         |
| 2.0   | Worker App Foundation                         | ⬜ Not Started | —         |
| 2.0.1 | Assessment Run Data Model                     | ⬜ Not Started | —         |
| 2.0.2 | Internal Token-Mint Endpoint                  | ⬜ Not Started | —         |
| 2.0.3 | Start Assessment Endpoint + UI                | ⬜ Not Started | —         |
| 2.0.4 | Assessment Job Handler (Worker Side)          | ⬜ Not Started | —         |
| 2.1   | Salesforce REST API Client                    | ⬜ Not Started | —         |
| 2.2   | Bulk & Composite API Clients                  | ⬜ Not Started | —         |
| 2.3   | CPQ Object Discovery Service                  | ⬜ Not Started | —         |
| 2.4   | Extracted Data Schema + Repository            | ⬜ Not Started | —         |
| 2.5   | Data Extraction Engine                        | ⬜ Not Started | —         |
| 2.6   | CPQ Explorer UI                               | ⬜ Not Started | —         |
| 2.7   | Extraction Monitoring UI                      | ⬜ Not Started | —         |
| 2.8   | Structured API Logging                        | ⬜ Not Started | —         |
| 3.1   | Token Refresh Service                         | ⬜ Not Started | —         |
| 3.2   | Health Monitoring Job                         | ⬜ Not Started | —         |
| 3.3   | In-App Notifications                          | ⬜ Not Started | —         |
| 3.4   | Email Notifications                           | ⬜ Not Started | —         |
| 3.5   | Reconnect Flow                                | ⬜ Not Started | —         |
| 3.6   | Encryption Key Rotation                       | ⬜ Not Started | —         |
| 3.7   | Connection Logs UI                            | ⬜ Not Started | —         |
| 3.8   | Data Retention — Cleanup Job                  | ⬜ Not Started | —         |
| 3.9   | Data Retention — On-Demand Deletion           | ⬜ Not Started | —         |
| 3.10  | Storage Bucket Setup + Signed URL Service     | ⬜ Not Started | —         |
| 4.0   | Phase 4/5 Persistence Schema                  | ⬜ Not Started | —         |
| 4.1   | Mapping Rules Database                        | ⬜ Not Started | —         |
| 4.2   | Mapping Engine                                | ⬜ Not Started | —         |
| 4.3   | QCP Code Analyzer                             | ⬜ Not Started | —         |
| 4.4   | Migration Plan Generator                      | ⬜ Not Started | —         |
| 4.5   | Migration Analysis UI                         | ⬜ Not Started | —         |
| 5.1   | Coexistence Detection Service                 | ⬜ Not Started | —         |
| 5.2   | Deployment Plan Generator                     | ⬜ Not Started | —         |
| 5.3   | RCA Object Creation Service                   | ⬜ Not Started | —         |
| 5.4   | Metadata Artifact Generator                   | ⬜ Not Started | —         |
| 5.5   | Validation & Comparison Engine                | ⬜ Not Started | —         |
| 5.6   | Rollback Service                              | ⬜ Not Started | —         |
| 5.7   | Write-Back UI                                 | ⬜ Not Started | —         |
| 6.1   | Browser Automation Credentials Table + Repo   | ⬜ Not Started | —         |
| 6.2   | Browser Credentials UI + Consent Flow         | ⬜ Not Started | —         |
| 6.3   | Playwright Integration into Existing Worker   | ⬜ Not Started | —         |
| 6.4   | Salesforce Login Automation                   | ⬜ Not Started | —         |
| 6.5   | QLE Behavioral Capture                        | ⬜ Not Started | —         |
| 6.6   | Configurator Behavioral Capture               | ⬜ Not Started | —         |
| 6.7   | Behavioral Analysis Results + UI              | ⬜ Not Started | —         |
| 7.1   | 2GP Package Setup                             | ⬜ Not Started | —         |
| 7.2   | AppExchange Security Review                   | ⬜ Not Started | —         |
| 7.3   | JWT Bearer Flow                               | ⬜ Not Started | —         |
| 7.4   | API Usage Tracking Dashboard                  | ⬜ Not Started | —         |
| 7.5   | RCA Feature Parity Tracking                   | ⬜ Not Started | —         |
| 7.6   | Compliance Documentation                      | ⬜ Not Started | —         |
| 7.7   | Security Checklist — Full System Verification | ⬜ Not Started | —         |

### Database Migration Strategy

Each phase creates its own migration:

- **Phase 1:** salesforceConnections, salesforceConnectionSecrets, oauthPendingFlows, salesforceConnectionLogs + projects alterations
- **Phase 2:** cpqAssessmentRuns, cpqAssessmentRunEvents, cpqExtractedData
- **Phase 4:** mappingReports, migrationPlans, deploymentRuns, deploymentRunItems, validationRuns
- **Phase 6:** browserAutomationCredentials, browserAutomationResults
- **Phase 7:** potential apiUsage table

### Worker Health & Monitoring

- **Stale job detection:** every 5 minutes, marks `running` jobs with no progress for >15 minutes as `failed`
- **Health endpoint:** `GET /health` returns `{ status, activeJobs, uptime }`
- **Observability:** structured logging, `onApiCall` callback
- **Auto-restart:** Docker `restart: unless-stopped`

### Queue Strategy

Phase 1-3: Postgres `jobQueue` with worker polling (2s interval, atomic claim). Migration to cloud queue (SQS / Cloud Tasks) when Postgres CPU > 70% or concurrent jobs regularly exceed 50.

---

## 6. Connection Plan

> Hono-specific implementation details from the FastAPI prototype port. Unique content not covered in previous sections.

### What the Prototype Proved

Niv's Python prototype (FastAPI) successfully demonstrated:

1. Salesforce Connected App configured as an External Client App with PKCE OAuth
2. PKCE Authorization Code flow — browser redirects to Salesforce login, backend exchanges code for tokens
3. Server-side token storage — access/refresh tokens never sent to browser
4. Automatic token refresh — transparent retry on 401
5. SOQL queries — fetched CPQ products and quotes via Salesforce REST API v59.0
6. CSV export — streamed quote data as downloadable CSV

### What the Prototype Did NOT Do (added in production)

- Store credentials in a database (used in-memory dicts)
- Support multiple concurrent connections per project
- Handle multi-tenant isolation (org-scoped access)
- Support sandbox vs. production org detection
- Store connection metadata (org name, org type, CPQ version)
- Encrypt tokens at rest

### Connected App Settings (from prototype)

| Setting                                      | Value                                                    |
| -------------------------------------------- | -------------------------------------------------------- |
| App Name                                     | `revBrainTest`                                           |
| Callback URL                                 | `http://localhost:3000/api/v1/salesforce/oauth/callback` |
| OAuth Scopes                                 | `id`, `api`, `refresh_token` (offline_access)            |
| Enable Authorization Code + Credentials Flow | Yes                                                      |
| Require Secret for Web Server Flow           | Yes                                                      |
| Require Secret for Refresh Token Flow        | Yes                                                      |
| Require PKCE                                 | Yes                                                      |

### Object Name Note

- Most CPQ orgs use `Product2` (standard object extended with `SBQQ__` fields)
- Some older installs use `SBQQ__Product__c` (custom CPQ product object)
- If query returns `sObject type 'SBQQ__Product__c' is not supported`, switch to `Product2`

### Two-Step Implementation Approach

**Step 1: Replicate the exact prototype flow.** Port Python prototype logic to TypeScript/Hono without changing the Connected App. Same callback URL, same credentials, same PKCE flow. Goal: confirm OAuth works from Node/Hono with existing Connected App configuration.

**Step 2: Production hardening.** Update Connected App for staging/production callbacks, implement token encryption, database storage, multi-tenant isolation, health monitoring, full client UI.

**Why this order matters:** Isolates variables — if Step 1 fails, it's a code bug, not a Salesforce config issue.

### Connection Plan Task Tracker

#### Phase A: Server-Side Foundation — ALREADY IMPLEMENTED

> All types, schemas, repositories (mock + Drizzle + PostgREST), OAuth service with PKCE/SSRF/signed state, audit service, routes, mock callback, and 35 unit tests are complete and passing.

| Task | Objective                                                         | Status          |
| ---- | ----------------------------------------------------------------- | --------------- |
| A.1  | Salesforce connection types and constants in `@revbrain/contract` | ✅ Pre-existing |
| A.2  | Token encryption helpers                                          | ✅ Pre-existing |
| A.3  | Database schema for connections + PKCE state                      | ✅ Pre-existing |
| A.4  | PKCE OAuth service                                                | ✅ Pre-existing |
| A.5  | Salesforce query service                                          | ✅ Pre-existing |
| A.6  | Mock Salesforce service                                           | ✅ Pre-existing |
| A.7  | Salesforce API routes                                             | ✅ Pre-existing |

#### Phase B: Client-Side Connection UI

| Task | Objective                                               | Status  | Commit    |
| ---- | ------------------------------------------------------- | ------- | --------- |
| B.1  | Salesforce connection React Query hooks                 | ✅ Done | `af3ac74` |
| B.2  | Connect flow UI (OAuth popup/redirect with postMessage) | ✅ Done | `d2d5db7` |
| B.3  | Connection status card on workspace Overview            | ✅ Done | `d2d5db7` |
| B.4  | Connection health polling (5-min interval)              | ✅ Done | `af3ac74` |

#### Phase C: Real Credentials & End-to-End Testing

| Task | Objective                                                                         | Status         |
| ---- | --------------------------------------------------------------------------------- | -------------- |
| C.1  | Wire real Salesforce credentials from prototype `.env` into RevBrain `.env.local` | ⬜ Not Started |
| C.2  | End-to-end test: connect to real Salesforce org, verify CPQ data returns          | ⬜ Not Started |
| C.3  | Update Connected App callback URL if needed for production                        | ⬜ Not Started |

---

## 7. Security

### Security Checklist

- [ ] **No plaintext tokens in database** — all tokens AES-256-GCM encrypted with per-field IV
- [ ] **Encryption key in env vars only** — never in code, DB, or logs
- [ ] **Derived keys per data class** — HKDF with different context strings for OAuth tokens vs browser credentials
- [ ] **PKCE enforced** — prevents authorization code interception
- [ ] **State parameter signed (nonce + exp only)** — prevents CSRF, minimal data exposure
- [ ] **PKCE verifier stored server-side** — never transmitted through user agent (RFC 7636 compliant)
- [ ] **Callback page anti-leak headers** — `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, nonce-based CSP
- [ ] **Tokens never sent to client** — browser only sees connection status
- [ ] **RLS on salesforce_connections** — org-scoped, no cross-tenant access
- [ ] **Audit logging** — all connect/disconnect/refresh events logged
- [ ] **Token revocation on disconnect** — actively revoke at Salesforce, don't just delete locally
- [ ] **HTTPS only** — callback URL must be HTTPS (except localhost dev)
- [ ] **Refresh token rotation** — if Salesforce enables it, store the new refresh token
- [ ] **Secrets scanning** — CI pipeline checks for leaked tokens in code
- [ ] **Access logging** — log which user/project triggered each Salesforce API call
- [ ] **Rate limiting on initiation AND callback endpoints** — prevent abuse
- [ ] **SOQL injection prevention** — validate all object/field names against describe(), escape values
- [ ] **loginUrl SSRF prevention** — allowlist Salesforce-owned hostnames only, reject IP literals/localhost/RFC1918, HTTPS required
- [ ] **postMessage origin locking** — callback uses hardcoded `APP_ORIGIN`, parent verifies `event.origin`
- [ ] **Connection locking** — `connecting` status with TTL prevents concurrent OAuth flows
- [ ] **Data retention enforcement** — automated cleanup of extracted data after retention window
- [ ] **Post-connection permission audit** — verify CPQ access immediately after OAuth
- [ ] **Browser credentials encrypted** — username, password, MFA secret all AES-256-GCM encrypted (Phase 6)
- [ ] **Browser credentials in separate table** — not mixed with OAuth connection data
- [ ] **Playwright sessions isolated** — separate container context per project
- [ ] **Browser sessions short-lived** — closed after each job
- [ ] **Screenshots access-controlled** — project-scoped storage, never publicly accessible
- [ ] **Structured API call logging** — every SF API call logs project ID, connection role, HTTP method, endpoint, response code, duration, Sforce-Limit-Info remaining
- [ ] **API usage metrics** — per-project daily call counts, error rates, refresh frequency
- [ ] **Alerting** — API budget exhaustion (80%/90% thresholds), sustained error rates, token refresh failures
- [ ] **Worker credential isolation** — worker obtains tokens ONLY via internal token-mint endpoint; refresh token never leaves control plane
- [ ] **Token-mint endpoint secured** — authenticated via worker secret, rate-limited, logged, restricted to internal network
- [ ] **Queue payload minimal** — contains only `{ assessmentRunId }` or `{ jobId }`, never tokens or secrets
- [ ] **Stale job detection** — jobs stuck in `running` >15 min auto-marked as failed

### SOQL Injection Protection

- All object/field names validated against `describe()` results before inclusion in queries
- User-provided filter values escaped using Salesforce SOQL escaping rules
- Extraction engine uses only hardcoded SOQL templates with field names from `describe()` — no raw user input

### RLS Policies

- `salesforce_connections`: `organization_id = auth.jwt() -> 'organization_id'`
- `salesforce_connection_secrets`: join-based via `salesforce_connections.organization_id`
- `salesforce_connection_logs`: join-based via `salesforce_connections.organization_id`
- `oauth_pending_flows`: NO RLS (server-only, service role key)

### Encryption Architecture

| Option                    | Verdict                                                             |
| ------------------------- | ------------------------------------------------------------------- |
| Store plaintext           | Unacceptable — DB breach = full compromise                          |
| Hashing                   | Tokens need recovery — hashing is one-way                           |
| AES-256-CBC               | No integrity check — vulnerable to padding oracle                   |
| **AES-256-GCM**           | **Authenticated encryption — confidentiality + integrity + fast**   |
| Supabase Vault (pgsodium) | Evaluated — handles key management natively but adds vendor lock-in |
| Vault/KMS (AWS/GCP)       | Best for scale, good future improvement                             |

### Resolved Design Decisions

1. **Popup with redirect fallback** for OAuth flow
2. **My Domain login URLs** supported from Day 1
3. **API version auto-detected** (not hardcoded)
4. **Supabase Vault** — spike evaluated in Phase 1
5. **Stateful PKCE storage** — code verifier stored server-side with TTL
6. **External Client App** over legacy Connected App
7. **ECA supports JWT Bearer Flow** — confirmed, enables Phase 7

### Remaining Open Questions

1. Should JWT Bearer flow be offered as alternative for enterprise tenants? (Lean: defer to Phase 7)
2. How to handle very large orgs (>100K CPQ records)? (Lean: pagination + lazy loading)
3. Should AppExchange listing be pursued earlier (Phase 3-4)? (Lean: start security review in parallel)
4. Do we need to handle Salesforce DX scratch orgs? (Lean: not in initial scope)
5. Should we add a `project_admin` role for project-level connection management? (Lean: evaluate after launch)
6. Should we leverage the Named Query API for extraction? (Lean: evaluate during Phase 7)

---

## Appendix A: Salesforce OAuth Token Format

```
Access Token:  00D5g00000XXXXX!AQEAQ... (starts with org ID, ~120 chars)
Refresh Token: 5Aep861... (~40 chars, opaque)
Instance URL:  https://globalcorp.my.salesforce.com
Org ID:        00D5g00000XXXXX (15 or 18 char Salesforce ID)
User ID:       0055g00000YYYYY
```

## Appendix B: Relevant Salesforce Documentation

- [External Client Apps Overview](https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/intro_external_client_apps.htm)
- [OAuth 2.0 Web Server Flow](https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/intro_understanding_web_server_oauth_flow.htm)
- [OAuth Scopes](https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_tokens_scopes.htm)
- [Token Refresh](https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/intro_understanding_refresh_token_oauth.htm)
- [PKCE for Salesforce](https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_PKCE.htm)
- [Bulk API 2.0](https://developer.salesforce.com/docs/atlas.en-us.api_asynch.meta/api_asynch/asynch_api_intro.htm)
- [Composite API](https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/resources_composite.htm)
- [CPQ Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.cpq_dev_api.meta/cpq_dev_api/cpq_api_get_started.htm)
- [JavaScript Quote Calculator Plugin](https://developer.salesforce.com/docs/atlas.en-us.cpq_dev_plugins.meta/cpq_dev_plugins/cpq_dev_jsqcp_parent.htm)
- [Revenue Cloud Advanced Documentation](https://developer.salesforce.com/docs/revenue/revenue-cloud/overview)

## Appendix C: Auditor Feedback Resolution Matrix

### v2 → v3 (first audit round, 28 items)

| #     | Issue                                         | Severity | Resolution                                 |
| ----- | --------------------------------------------- | -------- | ------------------------------------------ |
| 1     | Connected App installation requirement        | Critical | Added pre-connection guide, ECA            |
| 2     | External Client App over legacy Connected App | Critical | Fully rewritten for ECA                    |
| 3     | IV reuse in encryption                        | Critical | Per-field IV packed into BYTEA blob + HKDF |
| 4     | API version outdated                          | Critical | Auto-detection, no hardcoding              |
| 5     | RCA mapping incomplete                        | Critical | Expanded to 17 rows, version-aware         |
| 6     | No write-back phase                           | High     | New Phase 5                                |
| 7     | Single connection per project                 | High     | Source+target model                        |
| 8     | No data retention policy                      | High     | Added retention policy                     |
| 9     | No Bulk/Composite API strategy                | High     | Phase 2 Step 2.2                           |
| 10    | My Domain Day 1                               | High     | `custom_login_url` field                   |
| 11    | Post-connection permission audit              | High     | Added to OAuth callback                    |
| 12-28 | Medium/Low items                              | Med/Low  | All resolved                               |

### v3 → v4 (second audit round, 18 items)

| #     | Issue                                      | Severity | Resolution                                           |
| ----- | ------------------------------------------ | -------- | ---------------------------------------------------- |
| 29    | PKCE verifier in browser-transmitted state | Must-fix | Reverted to stateful storage with TTL                |
| 30    | OAuth base URL inconsistency               | Must-fix | `oauth_base_url` stored per connection               |
| 31    | Popup flow HTTP mechanics                  | Must-fix | `fetch()` + `window.open()` + popup blocker fallback |
| 32    | CPQ version detection method               | Must-fix | Tooling API with Publisher fallback                  |
| 33    | RCA/ARM rebrand not acknowledged           | High     | Terminology note, configurable naming                |
| 34    | CPQ end-of-sale market positioning         | High     | Market context added                                 |
| 35    | CPQ/RCA coexistence in write-back          | High     | Coexistence model for Phase 5                        |
| 36    | Metadata vs data deployment boundary       | High     | Data (REST) vs metadata (artifact) split             |
| 37-51 | Medium/Low items                           | Med/Low  | All resolved                                         |

### v4 → v5 (final polish, 7 items)

| #   | Issue                                      | Resolution                                             |
| --- | ------------------------------------------ | ------------------------------------------------------ |
| 52  | `oauth_pending_flows` table undefined      | Full schema added                                      |
| 53  | Pending-flow deleted before token exchange | Moved deletion to after successful exchange            |
| 54  | loginUrl SSRF prevention missing           | Allowlist validation added                             |
| 55  | postMessage origin not locked              | Hardcoded `APP_ORIGIN`, parent verifies `event.origin` |
| 56  | ECA JWT Bearer support unresolved          | Confirmed ECAs support JWT Bearer                      |
| 57  | 2GP packaging requirement                  | Noted in Phase 7                                       |
| 58  | Internal consistency fixes                 | Fixed all references                                   |

### v5 → v5-final (sign-off round, 3 items)

| #   | Issue                                    | Resolution                       |
| --- | ---------------------------------------- | -------------------------------- |
| 59  | Callback CSP blocks inline script        | Nonce-based CSP                  |
| 60  | Expired pending flow blocks new attempts | UPSERT-if-expired pattern        |
| 61  | Hardcoded v66.0 in permission audit      | Changed to auto-detected version |
