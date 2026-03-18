# Session 07: Production Readiness & Infrastructure

**Priority:** Medium (After MVP)
**Estimated Duration:** 2-3 days
**Dependencies:** All previous sessions

---

## Objective

Prepare the application for production deployment with Redis integration, staging environment, enhanced CI/CD, and operational best practices.

---

## Deliverables

### 1. Redis Integration

**Option A: Upstash Redis (Recommended for Serverless)**

- Serverless pricing (pay per request)
- Global edge deployment
- REST API (works in Edge Functions)

**Option B: Supabase Edge Functions + Deno KV**

- Built into Supabase
- No additional service
- Limited features

**Install Dependencies:**

```bash
pnpm add @upstash/redis --filter @geometrix/server
```

**Redis Client:** `apps/server/src/lib/redis.ts`

```typescript
import { Redis } from '@upstash/redis';

// Singleton Redis client
let redisClient: Redis | null = null;

export function getRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.warn('Redis not configured, falling back to in-memory');
    return null;
  }

  if (!redisClient) {
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }

  return redisClient;
}

// Generic cache wrapper
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const redis = getRedis();

  if (!redis) {
    return fetcher();
  }

  // Try cache first
  const cached = await redis.get<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Fetch and cache
  const result = await fetcher();
  await redis.set(key, result, { ex: ttlSeconds });

  return result;
}

// Cache invalidation
export async function invalidateCache(pattern: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
```

**Redis Rate Limiter:** `apps/server/src/middleware/rate-limit-redis.ts`

```typescript
import { createMiddleware } from 'hono/factory';
import { getRedis } from '../lib/redis';
import { AppError, ErrorCodes } from '@geometrix/contract';

export interface RedisRateLimitOptions {
  windowMs: number;
  max: number;
  keyGenerator?: (c: any) => string;
  message?: string;
}

export const redisRateLimit = (options: RedisRateLimitOptions) => {
  const {
    windowMs,
    max,
    keyGenerator = defaultKeyGenerator,
    message = 'Too many requests',
  } = options;

  return createMiddleware(async (c, next) => {
    const redis = getRedis();

    // Fallback to in-memory if Redis not available
    if (!redis) {
      // Use existing in-memory rate limiter
      return next();
    }

    const key = `ratelimit:${keyGenerator(c)}`;
    const windowKey = `${key}:${Math.floor(Date.now() / windowMs)}`;

    // Increment counter
    const count = await redis.incr(windowKey);

    // Set expiry on first request
    if (count === 1) {
      await redis.expire(windowKey, Math.ceil(windowMs / 1000));
    }

    // Get TTL for headers
    const ttl = await redis.ttl(windowKey);

    // Set headers
    c.header('X-RateLimit-Limit', String(max));
    c.header('X-RateLimit-Remaining', String(Math.max(0, max - count)));
    c.header('X-RateLimit-Reset', String(Math.ceil(Date.now() / 1000) + ttl));

    if (count > max) {
      c.header('Retry-After', String(ttl));
      throw new AppError(ErrorCodes.RATE_LIMITED, message, 429);
    }

    await next();
  });
};

function defaultKeyGenerator(c: any): string {
  const userId = c.var?.user?.id;
  if (userId) return `user:${userId}`;

  const ip =
    c.req.header('x-forwarded-for')?.split(',')[0] || c.req.header('x-real-ip') || 'unknown';
  return `ip:${ip}`;
}

// Pre-configured rate limiters with Redis
export const redisRateLimiters = {
  auth: redisRateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many authentication attempts',
  }),
  api: redisRateLimit({
    windowMs: 60 * 1000,
    max: 100,
  }),
  invite: redisRateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
  }),
  admin: redisRateLimit({
    windowMs: 60 * 60 * 1000,
    max: 60,
  }),
};
```

**Session/Token Cache:** `apps/server/src/lib/session-cache.ts`

```typescript
import { getRedis } from './redis';

interface CachedSession {
  userId: string;
  organizationId: string;
  role: string;
  expiresAt: number;
}

const SESSION_TTL = 3600; // 1 hour

export async function cacheSession(token: string, session: CachedSession): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const key = `session:${hashToken(token)}`;
  await redis.set(key, session, { ex: SESSION_TTL });
}

export async function getCachedSession(token: string): Promise<CachedSession | null> {
  const redis = getRedis();
  if (!redis) return null;

  const key = `session:${hashToken(token)}`;
  return redis.get<CachedSession>(key);
}

export async function invalidateSession(token: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const key = `session:${hashToken(token)}`;
  await redis.del(key);
}

export async function invalidateUserSessions(userId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const keys = await redis.keys(`session:*`);
  for (const key of keys) {
    const session = await redis.get<CachedSession>(key);
    if (session?.userId === userId) {
      await redis.del(key);
    }
  }
}

// Simple hash to avoid storing raw tokens
function hashToken(token: string): string {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}
```

### 2. Staging Environment

**Supabase Projects:**

- `geometrix-prod` - Production
- `geometrix-staging` - Staging (mirrors prod)
- `geometrix-dev` - Development (optional, local Supabase preferred)

**Environment Configuration:** `.env.staging`

```bash
NODE_ENV=staging

# Staging Supabase
SUPABASE_URL=https://xxx-staging.supabase.co
SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
DATABASE_URL=postgresql://postgres:xxx@db.xxx-staging.supabase.co:6543/postgres

# Staging Redis
UPSTASH_REDIS_REST_URL=https://xxx-staging.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx

# Staging Sentry (same project, different environment tag)
SENTRY_DSN=xxx
SENTRY_ENVIRONMENT=staging

# Feature flags (can enable experimental features)
FEATURE_NEW_DASHBOARD=true
```

**Vercel Configuration:** `vercel.json`

```json
{
  "buildCommand": "pnpm build",
  "outputDirectory": "apps/client/dist",
  "framework": "vite",
  "regions": ["iad1"],
  "env": {
    "VITE_API_URL": "@api_url",
    "VITE_SENTRY_DSN": "@sentry_dsn"
  },
  "git": {
    "deploymentEnabled": {
      "main": true,
      "develop": true
    }
  }
}
```

### 3. Enhanced CI/CD Pipeline

**Updated CI Workflow:** `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

env:
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ vars.TURBO_TEAM }}

jobs:
  # Quality checks
  quality:
    name: Quality
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - name: Setup
        uses: ./.github/actions/setup

      - name: Lint
        run: pnpm lint

      - name: Format Check
        run: pnpm format:check

      - name: TypeCheck
        run: pnpm typecheck

  # Unit & Integration tests
  test:
    name: Test
    runs-on: ubuntu-latest
    needs: quality
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Setup
        uses: ./.github/actions/setup

      - name: Run Tests
        run: pnpm test:coverage
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test

      - name: Upload Coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/lcov.info
          fail_ci_if_error: true

  # E2E tests (only on main/develop)
  e2e:
    name: E2E Tests
    runs-on: ubuntu-latest
    needs: test
    if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop'
    steps:
      - uses: actions/checkout@v4

      - name: Setup
        uses: ./.github/actions/setup

      - name: Install Playwright
        run: pnpm exec playwright install --with-deps chromium

      - name: Start Services
        run: |
          pnpm dev &
          sleep 10

      - name: Run E2E Tests
        run: pnpm test:e2e

      - name: Upload Report
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: apps/client/playwright-report/

  # Security scan
  security:
    name: Security Scan
    runs-on: ubuntu-latest
    needs: quality
    steps:
      - uses: actions/checkout@v4

      - name: Setup
        uses: ./.github/actions/setup

      - name: Run npm audit
        run: pnpm audit --audit-level=high

      - name: Run Snyk
        uses: snyk/actions/node@master
        continue-on-error: true
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

  # Build verification
  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [test, security]
    steps:
      - uses: actions/checkout@v4

      - name: Setup
        uses: ./.github/actions/setup

      - name: Build
        run: pnpm build

      - name: Upload Build Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build
          path: |
            apps/client/dist
            apps/server/dist
```

**Deploy Workflow:** `.github/workflows/deploy.yml`

```yaml
name: Deploy

on:
  push:
    branches:
      - main
      - develop
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to deploy to'
        required: true
        default: 'staging'
        type: choice
        options:
          - staging
          - production

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false

jobs:
  # Determine environment
  prepare:
    name: Prepare Deployment
    runs-on: ubuntu-latest
    outputs:
      environment: ${{ steps.env.outputs.environment }}
    steps:
      - name: Determine Environment
        id: env
        run: |
          if [ "${{ github.event_name }}" == "workflow_dispatch" ]; then
            echo "environment=${{ github.event.inputs.environment }}" >> $GITHUB_OUTPUT
          elif [ "${{ github.ref }}" == "refs/heads/main" ]; then
            echo "environment=production" >> $GITHUB_OUTPUT
          else
            echo "environment=staging" >> $GITHUB_OUTPUT
          fi

  # Deploy database migrations
  migrate:
    name: Database Migration
    runs-on: ubuntu-latest
    needs: prepare
    environment: ${{ needs.prepare.outputs.environment }}
    steps:
      - uses: actions/checkout@v4

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1

      - name: Link Project
        run: |
          supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_ID }}

      - name: Run Migrations
        run: supabase db push
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

  # Deploy backend (Edge Functions)
  backend:
    name: Deploy Backend
    runs-on: ubuntu-latest
    needs: [prepare, migrate]
    environment: ${{ needs.prepare.outputs.environment }}
    steps:
      - uses: actions/checkout@v4

      - name: Setup
        uses: ./.github/actions/setup

      - name: Build Backend
        run: pnpm --filter @geometrix/server build

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1

      - name: Deploy Edge Functions
        run: supabase functions deploy api --project-ref ${{ secrets.SUPABASE_PROJECT_ID }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

  # Deploy frontend
  frontend:
    name: Deploy Frontend
    runs-on: ubuntu-latest
    needs: [prepare, backend]
    environment: ${{ needs.prepare.outputs.environment }}
    steps:
      - uses: actions/checkout@v4

      - name: Setup
        uses: ./.github/actions/setup

      - name: Install Vercel CLI
        run: npm install -g vercel@latest

      - name: Pull Vercel Environment
        run: vercel pull --yes --environment=${{ needs.prepare.outputs.environment == 'production' && 'production' || 'preview' }} --token=${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

      - name: Build
        run: vercel build ${{ needs.prepare.outputs.environment == 'production' && '--prod' || '' }} --token=${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

      - name: Deploy
        run: vercel deploy --prebuilt ${{ needs.prepare.outputs.environment == 'production' && '--prod' || '' }} --token=${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

  # Post-deployment verification
  verify:
    name: Verify Deployment
    runs-on: ubuntu-latest
    needs: [prepare, frontend]
    environment: ${{ needs.prepare.outputs.environment }}
    steps:
      - name: Health Check
        run: |
          ENV=${{ needs.prepare.outputs.environment }}
          if [ "$ENV" == "production" ]; then
            URL="https://api.geometrix.io/v1/health"
          else
            URL="https://api-staging.geometrix.io/v1/health"
          fi

          for i in {1..5}; do
            STATUS=$(curl -s -o /dev/null -w "%{http_code}" $URL)
            if [ "$STATUS" == "200" ]; then
              echo "Health check passed"
              exit 0
            fi
            echo "Attempt $i failed with status $STATUS"
            sleep 10
          done

          echo "Health check failed"
          exit 1

      - name: Notify Success
        if: success()
        run: |
          echo "Deployment to ${{ needs.prepare.outputs.environment }} successful"
          # Add Slack/Discord notification here

      - name: Notify Failure
        if: failure()
        run: |
          echo "Deployment to ${{ needs.prepare.outputs.environment }} failed"
          # Add Slack/Discord notification here
```

### 4. Shared GitHub Action

**Setup Action:** `.github/actions/setup/action.yml`

```yaml
name: Setup
description: Setup Node.js, pnpm, and install dependencies

runs:
  using: composite
  steps:
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'

    - name: Setup pnpm
      uses: pnpm/action-setup@v3
      with:
        version: 8

    - name: Get pnpm store directory
      shell: bash
      run: echo "STORE_PATH=$(pnpm store path --silent)" >> $GITHUB_ENV

    - name: Setup pnpm cache
      uses: actions/cache@v4
      with:
        path: ${{ env.STORE_PATH }}
        key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}
        restore-keys: |
          ${{ runner.os }}-pnpm-

    - name: Install dependencies
      shell: bash
      run: pnpm install --frozen-lockfile
```

### 5. Dependabot Configuration

**.github/dependabot.yml**

```yaml
version: 2
updates:
  # Root dependencies
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
      day: monday
    groups:
      production:
        patterns:
          - '*'
        exclude-patterns:
          - '@types/*'
          - 'eslint*'
          - 'prettier*'
          - 'vitest*'
          - 'typescript'
      development:
        patterns:
          - '@types/*'
          - 'eslint*'
          - 'prettier*'
          - 'vitest*'
          - 'typescript'
    commit-message:
      prefix: 'deps'
    labels:
      - dependencies

  # GitHub Actions
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
    commit-message:
      prefix: 'ci'
    labels:
      - ci
```

### 6. CODEOWNERS

**.github/CODEOWNERS**

```
# Default owners for everything
* @team-lead

# Backend
/apps/server/ @backend-team
/packages/database/ @backend-team
/packages/contract/ @backend-team @frontend-team

# Frontend
/apps/client/ @frontend-team

# Infrastructure
/.github/ @devops-team
/supabase/ @devops-team @backend-team
*.yml @devops-team
*.json @devops-team

# Documentation
*.md @team-lead
/docs/ @team-lead
```

### 7. Release Process

**Release Script:** `scripts/release.sh`

```bash
#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

# Check we're on main
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  echo -e "${RED}Error: Must be on main branch${NC}"
  exit 1
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
  echo -e "${RED}Error: Uncommitted changes detected${NC}"
  exit 1
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT_VERSION"

# Ask for new version
read -p "Enter new version (current: $CURRENT_VERSION): " NEW_VERSION

if [ -z "$NEW_VERSION" ]; then
  echo -e "${RED}Error: Version required${NC}"
  exit 1
fi

# Update version in all package.json files
echo "Updating versions..."
pnpm -r exec -- npm version $NEW_VERSION --no-git-tag-version
npm version $NEW_VERSION --no-git-tag-version

# Generate changelog (if using conventional commits)
echo "Generating changelog..."
pnpm exec conventional-changelog -p angular -i CHANGELOG.md -s

# Commit and tag
git add -A
git commit -m "chore: release v$NEW_VERSION"
git tag "v$NEW_VERSION"

echo -e "${GREEN}Release v$NEW_VERSION created!${NC}"
echo "Run 'git push origin main --tags' to publish"
```

---

## Environment Variables Summary

```bash
# Production .env
NODE_ENV=production

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
DATABASE_URL=postgresql://postgres:xxx@db.xxx.supabase.co:6543/postgres

# Redis (Upstash)
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx

# Observability
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
LOG_LEVEL=info

# Frontend
VITE_API_URL=https://api.geometrix.io
VITE_SENTRY_DSN=xxx
```

---

## Acceptance Criteria

- [ ] Redis integrated with rate limiting
- [ ] Session caching with Redis working
- [ ] Staging environment functional
- [ ] CI pipeline includes all checks
- [ ] CD pipeline deploys to staging/production
- [ ] Post-deployment verification working
- [ ] Dependabot configured
- [ ] CODEOWNERS configured
- [ ] Release process documented

---

## Operational Checklist

### Before Go-Live

- [ ] All secrets configured in GitHub
- [ ] Vercel environment variables set
- [ ] Supabase projects created (prod + staging)
- [ ] Redis (Upstash) projects created
- [ ] Sentry projects created
- [ ] Domain configured and SSL working
- [ ] Health checks passing
- [ ] Monitoring dashboards created
- [ ] Alerting rules configured
- [ ] Backup strategy confirmed
- [ ] Rollback procedure tested

### Post Go-Live

- [ ] Monitor error rates
- [ ] Monitor latency p95
- [ ] Monitor Redis connection pool
- [ ] Review Sentry issues weekly
- [ ] Review Dependabot PRs weekly
- [ ] Rotate secrets quarterly
