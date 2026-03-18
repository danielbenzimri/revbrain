# Domain Setup: revbrain.com — Complete Implementation Plan

**Created:** 2026-03-16
**Domain:** revbrain.com (purchased on Namecheap)
**Status:** Final — reviewed by 2 independent auditors

---

## 1. Background & Goals

### What We Have Today

RevBrain is a construction management SaaS deployed across three services:

| Service            | Technology                               | Current URL                                                                                                            |
| ------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Frontend (App)** | React + Vite, hosted on Vercel           | `revbrain-client-staging.vercel.app` (staging) / `revbrain-client.vercel.app` (prod)                                   |
| **API Server**     | Hono, deployed as Supabase Edge Function | `zhotzdemwwyfzevtygob.supabase.co/functions/v1/api` (dev) / `jnuzixzgzwsodxejhvxt.supabase.co/functions/v1/api` (prod) |
| **Database**       | PostgreSQL, managed by Supabase          | Direct connection via PgBouncer pooler                                                                                 |

Additional services: Stripe (payments), Resend (email), Sentry (error tracking), GitHub Actions (CI/CD).

### What We Want

A professional domain structure that matches how best-in-class SaaS companies (Linear, Vercel, Supabase) organize their domains:

```
revbrain.com           → Marketing homepage (new)
www.revbrain.com       → Redirects to revbrain.com
app.revbrain.com       → Production application
stg.revbrain.com       → Staging application (for QA/testing)
```

### Why This Matters

1. **Credibility:** `app.revbrain.com` looks professional vs `revbrain-client-staging.vercel.app`
2. **Email deliverability:** Sending from `@revbrain.com` with proper SPF/DKIM/DMARC prevents emails from landing in spam
3. **SEO & branding:** The homepage at the apex domain is where search engines and users land first
4. **Cookie isolation:** Subdomains naturally isolate cookies between marketing site and app
5. **Staging separation:** `stg.revbrain.com` gives testers a real URL instead of a cryptic Vercel subdomain

---

## 2. Architecture Decisions

### Decision 1: Keep Namecheap as DNS Provider

**Chosen approach:** Keep DNS on Namecheap, add CNAME/A records pointing to Vercel.

**Alternative considered:** Transfer DNS to Vercel (simpler domain-to-project linking).

**Why Namecheap:** We need MX records for email (Resend), TXT records for SPF/DKIM/DMARC, and potentially other records in the future. Namecheap provides a full-featured DNS management UI. Vercel DNS can handle these too, but Namecheap gives us more control and doesn't lock us into Vercel for DNS.

### Decision 2: API Stays on Supabase URLs (No Custom API Domain)

**Chosen approach:** API endpoints remain at `*.supabase.co/functions/v1/api`.

**Alternative considered:** Custom API domain like `api.revbrain.com` proxying to Supabase.

**Why no custom API domain:**

- Supabase custom domains require Pro plan ($25/mo per project) and add configuration complexity
- The API is not user-facing — end users never see the URL
- Adding a proxy layer (Vercel rewrites, Cloudflare Workers) introduces latency and a new failure point
- The Supabase URL already has SSL, rate limiting, and edge caching
- If needed in the future, this can be added without breaking changes (the client reads `VITE_API_URL` from env vars)

### Decision 3: Homepage as Separate Vercel Project (Not App Route)

**Chosen approach:** New Vite project at `apps/homepage/`, deployed as a separate Vercel project.

**Alternative considered:** Deploy homepage as a route within the existing React app.

**Why separate project:**

- The app is an SPA behind authentication — it can't serve public marketing content
- Different deployment cadence: marketing content changes independently of the app
- Different performance requirements: homepage should be static/SSG for SEO, app is an SPA
- Separate Vercel project means independent deployments, preview URLs, and analytics
- Follows the pattern of Linear (linear.app vs linear.app/homepage), Vercel (vercel.com vs app.vercel.com), etc.

### Decision 4: Simple Vite Landing Page (Not Next.js)

**Chosen approach:** Minimal Vite + React + Tailwind landing page.

**Alternative considered:** Next.js with SSG/ISR for SEO and blog support.

**Why Vite:**

- We don't need a blog, docs, or dynamic content right now
- The homepage is a simple marketing page: hero, features, pricing, CTA
- Vite matches our existing toolchain (the app uses Vite)
- If we need SSG/blog later, we can migrate to Next.js or Astro — the content is simple enough that migration is low-effort
- Keeping the stack consistent reduces cognitive overhead

**SEO requirement — pre-rendering:** A plain Vite SPA serves an empty `<div id="root"></div>` to crawlers. Google can render JS but it's slower (second wave of indexing) and less reliable. Since the homepage is static marketing content, we use **`vite-ssg`** to pre-render all routes at build time. This produces fully-formed HTML with all `<meta>` tags, `<h1>`, and content visible to crawlers — zero JS required. `vite-ssg` is a drop-in addition to a Vite project with near-zero config.

---

## 3. DNS Configuration (Namecheap)

### 3a. Core DNS Records

These records point the domain and subdomains to Vercel:

| Type      | Host  | Value                  | TTL       | Purpose                                       |
| --------- | ----- | ---------------------- | --------- | --------------------------------------------- |
| **A**     | `@`   | `76.76.21.21`          | Automatic | Points apex domain (`revbrain.com`) to Vercel |
| **CNAME** | `www` | `cname.vercel-dns.com` | Automatic | Points `www.revbrain.com` to Vercel           |
| **CNAME** | `app` | `cname.vercel-dns.com` | Automatic | Points `app.revbrain.com` to Vercel           |
| **CNAME** | `stg` | `cname.vercel-dns.com` | Automatic | Points `stg.revbrain.com` to Vercel           |

**Why `76.76.21.21`:** This is Vercel's official A record IP for apex domains. CNAMEs cannot be used on apex domains (DNS spec limitation), so we use an A record. Vercel's infrastructure handles routing from this IP to the correct project based on the `Host` header. Note: Namecheap also supports ALIAS/FLATTENED CNAME for apex → `cname.vercel-dns.com` (functionally identical, resolves the CNAME at DNS level). Either approach works.

**Why `cname.vercel-dns.com`:** This is Vercel's recommended CNAME target for subdomains. Vercel uses the incoming `Host` header to route to the correct project, so all subdomains point to the same CNAME but serve different content.

### 3b. Security & Verification DNS Records

| Type    | Host      | Value                                      | TTL       | Purpose                                                                                                      |
| ------- | --------- | ------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------ |
| **CAA** | `@`       | `0 issue "letsencrypt.org"`                | Automatic | Only Let's Encrypt (Vercel's CA) can issue SSL certs                                                         |
| **CAA** | `@`       | `0 issuewild "letsencrypt.org"`            | Automatic | Same restriction for wildcard certs                                                                          |
| **TXT** | `_vercel` | _(provided by Vercel during domain setup)_ | Automatic | Domain ownership verification — Vercel may require this when adding domains to projects not using Vercel DNS |
| **TXT** | `@`       | _(provided by Google Search Console)_      | Automatic | Google Search Console domain verification — add after homepage is live                                       |

**Why CAA records:** Without CAA, any Certificate Authority can issue a certificate for `revbrain.com`. A malicious actor could obtain a valid cert from a permissive CA and use it for phishing. CAA restricts issuance to Let's Encrypt only (which Vercel uses). Note: if we ever add Cloudflare (proxy or CDN), we'll need to add their CA (e.g. `digicert.com`) — the failure mode is silent cert issuance failure, not an obvious error.

**Vercel TXT note:** When adding a custom domain to a Vercel project that doesn't use Vercel DNS, Vercel may require a TXT record to prove domain ownership. The exact value is shown in the Vercel domain setup UI. Check during Steps 4a/4b/4c.

**Google Search Console:** Register `revbrain.com` in GSC after the homepage is live to monitor indexing, submit sitemap, and catch crawl errors. Verification is via the TXT record above.

### 3c. Email DNS Records (Resend)

These records enable sending email from `@revbrain.com` with proper authentication:

| Type      | Host                | Value                                                   | TTL       | Purpose                                                                   |
| --------- | ------------------- | ------------------------------------------------------- | --------- | ------------------------------------------------------------------------- |
| **MX**    | `@`                 | _(provided by Resend after domain verification)_        | Automatic | Routes inbound email (optional — only needed if receiving email)          |
| **TXT**   | `@`                 | `v=spf1 include:resend.com ~all`                        | Automatic | **SPF** — tells receivers that Resend is authorized to send on our behalf |
| **CNAME** | `resend._domainkey` | _(provided by Resend dashboard)_                        | Automatic | **DKIM** — cryptographic signature proving emails are authentic           |
| **TXT**   | `_dmarc`            | `v=DMARC1; p=quarantine; rua=mailto:dmarc@revbrain.com` | Automatic | **DMARC** — policy for handling unauthenticated emails                    |

**Why SPF + DKIM + DMARC:** Without these, emails from `@revbrain.com` will likely land in spam. Gmail, Outlook, and Yahoo require all three for reliable delivery. SPF authorizes the sending server, DKIM cryptographically signs the email, and DMARC tells receivers what to do with failures.

**Why `p=quarantine` (not `p=reject`):** We start with `quarantine` which sends suspicious emails to spam rather than rejecting them outright. After confirming deliverability is good for 1-2 weeks, we tighten to `p=reject` for maximum protection against spoofing.

**Why `rua=mailto:dmarc@revbrain.com`:** DMARC aggregate reports are sent to this address, showing who is sending email on your behalf. Useful for detecting unauthorized use of the domain.

**Inbound email for DMARC reports:** The `rua` address must be able to receive email. Since we don't have mailboxes on `revbrain.com`, we set up forwarding:

**Setup:** Namecheap Dashboard → Domain → Email Forwarding → add `dmarc@revbrain.com` → forward to personal email. Use `dmarc@` (not `daniel@`) for clean isolation of report emails. Update the DMARC record to: `rua=mailto:dmarc@revbrain.com`.

**SPF alignment caveat:** Namecheap email forwarding re-sends mail from its own servers. The receiving inbox's MTA checks SPF against the forwarding server's IP — which won't be in the original sender's SPF record. This can cause DMARC reports to be silently spam-filtered at the personal inbox. Mitigation: use a **dedicated DMARC report processor** (e.g. DMARCian free tier, Postmark DMARC) which provides a reporting-specific `rua` address and parses the XML reports into human-readable dashboards. If DMARC reports aren't arriving, switch to one of these services.

**Additional DMARC/SPF report TXT records** — add these to prevent some receivers (especially Microsoft) from rejecting aggregate reports:

| Type    | Host             | Value      | Purpose                                                  |
| ------- | ---------------- | ---------- | -------------------------------------------------------- |
| **TXT** | `_report._dmarc` | `v=DMARC1` | Signals that this domain accepts DMARC aggregate reports |

**Alternative considered:** Google Workspace (full mailboxes) — overkill for now. Would also require adding `include:_spf.google.com` to the SPF record. Can migrate later if we need team mailboxes.

---

## 4. Vercel Project Setup

### 4a. Homepage (New Project)

**What:** Create `apps/homepage/` in the monorepo — a simple Vite + React + Tailwind marketing page.

**Content (minimal viable homepage):**

- Hero section with tagline + "Get Started" CTA → links to `app.revbrain.com`
- 3-4 feature cards (construction management, BIM, billing)
- Pricing overview with link to app billing page
- Footer with links
- Hebrew + English (matching app's i18n)
- Responsive, <100KB total

**SEO requirements (must-have at launch):**

- `robots.txt` — allow all crawlers (`User-agent: * / Allow: /`)
- `sitemap.xml` — even for a single page, search engines expect it
- `<meta>` tags — title, description, `og:image`, `og:title`, `twitter:card`
- `favicon.ico` + `apple-touch-icon.png` + `manifest.json`
- Canonical URL — `<link rel="canonical" href="https://revbrain.com/" />`
- `lang` attribute — `<html lang="he">` or `<html lang="en">` based on selected language

**App project `robots.txt`:** The app at `app.revbrain.com` is behind auth and should **not** be indexed. Add a `public/robots.txt` to the client app:

```
User-agent: *
Disallow: /
```

**Vercel setup:**

1. Create new Vercel project → link to the monorepo
2. Set root directory to `apps/homepage`
3. Add domains: `revbrain.com` + `www.revbrain.com`
4. Vercel automatically handles:
   - SSL certificate provisioning (Let's Encrypt)
   - `www` → apex redirect
   - HTTP → HTTPS redirect

### 4b. Production App (Existing Project)

**What:** Add `app.revbrain.com` to the existing production Vercel project.

**Steps:**

1. Vercel Dashboard → Project (revbrain-client) → Settings → Domains
2. Add `app.revbrain.com`
3. Vercel verifies DNS and provisions SSL
4. Keep `revbrain-client.vercel.app` active (fallback, no extra cost)

### 4c. Staging App (Existing Project)

**What:** Add `stg.revbrain.com` to the existing staging Vercel project.

**Steps:** Same as 4b but for the staging project.

---

## 5. Supabase Auth Configuration

### Why This Matters

Supabase Auth sends emails (invitations, password resets, magic links) containing redirect URLs. These URLs must be on an **allow-list** in the Supabase project settings. If a redirect URL isn't on the list, the auth flow silently fails — the user clicks the link and gets an error.

### 5a. Production Supabase Project

**Location:** Supabase Dashboard → Authentication → URL Configuration

| Setting           | Value                                                              |
| ----------------- | ------------------------------------------------------------------ |
| **Site URL**      | `https://app.revbrain.com`                                         |
| **Redirect URLs** | `https://app.revbrain.com/**`                                      |
|                   | `https://revbrain-client.vercel.app/**` _(keep during transition)_ |

**Why wildcard:** Using `/**` instead of explicit paths (`/set-password`, `/reset-password`, `/login`) means we don't need to update Supabase every time we add a new auth-related route. The tradeoff is a slightly wider open-redirect attack surface — acceptable given all redirects go to our own domain.

### 5b. Dev/Staging Supabase Project

| Setting           | Value                                                                      |
| ----------------- | -------------------------------------------------------------------------- |
| **Site URL**      | `https://stg.revbrain.com`                                                 |
| **Redirect URLs** | `https://stg.revbrain.com/set-password`                                    |
|                   | `https://stg.revbrain.com/reset-password`                                  |
|                   | `https://stg.revbrain.com/login`                                           |
|                   | `http://localhost:5173/**` _(keep for local dev)_                          |
|                   | `https://revbrain-client-staging.vercel.app/**` _(keep during transition)_ |

### 5c. Local Supabase Config

**File to modify:** `supabase/config.toml`

Add new domain redirect URLs to the `additional_redirect_urls` array. The existing localhost URLs stay for local development.

### 5d. Supabase Custom SMTP Configuration

**Why this is critical:** Supabase Auth sends its own emails (password resets, magic links, email confirmations) through Supabase's **built-in SMTP**. Changing `EMAIL_FROM` in our Hono API only affects emails sent via Resend — it does **not** change what Supabase Auth sends. Without configuring custom SMTP, auth emails will still come from Supabase's default sender address, which won't match `@revbrain.com`.

**Location:** Supabase Dashboard → Project Settings → Authentication → SMTP Settings

| Setting          | Production                | Staging                        |
| ---------------- | ------------------------- | ------------------------------ |
| **Host**         | `smtp.resend.com`         | `smtp.resend.com`              |
| **Port**         | `465` (SSL)               | `465` (SSL)                    |
| **Username**     | `resend`                  | `resend`                       |
| **Password**     | Production Resend API key | Staging Resend API key         |
| **Sender email** | `noreply@revbrain.com`    | `noreply+staging@revbrain.com` |
| **Sender name**  | `RevBrain`                | `RevBrain (Staging)`           |

**Which emails go where:**

- **Supabase Auth** (via custom SMTP): password reset, magic link, email confirmation, invite
- **Our Hono API** (via Resend directly): welcome email, billing emails, lead notifications, support tickets

### 5e. Preview Deployment Handling

Vercel preview deployments (per-PR URLs like `revbrain-client-git-feat-xyz.vercel.app`) hit the staging Supabase project. These must continue working:

- **Supabase staging redirect URLs:** Keep `https://revbrain-client-staging.vercel.app/**` wildcard permanently (not just during transition) — this covers all preview deployments
- **CORS:** The non-production CORS list keeps `*.vercel.app` domains. In Phase F cleanup, only remove `.vercel.app` from **production** CORS — never from staging/dev

---

## 6. Resend Domain Verification

### Current State

- Dev emails sent from `onboarding@resend.dev` (Resend sandbox)
- Prod emails sent from `noreply@revbrain.io` (may not have proper SPF/DKIM)

### Target State

- Production sends from `noreply@revbrain.com` with full SPF/DKIM/DMARC
- Staging sends from `noreply+staging@revbrain.com` — the `+staging` suffix makes it visually distinct and allows inbox filtering, while still being deliverable via the same verified domain

**Staging email safety:** Staging may contain production-like data. Using a distinct sender (`+staging`) prevents confusion if testers accidentally trigger emails to real customer addresses. Alternative: keep staging on Resend sandbox (`onboarding@resend.dev`) so emails only go to verified addresses — but this limits testing of real email flows.

**Note on `+staging` rendering:** Some older email clients (Outlook desktop, Apple Mail) may display the `+staging` part oddly. Test with major clients after configuring. Resend accepts it (the domain is verified), but rendering in the recipient's UI is worth verifying.

### Steps

1. **Resend Dashboard** → Domains → Add Domain → enter `revbrain.com`
2. Resend displays required DNS records (MX, DKIM CNAME, SPF TXT)
3. Add these records to Namecheap (see Section 3b)
4. Click "Verify" in Resend — usually takes 5-30 minutes
5. Update the `EMAIL_FROM` environment variable (see Section 7)
6. Send a test email and check score at [mail-tester.com](https://www.mail-tester.com) — target 9+/10

---

## 7. Server Code Changes

### 7a. CORS Origins

**File:** `apps/server/src/index.ts` — `getCorsOrigins()` function

The server must accept requests from the new domains. Currently hardcoded to `.vercel.app` domains.

**Change:** Add new domains to the defaults and ensure `CORS_ORIGINS` env var is respected:

- Production defaults: `https://app.revbrain.com`, `https://revbrain.com`
- Non-production defaults: add `https://stg.revbrain.com` alongside existing localhost entries

**Best practice note:** In production, prefer setting `CORS_ORIGINS` as an environment variable on the Supabase Edge Function. This allows adding domains without code deployments. The code changes are a safety net.

### 7b. Hardcoded Domain References

Several files reference `revbrain.io` as a fallback domain. These must be updated:

| File                                       | Line | Current Value              | New Value                  |
| ------------------------------------------ | ---- | -------------------------- | -------------------------- |
| `apps/server/src/lib/validated-config.ts`  | 55   | `noreply@revbrain.io`      | `noreply@revbrain.com`     |
| `apps/server/src/lib/validated-config.ts`  | 248  | `noreply@revbrain.io`      | `noreply@revbrain.com`     |
| `apps/server/src/services/user.service.ts` | 431  | `https://revbrain.io`      | `https://app.revbrain.com` |
| `apps/server/src/services/lead.service.ts` | 131  | `https://app.revbrain.com` | `https://app.revbrain.com` |

**Note:** Run `grep -r "revbrain\.io\|revbrain\.com" apps/server/src/` before and after to verify all references are caught.

### 7c. Local Supabase Config

**File:** `supabase/config.toml` — add new domain redirect URLs to `additional_redirect_urls`

---

## 8. Environment Variables

### 8a. Production (Vercel + Supabase Edge Function)

| Variable       | Value                                           | Where to set                                             |
| -------------- | ----------------------------------------------- | -------------------------------------------------------- |
| `APP_URL`      | `https://app.revbrain.com`                      | Vercel project env vars + Supabase Edge Function secrets |
| `FRONTEND_URL` | `https://app.revbrain.com`                      | Vercel project env vars + Supabase Edge Function secrets |
| `EMAIL_FROM`   | `RevBrain <noreply@revbrain.com>`               | Vercel project env vars + Supabase Edge Function secrets |
| `CORS_ORIGINS` | `https://app.revbrain.com,https://revbrain.com` | Supabase Edge Function secrets                           |

### 8b. Staging (Vercel + Supabase Edge Function)

| Variable       | Value                                                                 | Where to set                                             |
| -------------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| `APP_URL`      | `https://stg.revbrain.com`                                            | Vercel project env vars + Supabase Edge Function secrets |
| `FRONTEND_URL` | `https://stg.revbrain.com`                                            | Vercel project env vars + Supabase Edge Function secrets |
| `CORS_ORIGINS` | `https://stg.revbrain.com,https://revbrain.com,http://localhost:5173` | Supabase Edge Function secrets                           |

### 8c. Client-Side (No Changes Needed)

The React client reads `VITE_SUPABASE_URL` and `VITE_API_URL` which point to Supabase, not the custom domain. No client env var changes are needed.

---

## 9. Stripe Configuration

### What Changes

| Setting                      | Current                    | New                                                      | Where                   |
| ---------------------------- | -------------------------- | -------------------------------------------------------- | ----------------------- |
| Customer Portal return URL   | (reads from `APP_URL`)     | Auto-updated via `APP_URL` env var                       | No manual change needed |
| Checkout success/cancel URLs | (reads from `APP_URL`)     | Auto-updated via `APP_URL` env var                       | No manual change needed |
| Webhook endpoint URL         | Supabase Edge Function URL | **No change** — webhooks go to the API, not the frontend | N/A                     |

### What Doesn't Change

Stripe webhooks point to `*.supabase.co/functions/v1/api/v1/webhooks/stripe` — this is the API URL, not the custom domain. Stripe sends POST requests directly to this URL, so the custom domain setup doesn't affect webhooks at all.

### Manual Stripe Dashboard Updates

- **Settings → Customer Portal → Business information**: Update website URL to `https://revbrain.com`
- **Settings → Branding**: Update business URL if displayed on invoices/receipts

---

## 10. Sentry Configuration

- Add `app.revbrain.com` to allowed domains in Sentry project settings
- Add `stg.revbrain.com` to allowed domains
- This ensures Sentry captures errors from the new domains

---

## 11. Security Headers (Vercel Projects)

The Hono API already has security headers via `securityHeadersMiddleware`. The Vercel frontend projects (app + homepage) need their own headers via `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=63072000; includeSubDomains; preload"
        },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
      ]
    }
  ]
}
```

**Apply to:** Both `apps/client/vercel.json` and `apps/homepage/vercel.json`.

**Content-Security-Policy:** Deferred — requires careful allow-listing of Stripe.js, Sentry, Supabase, and inline styles. Add in a follow-up task after the domain migration is stable.

---

## 12. Uptime Monitoring

Sentry catches application errors, but does not detect if the domain itself is unreachable (DNS failure, Vercel outage, SSL expiry). Add external uptime monitoring:

**Monitored endpoints:**

- `https://app.revbrain.com` — production app
- `https://revbrain.com` — homepage
- `https://stg.revbrain.com` — staging (lower priority)

**Options (pick one):**

- **UptimeRobot** (free tier) — 5-minute intervals, email/Slack alerts
- **Better Uptime** — 3-minute intervals, status page included
- **Checkly** — more advanced (API checks, browser checks), free tier available

**Recommendation:** UptimeRobot free tier is sufficient for now. Set up email + Slack alerts for downtime.

---

## 13. CI/CD Pipeline Changes

### Existing Pipeline (No Changes Needed)

The current `deploy.yml` deploys to Vercel and Supabase based on branch. Domain configuration is done at the Vercel project level (Step 4), not in CI. Deployments continue to work as-is.

### New Homepage Deploy Job

Add to `.github/workflows/deploy.yml`:

```yaml
homepage-deploy:
  runs-on: ubuntu-latest
  if: github.ref == 'refs/heads/main'
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - run: pnpm install --frozen-lockfile
    - run: vercel deploy --prod --token=${{ secrets.VERCEL_TOKEN }}
      # Let Vercel handle the build remotely (--prebuilt requires vercel build, not pnpm build)
  env:
    VERCEL_PROJECT_ID: ${{ secrets.VERCEL_HOMEPAGE_PROJECT_ID }}
    VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
```

---

## 14. Migration Plan (Zero Downtime)

### Pre-Migration (Day 0)

0. **Verify domain auto-renewal** is enabled on Namecheap + payment method is current. If the domain expires, everything goes down.
1. **Lower DNS TTLs** — If any existing DNS records exist for `revbrain.com`, lower their TTL to 300 seconds (5 minutes). Wait for the old TTL to expire before proceeding. This ensures rollback DNS changes propagate in minutes rather than hours.

### Phase A: DNS + Vercel Domains (Day 1)

**Important — CORS timing:** Deploy CORS changes (Phase B steps 7-10) in parallel with DNS setup. DNS propagation gives us a natural window (15min-48h), but someone could try the new URL before CORS is ready. The old `.vercel.app` domains stay active, so no one is _forced_ onto the new domain — but deploy CORS ASAP to minimize the gap.

2. Add DNS records in Namecheap (Section 3a + 3b — core + security records, email records later)
3. Add custom domains to all three Vercel projects (Section 4) — check Vercel dashboard for any required TXT verification records
4. Wait for DNS propagation (usually 15min-2h, can take up to 48h)
5. Verify SSL provisioned: `curl -I https://app.revbrain.com`
6. Verify staging: `curl -I https://stg.revbrain.com`

### Phase B: Backend Code + Config (Day 1, in parallel with Phase A)

7. Update CORS origins in server code (Section 7a)
8. Update hardcoded domain references (Section 7b)
9. Update `supabase/config.toml` (Section 7c)
10. Update environment variables on Vercel + Supabase (Section 8)
11. Push to `develop` → verify on `stg.revbrain.com`
12. Merge to `main` → verify on `app.revbrain.com`
13. **Verify cookie domains** — after deployment, inspect cookies in DevTools on `app.revbrain.com`. Ensure Supabase Auth cookies are scoped to `app.revbrain.com` (not `.revbrain.com`), so they don't leak to the homepage or staging subdomains.

### Phase C: Auth + Email (Day 2)

14. Update Supabase Auth redirect URLs — **keep old URLs alongside new ones** (Section 5)
15. Configure Supabase custom SMTP for both prod and staging (Section 5d)
16. Add Resend domain + email DNS records (Sections 3c + 6)
17. Set up Namecheap email forwarding for `daniel@revbrain.com` (for DMARC reports)
18. Wait for Resend verification
19. Update `EMAIL_FROM` env var
20. Test: invite a user → verify email arrives from `@revbrain.com`
21. Test: password reset → verify link goes to `app.revbrain.com/reset-password`
22. Test: deliverability at mail-tester.com

### Phase D: Stripe + Sentry + Monitoring (Day 2)

23. Update Stripe dashboard settings (Section 9)
24. Update Sentry allowed domains (Section 10)
25. Add security headers to Vercel projects (Section 11)
26. Set up uptime monitoring (Section 12)
27. Test: Stripe checkout → success URL is `app.revbrain.com/billing`

### Phase E: Homepage (Day 3-5+)

**Timeline note:** "Day 3-5" assumes design is already decided. If there's design exploration, this could stretch. Track in the task tracker separately.

28. Build the landing page (`apps/homepage/`) with `vite-ssg` for pre-rendering
29. Add `robots.txt` to `apps/client/public/` (disallow indexing of the app)
30. Deploy homepage to Vercel with `revbrain.com` domain
31. Add homepage deploy job to CI (Section 13)
32. Register `revbrain.com` in Google Search Console, submit sitemap

### Phase F: Cleanup (Day 14+)

33. After 2 weeks with no issues on the new domain:
    - Remove old `.vercel.app` URLs from **production** CORS whitelist only — keep in staging/dev for preview deployments
    - Remove old `.vercel.app` URLs from **production** Supabase Auth redirect URLs only — keep in staging for preview deployments
    - Tighten DMARC from `p=quarantine` to `p=reject`
    - Raise DNS TTLs back to 1800-3600 seconds
    - Add Vercel redirect rules on old `.vercel.app` projects to 301 redirect visitors to the canonical domain (`app.revbrain.com`). This consolidates analytics and trains bookmarks. Old `.vercel.app` domains continue to work on Vercel — no need to remove them.
    - If we still own `revbrain.io` or `revbrain.com`, add 301 redirects to `revbrain.com` to preserve any SEO equity and prevent broken links

### Rollback Plan

Each phase is independently reversible:

| Phase                 | Rollback                                                                                                           | Time to Effect                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| **A (DNS)**           | Remove CNAME/A records in Namecheap → traffic returns to default Vercel URLs                                       | Minutes (TTL was lowered pre-migration) |
| **B (CORS/Code)**     | Old `.vercel.app` domains are kept in CORS throughout, so reverting DNS is sufficient                              | Instant (old domains still work)        |
| **C (Auth)**          | Old redirect URLs are kept in Supabase throughout Phase F, so reverting DNS is sufficient                          | Instant                                 |
| **C (Email)**         | Revert `EMAIL_FROM` env var to old value. Resend domain stays verified (no harm). Revert Supabase SMTP to default. | ~1 min (env var redeploy)               |
| **D (Stripe/Sentry)** | Revert Stripe dashboard URLs. Remove new Sentry domains.                                                           | Instant                                 |
| **E (Homepage)**      | Remove `revbrain.com` domain from homepage Vercel project → apex shows Vercel default page (harmless)              | Instant                                 |

---

## 15. Gotchas & Common Mistakes

| Gotcha                                 | Why It Matters                                                                                               | Prevention                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| **CORS before domain pointing**        | If you point the domain before updating CORS, the first request from `app.revbrain.com` gets blocked by CORS | Deploy CORS changes first (Phase B before Phase A completes)                                   |
| **Missing Supabase redirect URL**      | Auth flows (invite, reset, magic link) silently fail — user clicks link and gets a generic error             | Add ALL redirect paths to the allow-list, test each flow                                       |
| **Supabase SMTP not configured**       | Password reset and invite emails still come from Supabase's default sender, not `@revbrain.com`              | Configure custom SMTP in both prod and staging Supabase projects (Section 5d)                  |
| **Email SPF/DKIM not set**             | Emails land in spam, invite flow appears broken to users                                                     | Add DNS records before switching `EMAIL_FROM`, test with mail-tester.com                       |
| **DNS propagation delay**              | Records can take up to 48h to propagate globally                                                             | Don't panic. Use `dig` to check. Lower TTLs before migration.                                  |
| **Stripe webhook URL confusion**       | Stripe webhooks go to the API (Supabase), not the frontend domain                                            | Don't change webhook URLs — they're already correct                                            |
| **Old bookmarks/sessions**             | Users with bookmarks to `.vercel.app` URLs must still be able to access the app                              | Keep old domains active for 2+ weeks, don't remove from CORS                                   |
| **Preview deployments break**          | Removing `.vercel.app` from staging CORS/auth kills all PR preview deployments                               | Phase F cleanup only applies to **production** — keep `.vercel.app` in staging/dev permanently |
| **Cookie leaking across subdomains**   | If cookies are set on `.revbrain.com` (with leading dot), homepage/staging/app share cookies                 | Verify cookies are scoped to exact host after deployment (Phase B step 13)                     |
| **Scattered `revbrain.io` references** | Multiple files reference the old domain as fallback                                                          | Run `grep -r "revbrain\.io\|revbrain\.com"` to find all references                             |
| **Vercel env var scope**               | Env vars can be scoped to Production, Preview, or Development                                                | Ensure `APP_URL` is set correctly for the Production scope                                     |
| **Domain expiry**                      | If domain lapses, everything goes down instantly                                                             | Verify auto-renewal + payment method on Namecheap before migration                             |

---

## 16. Verification Checklist

After all phases complete:

| #   | Test                                                 | Expected Result                                                                |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | `curl -I https://revbrain.com`                       | 200 OK (homepage)                                                              |
| 2   | `curl -I https://www.revbrain.com`                   | 301 → `https://revbrain.com`                                                   |
| 3   | `curl -I https://app.revbrain.com`                   | 200 OK (app HTML)                                                              |
| 4   | `curl -I https://stg.revbrain.com`                   | 200 OK (staging HTML)                                                          |
| 5   | Login on `app.revbrain.com`                          | Auth works, no CORS errors in DevTools                                         |
| 6   | Password reset flow                                  | Email from `@revbrain.com`, link to `app.revbrain.com/reset-password`          |
| 7   | User invitation flow                                 | Email from `@revbrain.com`, link to `app.revbrain.com/set-password`            |
| 8   | Stripe checkout flow                                 | Success URL is `app.revbrain.com/billing`                                      |
| 9   | `dig revbrain.com TXT`                               | Shows SPF record                                                               |
| 10  | `dig resend._domainkey.revbrain.com CNAME`           | Shows DKIM record                                                              |
| 11  | `dig revbrain.com CAA`                               | Shows `letsencrypt.org`                                                        |
| 12  | mail-tester.com                                      | Score 9+/10                                                                    |
| 13  | Inspect cookies on `app.revbrain.com`                | Auth cookies scoped to `app.revbrain.com`, not `.revbrain.com`                 |
| 14  | Security headers: `curl -I https://app.revbrain.com` | Shows `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options` |
| 15  | `curl https://app.revbrain.com/robots.txt`           | Shows `Disallow: /`                                                            |
| 16  | `curl https://revbrain.com/robots.txt`               | Shows `Allow: /`                                                               |
| 17  | `curl https://revbrain.com/sitemap.xml`              | Returns valid sitemap                                                          |
| 18  | Old URL still works: `revbrain-client.vercel.app`    | Loads the app (kept as fallback)                                               |
| 19  | Vercel preview deployment (open any PR)              | Loads on `*.vercel.app`, auth works                                            |
| 20  | Uptime monitor active                                | Alerts configured for `app.revbrain.com` and `revbrain.com`                    |
