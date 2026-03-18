# Project Setup Guide

This folder contains setup instructions for all external services required by the RevBrain backend.

## Services Overview

| Service                      | Purpose                        | Required |
| ---------------------------- | ------------------------------ | -------- |
| [Supabase](./01-supabase.md) | Database, Auth, Edge Functions | Yes      |
| [Stripe](./02-stripe.md)     | Billing & Subscriptions        | Yes      |
| [Resend](./03-resend.md)     | Transactional Emails           | Yes      |
| [Vercel](./04-vercel.md)     | Frontend Hosting               | Yes      |

## Quick Start Checklist

- [ ] Create Supabase project and configure auth
- [ ] Run database migrations
- [ ] Deploy Edge Functions
- [ ] Set up Stripe account and webhook
- [ ] Set up Resend account and verify domain
- [ ] Deploy frontend to Vercel
- [ ] Configure all environment variables

## Environment Variables Summary

### Backend (Supabase Edge Functions)

Set these via `npx supabase secrets set KEY=value --project-ref <project-ref>`:

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_JWT_SECRET
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
RESEND_API_KEY
EMAIL_FROM
APP_URL
```

### Frontend (Vercel / .env files)

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_API_URL
VITE_STRIPE_PUBLISHABLE_KEY
```

## Dev vs Prod

We maintain two Supabase projects:

- **Dev**: `zhotzdemwwyfzevtygob` - for development/testing
- **Prod**: `jnuzixzgzwsodxejhvxt` - for production

Each needs its own set of secrets configured.
