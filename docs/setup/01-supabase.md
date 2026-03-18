# Supabase Setup

Supabase provides database, authentication, and edge function hosting.

## 1. Create Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New Project**
3. Fill in:
   - **Name**: e.g., `geometrix-dev` or `geometrix-prod`
   - **Database Password**: Save this securely
   - **Region**: Choose closest to your users (e.g., `eu-central-1`)
4. Click **Create new project**
5. Note the **Project Reference ID** (e.g., `zhotzdemwwyfzevtygob`)

## 2. Get API Keys

Go to **Settings → API**:

| Key            | Purpose                 | Where to use                        |
| -------------- | ----------------------- | ----------------------------------- |
| `Project URL`  | Supabase API endpoint   | `SUPABASE_URL`, `VITE_SUPABASE_URL` |
| `anon public`  | Public key for frontend | `VITE_SUPABASE_ANON_KEY`            |
| `service_role` | Admin key for backend   | `SUPABASE_SERVICE_ROLE_KEY`         |
| `JWT Secret`   | For token verification  | `SUPABASE_JWT_SECRET`               |

> **Warning**: Never expose `service_role` key in frontend code!

## 3. Configure Authentication

Go to **Authentication → Settings**:

### Site URL

Set to your frontend URL:

- Dev: `http://localhost:5173`
- Prod: `https://your-domain.com`

### Redirect URLs

Add allowed redirect URLs:

```
http://localhost:5173/**
https://your-domain.com/**
```

### Email Templates

Go to **Authentication → Email Templates** and customize:

- Confirm signup
- Invite user
- Magic link
- Reset password

Templates are in `/supabase/templates/` folder.

## 4. Run Database Migrations

```bash
# Set environment
export DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

# Run migrations
pnpm db:migrate
```

Or push from local:

```bash
npx supabase db push --project-ref [project-ref]
```

## 5. Deploy Edge Functions

**IMPORTANT**: Use `--no-verify-jwt` because we handle JWT verification in our own middleware.

```bash
# Deploy the API function
npx supabase functions deploy api --no-verify-jwt --project-ref [project-ref]
```

Without `--no-verify-jwt`, all requests will get 401 errors because Supabase's built-in JWT check runs before our code.

## 6. Set Edge Function Secrets

```bash
# Required secrets
npx supabase secrets set SUPABASE_URL=https://[project-ref].supabase.co --project-ref [project-ref]
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=[service-role-key] --project-ref [project-ref]
npx supabase secrets set SUPABASE_JWT_SECRET=[jwt-secret] --project-ref [project-ref]

# Stripe (see 02-stripe.md)
npx supabase secrets set STRIPE_SECRET_KEY=[stripe-secret] --project-ref [project-ref]
npx supabase secrets set STRIPE_WEBHOOK_SECRET=[webhook-secret] --project-ref [project-ref]

# Email (see 03-resend.md)
npx supabase secrets set RESEND_API_KEY=[resend-key] --project-ref [project-ref]
npx supabase secrets set EMAIL_FROM="Geometrix <hello@yourdomain.com>" --project-ref [project-ref]

# App URL (for email links)
npx supabase secrets set APP_URL=https://your-domain.com --project-ref [project-ref]
```

### List Current Secrets

```bash
npx supabase secrets list --project-ref [project-ref]
```

## 7. Database Connection Strings

For Drizzle/database tools, use the **Supavisor pooler** connection (port 6543):

```
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
```

Find this in **Settings → Database → Connection string → URI** (select "Transaction pooler").

## Project References

| Environment | Project Ref            | Dashboard                                                           |
| ----------- | ---------------------- | ------------------------------------------------------------------- |
| Dev         | `zhotzdemwwyfzevtygob` | [Link](https://supabase.com/dashboard/project/zhotzdemwwyfzevtygob) |
| Prod        | `jnuzixzgzwsodxejhvxt` | [Link](https://supabase.com/dashboard/project/jnuzixzgzwsodxejhvxt) |
