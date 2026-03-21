# RevBrain — Platform Setup Guide

> Step-by-step guide for setting up all external services and environment variables. Covers local development, staging, and production environments.

---

## Quick Reference — Services to Set Up

| #   | Service                      | Purpose                                | Required For                | Free Tier?           |
| --- | ---------------------------- | -------------------------------------- | --------------------------- | -------------------- |
| 1   | [Supabase](#1-supabase)      | Database, Auth, Storage                | Everything beyond mock mode | Yes                  |
| 2   | [Stripe](#2-stripe)          | Billing, Subscriptions, Payments       | Billing features            | Yes (test mode)      |
| 3   | [Resend](#3-resend)          | Transactional Email                    | Email delivery              | Yes (100 emails/day) |
| 4   | [Sentry](#4-sentry)          | Error Tracking, Performance Monitoring | Production monitoring       | Yes (5K events/mo)   |
| 5   | [Slack](#5-slack-alerts)     | Alert Notifications                    | Ops alerting                | Yes                  |
| 6   | [Vercel](#6-vercel-optional) | Deployment (optional)                  | If deploying to Vercel      | Yes                  |

**Without any services:** The app runs fully in mock mode (`USE_MOCK_DATA=true`) with in-memory data, console email, and no billing. This is the default local development experience.

---

## Environment Files

RevBrain uses different `.env` files per environment. All are loaded from the monorepo root:

| File           | Environment                 | Git-tracked?    |
| -------------- | --------------------------- | --------------- |
| `.env.local`   | Local development           | No (gitignored) |
| `.env.dev`     | Staging / dev remote        | No (gitignored) |
| `.env.prod`    | Production                  | No (gitignored) |
| `.env.example` | Template with all variables | Yes             |

The client also reads from `apps/client/.env.local` for `VITE_*` variables.

**Which file loads?** Controlled by `APP_ENV`:

- `APP_ENV=development` (or unset) → loads `.env.local`
- `APP_ENV=staging` → loads `.env.dev`
- `APP_ENV=production` → loads `.env.prod`

---

## 1. Supabase

**What it provides:** PostgreSQL database, user authentication (email/password, magic links, MFA), file storage, real-time subscriptions.

### Setup Steps

1. **Create a project** at [supabase.com](https://supabase.com)
   - Choose a region close to your users
   - Note the project URL and keys from Settings → API

2. **Get your keys** from the Supabase dashboard → Settings → API:
   - **Project URL** — e.g., `https://abcdefgh.supabase.co`
   - **anon/public key** — safe for client-side, starts with `eyJ...`
   - **service_role key** — server-only, full access, starts with `eyJ...`
   - **JWT Secret** — Settings → API → JWT Settings (for local token validation)

3. **Database password** — Settings → Database → Connection string
   - The pooled connection string for your app server
   - Format: `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`

4. **Run database migrations:**

   ```bash
   npx drizzle-kit push:pg
   ```

5. **Enable Row-Level Security** (recommended):
   - Dashboard → Authentication → Policies
   - Or via SQL in the SQL Editor

### Environment Variables

| Variable                    | Local                                                           | Staging                      | Production                    |
| --------------------------- | --------------------------------------------------------------- | ---------------------------- | ----------------------------- |
| `SUPABASE_URL`              | `http://localhost:54321` (local Supabase) or remote project URL | Your dev project URL         | Your prod project URL         |
| `SUPABASE_ANON_KEY`         | From local Supabase or remote                                   | Dev project anon key         | Prod project anon key         |
| `SUPABASE_SERVICE_ROLE_KEY` | From local Supabase or remote                                   | Dev project service key      | Prod project service key      |
| `SUPABASE_JWT_SECRET`       | From dashboard                                                  | Dev JWT secret               | Prod JWT secret               |
| `DATABASE_URL`              | `postgresql://postgres:postgres@localhost:5432/revbrain`        | Dev pooled connection string | Prod pooled connection string |
| `VITE_SUPABASE_URL`         | Same as `SUPABASE_URL`                                          | Same                         | Same                          |
| `VITE_SUPABASE_ANON_KEY`    | Same as `SUPABASE_ANON_KEY`                                     | Same                         | Same                          |

**Local mock mode (no Supabase needed):**

```env
USE_MOCK_DATA=true
AUTH_MODE=mock
# Supabase vars can be omitted entirely
```

**Local with real Supabase:**

```env
USE_MOCK_DATA=false
AUTH_MODE=jwt
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://postgres.[ref]:[password]@...
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### What Gets Unblocked

Once Supabase is connected, these implementation plan tasks can proceed:

- **Task 1.7:** Check RLS status, set INSERT-only on audit_logs
- **Task 1.10:** MFA enforcement (Supabase Auth MFA API)
- **Task 2.1:** Admin permission schema migration
- **Tasks 2.0–2.10:** Full impersonation chain

---

## 2. Stripe

**What it provides:** Subscription billing, checkout sessions, customer portal, payment processing, webhooks for billing events.

### Setup Steps

1. **Create an account** at [stripe.com](https://stripe.com)
   - Start in **test mode** (toggle in top-right of dashboard)

2. **Get your API keys** from Developers → API Keys:
   - **Publishable key** — starts with `pk_test_` (client-safe)
   - **Secret key** — starts with `sk_test_` (server-only)

3. **Set up webhook endpoint:**
   - Developers → Webhooks → Add endpoint
   - URL: `https://your-domain.com/v1/webhooks/stripe`
   - Events to listen for:
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `checkout.session.completed`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
     - `charge.refunded`
   - Copy the **Webhook signing secret** (starts with `whsec_`)

4. **For local development**, use Stripe CLI to forward webhooks:
   ```bash
   stripe listen --forward-to localhost:3000/v1/webhooks/stripe
   ```
   This prints a webhook signing secret for local use.

### Environment Variables

| Variable                      | Local                           | Staging                               | Production                          |
| ----------------------------- | ------------------------------- | ------------------------------------- | ----------------------------------- |
| `STRIPE_SECRET_KEY`           | `sk_test_...`                   | `sk_test_...` (same test key is fine) | `sk_live_...`                       |
| `STRIPE_WEBHOOK_SECRET`       | From `stripe listen` CLI output | `whsec_...` from staging webhook      | `whsec_...` from production webhook |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_test_...`                   | `pk_test_...`                         | `pk_live_...`                       |

**Minimal local setup (test mode):**

```env
STRIPE_SECRET_KEY=sk_test_your_test_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_local_webhook_secret
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_test_key_here
```

**No Stripe (mock mode):** Billing features use mock responses. No Stripe keys needed.

### Important Notes

- **Never use live keys in development/staging.** Test mode keys are free and create no real charges.
- Webhook signing secret is **different per endpoint** — local CLI, staging, and production each have their own.
- RevBrain syncs plans to Stripe automatically via `syncPlanToStripe()`. Test-mode products/prices are created on first use.

---

## 3. Resend

**What it provides:** Transactional email delivery (welcome emails, password resets, billing notifications, support ticket replies).

### Setup Steps

1. **Create an account** at [resend.com](https://resend.com)

2. **Get your API key** from the dashboard → API Keys → Create API Key

3. **Verify a sending domain:**
   - Add your domain (e.g., `revbrain.ai`)
   - Add the DNS records Resend provides (DKIM, SPF, DMARC)
   - Wait for verification (usually minutes)

4. **Set your sender address** — must be on the verified domain

### Environment Variables

| Variable         | Local                       | Staging                              | Production                       |
| ---------------- | --------------------------- | ------------------------------------ | -------------------------------- |
| `RESEND_API_KEY` | Omit (uses console adapter) | `re_...` (your dev key)              | `re_...` (your prod key)         |
| `EMAIL_FROM`     | N/A (console)               | `RevBrain <noreply@your-domain.com>` | `RevBrain <noreply@revbrain.ai>` |
| `EMAIL_ASYNC`    | `false`                     | `true`                               | `true`                           |

**No Resend (default local):**

```env
# Just omit RESEND_API_KEY — emails print to console
```

**With Resend:**

```env
RESEND_API_KEY=re_your_api_key_here
EMAIL_FROM=RevBrain <noreply@revbrain.ai>
EMAIL_ASYNC=true
```

### Behavior

- **No API key:** `ConsoleEmailAdapter` logs emails to server console (great for development)
- **With API key:** `ResendEmailAdapter` sends real emails
- **`EMAIL_ASYNC=true`:** Emails are queued via the job queue for reliability (recommended for staging/production)

---

## 4. Sentry

**What it provides:** Error tracking, performance monitoring, issue alerting, release tracking.

### Setup Steps

1. **Create an account** at [sentry.io](https://sentry.io)

2. **Create a project:**
   - Platform: Node.js
   - Copy the **DSN** (Data Source Name) from Project Settings → Client Keys

3. **Optional:** Set up source maps for better stack traces in production

### Environment Variables

| Variable             | Local                  | Staging                     | Production                  |
| -------------------- | ---------------------- | --------------------------- | --------------------------- |
| `SENTRY_DSN`         | Omit (Sentry disabled) | `https://...@sentry.io/...` | `https://...@sentry.io/...` |
| `SENTRY_ENVIRONMENT` | N/A                    | `staging`                   | `production`                |
| `SENTRY_RELEASE`     | N/A                    | Auto from package version   | Auto from package version   |

**No Sentry (local):**

```env
# Just omit SENTRY_DSN — errors only go to console
```

**With Sentry:**

```env
SENTRY_DSN=https://your-key@o12345.ingest.sentry.io/67890
SENTRY_ENVIRONMENT=production
```

### Behavior

- Sentry is a **no-op** when DSN is missing — zero overhead
- Performance tracing: 100% sample rate in dev, 10% in production
- Filters out 4xx errors (only captures 5xx and unhandled exceptions)
- Automatically tags errors with userId, orgId, and requestId

---

## 5. Slack (Alerts)

**What it provides:** Critical alert notifications delivered to a Slack channel (failed payments, dead jobs, SLA breaches).

### Setup Steps

1. **Create a Slack App** at [api.slack.com/apps](https://api.slack.com/apps) → Create New App → From scratch

2. **Enable Incoming Webhooks:**
   - Features → Incoming Webhooks → Activate
   - Add New Webhook to Workspace → Select a channel (e.g., `#revbrain-alerts`)
   - Copy the **Webhook URL**

### Environment Variables

| Variable                    | Local                       | Staging                      | Production                           |
| --------------------------- | --------------------------- | ---------------------------- | ------------------------------------ |
| `SLACK_ALERT_WEBHOOK_URL`   | Omit (alerts go to console) | Your staging channel webhook | Your production channel webhook      |
| `ALERT_EMAIL_RECIPIENTS`    | Omit                        | `dev@revbrain.ai`            | `ops@revbrain.ai,oncall@revbrain.ai` |
| `ALERT_CRITICAL_RECIPIENTS` | Omit                        | Same as above                | `cto@revbrain.ai,ops@revbrain.ai`    |

**No Slack (local):**

```env
# Alerts only print to console
```

**With Slack:**

```env
SLACK_ALERT_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../xxx
ALERT_EMAIL_RECIPIENTS=ops@revbrain.ai
```

---

## 6. Vercel (Optional)

**What it provides:** Deployment platform for the client SPA and optional edge functions.

### Setup Steps

1. **Create project** at [vercel.com](https://vercel.com) → Import your Git repository
2. Get tokens from Settings → Tokens

### Environment Variables (deployment scripts only)

| Variable            | Purpose                                |
| ------------------- | -------------------------------------- |
| `VERCEL_TOKEN`      | API authentication for CLI deployments |
| `VERCEL_PROJECT_ID` | Target project ID                      |
| `VERCEL_ORG_ID`     | Organization/team ID                   |

These are only needed if using Vercel CLI for automated deployments. If deploying via Git integration, Vercel reads env vars from its dashboard.

---

## Complete .env Templates

### Local Development (Mock Mode — No Services Needed)

```env
# === Core ===
NODE_ENV=development
APP_ENV=development
APP_URL=http://localhost:5173

# === Mock Mode (no external services) ===
USE_MOCK_DATA=true
AUTH_MODE=mock

# === Client ===
VITE_API_URL=http://localhost:3000
VITE_AUTH_MODE=mock

# === Optional: Stripe test mode (for testing billing UI) ===
# STRIPE_SECRET_KEY=sk_test_...
# VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### Local Development (Real Supabase)

```env
# === Core ===
NODE_ENV=development
APP_ENV=development
APP_URL=http://localhost:5173

# === Real Mode ===
USE_MOCK_DATA=false
AUTH_MODE=jwt

# === Supabase ===
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_JWT_SECRET=your-jwt-secret
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-region.pooler.supabase.com:6543/postgres

# === Client ===
VITE_API_URL=http://localhost:3000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_AUTH_MODE=jwt

# === Stripe (test mode) ===
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_... (from stripe listen CLI)
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...

# === Email (optional — console fallback if omitted) ===
# RESEND_API_KEY=re_...
# EMAIL_FROM=RevBrain <noreply@your-domain.com>
```

### Staging

```env
# === Core ===
NODE_ENV=production
APP_ENV=staging
APP_URL=https://staging.revbrain.ai
FRONTEND_URL=https://staging.revbrain.ai

# === Real Mode ===
USE_MOCK_DATA=false
AUTH_MODE=jwt

# === Supabase (staging project) ===
SUPABASE_URL=https://staging-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_JWT_SECRET=staging-jwt-secret
DATABASE_URL=postgresql://...staging-connection-string...

# === Client ===
VITE_API_URL=https://staging-project.supabase.co/functions/v1
VITE_SUPABASE_URL=https://staging-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_AUTH_MODE=jwt

# === Stripe (test mode — same test keys as local) ===
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_... (staging webhook endpoint)
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...

# === Email ===
RESEND_API_KEY=re_...
EMAIL_FROM=RevBrain <noreply@revbrain.ai>
EMAIL_ASYNC=true

# === Monitoring ===
SENTRY_DSN=https://...@sentry.io/...
SENTRY_ENVIRONMENT=staging

# === Alerting (optional) ===
SLACK_ALERT_WEBHOOK_URL=https://hooks.slack.com/services/...
ALERT_EMAIL_RECIPIENTS=dev@revbrain.ai
```

### Production

```env
# === Core ===
NODE_ENV=production
APP_ENV=production
APP_URL=https://app.revbrain.ai
FRONTEND_URL=https://app.revbrain.ai

# === Real Mode ===
USE_MOCK_DATA=false
AUTH_MODE=jwt

# === Supabase (production project — SEPARATE from staging) ===
SUPABASE_URL=https://prod-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_JWT_SECRET=production-jwt-secret
DATABASE_URL=postgresql://...production-connection-string...

# === Client ===
VITE_API_URL=https://prod-project.supabase.co/functions/v1
VITE_SUPABASE_URL=https://prod-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_AUTH_MODE=jwt
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...

# === Stripe (LIVE mode) ===
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_... (production webhook endpoint)

# === Email ===
RESEND_API_KEY=re_...
EMAIL_FROM=RevBrain <noreply@revbrain.ai>
EMAIL_ASYNC=true

# === Monitoring ===
SENTRY_DSN=https://...@sentry.io/...
SENTRY_ENVIRONMENT=production

# === Alerting ===
SLACK_ALERT_WEBHOOK_URL=https://hooks.slack.com/services/...
ALERT_EMAIL_RECIPIENTS=ops@revbrain.ai,oncall@revbrain.ai
ALERT_CRITICAL_RECIPIENTS=cto@revbrain.ai,ops@revbrain.ai

# === Sales ===
SALES_NOTIFICATION_EMAIL=sales@revbrain.ai
CALENDLY_BOOKING_URL=https://calendly.com/revbrain/demo
```

---

## Security Checklist

- [ ] **Never commit `.env` files** — they're gitignored
- [ ] **Use separate Supabase projects** for staging and production
- [ ] **Use Stripe test mode** for all non-production environments
- [ ] **Rotate secrets** if any are accidentally exposed
- [ ] `SUPABASE_SERVICE_ROLE_KEY` and `STRIPE_SECRET_KEY` are the most sensitive — never expose client-side
- [ ] Mock mode is **impossible in production** — the server validates this at startup and crashes if `USE_MOCK_DATA=true` with `APP_ENV=production`
- [ ] Webhook secrets are **per-endpoint** — don't reuse between environments

---

## Recommended Setup Order

1. **Start with mock mode** (no services needed) — `pnpm dev:real`
2. **Set up Supabase** — unlocks auth, database, and remaining Phase 1 tasks
3. **Set up Stripe** (test mode) — unlocks billing testing
4. **Set up Resend** — unlocks email delivery testing
5. **Set up Sentry** — before going to production
6. **Set up Slack alerts** — before going to production
