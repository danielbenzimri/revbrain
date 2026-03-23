# Technical Spike: JWT Signing for Impersonation + Step-Up Auth

> **Date:** 2026-03-21 | **Status:** Decided

## Decision: HS256 JWTs with SUPABASE_JWT_SECRET

### Impersonation Tokens

The RevBrain server will sign its own impersonation JWTs using the `SUPABASE_JWT_SECRET` with HS256 algorithm. The existing auth middleware already handles HS256 verification via `hono/jwt verify()`.

**Token structure:**

```json
{
  "sub": "<impersonated user's supabaseUserId>",
  "realUserId": "<admin's user ID>",
  "realSubject": "<admin's supabaseUserId>",
  "impersonationMode": "read_only",
  "reason": "Investigating ticket TK-003",
  "iat": <issued timestamp>,
  "exp": <iat + 30 minutes>,
  "iss": "revbrain-impersonation"
}
```

**Why this works:**

- Auth middleware detects HS256 algo and verifies with `SUPABASE_JWT_SECRET`
- `sub` claim matches the impersonated user → middleware loads that user
- `iss: "revbrain-impersonation"` distinguishes from regular Supabase JWTs
- `realUserId` preserved for audit logging
- 30-minute expiry enforces time-bounded sessions

**Auth middleware changes needed:**

- After JWT verification, check `iss === 'revbrain-impersonation'`
- If impersonation: set both `c.set('user', impersonatedUser)` and `c.set('realUser', adminUser)`
- Apply impersonation endpoint allowlist (read-only mode blocks mutations)

### Step-Up Auth

**Mechanism:** JWT `iat` claim as proxy for last authentication time.

- `requireRecentAuth(maxAgeMinutes)` middleware checks `payload.iat`
- If `iat` is older than `maxAgeMinutes`, return 403 `STEP_UP_REQUIRED`
- Client calls `supabase.auth.refreshSession()` which issues new JWT with fresh `iat`
- Client retries the original request with the refreshed token

**Why `iat` works:**

- Supabase issues new JWT on session refresh with updated `iat`
- No additional server-side session store needed
- Simple, stateless, no new infrastructure

### What NOT to build

- No custom JWT signing library — use `hono/jwt sign()`
- No JWKS or public key infrastructure — HS256 with shared secret is sufficient
- No server-side session table for impersonation — JWT is self-contained
- No custom MFA re-challenge flow — Supabase session refresh is the mechanism
