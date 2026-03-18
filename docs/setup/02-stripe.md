# Stripe Setup

Stripe handles billing, subscriptions, and payment processing.

## 1. Create Account

1. Go to [stripe.com](https://stripe.com) and sign up
2. Complete account verification (business details, bank account)
3. For testing, use **Test mode** (toggle in dashboard header)

> **Note**: You can test everything without a verified business account. Verification is only required to accept real payments.

## 2. Get API Keys

Go to **Developers → API keys**:

| Key             | Format                         | Purpose                      |
| --------------- | ------------------------------ | ---------------------------- |
| Publishable key | `pk_test_...` or `pk_live_...` | Frontend (safe to expose)    |
| Secret key      | `sk_test_...` or `sk_live_...` | Backend only (never expose!) |

### Environment Variables

```bash
# Backend (Supabase secrets)
STRIPE_SECRET_KEY=sk_test_xxx

# Frontend (.env files)
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
```

## 3. Create Webhook Endpoint

Webhooks notify your app when events happen (subscription created, payment succeeded, etc.).

### Steps:

1. Go to **Developers → Webhooks**
2. Click **Add endpoint**
3. Enter endpoint URL:
   ```
   https://[project-ref].supabase.co/functions/v1/api/v1/webhooks/stripe
   ```
4. Select events to listen to:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Click **Add endpoint**
6. Click on the endpoint → **Reveal** signing secret
7. Copy the `whsec_...` value

### Set Webhook Secret

```bash
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx --project-ref [project-ref]
```

## 4. Create Products & Prices (Optional)

Products and prices can be created:

- **Manually** in Stripe Dashboard → Products
- **Automatically** via our sync feature (creates Stripe products from database plans)

### Manual Creation:

1. Go to **Products → Add product**
2. Fill in name, description
3. Add a recurring price (monthly/yearly)
4. Copy the Price ID (`price_xxx`)
5. Update your plan in the database with `stripe_price_id`

### Automatic Sync:

The billing service can sync plans to Stripe:

```typescript
const billingService = new BillingService();
await billingService.syncAllPlansToStripe();
```

## 5. Test Cards

Use these test card numbers in Stripe test mode:

| Card               | Number                | Use Case                |
| ------------------ | --------------------- | ----------------------- |
| Visa (success)     | `4242 4242 4242 4242` | Successful payment      |
| Visa (decline)     | `4000 0000 0000 0002` | Card declined           |
| 3D Secure          | `4000 0027 6000 3184` | Requires authentication |
| Insufficient funds | `4000 0000 0000 9995` | Insufficient funds      |

Use any future expiry date and any 3-digit CVC.

## 6. Customer Portal

Stripe provides a hosted portal for customers to manage billing.

### Configure Portal:

1. Go to **Settings → Billing → Customer portal**
2. Enable features you want:
   - Update payment method
   - View invoices
   - Cancel subscription
   - Switch plans
3. Customize branding (logo, colors)
4. Save configuration

The portal is accessed via our `/billing/portal` endpoint.

## 7. Going Live

When ready for production:

1. Complete Stripe account verification
2. Switch to **Live mode** in dashboard
3. Get live API keys (`pk_live_`, `sk_live_`)
4. Create a new webhook endpoint with live URL
5. Update environment variables with live keys
6. Test with a real card (refund immediately)

## Webhook URL Reference

| Environment | Webhook URL                                                                    |
| ----------- | ------------------------------------------------------------------------------ |
| Dev         | `https://zhotzdemwwyfzevtygob.supabase.co/functions/v1/api/v1/webhooks/stripe` |
| Prod        | `https://jnuzixzgzwsodxejhvxt.supabase.co/functions/v1/api/v1/webhooks/stripe` |

## Troubleshooting

### Webhook not receiving events

- Check the endpoint URL is correct
- Verify the webhook is enabled (not paused)
- Check Stripe Dashboard → Webhooks → Recent events for errors

### Signature verification failed

- Ensure `STRIPE_WEBHOOK_SECRET` matches the signing secret
- Make sure you're using the raw request body (not parsed JSON)

### Payment declined in test mode

- Use the correct test card number
- Check card expiry is in the future
