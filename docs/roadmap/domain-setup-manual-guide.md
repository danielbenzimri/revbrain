# Domain Setup: Manual Step-by-Step Guide

**Purpose:** Do exactly what this guide says, in order, one step at a time.
**Time estimate:** ~2 hours of clicking around dashboards (spread across 1-2 days due to DNS propagation waits).

---

## Before You Start

Open these tabs — you'll need all of them:

1. **Namecheap** → Domain List → `geometrixlabs.com` → Advanced DNS
2. **Vercel** → Dashboard (logged in)
3. **Supabase** → Both projects open (dev/staging + production)
4. **Resend** → Dashboard (logged in)
5. **Stripe** → Dashboard (logged in)
6. **Sentry** → Project Settings

Have a notepad ready to paste values between platforms.

---

## STEP 1: Namecheap — Core DNS Records

**Where:** Namecheap → Domain List → click `geometrixlabs.com` → tab "Advanced DNS"

> If there are existing "parking" records (like a default Namecheap parking page), delete them first.

Add these 4 records one by one. Click "Add New Record" for each:

### Record 1: Apex domain → Vercel

| Field | Value         |
| ----- | ------------- |
| Type  | **A Record**  |
| Host  | `@`           |
| Value | `76.76.21.21` |
| TTL   | Automatic     |

### Record 2: www → Vercel

| Field | Value                  |
| ----- | ---------------------- |
| Type  | **CNAME Record**       |
| Host  | `www`                  |
| Value | `cname.vercel-dns.com` |
| TTL   | Automatic              |

### Record 3: app subdomain → Vercel

| Field | Value                  |
| ----- | ---------------------- |
| Type  | **CNAME Record**       |
| Host  | `app`                  |
| Value | `cname.vercel-dns.com` |
| TTL   | Automatic              |

### Record 4: stg subdomain → Vercel

| Field | Value                  |
| ----- | ---------------------- |
| Type  | **CNAME Record**       |
| Host  | `stg`                  |
| Value | `cname.vercel-dns.com` |
| TTL   | Automatic              |

**Save all records.** You should now have 4 records.

---

## STEP 2: Namecheap — Security DNS Records

Still on the same Advanced DNS page, add these:

### Record 5: CAA (SSL restriction)

| Field | Value                       |
| ----- | --------------------------- |
| Type  | **CAA Record**              |
| Host  | `@`                         |
| Value | `0 issue "letsencrypt.org"` |
| TTL   | Automatic                   |

### Record 6: CAA wildcard (SSL restriction)

| Field | Value                           |
| ----- | ------------------------------- |
| Type  | **CAA Record**                  |
| Host  | `@`                             |
| Value | `0 issuewild "letsencrypt.org"` |
| TTL   | Automatic                       |

> These records ensure only Let's Encrypt (Vercel's SSL provider) can issue certificates for your domain.

**Save.** You should now have 6 records total.

---

## STEP 3: Namecheap — Domain Auto-Renewal Check

**Where:** Namecheap → Domain List → `geometrixlabs.com`

- [ ] Verify "Auto-Renew" is **ON**
- [ ] Verify your payment method is current (Namecheap → Account → Payment Methods)

> If the domain expires, EVERYTHING goes down instantly.

---

## STEP 4: Vercel — Add Domain to Production App

**Where:** Vercel Dashboard → Select your **production** project (the one currently at `geometrix-client.vercel.app`)

1. Click **Settings** (top nav)
2. Click **Domains** (left sidebar)
3. Type `app.geometrixlabs.com` in the domain input field
4. Click **Add**
5. Vercel will check DNS — it should show "Valid Configuration" (green checkmark) within a few minutes
6. If Vercel asks for a **TXT verification record**:
   - Copy the TXT record value Vercel shows you
   - Go back to Namecheap → Advanced DNS → add a new TXT record with host `_vercel` and the value Vercel gave you
   - Come back to Vercel and click "Verify"
7. Wait for the green "Valid Configuration" status
8. **DO NOT remove** `geometrix-client.vercel.app` — keep it as a fallback

---

## STEP 5: Vercel — Add Domain to Staging App

**Where:** Vercel Dashboard → Select your **staging** project (the one currently at `geometrix-client-staging.vercel.app`)

1. Click **Settings** → **Domains**
2. Type `stg.geometrixlabs.com`
3. Click **Add**
4. Wait for green checkmark (same TXT verification if needed)
5. **DO NOT remove** `geometrix-client-staging.vercel.app`

---

## STEP 6: Quick Verification — Do the Domains Work?

Open your terminal and run:

```bash
curl -I https://app.geometrixlabs.com
```

**Expected:** You should see `HTTP/2 200` (or similar). If you get a DNS error, DNS hasn't propagated yet — wait 15-30 minutes and try again.

```bash
curl -I https://stg.geometrixlabs.com
```

**Expected:** Same — `HTTP/2 200`.

> DNS can take up to 48 hours in rare cases. Usually it's 15 minutes to 2 hours. Don't panic.

---

## STEP 7: Resend — Verify Your Domain

**Where:** Resend Dashboard → **Domains** (left sidebar)

1. Click **Add Domain**
2. Type `geometrixlabs.com`
3. Click **Add**
4. Resend will show you **3 DNS records** you need to add. They look like:

| Type  | Name                                  | Value                                                               |
| ----- | ------------------------------------- | ------------------------------------------------------------------- |
| MX    | `geometrixlabs.com`                   | _(something like `feedback-smtp.us-east-1.amazonses.com`)_          |
| TXT   | `geometrixlabs.com`                   | _(SPF record — something like `v=spf1 include:amazonses.com ~all`)_ |
| CNAME | `resend._domainkey.geometrixlabs.com` | _(long DKIM key)_                                                   |

**IMPORTANT:** The exact values come from Resend. Copy them exactly.

> **About SPF:** If Resend gives you a full SPF record like `v=spf1 include:amazonses.com ~all`, but you also want to include Resend's own SPF, combine them into ONE TXT record:
> `v=spf1 include:resend.com ~all`
> You can only have ONE SPF TXT record on the `@` host. If Resend's instructions differ from this, follow Resend's instructions.

---

## STEP 8: Namecheap — Add Resend Email DNS Records

**Where:** Namecheap → Advanced DNS (same page as before)

Add the records Resend gave you:

### Record 7: SPF (email authentication)

| Field | Value                                                                     |
| ----- | ------------------------------------------------------------------------- |
| Type  | **TXT Record**                                                            |
| Host  | `@`                                                                       |
| Value | _(copy exactly from Resend — typically `v=spf1 include:resend.com ~all`)_ |
| TTL   | Automatic                                                                 |

### Record 8: DKIM (email signing)

| Field | Value                               |
| ----- | ----------------------------------- |
| Type  | **CNAME Record**                    |
| Host  | `resend._domainkey`                 |
| Value | _(copy the long value from Resend)_ |
| TTL   | Automatic                           |

### Record 9: MX (optional — only if Resend shows one)

| Field    | Value                            |
| -------- | -------------------------------- |
| Type     | **MX Record**                    |
| Host     | `@`                              |
| Value    | _(copy from Resend)_             |
| Priority | _(copy from Resend, usually 10)_ |
| TTL      | Automatic                        |

### Record 10: DMARC policy

| Field | Value                                                        |
| ----- | ------------------------------------------------------------ |
| Type  | **TXT Record**                                               |
| Host  | `_dmarc`                                                     |
| Value | `v=DMARC1; p=quarantine; rua=mailto:dmarc@geometrixlabs.com` |
| TTL   | Automatic                                                    |

### Record 11: DMARC report acceptance

| Field | Value            |
| ----- | ---------------- |
| Type  | **TXT Record**   |
| Host  | `_report._dmarc` |
| Value | `v=DMARC1`       |
| TTL   | Automatic        |

**Save all records.**

---

## STEP 9: Namecheap — Set Up Email Forwarding for DMARC Reports

**Where:** Namecheap → Domain List → `geometrixlabs.com` → tab **"Email Forwarding"** (or "Redirect Email")

1. Add a forwarding rule:
   - **From:** `dmarc@geometrixlabs.com`
   - **To:** your personal email (e.g., `danielaviram82@gmail.com`)
2. Save

> This ensures DMARC aggregate reports (XML files from Gmail, Outlook, etc.) reach you. They arrive ~daily and tell you if anyone is spoofing your domain.

---

## STEP 10: Resend — Verify Domain

**Where:** Back in Resend Dashboard → Domains

1. Click on `geometrixlabs.com`
2. Click **"Verify DNS Records"** (or similar button)
3. Each record should turn green
4. If any record is pending, wait 5-30 minutes and click verify again

> All 3 records (SPF, DKIM, MX) must be green before proceeding.

---

## STEP 11: Supabase — Update Production Auth URLs

**Where:** Supabase Dashboard → select your **PRODUCTION** project → **Authentication** (left sidebar) → **URL Configuration**

1. **Site URL:** Change to `https://app.geometrixlabs.com`
2. **Redirect URLs:** Add these (click "Add URL" for each):
   - `https://app.geometrixlabs.com/**`
3. **Keep the existing ones:**
   - `https://geometrix-client.vercel.app/**` ← keep this during transition
4. Save

---

## STEP 12: Supabase — Update Staging Auth URLs

**Where:** Supabase Dashboard → select your **DEV/STAGING** project → **Authentication** → **URL Configuration**

1. **Site URL:** Change to `https://stg.geometrixlabs.com`
2. **Redirect URLs:** Add these:
   - `https://stg.geometrixlabs.com/set-password`
   - `https://stg.geometrixlabs.com/reset-password`
   - `https://stg.geometrixlabs.com/login`
3. **Keep the existing ones:**
   - `http://localhost:5173/**` ← needed for local dev
   - `https://geometrix-client-staging.vercel.app/**` ← needed for Vercel preview deploys
4. Save

---

## STEP 13: Supabase — Configure Custom SMTP (Production)

**Why:** Without this, Supabase sends password reset and invite emails from its own default address — NOT from `@geometrixlabs.com`. This step makes Supabase use Resend to send its auth emails.

**Where:** Supabase Dashboard → **PRODUCTION** project → **Project Settings** (gear icon) → **Authentication** → scroll down to **SMTP Settings** → toggle "Enable Custom SMTP"

| Field        | Value                                                       |
| ------------ | ----------------------------------------------------------- |
| Host         | `smtp.resend.com`                                           |
| Port         | `465`                                                       |
| Username     | `resend`                                                    |
| Password     | _(your **production** Resend API key — starts with `re_`)\_ |
| Sender email | `noreply@geometrixlabs.com`                                 |
| Sender name  | `Geometrix`                                                 |

**Where to find your Resend API key:** Resend Dashboard → **API Keys** (left sidebar). Use the production key.

Click **Save**.

---

## STEP 14: Supabase — Configure Custom SMTP (Staging)

**Where:** Supabase Dashboard → **DEV/STAGING** project → **Project Settings** → **Authentication** → **SMTP Settings**

| Field        | Value                                                                    |
| ------------ | ------------------------------------------------------------------------ |
| Host         | `smtp.resend.com`                                                        |
| Port         | `465`                                                                    |
| Username     | `resend`                                                                 |
| Password     | _(your Resend API key — can use the same key or a staging-specific one)_ |
| Sender email | `noreply+staging@geometrixlabs.com`                                      |
| Sender name  | `Geometrix (Staging)`                                                    |

Click **Save**.

---

## STEP 15: Supabase — Update Environment Variables (Production Edge Function)

**Where:** Supabase Dashboard → **PRODUCTION** project → **Edge Functions** → select your function → **Secrets** (or Settings → Edge Functions → Manage Secrets)

Update these secrets:

| Secret         | New Value                                                 |
| -------------- | --------------------------------------------------------- |
| `APP_URL`      | `https://app.geometrixlabs.com`                           |
| `FRONTEND_URL` | `https://app.geometrixlabs.com`                           |
| `EMAIL_FROM`   | `Geometrix <noreply@geometrixlabs.com>`                   |
| `CORS_ORIGINS` | `https://app.geometrixlabs.com,https://geometrixlabs.com` |

> If a secret already exists, update its value. If it doesn't exist, create it.

---

## STEP 16: Supabase — Update Environment Variables (Staging Edge Function)

**Where:** Supabase Dashboard → **DEV/STAGING** project → Edge Functions → Secrets

| Secret         | New Value                                                                       |
| -------------- | ------------------------------------------------------------------------------- |
| `APP_URL`      | `https://stg.geometrixlabs.com`                                                 |
| `FRONTEND_URL` | `https://stg.geometrixlabs.com`                                                 |
| `CORS_ORIGINS` | `https://stg.geometrixlabs.com,https://geometrixlabs.com,http://localhost:5173` |

---

## STEP 17: Vercel — Update Environment Variables (Production App)

**Where:** Vercel Dashboard → **production** project → **Settings** → **Environment Variables**

Update or add these variables (scope: **Production**):

| Variable       | Value                           | Scope      |
| -------------- | ------------------------------- | ---------- |
| `APP_URL`      | `https://app.geometrixlabs.com` | Production |
| `FRONTEND_URL` | `https://app.geometrixlabs.com` | Production |

> The `VITE_API_URL` and `VITE_SUPABASE_URL` stay the same — they point to Supabase, not the custom domain.

---

## STEP 18: Vercel — Update Environment Variables (Staging App)

**Where:** Vercel Dashboard → **staging** project → **Settings** → **Environment Variables**

| Variable       | Value                           | Scope                 |
| -------------- | ------------------------------- | --------------------- |
| `APP_URL`      | `https://stg.geometrixlabs.com` | Preview + Development |
| `FRONTEND_URL` | `https://stg.geometrixlabs.com` | Preview + Development |

---

## STEP 19: Stripe — Update Dashboard URLs

**Where:** Stripe Dashboard → **Settings**

### 19a: Customer Portal

1. Go to **Settings** → **Customer portal** (or search "Customer portal" in Stripe)
2. Under **Business information** → Website URL → change to `https://geometrixlabs.com`
3. Save

### 19b: Branding (optional)

1. Go to **Settings** → **Branding**
2. If "Website" or "Domain" is shown, update to `https://geometrixlabs.com`
3. Save

> **DO NOT** change webhook endpoint URLs. Stripe webhooks point to your Supabase Edge Function URL, which stays the same.

---

## STEP 20: Sentry — Add New Domains

**Where:** Sentry → your project → **Settings** → **Client Keys (DSN)** → click on the key → **Allowed Domains**

1. Add `app.geometrixlabs.com`
2. Add `stg.geometrixlabs.com`
3. Add `geometrixlabs.com`
4. Save

> Keep existing domains (like `.vercel.app`) — don't remove them.

---

## STEP 21: UptimeRobot — Set Up Monitoring (Free)

**Where:** Go to [uptimerobot.com](https://uptimerobot.com/) and create a free account (if you don't have one)

### Monitor 1: Production App

1. Click **Add New Monitor**
2. Type: **HTTP(s)**
3. Friendly Name: `Geometrix App (Production)`
4. URL: `https://app.geometrixlabs.com`
5. Monitoring Interval: **5 minutes**
6. Alert Contact: your email
7. Click **Create Monitor**

### Monitor 2: Homepage (add after homepage is live)

1. **Add New Monitor**
2. Type: **HTTP(s)**
3. Friendly Name: `Geometrix Homepage`
4. URL: `https://geometrixlabs.com`
5. Interval: 5 minutes
6. Click **Create Monitor**

### Monitor 3: Staging (optional, lower priority)

1. Same as above but URL: `https://stg.geometrixlabs.com`
2. Friendly Name: `Geometrix Staging`

---

## STEP 22: Verification — Test Everything

Run these in your terminal:

```bash
# 1. Production app loads
curl -I https://app.geometrixlabs.com
# Expected: HTTP/2 200

# 2. Staging loads
curl -I https://stg.geometrixlabs.com
# Expected: HTTP/2 200

# 3. Old URLs still work
curl -I https://geometrix-client.vercel.app
# Expected: HTTP/2 200

# 4. DNS records are correct
dig geometrixlabs.com A +short
# Expected: 76.76.21.21

dig app.geometrixlabs.com CNAME +short
# Expected: cname.vercel-dns.com

dig geometrixlabs.com TXT +short
# Expected: Should include SPF record

dig geometrixlabs.com CAA +short
# Expected: Should show letsencrypt.org

dig _dmarc.geometrixlabs.com TXT +short
# Expected: v=DMARC1; p=quarantine; ...
```

### Manual Tests (do in browser):

- [ ] Go to `https://app.geometrixlabs.com` → login works, no CORS errors in DevTools console
- [ ] Trigger a password reset → email should come from `noreply@geometrixlabs.com` and link should go to `app.geometrixlabs.com/reset-password`
- [ ] Invite a test user → email should come from `noreply@geometrixlabs.com` and link should go to `app.geometrixlabs.com/set-password`
- [ ] Go to `https://stg.geometrixlabs.com` → login works
- [ ] Old URL `geometrix-client.vercel.app` → still loads the app
- [ ] Check cookies on `app.geometrixlabs.com` (DevTools → Application → Cookies) → cookies should be scoped to `app.geometrixlabs.com`, NOT `.geometrixlabs.com`

### Email Deliverability Test:

1. Go to [mail-tester.com](https://www.mail-tester.com)
2. Copy the test email address shown
3. Trigger an email from your app to that address (e.g., password reset, or use Resend dashboard to send a test)
4. Go back to mail-tester.com and click "Then check your score"
5. **Target: 9+/10**

---

## Summary — What You Should Have When Done

| Platform        | What you set up                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Namecheap**   | 4 core DNS records (A + 3 CNAMEs) + 2 CAA + SPF/DKIM/DMARC/MX + email forwarding                                         |
| **Vercel**      | 2 custom domains added (app + stg), env vars updated for both                                                            |
| **Supabase**    | Auth URLs updated (both projects), custom SMTP configured (both projects), Edge Function secrets updated (both projects) |
| **Resend**      | Domain verified with green checkmarks                                                                                    |
| **Stripe**      | Customer portal URL updated                                                                                              |
| **Sentry**      | 3 new allowed domains                                                                                                    |
| **UptimeRobot** | 2-3 monitors active                                                                                                      |

---

## What's Left After This (Code Automation — Do With Claude)

These are code changes, not dashboard clicking. Come back and we'll do them together:

1. **Deploy server code changes** — CORS origins and domain references (already written, just need push)
2. **`vercel.json` security headers** — for both app and homepage projects
3. **`robots.txt`** — disallow indexing on the app (`apps/client/public/robots.txt`)
4. **Homepage build** — create `apps/homepage/` with vite-ssg
5. **CI deploy job** — add homepage deploy step to GitHub Actions
6. **Google Search Console** — register domain after homepage is live
