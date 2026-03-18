# Session 03: Database Optimization

**Priority:** High
**Estimated Duration:** 1 day
**Dependencies:** Session 02 (Data Access Layer)

---

## Objective

Optimize the database layer with proper indexes, constraints, and query patterns to ensure the application scales efficiently from day one.

---

## Current Schema Analysis

### Tables & Estimated Growth

| Table         | Current Rows | 1 Year Est. | Index Priority |
| ------------- | ------------ | ----------- | -------------- |
| users         | ~10          | 10,000+     | High           |
| organizations | ~5           | 1,000+      | High           |
| plans         | ~5           | 20          | Low            |
| projects      | ~0           | 50,000+     | High           |
| audit_logs    | ~100         | 1,000,000+  | Critical       |

---

## Deliverables

### 1. Database Indexes

**Migration File:** `supabase/migrations/YYYYMMDD_add_indexes.sql`

```sql
-- ============================================================
-- USERS TABLE INDEXES
-- ============================================================

-- Primary lookup by Supabase Auth ID (every authenticated request)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_supabase_user_id
  ON users (supabase_user_id);

-- Email lookup (login, invite dedup)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email
  ON users (email);

-- Organization members listing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_organization_id
  ON users (organization_id)
  WHERE is_active = true;

-- Admin user listing (filtered by role)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_role
  ON users (role)
  WHERE is_active = true;

-- Combined index for org + role queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_org_role
  ON users (organization_id, role)
  WHERE is_active = true;

-- ============================================================
-- ORGANIZATIONS TABLE INDEXES
-- ============================================================

-- Slug lookup (public URLs, unique constraint)
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_organizations_slug
  ON organizations (slug);

-- Plan-based queries (upgrade campaigns, etc.)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organizations_plan_id
  ON organizations (plan_id)
  WHERE is_active = true;

-- Organization type queries (contractor vs client listings)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organizations_type
  ON organizations (type)
  WHERE is_active = true;

-- ============================================================
-- PROJECTS TABLE INDEXES
-- ============================================================

-- Owner's projects listing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_owner_id
  ON projects (owner_id);

-- Recently updated (dashboard, activity feeds)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_updated_at
  ON projects (updated_at DESC);

-- ============================================================
-- AUDIT LOGS TABLE INDEXES (Critical for compliance)
-- ============================================================

-- Organization audit trail
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_organization_id
  ON audit_logs (organization_id, created_at DESC);

-- User activity tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user_id
  ON audit_logs (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Action-based queries (security analysis)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_action
  ON audit_logs (action, created_at DESC);

-- Time-based queries (compliance reports)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_created_at
  ON audit_logs (created_at DESC);

-- Target user tracking (who was affected)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_target_user_id
  ON audit_logs (target_user_id, created_at DESC)
  WHERE target_user_id IS NOT NULL;

-- ============================================================
-- PLANS TABLE INDEXES
-- ============================================================

-- Code lookup (subscription management)
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_plans_code
  ON plans (code);

-- Active public plans (pricing page)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_plans_active_public
  ON plans (is_active, is_public)
  WHERE is_active = true AND is_public = true;
```

### 2. Database Constraints

**Migration File:** `supabase/migrations/YYYYMMDD_add_constraints.sql`

```sql
-- ============================================================
-- CHECK CONSTRAINTS
-- ============================================================

-- Users: Valid email format
ALTER TABLE users
  ADD CONSTRAINT chk_users_email_format
  CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- Organizations: Seat limits
ALTER TABLE organizations
  ADD CONSTRAINT chk_organizations_seat_limit
  CHECK (seat_limit >= 1 AND seat_limit <= 10000);

ALTER TABLE organizations
  ADD CONSTRAINT chk_organizations_seat_used
  CHECK (seat_used >= 0 AND seat_used <= seat_limit);

-- Plans: Price validation
ALTER TABLE plans
  ADD CONSTRAINT chk_plans_price_positive
  CHECK (price >= 0);

-- Plans: Interval validation
ALTER TABLE plans
  ADD CONSTRAINT chk_plans_interval_valid
  CHECK (interval IN ('month', 'year'));

-- ============================================================
-- FOREIGN KEY CONSTRAINTS (if not already present)
-- ============================================================

-- Users -> Organizations
ALTER TABLE users
  ADD CONSTRAINT fk_users_organization
  FOREIGN KEY (organization_id)
  REFERENCES organizations (id)
  ON DELETE RESTRICT;

-- Users -> Users (invited_by)
ALTER TABLE users
  ADD CONSTRAINT fk_users_invited_by
  FOREIGN KEY (invited_by)
  REFERENCES users (id)
  ON DELETE SET NULL;

-- Organizations -> Plans
ALTER TABLE organizations
  ADD CONSTRAINT fk_organizations_plan
  FOREIGN KEY (plan_id)
  REFERENCES plans (id)
  ON DELETE RESTRICT;

-- Projects -> Users (owner)
ALTER TABLE projects
  ADD CONSTRAINT fk_projects_owner
  FOREIGN KEY (owner_id)
  REFERENCES users (id)
  ON DELETE CASCADE;

-- Audit Logs -> Organizations
ALTER TABLE audit_logs
  ADD CONSTRAINT fk_audit_logs_organization
  FOREIGN KEY (organization_id)
  REFERENCES organizations (id)
  ON DELETE CASCADE;

-- ============================================================
-- UNIQUE CONSTRAINTS
-- ============================================================

-- Ensure one user per email
ALTER TABLE users
  ADD CONSTRAINT uq_users_email
  UNIQUE (email);

-- Ensure one user per Supabase ID
ALTER TABLE users
  ADD CONSTRAINT uq_users_supabase_user_id
  UNIQUE (supabase_user_id);

-- Ensure unique org slugs
ALTER TABLE organizations
  ADD CONSTRAINT uq_organizations_slug
  UNIQUE (slug);

-- Ensure unique plan codes
ALTER TABLE plans
  ADD CONSTRAINT uq_plans_code
  UNIQUE (code);
```

### 3. Query Optimization Patterns

**Location:** `apps/server/src/repositories/drizzle/query-patterns.ts`

```typescript
// ============================================================
// PAGINATION PATTERN
// ============================================================
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  cursor?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export async function paginate<T>(
  query: () => Promise<T[]>,
  countQuery: () => Promise<number>,
  params: PaginationParams
): Promise<PaginatedResult<T>> {
  const page = params.page ?? 1;
  const pageSize = Math.min(params.pageSize ?? 20, 100); // Max 100

  const [data, totalCount] = await Promise.all([query(), countQuery()]);

  return {
    data,
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
      hasNext: page * pageSize < totalCount,
      hasPrev: page > 1,
    },
  };
}

// ============================================================
// BATCH QUERY PATTERN
// ============================================================
export async function batchQuery<T, K>(
  ids: K[],
  fetcher: (ids: K[]) => Promise<T[]>,
  batchSize = 100
): Promise<T[]> {
  const results: T[] = [];

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const batchResults = await fetcher(batch);
    results.push(...batchResults);
  }

  return results;
}

// ============================================================
// SELECT ONLY NEEDED COLUMNS
// ============================================================
export const userSelectFields = {
  minimal: {
    id: true,
    email: true,
    fullName: true,
    role: true,
  },
  list: {
    id: true,
    email: true,
    fullName: true,
    role: true,
    isActive: true,
    createdAt: true,
  },
  full: true, // All columns
};

// Usage in repository:
// db.query.users.findMany({ columns: userSelectFields.minimal })
```

### 4. Connection Pooling Configuration

**Location:** `.env` / Environment Variables

```bash
# ============================================================
# DATABASE CONNECTION (Supabase)
# ============================================================

# Transaction mode (6543) - Use for serverless/edge
# Best for: Short-lived connections, Edge Functions
DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:6543/postgres?pgbouncer=true

# Session mode (5432) - Use for migrations & long transactions
# Best for: Drizzle migrations, complex transactions
DATABASE_URL_DIRECT=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres

# ============================================================
# POOL CONFIGURATION
# ============================================================

# Max connections in pool (Edge Functions share a pool)
DATABASE_POOL_SIZE=10

# Connection timeout (ms)
DATABASE_CONNECT_TIMEOUT=10000

# Idle timeout (ms) - Return connection after idle
DATABASE_IDLE_TIMEOUT=30000
```

**Drizzle Configuration Update:** `packages/database/src/client.ts`

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

// Connection optimized for serverless
const client = postgres(connectionString, {
  max: parseInt(process.env.DATABASE_POOL_SIZE ?? '10'),
  idle_timeout: parseInt(process.env.DATABASE_IDLE_TIMEOUT ?? '30') / 1000,
  connect_timeout: parseInt(process.env.DATABASE_CONNECT_TIMEOUT ?? '10000') / 1000,
  prepare: false, // Required for Supabase pooler
});

export const db = drizzle(client, { schema });
export type DrizzleDB = typeof db;
```

### 5. Audit Log Partitioning Strategy (Future)

For when audit_logs exceeds 10M rows:

```sql
-- NOTE: Implement when audit_logs > 10M rows
-- This creates monthly partitions automatically

-- Convert to partitioned table
CREATE TABLE audit_logs_partitioned (
  LIKE audit_logs INCLUDING ALL
) PARTITION BY RANGE (created_at);

-- Create partitions for current and next 12 months
CREATE TABLE audit_logs_2026_01 PARTITION OF audit_logs_partitioned
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE audit_logs_2026_02 PARTITION OF audit_logs_partitioned
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- ... etc

-- Auto-create partitions via pg_partman extension
-- CREATE EXTENSION pg_partman;
-- SELECT partman.create_parent('public.audit_logs_partitioned', 'created_at', 'native', 'monthly');
```

---

## Drizzle Schema Updates

Update the schema to reflect constraints:

```typescript
// packages/database/src/schema.ts

import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  integer,
  jsonb,
  text,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    supabaseUserId: uuid('supabase_user_id').unique(),
    organizationId: uuid('organization_id').references(() => organizations.id),
    email: varchar('email', { length: 255 }).unique().notNull(),
    fullName: varchar('full_name', { length: 255 }),
    role: varchar('role', { length: 50 }).notNull(),
    isOrgAdmin: boolean('is_org_admin').default(false),
    isActive: boolean('is_active').default(false),
    // ... other fields
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    // Check constraints (Drizzle v0.30+)
    emailCheck: check(
      'email_format',
      sql`${table.email} ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'`
    ),
  })
);

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).unique().notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    seatLimit: integer('seat_limit').default(5).notNull(),
    seatUsed: integer('seat_used').default(0).notNull(),
    planId: uuid('plan_id').references(() => plans.id),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    seatLimitCheck: check(
      'seat_limit_range',
      sql`${table.seatLimit} >= 1 AND ${table.seatLimit} <= 10000`
    ),
    seatUsedCheck: check(
      'seat_used_valid',
      sql`${table.seatUsed} >= 0 AND ${table.seatUsed} <= ${table.seatLimit}`
    ),
  })
);
```

---

## Implementation Steps

### Step 1: Create Migration Files

```bash
# Generate timestamp for migration
TIMESTAMP=$(date +%Y%m%d%H%M%S)

# Create index migration
touch supabase/migrations/${TIMESTAMP}_add_indexes.sql

# Create constraints migration
touch supabase/migrations/${TIMESTAMP}_add_constraints.sql
```

### Step 2: Apply Migrations

```bash
# Local development
supabase db reset

# Or apply incrementally
pnpm db:migrate
```

### Step 3: Verify Indexes

```sql
-- Check all indexes
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- Check index usage
SELECT
  relname AS table,
  indexrelname AS index,
  idx_scan AS scans,
  idx_tup_read AS tuples_read,
  idx_tup_fetch AS tuples_fetched
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

### Step 4: Update Query Patterns

- Refactor repositories to use new pagination patterns
- Add column selection to reduce data transfer
- Implement batch queries for bulk operations

---

## Query Analysis Tools

### Explain Analyze Template

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT * FROM users
WHERE organization_id = 'xxx'
AND is_active = true
ORDER BY created_at DESC
LIMIT 20;
```

### Slow Query Logging

```sql
-- Enable slow query logging (Supabase Dashboard > Settings > Database)
ALTER SYSTEM SET log_min_duration_statement = 1000; -- Log queries > 1s
SELECT pg_reload_conf();
```

---

## Acceptance Criteria

- [ ] All indexes created and verified
- [ ] All constraints applied and tested
- [ ] Drizzle schema updated with constraints
- [ ] Connection pooling configured for Edge Functions
- [ ] Query patterns documented
- [ ] No slow queries (>100ms) for common operations
- [ ] Index usage verified via `pg_stat_user_indexes`

---

## Performance Targets

| Query              | Before | After | Target |
| ------------------ | ------ | ----- | ------ |
| Find user by email | ~50ms  | ~5ms  | <10ms  |
| List org members   | ~100ms | ~15ms | <20ms  |
| Audit log query    | ~500ms | ~30ms | <50ms  |
| User count         | ~200ms | ~10ms | <20ms  |

---

## Monitoring

Add these queries to your monitoring dashboard:

```sql
-- Unused indexes (remove after 30 days of no use)
SELECT * FROM pg_stat_user_indexes
WHERE idx_scan = 0;

-- Table bloat (may need VACUUM)
SELECT
  schemaname, relname,
  n_dead_tup AS dead_tuples,
  n_live_tup AS live_tuples,
  round(n_dead_tup * 100.0 / nullif(n_live_tup, 0), 2) AS dead_pct
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY dead_pct DESC;
```
