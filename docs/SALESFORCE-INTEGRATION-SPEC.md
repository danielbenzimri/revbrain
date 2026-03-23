# Salesforce Integration Spec — Project-Level Connection

> **Status:** Draft v3 — post-audit revision
> **Author:** Daniel + Claude
> **Date:** 2026-03-23
> **Audience:** Engineering team, external reviewers, security auditors
> **Changelog:** v3 incorporates feedback from two external auditors. Key changes: External Client App (ECA) over legacy Connected App, fixed IV-per-field encryption, multi-connection source/target model, added write-back phase, expanded RCA mapping, data retention policy, Bulk API strategy, My Domain Day 1 support, post-connection permission audit.

---

## Table of Contents

1. [Context & Motivation](#1-context--motivation)
2. [User Story & Flow](#2-user-story--flow)
3. [The Core Problem: Connecting to a Customer's Salesforce](#3-the-core-problem-connecting-to-a-customers-salesforce)
4. [Connection Methods — Analysis](#4-connection-methods--analysis)
5. [Recommended Approach: OAuth 2.0 Web Server Flow](#5-recommended-approach-oauth-20-web-server-flow)
6. [External Client App Setup (Replaces Legacy Connected App)](#6-external-client-app-setup-replaces-legacy-connected-app)
7. [Pre-Connection Setup Guide — What the End-Client Must Do](#7-pre-connection-setup-guide--what-the-end-client-must-do)
8. [OAuth Flow — Step by Step](#8-oauth-flow--step-by-step)
9. [Token Storage & Security](#9-token-storage--security)
10. [Token Lifecycle Management](#10-token-lifecycle-management)
11. [Data Model Changes](#11-data-model-changes)
12. [API Design](#12-api-design)
13. [Multi-Org Architecture Considerations](#13-multi-org-architecture-considerations)
14. [Scopes & Permissions](#14-scopes--permissions)
15. [The CPQ Data Access Problem — The Bigger Picture](#15-the-cpq-data-access-problem--the-bigger-picture)
16. [Data Retention & Cleanup Policy](#16-data-retention--cleanup-policy)
17. [Error Handling & Edge Cases](#17-error-handling--edge-cases)
18. [Security Checklist](#18-security-checklist)
19. [Tech Stack & Libraries](#19-tech-stack--libraries)
20. [Resolved Design Decisions (Previously Open Questions)](#20-resolved-design-decisions-previously-open-questions)
21. [Remaining Open Questions](#21-remaining-open-questions)
22. [Implementation Phases — Detailed Breakdown](#22-implementation-phases--detailed-breakdown)

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
- **Each project gets its own isolated Salesforce connection(s)**
- **Credentials must never leak across projects or tenants**

### The Source/Target Pattern

In most real-world migrations, a project needs **two** Salesforce connections:

```
Source Org (CPQ data lives here)  →  RevBrain analyzes & maps  →  Target Org (RCA config is written here)
```

Common patterns:

- Read CPQ from **Production** → Write RCA to **Sandbox** (test) → Validate → Deploy to Production
- Read CPQ from **Sandbox copy** → Write RCA to **separate Sandbox** → Validate
- Same org for both (Production→Production) — less common, higher risk

This means a project may need **multiple connections** (source + target), not just one.

---

## 2. User Story & Flow

### High-Level User Journey

```
Tenant admin creates a new project
  → Names it (e.g., "CPQ→RCA Migration — GlobalCorp Q2")
  → Fills in project details (stakeholders, timeline, contract ref)
  → Clicks "Connect Salesforce (Source)"
  → PREREQUISITE: End-client must approve RevBrain's External Client App first (see Section 7)
  → Redirected to Salesforce login page (of the end-client's org)
  → End-client admin logs in and grants access
  → Redirected back to RevBrain with connection confirmed
  → RevBrain can now read CPQ data from that Salesforce org
  → Later: "Connect Salesforce (Target)" for RCA write-back
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
|                         | Salesforce has deprecated this flow                               |
|                         | Tied to a specific user — if they leave, connection breaks        |
|                         | No consent screen — end-client can't see what they're authorizing |
|                         | Cannot use with orgs that enforce SSO                             |

**Verdict: Rejected.** Salesforce has deprecated this flow. MFA enforcement makes it unreliable. Storing passwords is a liability. External Client Apps (the new framework) don't support legacy flows at all.

---

### Option B: OAuth 2.0 Web Server Flow (Authorization Code Grant)

**How it works:** User is redirected to Salesforce to log in and grant access. Salesforce redirects back with an authorization code. RevBrain exchanges the code for access + refresh tokens server-side.

| Pros                                                           | Cons                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| Industry standard, well-documented                             | Requires redirect flow (slightly more complex UI)            |
| No passwords stored — only tokens                              | Requires External Client App or Connected App registration   |
| Supports refresh tokens (long-lived access)                    | Refresh tokens can be revoked by the Salesforce admin        |
| Works with MFA, SSO, and all security policies                 | End-client may need to approve the app first (see Section 7) |
| Clear consent screen — user sees requested permissions         |                                                              |
| Not tied to a single user's credentials                        |                                                              |
| Works with sandbox and production instances                    |                                                              |
| Salesforce's recommended approach for server-side apps         |                                                              |
| Fully supported by External Client Apps (the modern framework) |                                                              |

**Verdict: Recommended.** This is the correct choice. See detailed design below.

---

### Option C: OAuth 2.0 JWT Bearer Flow (Server-to-Server)

**How it works:** RevBrain holds a private key. A Salesforce admin pre-authorizes the app with the corresponding certificate. RevBrain generates JWT assertions signed with the private key to get access tokens without user interaction.

| Pros                                    | Cons                                                     |
| --------------------------------------- | -------------------------------------------------------- |
| No user interaction after initial setup | Complex setup — requires certificate exchange            |
| No refresh tokens to manage             | Requires Salesforce admin to upload certificate manually |
| Good for fully automated integrations   | Private key management is critical — leak = full access  |
|                                         | Less intuitive for non-technical end-clients             |
|                                         | Harder to scope to specific permissions                  |
|                                         | Each Salesforce org needs separate certificate setup     |

**Verdict: Not recommended for initial launch.** The setup burden on end-clients is too high. Could be offered as an advanced option later for enterprise clients who prefer certificate-based auth.

---

### Option D: Salesforce CLI (sfdx) Token Forwarding

**Verdict: Rejected.** Not suitable for a SaaS product — requires CLI installation, short-lived tokens, terrible UX for non-developers.

---

### Option E: Client Credentials Flow

**Verdict: Future consideration.** Good for enterprise customers who want a service account pattern. Pushes too much setup work to the end-client for primary use.

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

1. **Low friction for end-clients** — they log in and click "Allow". No certificate exchanges, no CLI tools.

2. **Security model aligns with our needs** — we get scoped tokens, not passwords. The end-client can see what was authorized and revoke access at any time from their Salesforce setup.

3. **Refresh tokens solve the long-running problem** — CPQ→RCA migrations take weeks or months. Refresh tokens let us maintain access without re-prompting the user.

4. **Battle-tested** — this is the same flow used by Dataloader.io, Ownbackup, Gearset, Copado, and every other Salesforce ISV. Salesforce AppExchange apps are required to use OAuth.

5. **Works everywhere** — production orgs, sandbox orgs, scratch orgs, Developer Edition. Any Salesforce instance with a login URL.

6. **Future-proof** — fully supported by External Client Apps, the modern framework replacing legacy Connected Apps.

---

## 6. External Client App Setup (Replaces Legacy Connected App)

> **CRITICAL (v3 change):** As of Spring '26, Salesforce has restricted creation of new legacy Connected Apps (both UI and Metadata API). The recommended replacement is **External Client Apps (ECAs)** — the next-generation framework for third-party integrations. The OAuth flow itself remains identical; the registration process and governance model differ.

### What Is an External Client App?

An External Client App (ECA) is Salesforce's modern framework for registering external applications that need OAuth access. It replaces legacy Connected Apps and offers:

- Better metadata compliance and packaging (important for AppExchange)
- Modern OAuth-only support (no legacy flows)
- Improved governance and security boundaries
- Built-in support for PKCE

**Key distinction:** The ECA is created in **RevBrain's Salesforce org** (or a dedicated Salesforce org we maintain for this purpose). End-clients need to **approve** this app in their org before their users can authorize it (see Section 7).

### Configuration

We will create a single External Client App in a Salesforce org we control:

| Field                              | Value                                                           |
| ---------------------------------- | --------------------------------------------------------------- |
| App Name                           | RevBrain                                                        |
| Contact Email                      | security@revbrain.com                                           |
| OAuth Enabled                      | Yes                                                             |
| Callback URL                       | `https://app.revbrain.com/api/v1/salesforce/oauth/callback`     |
|                                    | `https://staging.revbrain.com/api/v1/salesforce/oauth/callback` |
|                                    | `http://localhost:5173/api/v1/salesforce/oauth/callback` (dev)  |
| Selected OAuth Scopes              | See [Section 14](#14-scopes--permissions)                       |
| Require PKCE                       | Yes                                                             |
| Require Secret for Web Server Flow | Yes                                                             |

### Credentials We'll Store

From the ECA, we get:

- **Consumer Key** (client_id) — public, can be in env vars
- **Consumer Secret** (client_secret) — secret, must be in env vars, never in code

These are **RevBrain's credentials**, not the end-client's. They are the same for all tenants and all projects.

### Why Not Legacy Connected App?

| Factor                | Legacy Connected App                               | External Client App                     |
| --------------------- | -------------------------------------------------- | --------------------------------------- |
| New creation          | Restricted — requires Salesforce Support exception | Available by default                    |
| OAuth flows           | All (including deprecated)                         | Modern only (Authorization Code + PKCE) |
| AppExchange packaging | Manual                                             | Built-in metadata compliance            |
| Governance            | Org-level                                          | Namespace-level                         |
| Future support        | Maintenance mode                                   | Active development                      |

---

## 7. Pre-Connection Setup Guide — What the End-Client Must Do

> **CRITICAL (v3 addition):** Since September 2025, Salesforce blocks uninstalled/unapproved external apps for most users. The end-client's Salesforce admin must approve RevBrain's External Client App BEFORE any user can authorize it via OAuth.

### The Problem

When a user clicks "Allow" on RevBrain's OAuth consent screen, Salesforce checks whether the app is approved in that org. If not, the authorization fails — even if the user has full admin permissions.

Only users with the **"Approve Uninstalled Connected Apps"** or **"Use Any API Client"** permission can bypass this check.

### What the End-Client Admin Must Do (One-Time Setup)

Before any user in their org can connect RevBrain, a Salesforce admin must:

1. **Go to Setup → Connected Apps OAuth Usage** (or **External Client App OAuth Usage**)
2. **Find "RevBrain"** in the list (it appears after anyone attempts the OAuth flow once, or the admin can look it up by Consumer Key)
3. **Click "Install"** or **"Approve"** to authorize RevBrain for their org
4. **Set Permitted Users:** Choose either:
   - "All users may self-authorize" — any user with sufficient profile permissions can connect
   - "Admin approved users are pre-authorized" — only users in specific profiles/permission sets can connect (more secure, recommended for enterprise)
5. **Optionally:** Assign specific profiles or permission sets that are allowed to use RevBrain

### RevBrain's Responsibility

- **In-app guide:** When a user clicks "Connect Salesforce", show a pre-flight checklist explaining what the end-client admin needs to do first
- **Clear error handling:** If the OAuth flow fails due to an unapproved app, surface a specific, actionable error message: _"RevBrain hasn't been approved in this Salesforce org yet. Please ask your Salesforce admin to go to Setup → Connected Apps OAuth Usage → find RevBrain → click Install."_
- **Documentation:** Provide a customer-facing setup guide (with screenshots) that can be shared with end-client admins
- **AppExchange listing (Phase 7):** Once listed on the AppExchange, installed package apps bypass this restriction entirely — this is a strong argument for pursuing AppExchange listing earlier

### Alternative: AppExchange Package Install

If RevBrain is listed on the Salesforce AppExchange, the end-client can install it as a managed package. Installed apps are automatically approved — no manual approval step needed. This significantly reduces onboarding friction for enterprise customers.

---

## 8. OAuth Flow — Step by Step

### Phase 1: Initiation (RevBrain → Salesforce)

```
User clicks "Connect Salesforce" on their project page
  ↓
RevBrain frontend opens a popup window
  ↓
Popup loads POST /v1/projects/:id/salesforce/connect
  with body: { instanceType: "production" | "sandbox", connectionRole: "source" | "target",
               loginUrl?: "https://globalcorp.my.salesforce.com" }
  ↓
Server generates:
  - codeVerifier = crypto.randomBytes(64).toString('base64url')
  - codeChallenge = sha256(codeVerifier).toString('base64url')
  - state = sign({ projectId, orgId, userId, connectionRole, nonce, exp, codeVerifier }, secret)
    ↑ code verifier is embedded in the signed state (stateless PKCE — no server-side storage needed)
  ↓
Server returns redirect URL using the appropriate login URL:
  - Custom domain (if provided): https://globalcorp.my.salesforce.com/services/oauth2/authorize
  - Production (default): https://login.salesforce.com/services/oauth2/authorize
  - Sandbox: https://test.salesforce.com/services/oauth2/authorize
  ?response_type=code
  &client_id={CONSUMER_KEY}
  &redirect_uri={CALLBACK_URL}
  &scope=api refresh_token id
  &state={signed_state}
  &code_challenge={codeChallenge}
  &code_challenge_method=S256
  &prompt=login consent
  ↓
Popup redirects to Salesforce login
```

> **Design decisions (v3):**
>
> - **Popup over redirect** — user stays on the project page, popup closes after auth. Implementation: `window.open()` → callback page calls `window.opener.postMessage({ type: 'sf_connected' })` → popup closes. ~20 lines of extra code for significantly better UX.
> - **Stateless PKCE** — the code verifier is included inside the signed state JWT. No server-side storage needed (no Redis, no DB row, no job queue pollution). Since the state is signed with a secret, the code verifier cannot be tampered with. This is the most elegant solution and eliminates the TTL cleanup concern.
> - **My Domain support from Day 1** — users can optionally provide their custom login URL. My Domain is now required for all Salesforce orgs, and some have disabled the generic `login.salesforce.com` redirect. The implementation cost is trivial (one additional text field).
> - **Connection role** — `source` or `target` is captured during initiation and stored with the connection, enabling the multi-connection pattern.

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

**Error: App not approved** — If the end-client hasn't approved RevBrain (see Section 7), Salesforce returns an error instead of the consent screen. RevBrain detects this and shows the pre-connection setup instructions.

### Phase 3: Token Exchange (RevBrain server-side)

```
GET /v1/salesforce/oauth/callback?code=xxx&state=yyy
  ↓
Server validates state (verify signature, check expiry, extract projectId + connectionRole)
Server extracts codeVerifier from the signed state payload
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
    "scope": "api refresh_token id"
  }
  ↓
Server runs post-connection permission audit (see below)
  ↓
Server stores tokens securely (see Section 9)
  ↓
Popup shows success → posts message to parent window → closes
```

### Post-Connection Permission Audit (automatic)

> **v3 addition:** Both auditors recommended this. After a successful token exchange, RevBrain immediately validates that the connection has the permissions needed for useful work.

```
Immediately after token storage:
  ↓
1. GET {instance_url}/services/data/  → confirms API access, captures supported API versions
2. Auto-detect latest API version from response (instead of hardcoding)
3. Query: SELECT Id, NamespacePrefix, MajorVersion, MinorVersion
          FROM Publisher WHERE NamespacePrefix = 'SBQQ'
   → confirms CPQ is installed, captures version
4. Describe SBQQ__Quote__c → confirms CPQ objects are accessible
5. If target connection: Describe ProductSellingModel → confirms RCA is available
6. GET {instance_url}/services/data/v66.0/limits → captures API budget (daily limit, remaining)
7. Capture authorizing user's profile name (from /id response) for debugging
  ↓
Store audit results in connection metadata:
  {
    cpqInstalled: true,
    cpqVersion: "242.1",
    rcaAvailable: true/false,
    apiVersion: "v66.0",
    dailyApiLimit: 100000,
    dailyApiRemaining: 99850,
    sfEdition: "Enterprise",
    authorizingUserProfile: "System Administrator",
    missingPermissions: []    ← or list of specific objects that returned 403
  }
  ↓
Surface results to user:
  ✅ API access confirmed
  ✅ CPQ package v242.1 detected
  ✅ 47 CPQ objects accessible
  ⚠️ Cannot access SBQQ__PricingGuidance__c — may need permission set adjustment
  ✅ API budget: 99,850 / 100,000 calls remaining today
```

### Phase 4: Using the Connection

```
RevBrain needs to read CPQ data for this project
  ↓
Server retrieves access_token for this project's Salesforce connection
  ↓
Server calls Salesforce REST API using auto-detected API version:
  GET {instance_url}/services/data/{api_version}/query?q=SELECT+Id,Name+FROM+Product2
  Authorization: Bearer {access_token}
  ↓
Server reads Sforce-Limit-Info header → updates API usage tracking
  ↓
If 401 (token expired):
  → Use refresh_token to get new access_token (see Section 10)
  → Update stored instance_url if it changed (Hyperforce migrations)
  → Retry the request
```

---

## 9. Token Storage & Security

### The Challenge

Salesforce tokens are **extremely sensitive**. An access token grants full API access to the end-client's Salesforce org. A refresh token grants the ability to generate new access tokens indefinitely (until revoked). Leaking these tokens could expose the end-client's entire Salesforce data.

### Current State in RevBrain

Today, RevBrain stores no credentials in the database. All secrets (Supabase keys, Stripe keys, etc.) live in environment variables. This works because those are **RevBrain's own credentials** — there's one set per environment.

Salesforce tokens are different: **there's one set per connection**. They must be in the database.

### Storage Design

#### Encryption at Rest

All Salesforce tokens will be encrypted before being written to the database using **AES-256-GCM** (authenticated encryption):

```
plaintext token → AES-256-GCM encrypt → IV(12) || ciphertext || authTag(16) → stored as single BYTEA
```

> **CRITICAL FIX (v3):** Each encrypted field gets its **own unique IV**. Reusing an IV with the same key under AES-GCM is catastrophic — it completely breaks both confidentiality and authenticity. The v2 schema had a single `encryption_iv` and `encryption_auth_tag` for multiple encrypted fields. This is now fixed by packing `IV || ciphertext || authTag` into a single `BYTEA` column per field. This also scales cleanly to any number of encrypted fields without schema changes.

- **Encryption key**: Stored as an environment variable (`SALESFORCE_TOKEN_ENCRYPTION_KEY`), never in the database
- **Per-field IV**: Every `encrypt()` call generates a fresh 12-byte IV via `crypto.randomBytes(12)`
- **Auth tag**: GCM mode produces a 16-byte authentication tag that prevents tampering — if someone modifies the ciphertext, decryption fails
- **Key rotation**: Support key versioning (`encryption_key_version` column) to allow rotating the encryption key without re-encrypting all tokens at once
- **Derived keys**: Use HKDF from the master key with different context strings for different data classes (OAuth tokens vs browser credentials). If a token-decryption path is compromised, browser credentials remain safe under a different derived key.

**Encrypt/decrypt functions:**

```typescript
// encrypt() returns: IV(12 bytes) || ciphertext || authTag(16 bytes) as a single Buffer
function encrypt(plaintext: string, masterKey: Buffer, context: string): Buffer {
  const derivedKey = hkdf(masterKey, context); // e.g., context = "oauth_token" or "browser_cred"
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, authTag]); // single blob
}

// decrypt() splits the blob back into IV, ciphertext, authTag
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

#### Why AES-256-GCM Over Alternatives

| Option                    | Verdict                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| Store plaintext           | Unacceptable — DB breach = full compromise                                                   |
| Hashing                   | Tokens need to be recovered (used in API calls) — hashing is one-way                         |
| AES-256-CBC               | No built-in integrity check — vulnerable to padding oracle attacks                           |
| **AES-256-GCM**           | **Authenticated encryption — confidentiality + integrity + fast**                            |
| Supabase Vault (pgsodium) | Worth evaluating — handles key management natively but adds vendor lock-in. Spike in Phase 1 |
| Vault/KMS (AWS/GCP)       | Best for scale, but adds infra dependency. Good future improvement                           |

#### Access Controls

- Only the **server application** can decrypt tokens (it holds the encryption key)
- Database users (Supabase dashboard, support tools) see only ciphertext
- **Row-Level Security (RLS)**: Supabase RLS policies will prevent cross-tenant access even if someone bypasses the application layer
- **No client-side access**: Tokens are never sent to the browser. The client only sees connection status (connected/disconnected/error)

---

## 10. Token Lifecycle Management

### Access Token

- **Lifespan**: ~2 hours (Salesforce default, configurable per Connected App in the target org)
- **Usage**: Included as `Authorization: Bearer {token}` in every Salesforce API call
- **Refresh**: Proactively at 75% of TTL (before expiry), and reactively on 401

### Refresh Token

- **Lifespan**: Indefinite by default, but can be configured by the Salesforce admin to expire
- **Usage**: Used only to obtain new access tokens
- **Revocation scenarios**:
  - End-client admin revokes access in Salesforce Setup → Connected Apps → Manage
  - End-client changes their security policy
  - The authorizing user's account is deactivated
  - The app's consumer secret is rotated (existing tokens work during grace period; new exchanges require new secret)

### Refresh Flow

```
POST https://login.salesforce.com/services/oauth2/token
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

Note: Salesforce does **not** return a new refresh token on refresh. The original refresh token remains valid.

**Important (v3):** Always update the stored `instance_url` from the refresh response. Salesforce's move to Hyperforce is causing more URL changes than historically expected. My Domain URLs are stable, but legacy `naXX.salesforce.com` patterns may shift. Prefer storing and using the My Domain URL.

### Concurrent Refresh Handling

> **v3 addition:** Use optimistic locking instead of distributed mutexes.

Store a `token_version` counter on the connection. When refreshing:

```sql
UPDATE salesforce_connections
SET encrypted_access_token = {new_encrypted}, token_version = token_version + 1, updated_at = now()
WHERE id = {connection_id} AND token_version = {expected_version}
```

If the update affects 0 rows, another process already refreshed — read the new token from DB and use it. No distributed locks needed.

### Connection Health States

| State                      | Meaning                                           | User Action                    |
| -------------------------- | ------------------------------------------------- | ------------------------------ |
| `active`                   | Tokens valid, API calls succeeding                | None                           |
| `connecting`               | OAuth flow in progress (10-min TTL lock)          | Wait for completion            |
| `token_expired`            | Access token expired, refresh succeeded           | None (automatic)               |
| `refresh_failed`           | Refresh token was revoked or expired              | User must re-authorize         |
| `instance_unreachable`     | Salesforce org is down or instance URL changed    | Check Salesforce status        |
| `insufficient_permissions` | Token works but user lacks required object access | End-client must adjust profile |
| `disconnected`             | User manually disconnected                        | Reconnect when ready           |

> **v3 addition:** The `connecting` state serves as a lock to prevent concurrent connection attempts. If User A starts the OAuth flow, User B sees "Connection in progress" instead of starting a duplicate flow. The lock auto-expires after 10 minutes (if the OAuth flow is abandoned).

---

## 11. Data Model Changes

### New Table: `salesforce_connections`

This table stores connections per project. A project can have **multiple connections** (source + target), differentiated by `connection_role`.

```sql
CREATE TABLE salesforce_connections (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id              UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_role          VARCHAR(10) NOT NULL DEFAULT 'source',  -- 'source' | 'target'

  -- Salesforce org identity
  salesforce_org_id       VARCHAR(18) NOT NULL,       -- e.g., "00Dxx0000001234"
  salesforce_instance_url TEXT NOT NULL,               -- e.g., "https://globalcorp.my.salesforce.com"
  custom_login_url        TEXT,                        -- Optional My Domain URL for login
  salesforce_user_id      VARCHAR(18),                 -- The user who authorized
  salesforce_username     TEXT,                         -- For display (see note below)
  instance_type           VARCHAR(10) NOT NULL,         -- "production" | "sandbox"
  api_version             VARCHAR(10),                  -- Auto-detected, not hardcoded

  -- Encrypted tokens (AES-256-GCM, each field = IV || ciphertext || authTag)
  encrypted_access_token  BYTEA NOT NULL,
  encrypted_refresh_token BYTEA NOT NULL,
  encryption_key_version  INTEGER NOT NULL DEFAULT 1,
  token_version           INTEGER NOT NULL DEFAULT 1,  -- Optimistic locking for refresh

  -- Token metadata
  token_issued_at         TIMESTAMPTZ,
  token_scopes            TEXT,                         -- Space-separated scopes granted
  last_refresh_at         TIMESTAMPTZ,

  -- Connection audit metadata (captured during post-connection audit)
  connection_metadata     JSONB,                        -- cpqVersion, sfEdition, apiLimits, permissions

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

  -- Constraints
  UNIQUE (project_id, connection_role)   -- One source + one target per project
);

-- Indexes
CREATE INDEX idx_sf_connections_org ON salesforce_connections(organization_id);
CREATE INDEX idx_sf_connections_status ON salesforce_connections(status);
CREATE INDEX idx_sf_connections_sf_org ON salesforce_connections(salesforce_org_id);
```

> **v3 changes from v2:**
>
> - `UNIQUE (project_id)` → `UNIQUE (project_id, connection_role)` — allows source + target connections per project
> - Added `connection_role` column (`source` | `target`)
> - Added `custom_login_url` for My Domain support
> - Removed single `encryption_iv` and `encryption_auth_tag` columns — each encrypted BYTEA field now contains its own IV and auth tag (see Section 9)
> - Added `token_version` for optimistic locking on refresh
> - Added `last_refresh_at`, `last_successful_api_call_at` for monitoring
> - Added `connection_metadata` JSONB for post-connection audit data
> - Added `salesforce_org_id` index
> - `api_version` is now nullable (auto-detected, not hardcoded to v62.0)
> - `salesforce_username` remains plaintext `TEXT` for display — it's protected by RLS and is no more sensitive than the user's email which is already stored in plaintext elsewhere. The real security boundary is the encrypted tokens.
> - Phase 6 browser automation columns (`encrypted_sf_username`, `encrypted_sf_password`, `encrypted_mfa_secret`, `browser_auth_status`) are NOT included here — they will be added in a separate `browser_automation_credentials` table when Phase 6 is implemented. Don't add unused nullable columns prematurely.

### New Table: `salesforce_connection_logs`

Audit trail for connection lifecycle events.

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

### Changes to Existing Tables

**`projects` table** — add project detail fields:

```sql
ALTER TABLE projects ADD COLUMN client_company_name TEXT;
ALTER TABLE projects ADD COLUMN contract_reference TEXT;
ALTER TABLE projects ADD COLUMN estimated_objects INTEGER;
ALTER TABLE projects ADD COLUMN stakeholders JSONB;    -- Validated by Zod schema: [{ name, role, email }]
```

> **v3 note:** The `stakeholders` JSONB column must be validated by a Zod schema in `packages/contract/` to prevent inconsistent data accumulation. Define the schema:
>
> ```typescript
> const StakeholderSchema = z.object({
>   name: z.string(),
>   role: z.string(),
>   email: z.string().email(),
> });
> const StakeholdersSchema = z.array(StakeholderSchema).nullable();
> ```

---

## 12. API Design

### Salesforce Connection Endpoints

All endpoints are org-scoped and require authentication.

```
# Initiate OAuth flow
POST /v1/projects/:projectId/salesforce/connect
  Body: { instanceType: "production" | "sandbox", connectionRole: "source" | "target",
          loginUrl?: "https://custom.my.salesforce.com" }
  Response: { redirectUrl: "https://login.salesforce.com/..." }

# OAuth callback (called by Salesforce redirect)
GET /v1/salesforce/oauth/callback?code=xxx&state=yyy
  → Exchanges code for tokens, runs permission audit, stores encrypted
  → Renders a small HTML page that posts message to opener and closes

# Get connection status
GET /v1/projects/:projectId/salesforce/connections
  Response: {
    source: { status, instanceUrl, salesforceUsername, instanceType, connectedAt, ... } | null,
    target: { status, instanceUrl, ... } | null
  }
  Note: Never returns tokens to the client

# Get single connection details
GET /v1/projects/:projectId/salesforce/connections/:role
  :role = "source" | "target"

# Disconnect
POST /v1/projects/:projectId/salesforce/disconnect
  Body: { connectionRole: "source" | "target" }
  → Revokes tokens at Salesforce, marks connection as disconnected

# Reconnect (re-initiate OAuth after a revocation)
POST /v1/projects/:projectId/salesforce/reconnect
  Body: { connectionRole: "source" | "target", instanceType: "production" | "sandbox",
          loginUrl?: "..." }

# Test connection
POST /v1/projects/:projectId/salesforce/test
  Body: { connectionRole: "source" | "target" }
  Response: { healthy: true/false, apiVersion, orgId, cpqVersion?, rcaAvailable?, error? }
```

### RBAC for Salesforce Endpoints

| Action                           | Required Role                                |
| -------------------------------- | -------------------------------------------- |
| Connect / Reconnect / Disconnect | `org_owner`, `admin`                         |
| View connection status           | `org_owner`, `admin`, `operator`, `reviewer` |
| Test connection                  | `org_owner`, `admin`, `operator`             |

---

## 13. Multi-Org Architecture Considerations

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
- Cross-tenant queries are impossible through the application layer (same pattern as existing repos)

### Sandbox vs Production

| Environment   | Login URL                            | Use Case                                        |
| ------------- | ------------------------------------ | ----------------------------------------------- |
| Production    | `https://login.salesforce.com`       | Live data migration                             |
| Sandbox       | `https://test.salesforce.com`        | Testing, validation                             |
| Custom Domain | `https://{domain}.my.salesforce.com` | Orgs with My Domain (now required for all orgs) |

RevBrain supports all three from Day 1:

1. User selects environment type (production/sandbox) and optionally provides a custom login URL
2. Custom domain URL is used when provided (preferred, most reliable)
3. Falls back to standard login URLs
4. Stored as `instance_type` + `custom_login_url` on the connection

---

## 14. Scopes & Permissions

### Requested OAuth Scopes

| Scope           | Purpose                                                  | Required?                    |
| --------------- | -------------------------------------------------------- | ---------------------------- |
| `api`           | Access Salesforce REST, SOAP, Tooling, and Metadata APIs | Yes — core functionality     |
| `refresh_token` | Obtain refresh token for long-lived access               | Yes — migrations span weeks  |
| `id`            | Access user identity information                         | Yes — display who authorized |

> **Note:** The `api` scope provides access to the Tooling API and Metadata API endpoints (via the same instance URL), which are needed for CPQ package version detection, custom field metadata, and Static Resource extraction (for large QCP overflow). No additional scopes are required for these.

### Scopes We Explicitly Do NOT Request

| Scope         | Why Not                                       |
| ------------- | --------------------------------------------- |
| `full`        | Grants everything including setup. Too broad. |
| `web`         | Browser-based access — we're server-side      |
| `chatter_api` | Social features — irrelevant                  |
| `wave_api`    | Analytics — irrelevant                        |
| `content`     | File management — not needed initially        |

### Principle of Least Privilege

The actual data access is further limited by the **authorizing user's profile and permission sets** in Salesforce. If the user who authorizes can't see SBQQ**Quote**c, RevBrain can't see it either. This is why the post-connection permission audit (Section 8) is critical — it surfaces these gaps immediately.

---

## 15. The CPQ Data Access Problem — The Bigger Picture

> **This is the most important section of this document.** OAuth is necessary but not sufficient. CPQ does not have its own standalone API — it's a managed package sitting on top of Salesforce, and accessing its data requires understanding three distinct layers.

### The Uncomfortable Truth About CPQ Data

Salesforce CPQ (formerly Steelbrick) is a **managed package** — it installs custom objects (all prefixed `SBQQ__`) into a standard Salesforce org. Unlike a standalone product with its own API, CPQ piggybacks on Salesforce's standard APIs. This has major implications:

1. **Most CPQ config data IS accessible via standard APIs** — good news
2. **Some CPQ behavior is ONLY observable in a live browser** — bad news
3. **There is NO official Salesforce migration tool** — this is our opportunity

### Layer 1: API-Accessible Data (OAuth is enough)

Everything in this layer can be read via SOQL queries and the Salesforce REST API, using the OAuth tokens we obtain in Section 8. This is the majority of CPQ configuration.

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

> **Key insight:** The QCP JavaScript source code is stored in `SBQQ__CustomScript__c.SBQQ__Code__c` (Long Text Area, up to 131,072 characters). We CAN retrieve it with a simple SOQL query. When QCPs exceed this limit, developers put overflow logic in **Static Resources**, which are retrievable via the Metadata API.

### Layer 2: Server-Side CPQ API (OAuth is enough, specialized calls)

Salesforce provides a dedicated CPQ API via the `SBQQ.ServiceRouter` global Apex class:

| Operation                 | What It Does                                       | Why We Need It                               |
| ------------------------- | -------------------------------------------------- | -------------------------------------------- |
| **Calculate Quote API**   | Triggers full CPQ price calculation on a quote     | Validates our understanding of pricing rules |
| **Save Quote API**        | Saves a CPQ quote (triggers all rules/QCP)         | Needed to test migration output              |
| **Generate Document API** | Generates a quote PDF document                     | Comparing migrated output vs original        |
| **Read Quote API**        | Reads a quote with all calculated fields populated | Gets the "true" calculated state             |

Accessible via: `POST {instance_url}/services/apexrest/SBQQ/ServiceRouter`

### Layer 3: Browser-Only Behavior (OAuth is NOT enough)

Some CPQ behaviors **only exist in the browser**:

**1. QCP Runtime Behavior (2 of 7 methods are browser-only):**

| QCP Method            | Runs Where       | What It Does                      |
| --------------------- | ---------------- | --------------------------------- |
| `onInit`              | Server + Browser | Initialization logic              |
| `onBeforeCalculate`   | Server + Browser | Pre-calculation logic             |
| `onBeforePriceRules`  | Server + Browser | Before price rules evaluate       |
| `onAfterPriceRules`   | Server + Browser | After price rules evaluate        |
| `onAfterCalculate`    | Server + Browser | Post-calculation logic            |
| **`isFieldVisible`**  | **Browser ONLY** | Controls field visibility in QLE  |
| **`isFieldEditable`** | **Browser ONLY** | Controls field editability in QLE |

**2. Product Configurator Interactive Behavior** — configuration rules are API-readable, but the interactive experience (option appear/disappear, dynamic filtering) renders only in the browser.

**3. Custom Action Button Behavior** — record definitions are API-readable, but runtime behavior (Flows, Apex, JavaScript) only executes when clicked in the browser.

**4. Quote Document PDF Rendering** — templates are API-readable, but actual rendering (merge fields, conditional sections, Visualforce) happens server-side within Salesforce.

### The Dedicated User Requirement (for Browser Automation)

Browser automation requires **actual login credentials** (username + password). The end-client should create a dedicated Salesforce user for RevBrain. See Phase 6 in Section 22 for full details. This is an optional, advanced feature — not required for Phases 1-5.

### The Multi-Connection Model

```
Project "CPQ→RCA Migration — GlobalCorp"
│
├── Source Connection: OAuth (required)
│   ├── Used for: API data extraction (Layer 1 & 2) from CPQ org
│   ├── Covers: ~85% of migration data needs
│   └── Write access: Read-only in practice
│
├── Target Connection: OAuth (optional, for write-back)
│   ├── Used for: Writing RCA configuration to target org
│   └── May be same org (sandbox→prod) or different org
│
└── Browser Credentials (optional, for advanced analysis)
    ├── Used for: UI behavior capture (Layer 3) — Phase 6
    └── Stored in separate table, not mixed with OAuth connections
```

---

## 16. Data Retention & Cleanup Policy

> **v3 addition:** Auditor 1 flagged that storing customer Salesforce data indefinitely is a liability.

### What RevBrain Stores

| Data Type                                              | Sensitivity | Source                    |
| ------------------------------------------------------ | ----------- | ------------------------- |
| Encrypted OAuth tokens                                 | Critical    | Salesforce OAuth flow     |
| Extracted CPQ configuration (rules, products, pricing) | High        | Customer's Salesforce org |
| QCP JavaScript source code                             | High        | Customer's Salesforce org |
| Migration mapping results                              | Medium      | RevBrain analysis engine  |
| Connection metadata (org ID, edition, user)            | Low         | Salesforce OAuth response |

### Retention Rules

| Data               | Retention Policy                         | Trigger                                     |
| ------------------ | ---------------------------------------- | ------------------------------------------- |
| OAuth tokens       | Deleted on disconnect; encrypted at rest | User action or project deletion             |
| Extracted CPQ data | **90 days after project completion**     | Project status → `completed` or `cancelled` |
| QCP source code    | Same as extracted data                   | Same                                        |
| Migration mappings | **180 days after project completion**    | Project status → `completed` or `cancelled` |
| Connection logs    | **1 year**                               | Rolling window                              |
| Audit log entries  | **Per existing audit log policy**        | N/A (immutable)                             |

### Right-to-Deletion

- **On demand:** Tenant admin can trigger "Delete all Salesforce data" for a project at any time, which:
  - Revokes OAuth tokens at Salesforce
  - Deletes all encrypted tokens from DB
  - Deletes all extracted CPQ data
  - Preserves audit log entries (required for compliance) but redacts PII
- **GDPR / CCPA compliance:** Document what personal data from Salesforce is stored (authorizing user's username, email) and include in RevBrain's privacy policy
- **Automated cleanup:** Background job runs weekly, identifies completed/cancelled projects past retention window, purges extracted data

---

## 17. Error Handling & Edge Cases

### OAuth Flow Errors

| Error                             | Cause                                                 | Handling                                                                   |
| --------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------- |
| `state` mismatch                  | CSRF attempt or expired session                       | Show error, ask user to retry                                              |
| User denies consent               | Clicked "Deny" on consent screen                      | Friendly message explaining why access is needed                           |
| Invalid authorization code        | Code expired (10-min window) or already used          | Ask user to retry                                                          |
| `invalid_grant` on token exchange | Org security policy blocked it                        | Surface Salesforce error message                                           |
| **App not approved / blocked**    | ECA not installed in end-client's org (see Section 7) | Show pre-connection setup instructions with specific steps for their admin |
| Concurrent connection attempt     | Another user already started OAuth for this project   | Show "Connection in progress" message (check `connecting` status)          |

### Runtime Errors

| Error                    | Cause                                | Handling                                              |
| ------------------------ | ------------------------------------ | ----------------------------------------------------- |
| 401 on API call          | Access token expired                 | Auto-refresh (optimistic lock), retry once            |
| 401 after refresh        | Refresh token revoked                | Mark `refresh_failed`, notify user                    |
| 403 on specific object   | Insufficient permissions             | Log which object, surface specific guidance           |
| `UNABLE_TO_LOCK_ROW`     | Salesforce record locking            | Retry with exponential backoff (max 3)                |
| `REQUEST_LIMIT_EXCEEDED` | Hit Salesforce API limits            | Back off, surface usage dashboard, schedule for later |
| Network timeout          | Salesforce downtime or network issue | Retry with backoff, mark connection health            |
| Instance URL changed     | Hyperforce migration                 | Update stored URL from refresh response               |

### SOQL Injection Protection

> **v3 addition:** The Salesforce API client's `query<T>(soql: string)` method must never concatenate raw user input into SOQL strings.

- All object/field names must be validated against `describe()` results before inclusion in queries
- User-provided filter values must be escaped using Salesforce's SOQL escaping rules (backslash-escape single quotes, etc.)
- RevBrain's extraction engine uses only hardcoded SOQL templates with field names derived from `describe()` — no raw user input in queries

### Edge Cases

1. **User revokes access mid-migration** — Next API call fails. RevBrain marks connection as `refresh_failed`, notifies project team. In-progress work preserved in RevBrain.

2. **Salesforce org migrated to new instance (Hyperforce)** — Token refresh returns new `instance_url`. RevBrain updates stored URL on each refresh. Prefer My Domain URLs (stable) over legacy `naXX.salesforce.com` patterns.

3. **Same Salesforce org connected to two different projects** — Allowed. Each project gets its own tokens.

4. **App secret is rotated** — Existing refresh tokens continue to work with the old secret. New token exchanges require the new secret. Plan rotation procedure in runbooks.

5. **Authorizing user leaves the company** — Account deactivation revokes the refresh token. RevBrain detects this and prompts re-authorization.

6. **Same org as source AND target** — Allowed. The project would have two connections with the same `salesforce_org_id` but different `connection_role` values. Each has its own tokens (potentially authorized by different users with different permission levels).

---

## 18. Security Checklist

- [ ] **No plaintext tokens in database** — all tokens AES-256-GCM encrypted with per-field IV
- [ ] **Encryption key in env vars only** — never in code, DB, or logs
- [ ] **Derived keys per data class** — HKDF with different context strings for OAuth tokens vs browser credentials
- [ ] **PKCE enforced** — prevents authorization code interception
- [ ] **State parameter signed with embedded PKCE verifier** — prevents CSRF, stateless
- [ ] **Tokens never sent to client** — browser only sees connection status
- [ ] **RLS on salesforce_connections** — org-scoped, no cross-tenant access
- [ ] **Audit logging** — all connect/disconnect/refresh events logged
- [ ] **Token revocation on disconnect** — actively revoke at Salesforce, don't just delete locally
- [ ] **HTTPS only** — callback URL must be HTTPS (except localhost dev)
- [ ] **Refresh token rotation** — if Salesforce enables it, store the new refresh token
- [ ] **Secrets scanning** — CI pipeline checks for leaked tokens in code
- [ ] **Access logging** — log which user/project triggered each Salesforce API call
- [ ] **Rate limiting on initiation AND callback endpoints** — prevent abuse (callback is public-facing)
- [ ] **SOQL injection prevention** — validate all object/field names against describe(), escape values
- [ ] **Connection locking** — `connecting` status with TTL prevents concurrent OAuth flows
- [ ] **Data retention enforcement** — automated cleanup of extracted data after retention window
- [ ] **Post-connection permission audit** — verify CPQ access immediately after OAuth
- [ ] **Browser credentials encrypted** — username, password, MFA secret all AES-256-GCM encrypted (Phase 6 only)
- [ ] **Browser credentials in separate table** — not mixed with OAuth connection data
- [ ] **Playwright sessions isolated** — separate container context per project, no cookie/state leakage
- [ ] **Browser sessions short-lived** — closed after each job
- [ ] **Screenshots access-controlled** — project-scoped storage, never publicly accessible

---

## 19. Tech Stack & Libraries

### Server-Side (Hono API)

| Purpose                         | Library                           | Why                                                                   |
| ------------------------------- | --------------------------------- | --------------------------------------------------------------------- |
| HTTP client for Salesforce API  | Native `fetch`                    | Available in Node + Deno; no external dependency needed               |
| Encryption (AES-256-GCM + HKDF) | Node.js `crypto` / Web Crypto API | Built-in, no dependencies. `crypto.subtle` for Deno compat            |
| PKCE code verifier/challenge    | Node.js `crypto`                  | `randomBytes` + `createHash('sha256')`                                |
| State token signing             | `jose` (already used for JWT)     | Lightweight, works in both runtimes                                   |
| Salesforce REST API wrapper     | Raw `fetch` with thin wrapper     | `jsforce` is ~200KB and Node-centric; raw wrapper is runtime-agnostic |
| SOQL escaping                   | Custom utility (~20 lines)        | Too simple to need a library                                          |

### Client-Side (React)

| Purpose                     | Approach                                                                     |
| --------------------------- | ---------------------------------------------------------------------------- |
| "Connect Salesforce" button | Opens popup via `window.open(oauthUrl)`                                      |
| OAuth completion detection  | `window.addEventListener('message', ...)` listens for postMessage from popup |
| Connection status display   | React Query hook polling `GET /salesforce/connections`                       |
| Disconnect confirmation     | Modal with clear warning about losing access                                 |

---

## 20. Resolved Design Decisions (Previously Open Questions)

> These were open questions in v2. They have been resolved based on auditor feedback and team discussion.

### 1. Popup for OAuth flow (was: "popup vs redirect?")

**Decision: Popup.** Both auditors recommended it. The implementation is ~20 lines of extra code:

1. `window.open(oauthUrl, 'sf_connect', 'width=600,height=700')`
2. Callback page: `window.opener.postMessage({ type: 'sf_connected', role: 'source' }, origin)`
3. Popup closes itself
4. Parent page React Query invalidates connection cache on message receipt

### 2. My Domain login URLs supported from Day 1 (was: "should we support My Domain?")

**Decision: Yes, Day 1.** My Domain is now required for all Salesforce orgs. Some have disabled the generic `login.salesforce.com` redirect. One extra text field in the connect form. Trivial implementation cost, prevents immediate failures.

### 3. API version auto-detected (was: "what version to target?")

**Decision: Auto-detect.** Call `GET /services/data/` after connection to discover the org's latest supported version. Store per-connection. Never hardcode. Current latest is v66.0 (Spring '26).

### 4. Supabase Vault evaluation (was: "Vault vs app-level encryption?")

**Decision: Spike in Phase 1.** Evaluate Supabase Vault (pgsodium) during Phase 1 implementation. If it provides sufficient control and the developer experience is good, use it. Otherwise, proceed with application-level AES-256-GCM. Both are valid approaches.

### 5. Stateless PKCE (was: "where to store code verifier?")

**Decision: Embed in signed state JWT.** No server-side storage needed. The code verifier is included in the state JWT payload, signed with a secret. Eliminates cleanup concerns and job queue pollution.

### 6. External Client App (was: not previously discussed)

**Decision: Use ECA, not legacy Connected App.** New Connected App creation is restricted in Spring '26. ECAs are the modern framework, fully support the same OAuth flows, and are better positioned for AppExchange.

---

## 21. Remaining Open Questions

> These still need team discussion.

1. **Should the JWT Bearer flow be offered as an alternative for enterprise tenants?**
   - Some enterprise clients may prefer certificate-based auth for security compliance.
   - **Lean:** Defer to Phase 7 unless a customer requests it.

2. **How should we handle very large orgs (>100K CPQ records)?**
   - Bulk API 2.0 handles the extraction, but storage and UI performance need consideration.
   - **Lean:** Add pagination and lazy loading in the CPQ Explorer UI. Consider cold storage for historical data.

3. **Should we pursue AppExchange listing earlier (Phase 3-4 instead of Phase 7)?**
   - AppExchange listing eliminates the "app not approved" friction (Section 7).
   - But the security review process takes 4-8 weeks and requires significant documentation.
   - **Lean:** Start the security review process in parallel with Phase 4-5 development.

4. **Do we need to handle Salesforce DX scratch orgs?**
   - Scratch orgs are ephemeral and typically used by developers, not migration targets.
   - **Lean:** Not in initial scope.

5. **Should we add a `project_admin` role for project-level connection management?**
   - Currently, only `org_owner` and `admin` can connect/disconnect. In consulting firms, a project lead (who might be an `operator`) may need this ability scoped to their project.
   - **Lean:** Evaluate after initial launch based on customer feedback.

---

## 22. Implementation Phases — Detailed Breakdown

> This section is written so anyone — including non-technical stakeholders — can understand what each phase delivers, what work is involved, and how long it should realistically take.
>
> **Effort estimates include a 30-50% buffer** over the v2 estimates, per auditor feedback. Salesforce OAuth nuances, RLS configuration, and encryption implementation typically take longer than initially expected.

---

### Phase 1: OAuth Connection & Verification

**What the user gets:** "I can connect my project to a Salesforce org and see that it works. I know exactly what CPQ version is installed and what permissions I have."

**Why this first:** Everything else depends on having a working, secure connection to Salesforce.

#### Step 1.1: External Client App Registration

**What:** Register RevBrain as an External Client App in a Salesforce org we control. One-time manual setup — not code.

**Detailed steps:**

1. Log into our Salesforce Developer Edition org (or create one — free)
2. Go to Setup → External Client App Manager → New
3. Fill in app name ("RevBrain"), contact email, enable OAuth
4. Add callback URLs for localhost, staging, and production
5. Select scopes: `api`, `refresh_token`, `id`
6. Enable PKCE, require client secret
7. Save — Salesforce generates Consumer Key and Consumer Secret
8. Copy into env vars: `SALESFORCE_CONSUMER_KEY`, `SALESFORCE_CONSUMER_SECRET`

**Output:** ECA registered, env vars configured. **Effort:** ~1-2 hours.

#### Step 1.2: Database Schema

**What:** Drizzle schema and migration for `salesforce_connections` and `salesforce_connection_logs`.

**Detailed steps:**

1. Add `salesforceConnections` table definition to `packages/database/src/schema.ts`
2. Add `salesforceConnectionLogs` table
3. Add new columns to `projects` table: `clientCompanyName`, `contractReference`, `estimatedObjects`, `stakeholders`
4. Add Zod schema for `stakeholders` JSONB validation in `packages/contract/`
5. Generate Drizzle migration: `pnpm drizzle-kit generate`
6. Run against staging: `pnpm db:push`
7. Add RLS policies (org-scoped, same pattern as existing tables)

**Output:** Tables exist, queryable via Drizzle, protected by RLS. **Effort:** ~4-6 hours.

#### Step 1.3: Token Encryption Utility

**What:** AES-256-GCM encryption with HKDF key derivation and per-field IV.

**Detailed steps:**

1. Create `apps/server/src/lib/encryption.ts`
2. Implement HKDF key derivation: `deriveKey(masterKey, context)` with different contexts for OAuth tokens vs browser credentials
3. Implement `encrypt(plaintext, masterKey, context) → Buffer` — returns `IV(12) || ciphertext || authTag(16)`
4. Implement `decrypt(blob, masterKey, context) → string` — splits blob back
5. Ensure Web Crypto API compatibility (for Deno runtime)
6. Generate master key: `openssl rand -base64 32` → `SALESFORCE_TOKEN_ENCRYPTION_KEY`
7. Comprehensive tests: roundtrip, tamper detection, wrong key rejection, wrong context rejection, IV uniqueness across calls

**Output:** Encryption module with full test coverage. **Effort:** ~5-6 hours.

#### Step 1.4: Salesforce Connection Repository

**What:** Contract interface + Drizzle implementation + mock implementation.

**Detailed steps:**

1. Define `SalesforceConnectionEntity` and `SalesforceConnectionRepository` in `packages/contract/`
2. Implement Drizzle repository (encrypt on write, decrypt on read, optimistic lock on refresh)
3. Implement mock repository (in-memory, no encryption)
4. Add seed data in `packages/seed-data/src/salesforce-connections.ts`
5. Register in `Repositories` container
6. Tests for both implementations

**Output:** Full CRUD repository. **Effort:** ~8-10 hours.

#### Step 1.5: OAuth Flow Endpoints + Post-Connection Audit

**What:** OAuth initiation, callback with stateless PKCE, disconnect, and automatic permission audit.

**Three endpoints + one audit routine:**

1. `POST /v1/projects/:projectId/salesforce/connect` — generates signed state with embedded code verifier, returns redirect URL, sets `connecting` status with 10-min TTL
2. `GET /v1/salesforce/oauth/callback` — validates state, extracts code verifier, exchanges tokens, runs permission audit, stores encrypted, renders popup-closing HTML
3. `POST /v1/projects/:projectId/salesforce/disconnect` — revokes tokens at Salesforce, marks disconnected
4. **Post-connection audit routine** — automatically runs after token exchange: detects CPQ version, tests object access, captures API limits, stores results in `connection_metadata`

**Also:**

- `SalesforceOAuthService` in `apps/server/src/services/` (keeps routes thin)
- Zod schemas in `packages/contract/`
- Specific error handler for "app not approved" error → shows Section 7 instructions
- Connection lock: reject new connect attempts while status is `connecting`

**Output:** Full OAuth flow with permission audit. **Effort:** ~12-15 hours.

#### Step 1.6: Connection Status & Test Endpoints

**What:** `GET .../connections` and `POST .../test`.

- Status endpoint returns both source and target connection info (never tokens)
- Test endpoint makes lightweight API call, attempts refresh if needed

**Effort:** ~3-4 hours.

#### Step 1.7: Client UI — Connection Flow

**What:** React components for popup OAuth flow, connection status, and disconnect.

**Detailed steps:**

1. "Salesforce Connections" section on project settings/workspace
2. Two connection slots: Source (CPQ) and Target (RCA) — each with its own connect/disconnect
3. Environment selector (Production/Sandbox) + optional My Domain URL field
4. Popup OAuth flow with `window.open()` + `postMessage` listener
5. Connected state: green badge, instance URL, user, CPQ version, API budget, "Test" and "Disconnect" buttons
6. Pre-connection checklist (Section 7 instructions) shown as expandable help text
7. Error states with actionable messages
8. Translations (English + Hebrew)

**Output:** Full connection management UI. **Effort:** ~8-10 hours.

#### Step 1.8: Mock Mode + Tests

**What:** Mock mode support + comprehensive test suite.

- Mock repository returns pre-configured connections for seed projects
- Mock "Connect" shows simulated success flow
- Tests: encryption, OAuth flow, PKCE, state validation, RBAC, token refresh, disconnect, permission audit

**Effort:** ~6-8 hours.

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

> **Practically:** ~2-3 weeks for one developer. ~1-2 weeks for a team of 2.

---

### Phase 2: CPQ Data Extraction

**What the user gets:** "I can see all my CPQ configuration data inside RevBrain — products, rules, pricing, templates, everything."

#### Step 2.1: Salesforce API Client

**What:** Runtime-agnostic wrapper around Salesforce REST API with built-in token refresh, rate limit tracking, and SOQL injection protection.

**Key capabilities:**

- `query<T>(soql)` — SOQL with pagination (2000 records per page, auto-follow `nextRecordsUrl`)
- `queryAll<T>(soql)` — auto-paginating version
- `describe(objectName)` — object metadata
- `describeGlobal()` — all objects
- `getRecord()`, `createRecord()`, `updateRecord()` — CRUD
- Built-in 401 → refresh → retry
- `Sforce-Limit-Info` header tracking → updates connection's API usage
- Request logging: project ID, method, duration, remaining API calls
- **SOQL safety:** Object/field names validated against `describe()` results. No raw user input in queries.

**Effort:** ~8-10 hours.

#### Step 2.2: Bulk & Composite API Support

> **v3 addition:** Both auditors flagged that standard REST queries burn through API limits for large orgs.

**What to build:**

- **Composite API wrapper** — batch up to 25 subrequests in a single HTTP call. Used for multi-object describe calls and small-to-medium queries.
- **Bulk API 2.0 wrapper** — for large data volumes (>10,000 records per object). Creates query jobs, polls for completion, downloads CSV results. Used for `SBQQ__QuoteLine__c`, `SBQQ__Subscription__c`, and other high-volume objects.
- **PK chunking** header support for very large tables
- **Adaptive strategy:** Auto-select REST vs Bulk based on estimated record count (from `SELECT COUNT() FROM ...`)

**Effort:** ~8-10 hours.

#### Step 2.3: CPQ Object Discovery

**What:** Auto-detect CPQ package version and available objects.

1. Query `Publisher` for SBQQ namespace → CPQ version
2. `describeGlobal()` → filter `SBQQ__` objects
3. `describe()` each → field metadata, types, picklist values
4. Store schema in `connection_metadata`
5. "CPQ Inventory" view in UI

**Effort:** ~4-6 hours.

#### Step 2.4: Data Extraction Engine

**What:** Extract all CPQ configuration data with progress tracking and incremental support.

**Key features:**

- Extraction jobs per object category (via `jobQueue`)
- Adaptive query strategy (REST for small objects, Bulk API for large)
- **Incremental extraction** using `SystemModstamp` / `LastModifiedDate` — only fetch changed records
- Progress bar in UI: "Extracting Price Rules... 245/312"
- API limit awareness: pause extraction if approaching daily limit (80% threshold)
- Store in project-scoped `cpq_extracted_data` table

**Effort:** ~12-16 hours.

#### Step 2.5: CPQ Data Visualization UI

**What:** "CPQ Explorer" in project workspace.

- Object categories in sidebar (Products, Bundles, Rules, Templates, QCP)
- Searchable/filterable tables per category
- Detail views with all fields
- Visual rule representation (condition → action)
- Bundle tree view (parent → features → options)
- QCP source code with syntax highlighting
- Relationship maps

**Effort:** ~12-16 hours.

#### Step 2.6: Extraction Health & Monitoring

- Last extraction timestamp per object type
- Record counts and change detection
- API usage dashboard (daily limit, remaining, trend)
- Warnings for incomplete extractions
- "Re-extract" and "Refresh changed data" buttons

**Effort:** ~4-6 hours.

#### Phase 2 Total: **~48-64 hours** (~2-3 weeks solo, ~1-2 weeks with 2 devs)

---

### Phase 3: Connection Resilience & Token Management

**What the user gets:** "My Salesforce connection stays healthy for weeks without me thinking about it."

#### Step 3.1: Robust Token Refresh

Proactive refresh at 75% TTL, optimistic locking, retry with backoff, permanent failure detection.
**Effort:** ~5-7 hours.

#### Step 3.2: Connection Health Monitoring

Scheduled job every 30 minutes, lightweight API health check, auto-refresh, notifications on failure, health dashboard.
**Effort:** ~5-7 hours.

#### Step 3.3: User Notifications

In-app + email notifications for connection errors, project-level banners, notification preferences.
**Effort:** ~5-7 hours.

#### Step 3.4: Reconnect Flow

"Reconnect" button → new OAuth flow → updates EXISTING connection record (preserves history and extracted data references). Auto-retest after reconnection.
**Effort:** ~3-5 hours.

#### Step 3.5: Encryption Key Rotation

Admin endpoint `POST /admin/encryption/rotate`. Re-encrypts all connections with new key, increments `encryption_key_version`, supports gradual rollover.
**Effort:** ~5-7 hours.

#### Step 3.6: Connection Logs UI

Timeline view of connection events, filterable by type. Useful for debugging and auditing.
**Effort:** ~3-5 hours.

#### Phase 3 Total: **~26-38 hours** (~1-2 weeks solo)

---

### Phase 4: CPQ Analysis & Migration Mapping

**What the user gets:** "RevBrain tells me exactly how my CPQ configuration maps to RCA, what can be auto-migrated, and what needs manual work."

#### Step 4.1: CPQ→RCA Object Mapping Engine

> **v3 expansion:** Auditor 1 flagged that the v2 mapping table was incomplete and partially inaccurate. RCA has introduced several new concepts with no direct CPQ equivalent.

**Expanded mapping (v3):**

| CPQ Concept             | CPQ Object                                   | RCA Equivalent                                            | RCA Object                                    | Complexity  |
| ----------------------- | -------------------------------------------- | --------------------------------------------------------- | --------------------------------------------- | ----------- |
| Product                 | `Product2` + `SBQQ__*` fields                | Product + Selling Model                                   | `Product2` + `ProductSellingModel`            | Simple      |
| Bundle                  | `SBQQ__ProductOption__c`                     | Product Relationship                                      | `ProductRelationship`                         | Moderate    |
| Features                | `SBQQ__Feature__c`                           | Product Relationship Groups                               | Native grouping                               | Moderate    |
| Price Rule              | `SBQQ__PriceRule__c`                         | **Pricing Procedure**                                     | `PricingProcedure` + `PricingProcedureStep`   | Complex     |
| Price Condition/Action  | `SBQQ__PriceCondition__c` / `PriceAction__c` | Pricing Procedure Steps                                   | `PricingProcedureStep`                        | Complex     |
| Discount Schedule       | `SBQQ__DiscountSchedule__c`                  | Pricing Adjustment                                        | `PricingAdjustment` + `PricingAdjustmentTier` | Moderate    |
| Block Price             | `SBQQ__BlockPrice__c`                        | Pricing Plan                                              | `PricingPlan` + `PricingPlanStep`             | Moderate    |
| Product Rule            | `SBQQ__ProductRule__c`                       | **Constraint Modeling Language**                          | Constraint rules                              | Complex     |
| Configuration Rule      | `SBQQ__ConfigurationRule__c`                 | **Product Configurator (native)**                         | Native configurator rules                     | Complex     |
| Configuration Attribute | `SBQQ__ConfigurationAttribute__c`            | **Dynamic Attributes**                                    | Dynamic attribute definitions                 | Complex     |
| QCP (JS calculations)   | `SBQQ__CustomScript__c`                      | **Pricing Procedure (replaces BOTH Price Rules AND QCP)** | Custom pricing logic in Procedures            | Manual      |
| QCP (field visibility)  | `isFieldVisible`/`isFieldEditable`           | OmniStudio / LWC UI logic                                 | Custom LWC components                         | Manual      |
| Quote Template          | `SBQQ__QuoteTemplate__c`                     | **OmniStudio Document Generation**                        | OmniStudio FlexCard / Document Template       | Complex     |
| Custom Action           | `SBQQ__CustomAction__c`                      | Flow / LWC Action                                         | Platform Flows + LWC                          | Complex     |
| Guided Selling          | CPQ Guided Selling Flow                      | **OmniStudio Guided Selling**                             | OmniStudio FlexCards + Integration Procedures | Complex     |
| N/A (new in RCA)        | —                                            | **Context Definition Service**                            | `ContextDefinition`                           | New concept |
| N/A (new in RCA)        | —                                            | **Dynamic Revenue Orchestration**                         | Order decomposition engine                    | New concept |

> **Critical note:** RCA is evolving rapidly but has **not yet reached full feature parity with CPQ**. Documentation and ecosystem expertise are still maturing. The mapping engine must be **version-aware** — RCA features are being added every Salesforce release. A mapping that's "manual-only" today might become automatable in the next release. Consider a **versioned mapping rules database** that can be updated without code changes.

**What to build:**

1. Mapping rules engine with transformation definitions per object pair
2. Complexity scoring (simple, moderate, complex, manual-only)
3. Dependency analysis (which mappings must be done first)
4. Gap analysis ("these CPQ features have no RCA equivalent — workaround: ...")
5. Coverage report ("85% auto-mappable, 10% needs review, 5% manual")
6. **Version-aware rules** — tag each mapping with the minimum RCA release that supports it

**Effort:** ~25-35 hours (core IP of the product).

#### Step 4.2: QCP Code Analysis

Parse QCP JavaScript via AST (using `acorn` or similar). Identify implemented methods, detect patterns (custom calculations, external lookups, field visibility rules). Classify by complexity and RCA-equivalent approach.
**Effort:** ~12-16 hours.

#### Step 4.3: Migration Plan Generator

Auto-generate phased plan based on analysis. Estimate effort per step. Identify blockers. Shareable report (PDF/web) for stakeholders. Customizable by operator.
**Effort:** ~10-14 hours.

#### Phase 4 Total: **~47-65 hours** (~2-3 weeks solo)

---

### Phase 5: RCA Write-Back & Deployment

> **v3 addition:** Both auditors flagged that the spec was missing the write side — actually creating RCA objects in the target org. This is arguably the most valuable capability.

**What the user gets:** "RevBrain can create the RCA configuration in my target org based on the migration mapping, and validate that it produces correct results."

#### Step 5.1: RCA Object Creation API

**What:** Use the target connection's OAuth tokens to create RCA objects via the Salesforce REST API.

**Key challenges:**

- **Deployment ordering:** Parent objects before children (e.g., `ProductSellingModel` before `ProductSellingModelOption`)
- **Mixed config + data:** RCA configuration involves both metadata (custom fields, flows) and data (records). Most deployment tools can't handle both — RevBrain's write-back needs to handle both
- **Idempotency:** Must support re-running write-back without creating duplicates (upsert by external ID)

**What to build:**

1. Deployment plan generator — topologically sorted creation order based on object dependencies
2. Upsert-based creation (use external IDs to prevent duplicates)
3. Progress tracking in UI ("Creating ProductSellingModel... 12/45")
4. Error handling per record — continue on soft errors, abort on hard errors
5. Detailed deployment report (what was created, what failed, why)

**Effort:** ~16-22 hours.

#### Step 5.2: Validation Testing

**What:** After write-back, verify that the RCA configuration produces the same pricing as the original CPQ configuration.

**What to build:**

1. Create test quotes in the target org using RCA pricing
2. Compare results against CPQ-calculated quotes (from Layer 2 ServiceRouter API)
3. Highlight discrepancies with specific field-level diffs
4. "Validation Report" showing pass/fail per pricing scenario

**Effort:** ~10-14 hours.

#### Step 5.3: Rollback Strategy

**What:** If a deployment fails or produces wrong results, undo the changes.

**What to build:**

1. Track all records created during a deployment (IDs + object types)
2. "Rollback" button that deletes all created records in reverse dependency order
3. Confirmation dialog with clear warning
4. Rollback report

**Effort:** ~6-8 hours.

#### Phase 5 Total: **~32-44 hours** (~2 weeks solo)

---

### Phase 6: Browser Automation (Advanced Behavioral Analysis)

**What the user gets:** "RevBrain can observe how the CPQ UI actually behaves — field visibility, configurator interactions — and capture that behavior for accurate migration."

**Why this late:** Most customers get a successful migration from Phases 1-5 (API data + code analysis + write-back). Phase 6 is for complex CPQ implementations where UI behavior diverges from what the rules data suggests.

> **Security posture (v3 strengthened):** This phase is **explicitly optional and high-risk**. Storing passwords (even encrypted, even for a dedicated user) is the biggest security/compliance liability in the entire plan. Customer consent and disclaimers are required.

#### Step 6.1: Browser Automation Credentials Table

Separate table (NOT in `salesforce_connections`):

```sql
CREATE TABLE browser_automation_credentials (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id         UUID NOT NULL REFERENCES salesforce_connections(id) ON DELETE CASCADE,
  encrypted_sf_username BYTEA NOT NULL,    -- AES-256-GCM (HKDF context: "browser_cred")
  encrypted_sf_password BYTEA NOT NULL,
  encrypted_mfa_secret  BYTEA,             -- Optional TOTP seed
  status                VARCHAR(20) NOT NULL DEFAULT 'active',
  last_login_at         TIMESTAMPTZ,
  last_error            TEXT,
  consent_accepted_at   TIMESTAMPTZ NOT NULL, -- Customer must explicitly consent
  consent_accepted_by   UUID NOT NULL REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Effort:** ~6-8 hours (includes UI for credential input, consent flow, "Test Login" button).

#### Step 6.2: Playwright Worker Infrastructure

`apps/worker/` — Node.js job poller, browser pool, session manager, Docker image, health endpoint.
**Effort:** ~14-18 hours.

#### Step 6.3: Salesforce Login Automation

Login page navigation, credential entry, TOTP MFA handling, Lightning Experience detection. Error for unsupported MFA types (push/SMS).
**Effort:** ~10-12 hours.

#### Step 6.4: QLE Behavioral Capture

Navigate to QLE, capture field visibility/editability, trigger recalculations, compare against QCP expectations.
**Effort:** ~12-16 hours.

#### Step 6.5: Configurator Behavioral Capture

Navigate to Configurator, capture option visibility, selection dependencies, interaction tree.
**Effort:** ~12-16 hours.

#### Step 6.6: Results Storage & Visualization

`browser_automation_results` table, "Behavioral Analysis" tab, field visibility matrix, configurator interaction tree, screenshots, API-vs-observed comparison.
**Effort:** ~10-14 hours.

#### Phase 6 Total: **~64-84 hours** (~3-4 weeks solo)

---

### Phase 7: Enterprise Hardening & AppExchange

**What the user gets:** "RevBrain is production-grade — AppExchange-listed, enterprise auth options, API limit management."

#### Step 7.1: AppExchange Listing

Security review, documentation, penetration testing, compliance. **Eliminates the "app not approved" friction from Section 7.**
**Effort:** ~30-50 hours (includes review cycles).

#### Step 7.2: JWT Bearer Flow (Alternative Auth)

Certificate-based auth for enterprise clients.
**Effort:** ~8-10 hours.

#### Step 7.3: API Usage Tracking & Dashboard

Per-project daily usage, throttling, warnings at 80%.
**Effort:** ~8-10 hours.

#### Step 7.4: RCA Feature Parity Tracking

Versioned mapping rules database. Track which RCA release supports which features. Auto-flag mappings that became automatable in new releases.
**Effort:** ~6-8 hours.

#### Step 7.5: SOC 2 / Compliance Documentation

Document credential handling, data retention, access controls for compliance audits.
**Effort:** ~15-25 hours.

#### Phase 7 Total: **~67-103 hours**

---

### Timeline Summary

| Phase       | What You Get                        | Dev Effort  | Calendar (1 dev) | Calendar (2 devs) |
| ----------- | ----------------------------------- | ----------- | ---------------- | ----------------- |
| **Phase 1** | Connect + verify + permission audit | ~47-61 hrs  | ~2-3 weeks       | ~1-2 weeks        |
| **Phase 2** | Extract and view all CPQ data       | ~48-64 hrs  | ~2-3 weeks       | ~1-2 weeks        |
| **Phase 3** | Reliable long-running connections   | ~26-38 hrs  | ~1-2 weeks       | ~1 week           |
| **Phase 4** | CPQ→RCA mapping and migration plan  | ~47-65 hrs  | ~2-3 weeks       | ~1-2 weeks        |
| **Phase 5** | RCA write-back and validation       | ~32-44 hrs  | ~1-2 weeks       | ~1 week           |
| **Phase 6** | Browser-based behavioral analysis   | ~64-84 hrs  | ~3-4 weeks       | ~2-3 weeks        |
| **Phase 7** | AppExchange, enterprise, compliance | ~67-103 hrs | ~3-5 weeks       | ~2-3 weeks        |

**Total: ~331-459 hours**

**Recommended launch plan:**

- **Phases 1-2** together → first usable product (connect + see data). ~3-4 weeks.
- **Phase 3** → production-ready connections. +1-2 weeks.
- **Phase 4** → the real product differentiator (migration intelligence). +2-3 weeks.
- **Phase 5** → complete the core value prop (write-back + validation). +1-2 weeks.
- **Phase 6** → premium feature for complex CPQ setups. +3-4 weeks.
- **Phase 7** → in parallel with Phase 4-6: start AppExchange security review early to reduce onboarding friction.

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

## Appendix C: RevBrain Architecture Context

For reviewers unfamiliar with the codebase:

- **Monorepo** with `apps/server` (Hono API), `apps/client` (React SPA), `packages/contract` (shared types), `packages/database` (Drizzle ORM)
- **Dual-adapter pattern**: every repository has a mock (in-memory) and a Drizzle (PostgreSQL) implementation sharing the same interface
- **Multi-runtime**: server runs on Node.js locally and Deno on Supabase Edge Functions — libraries must be compatible with both
- **Auth**: JWT-based (Supabase Auth), decode-only on edge (gateway already verified)
- **Existing project model**: projects already have CRUD, members, files, status tracking — Salesforce connection extends this
- **Job queue**: existing `jobQueue` table for async work — used for extraction jobs and browser automation

## Appendix D: Auditor Feedback Resolution Matrix

| #   | Issue                                               | Auditor | Severity | Resolution                                                  | Section       |
| --- | --------------------------------------------------- | ------- | -------- | ----------------------------------------------------------- | ------------- |
| 1   | Connected App installation requirement              | A1      | Critical | Added Section 7 (pre-connection guide), ECA in Section 6    | §6, §7        |
| 2   | External Client App (ECA) over legacy Connected App | A2      | Critical | Section 6 fully rewritten for ECA                           | §6            |
| 3   | IV reuse in encryption                              | A1      | Critical | Per-field IV packed into BYTEA blob + HKDF derived keys     | §9, §11       |
| 4   | API version outdated (v62→v66)                      | A1      | Critical | Auto-detection, no hardcoding                               | §8, §11, §20  |
| 5   | RCA mapping incomplete                              | A1      | Critical | Expanded table with 17 rows, version-aware rules            | §22 (Phase 4) |
| 6   | No write-back phase                                 | A1, A2  | High     | New Phase 5: RCA Write-Back & Deployment                    | §22 (Phase 5) |
| 7   | Single connection per project                       | A1      | High     | `UNIQUE(project_id, connection_role)`, source+target model  | §11, §13      |
| 8   | No data retention policy                            | A1      | High     | New Section 16                                              | §16           |
| 9   | No Bulk/Composite API strategy                      | A1, A2  | High     | Phase 2 Step 2.2                                            | §22 (Phase 2) |
| 10  | My Domain Day 1                                     | A1, A2  | High     | `custom_login_url` field, supported from Phase 1            | §8, §11, §20  |
| 11  | Post-connection permission audit                    | A1, A2  | High     | Added to OAuth callback flow                                | §8            |
| 12  | Stateless PKCE                                      | A1      | Medium   | Code verifier embedded in signed state JWT                  | §8, §20       |
| 13  | Popup OAuth flow                                    | A1, A2  | Medium   | Resolved: popup with postMessage                            | §8, §20       |
| 14  | Concurrent connection handling                      | A1      | Medium   | `connecting` status with TTL lock                           | §10, §17      |
| 15  | SOQL injection protection                           | A1      | Medium   | Documented in §17, enforced in API client                   | §17, §22      |
| 16  | Premature Phase 5 columns                           | A1      | Low      | Removed — separate `browser_automation_credentials` table   | §11, §22      |
| 17  | Missing `salesforce_org_id` index                   | A1      | Low      | Added to schema                                             | §11           |
| 18  | Rate limit callback endpoint                        | A1      | Low      | Added to security checklist                                 | §18           |
| 19  | Effort estimates buffer                             | A1      | Low      | 30-50% buffer added to all estimates                        | §22           |
| 20  | HKDF derived keys per sensitivity                   | A1      | Medium   | Added to encryption design                                  | §9            |
| 21  | Connection metadata capture                         | A1      | Medium   | `connection_metadata` JSONB + audit routine                 | §8, §11       |
| 22  | Optimistic locking for refresh                      | A1      | Medium   | `token_version` counter                                     | §10, §11      |
| 23  | Hyperforce URL changes                              | A1      | Low      | Update instance_url on every refresh                        | §10           |
| 24  | Stakeholders JSONB validation                       | A1      | Low      | Zod schema required                                         | §11           |
| 25  | Browser credentials separate table                  | A1      | Low      | `browser_automation_credentials` table                      | §22 (Phase 6) |
| 26  | Phase 5 credential security language                | A2      | Medium   | Strengthened: explicit opt-in, consent, high-risk warning   | §22 (Phase 6) |
| 27  | RCA feature parity tracking                         | A1      | Medium   | Version-aware mapping rules in Phase 4, tracking in Phase 7 | §22           |
| 28  | Consumer secret rotation behavior                   | A1      | Low      | Clarified in §10 and §17 edge case #4                       | §10, §17      |
