# Vercel Setup

Vercel hosts the frontend application.

## 1. Create Account

1. Go to [vercel.com](https://vercel.com) and sign up
2. Connect your GitHub account

## 2. Import Project

1. Click **Add New → Project**
2. Import from GitHub repository
3. Configure:
   - **Framework Preset**: Vite
   - **Root Directory**: `apps/client`
   - **Build Command**: `pnpm build`
   - **Output Directory**: `dist`

## 3. Environment Variables

Go to **Project Settings → Environment Variables**:

| Variable                      | Value                                                | Environment          |
| ----------------------------- | ---------------------------------------------------- | -------------------- |
| `VITE_SUPABASE_URL`           | `https://[project-ref].supabase.co`                  | Preview & Production |
| `VITE_SUPABASE_ANON_KEY`      | `eyJhbG...` (anon key)                               | Preview & Production |
| `VITE_API_URL`                | `https://[project-ref].supabase.co/functions/v1/api` | Preview & Production |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` or `pk_live_...`                       | Preview & Production |

### Separate Dev/Prod Values

You can set different values per environment:

- **Production**: Uses prod Supabase project
- **Preview**: Uses dev Supabase project (for PR previews)

## 4. Build Settings

### Build Command

```bash
pnpm build
```

Or for specific environment:

```bash
pnpm build:dev    # Uses .env.dev
pnpm build:prod   # Uses .env.prod
```

### Install Command

```bash
pnpm install
```

## 5. Custom Domain

1. Go to **Project Settings → Domains**
2. Add your domain (e.g., `app.revbrain.io`)
3. Configure DNS:
   - **CNAME**: Point to `cname.vercel-dns.com`
   - Or use Vercel nameservers for full control

### Recommended Setup

```
app.revbrain.io    → Vercel (main app)
www.revbrain.io    → Marketing site or redirect
revbrain.io        → Redirect to app or marketing
```

## 6. Deployment

### Automatic

Push to `main` branch → Auto-deploys to production

### Manual

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy preview
vercel

# Deploy production
vercel --prod
```

## 7. Monorepo Configuration

Since this is a monorepo, configure Vercel to only build when client changes:

**Project Settings → Git → Ignored Build Step**:

```bash
git diff HEAD^ HEAD --quiet -- apps/client
```

This skips builds when only other packages changed.

## 8. Environment File Reference

| File         | Build Command     | Use Case                |
| ------------ | ----------------- | ----------------------- |
| `.env.dev`   | `pnpm build:dev`  | Dev/Preview deployments |
| `.env.prod`  | `pnpm build:prod` | Production deployment   |
| `.env.local` | `pnpm dev`        | Local development       |

## Project Reference

| Key               | Value                              |
| ----------------- | ---------------------------------- |
| Vercel Project ID | `prj_hkgM9SoCfbyvpglTCmrVoPYn8mss` |
| Vercel Org ID     | `team_mrBAkX0L2XiwX7LjBwJESek0`    |

## Troubleshooting

### Build fails with missing dependencies

- Ensure `pnpm-lock.yaml` is committed
- Check that all workspace dependencies are listed

### Environment variables not available

- Variables must start with `VITE_` to be exposed to the client
- Restart build after adding new variables

### API calls failing (CORS)

- Ensure Supabase Edge Function allows the Vercel domain
- Check `APP_URL` matches the deployed URL
