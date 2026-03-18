# Resend Setup

Resend handles transactional emails (welcome emails, billing notifications).

> **Note**: Auth-related emails (invites, password reset, email verification) are handled by Supabase Auth, not Resend.

## 1. Create Account

1. Go to [resend.com](https://resend.com) and sign up
2. Verify your email address

## 2. Get API Key

1. Go to **API Keys** in sidebar
2. Click **Create API Key**
3. Name it (e.g., `revbrain-dev`)
4. Select permissions: **Sending access** (Full access not needed)
5. Copy the key (starts with `re_`)

### Set API Key

```bash
npx supabase secrets set RESEND_API_KEY=re_xxx --project-ref [project-ref]
```

## 3. Configure Sender Address

### Development (No Domain Verification)

For testing, use Resend's shared domain:

```
EMAIL_FROM=RevBrain <onboarding@resend.dev>
```

This works immediately but emails go to spam and have "via resend.dev" label.

### Production (Verified Domain)

1. Go to **Domains** → **Add domain**
2. Enter your domain (e.g., `revbrain.io`)
3. Add the DNS records Resend provides:
   - SPF record
   - DKIM records (usually 2-3)
   - Optional: DMARC record
4. Click **Verify**
5. Once verified, use your domain:
   ```
   EMAIL_FROM=RevBrain <hello@revbrain.io>
   ```

### DNS Records Example

| Type  | Name                | Value                                 |
| ----- | ------------------- | ------------------------------------- |
| TXT   | @                   | `v=spf1 include:_spf.resend.com ~all` |
| CNAME | resend.\_domainkey  | `xxx.dkim.resend.dev`                 |
| CNAME | resend2.\_domainkey | `xxx.dkim.resend.dev`                 |
| TXT   | \_dmarc             | `v=DMARC1; p=none;`                   |

## 4. Set Environment Variables

```bash
# Backend (Supabase secrets)
npx supabase secrets set RESEND_API_KEY=re_xxx --project-ref [project-ref]
npx supabase secrets set EMAIL_FROM="RevBrain <hello@revbrain.io>" --project-ref [project-ref]
```

## 5. Email Templates

Email templates are in `/apps/server/src/emails/templates/`:

| Template                 | Trigger            | File                 |
| ------------------------ | ------------------ | -------------------- |
| Welcome                  | User activation    | `welcome.ts`         |
| (future) Payment receipt | Successful payment | `payment-receipt.ts` |
| (future) Payment failed  | Failed payment     | `payment-failed.ts`  |

Templates use HTML with inline styles for maximum email client compatibility.

## 6. Testing Emails

### Using Dev Route (Development Only)

```bash
curl -X POST http://localhost:3000/v1/dev/test-email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "your@email.com",
    "template": "welcome",
    "data": {
      "userName": "Test User",
      "orgName": "Acme Inc",
      "loginUrl": "http://localhost:5173/login"
    }
  }'
```

### Console Adapter (No API Key)

When `RESEND_API_KEY` is not set, emails are logged to console instead of sent. Useful for local development.

## 7. Monitoring

In Resend Dashboard:

- **Logs**: View all sent emails and delivery status
- **Analytics**: Open rates, click rates, bounces
- **Suppressions**: Manage bounced/complained addresses

## Email Types by Provider

| Email Type            | Provider      | Configuration                                  |
| --------------------- | ------------- | ---------------------------------------------- |
| User invite           | Supabase Auth | Supabase Dashboard → Auth → Email Templates    |
| Password reset        | Supabase Auth | Supabase Dashboard → Auth → Email Templates    |
| Email verification    | Supabase Auth | Supabase Dashboard → Auth → Email Templates    |
| Welcome email         | Resend        | `/apps/server/src/emails/templates/welcome.ts` |
| Billing notifications | Resend        | (future)                                       |

## Troubleshooting

### Emails not sending

- Check `RESEND_API_KEY` is set correctly
- Verify domain is verified (for custom domains)
- Check Resend Dashboard logs for errors

### Emails going to spam

- Use a verified custom domain
- Ensure SPF, DKIM, DMARC records are set
- Don't use excessive images or spam-trigger words

### "Sender not verified" error

- For `@resend.dev`: No setup needed, should work immediately
- For custom domain: Verify domain in Resend Dashboard
