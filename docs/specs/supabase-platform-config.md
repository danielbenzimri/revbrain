# Supabase Platform Configuration

> Required dashboard/CLI settings for the RevBrain hybrid auth flow.
> Without these, magic links, password resets, and invites will break.

---

## 1. Environment Variables (Server)

| Variable                    | Purpose                                        | Where to find                           |
| --------------------------- | ---------------------------------------------- | --------------------------------------- |
| `SUPABASE_URL`              | Project API URL                                | Dashboard > Settings > API              |
| `SUPABASE_ANON_KEY`         | Client-side public key                         | Dashboard > Settings > API              |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin key (never expose to client) | Dashboard > Settings > API              |
| `SUPABASE_JWT_SECRET`       | Local JWT verification (skips remote call)     | Dashboard > Settings > API > JWT Secret |
| `FRONTEND_URL`              | Used in redirect URLs for magic links          | Your deployment URL                     |

## 2. Authentication > URL Configuration

### Site URL

Set to your production frontend URL:

```
https://app.revbrain.com
```

### Redirect URLs (Whitelist)

All redirect targets must be explicitly whitelisted. Add these:

```
# Local development
http://localhost:5173/set-password
http://localhost:5173/reset-password

# Production
https://app.revbrain.com/set-password
https://app.revbrain.com/reset-password

# Staging (if applicable)
https://staging.revbrain.com/set-password
https://staging.revbrain.com/reset-password
```

**If these are missing:** Magic links will redirect to the Site URL homepage instead of the intended page, breaking the invite and password reset flows.

## 3. Authentication > Email Templates

### Invite User Template

Used when `inviteUserByEmail()` is called (admin invites a new team member).

**Subject:** `You have been invited to join RevBrain`

**Body:**

```html
<h2>Welcome to RevBrain!</h2>
<p>You have been invited to join the platform.</p>
<p>
  <a
    href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&redirect_to={{ .RedirectTo }}"
    >Accept Invitation & Set Password</a
  >
</p>
<p>If you didn't expect this invite, you can ignore this email.</p>
```

### Reset Password Template

Used when `resetPasswordForEmail()` is called (forgot password flow).

**Subject:** `Reset your RevBrain password`

**Body:**

```html
<h2>Password Reset</h2>
<p>Click the link below to reset your password:</p>
<p>
  <a
    href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&redirect_to={{ .RedirectTo }}"
    >Reset Password</a
  >
</p>
<p>If you didn't request this, you can ignore this email.</p>
```

### Magic Link Template

Used if `signInWithOtp()` is ever called. Style consistently with the above.

## 4. Authentication > Providers

| Provider           | Status   | Notes                                  |
| ------------------ | -------- | -------------------------------------- |
| Email              | Enabled  | Primary auth method                    |
| Phone              | Disabled | Not used                               |
| Google/GitHub/etc. | Disabled | B2B SaaS — invite-only, no self-signup |

## 5. Authentication > Settings

| Setting                    | Value                | Reason                                                                                     |
| -------------------------- | -------------------- | ------------------------------------------------------------------------------------------ |
| Enable email confirmations | **OFF**              | Users are invited explicitly — we trust the email. Double-confirm creates friction.        |
| Secure email change        | ON                   | Require confirmation for email changes                                                     |
| PKCE flow                  | **ON**               | Modern security standard for client-side apps                                              |
| JWT expiry                 | 3600 (1 hour)        | Default. Local JWT verification means revoked tokens are valid until expiry.               |
| Minimum password length    | 6 (Supabase default) | We enforce 12+ chars server-side with strength rules. Supabase minimum is a fallback only. |

## 6. Auth Flow Summary

### Invite Flow (New User)

```
Admin (Frontend)
  → POST /v1/org/invite  (or /v1/admin/onboard)
  → Server calls supabase.auth.admin.inviteUserByEmail(email, { redirectTo: '/set-password' })
  → Supabase sends invite email
  → User clicks link → Supabase verifies → 302 redirect to /set-password#access_token=...
  → Frontend: setSession(accessToken) → user is authenticated as "ghost"
  → User enters password → supabase.auth.updateUser({ password })
  → Frontend calls POST /v1/auth/activate
  → Server sets isActive=true in local DB
  → Redirect to dashboard
```

### Password Reset Flow (Existing User)

```
User (Frontend)
  → ForgotPasswordPage: enters email
  → Client calls supabase.auth.resetPasswordForEmail(email, { redirectTo: '/reset-password' })
  → Supabase sends reset email
  → User clicks link → Supabase verifies → redirect to /reset-password
  → Supabase fires PASSWORD_RECOVERY auth event → session established
  → User enters new password (12+ chars, strength rules enforced)
  → Client calls supabase.auth.updateUser({ password })
  → Redirect to login
```

### JWT Verification Strategy

```
Every API request:
  1. Extract Bearer token from Authorization header
  2. If SUPABASE_JWT_SECRET is set → verify locally (fast, ~0ms)
  3. If not set → fall back to getSupabaseAdmin().auth.getUser(token) (slow, ~100-300ms)
  4. Fetch local user record by supabaseUserId
  5. Check isActive flag
  6. Attach user + payload to request context
```

## 7. Applying via Supabase CLI (Optional)

Email templates can be managed via the Supabase CLI config file:

```bash
# supabase/config.toml
[auth]
site_url = "https://app.revbrain.com"
additional_redirect_urls = [
  "http://localhost:5173/set-password",
  "http://localhost:5173/reset-password",
  "https://app.revbrain.com/set-password",
  "https://app.revbrain.com/reset-password"
]
enable_signup = false
enable_confirmations = false

[auth.email]
enable_signup = true
double_confirm_changes = true
enable_confirmations = false

[auth.email.template.invite]
subject = "You have been invited to join RevBrain"
content_path = "./supabase/templates/invite.html"

[auth.email.template.recovery]
subject = "Reset your RevBrain password"
content_path = "./supabase/templates/recovery.html"
```

Then deploy with:

```bash
supabase db push
```

See Section 8 below for creating the actual template HTML files.

## 8. Next Steps

- [ ] Create branded HTML email templates in `supabase/templates/`
- [ ] Configure Supabase dashboard settings per this document
- [ ] Set `SUPABASE_JWT_SECRET` in all environments
- [ ] Test invite flow end-to-end in staging
- [ ] Test password reset flow end-to-end in staging
