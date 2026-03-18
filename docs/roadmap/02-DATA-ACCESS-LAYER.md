# Session 02: Data Access Layer (Repository Pattern)

**Priority:** Critical (Architectural Foundation)
**Estimated Duration:** 2-3 days
**Dependencies:** Session 01 (Code Quality)

---

## Objective

Implement a **platform-agnostic Data Access Layer** using the Repository Pattern with two engines:

1. **Drizzle Engine (TCP):** Full SQL control, portable, ideal for complex queries
2. **Supabase Engine (HTTP):** Optimized for Supabase Edge, instant connection, best for simple CRUD

This enables:

- **Performance:** Use the fastest engine for each environment
- **Portability:** Core business logic never imports vendor SDKs
- **Flexibility:** Switch engines per-query or globally

---

## Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────────┐
│                      ROUTE HANDLERS                             │
│              (Use repositories from context)                    │
│                                                                 │
│   const user = await c.var.repos.users.findById(id);           │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    REPOSITORY INTERFACES                        │
│              (packages/contract/src/repositories)               │
│                                                                 │
│   interface UserRepository {                                    │
│     findById(id: string): Promise<User | null>;                │
│     findByEmail(email: string): Promise<User | null>;          │
│     create(data: CreateUserInput): Promise<User>;              │
│   }                                                             │
└─────────────────────────────┬───────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│    DRIZZLE ENGINE       │     │   SUPABASE ENGINE       │
│   (apps/server/src/     │     │   (apps/server/src/     │
│    repositories/drizzle)│     │    repositories/supabase)│
│                         │     │                         │
│  - Full SQL queries     │     │  - PostgREST HTTP calls │
│  - Complex joins        │     │  - Internal network     │
│  - Transactions         │     │  - No TCP overhead      │
│  - Migrations           │     │  - Simple CRUD only     │
└─────────────────────────┘     └─────────────────────────┘
```

### Engine Selection Logic

```typescript
// Automatic engine selection based on environment + query complexity
function selectEngine(operation: Operation): Engine {
  const isSupabaseEdge = !!Deno.env.get('SUPABASE_URL');
  const isComplexQuery = operation.hasJoins || operation.hasAggregation;

  if (isSupabaseEdge && !isComplexQuery) {
    return 'supabase'; // HTTP - fast for simple CRUD
  }
  return 'drizzle'; // TCP - full SQL power
}
```

---

## Implementation

### Step 1: Define Repository Interfaces

**Location:** `packages/contract/src/repositories/index.ts`

```typescript
// packages/contract/src/repositories/types.ts
import { z } from 'zod';
import type { User, Organization, Plan, Project, AuditLog } from '../schemas';

// ============================================================
// BASE REPOSITORY INTERFACE
// ============================================================
export interface BaseRepository<T, CreateInput, UpdateInput> {
  findById(id: string): Promise<T | null>;
  findMany(options?: FindManyOptions): Promise<T[]>;
  create(data: CreateInput): Promise<T>;
  update(id: string, data: UpdateInput): Promise<T | null>;
  delete(id: string): Promise<boolean>;
  count(filter?: Record<string, unknown>): Promise<number>;
}

export interface FindManyOptions {
  limit?: number;
  offset?: number;
  orderBy?: { field: string; direction: 'asc' | 'desc' };
  filter?: Record<string, unknown>;
}

// ============================================================
// DOMAIN-SPECIFIC REPOSITORIES
// ============================================================

export interface UserRepository extends BaseRepository<User, CreateUserInput, UpdateUserInput> {
  // User-specific queries
  findByEmail(email: string): Promise<User | null>;
  findBySupabaseId(supabaseUserId: string): Promise<User | null>;
  findByOrganization(organizationId: string, options?: FindManyOptions): Promise<User[]>;
  activate(id: string): Promise<User | null>;
  updateLastLogin(id: string): Promise<void>;
}

export interface OrganizationRepository extends BaseRepository<
  Organization,
  CreateOrgInput,
  UpdateOrgInput
> {
  findBySlug(slug: string): Promise<Organization | null>;
  incrementSeatUsed(id: string): Promise<Organization | null>;
  decrementSeatUsed(id: string): Promise<Organization | null>;
  findWithPlan(id: string): Promise<OrganizationWithPlan | null>;
}

export interface PlanRepository extends BaseRepository<Plan, CreatePlanInput, UpdatePlanInput> {
  findByCode(code: string): Promise<Plan | null>;
  findActive(): Promise<Plan[]>;
  findPublic(): Promise<Plan[]>;
}

export interface ProjectRepository extends BaseRepository<
  Project,
  CreateProjectInput,
  UpdateProjectInput
> {
  findByOwner(ownerId: string, options?: FindManyOptions): Promise<Project[]>;
  findByOrganization(organizationId: string, options?: FindManyOptions): Promise<Project[]>;
}

export interface AuditLogRepository {
  // Audit logs are append-only
  create(data: CreateAuditLogInput): Promise<AuditLog>;
  findByOrganization(organizationId: string, options?: FindManyOptions): Promise<AuditLog[]>;
  findByUser(userId: string, options?: FindManyOptions): Promise<AuditLog[]>;
  findByAction(action: string, options?: FindManyOptions): Promise<AuditLog[]>;
}

// ============================================================
// REPOSITORY CONTAINER
// ============================================================
export interface Repositories {
  users: UserRepository;
  organizations: OrganizationRepository;
  plans: PlanRepository;
  projects: ProjectRepository;
  auditLogs: AuditLogRepository;
}

// ============================================================
// INPUT TYPES (Zod-inferred)
// ============================================================
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreateOrgInput = z.infer<typeof createOrgSchema>;
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;
// ... etc
```

### Step 2: Implement Drizzle Engine

**Location:** `apps/server/src/repositories/drizzle/`

```typescript
// apps/server/src/repositories/drizzle/user.repository.ts
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import type { DrizzleDB } from '../../lib/db';
import { users } from '@revbrain/database';
import type {
  UserRepository,
  FindManyOptions,
  CreateUserInput,
  UpdateUserInput,
} from '@revbrain/contract';

export class DrizzleUserRepository implements UserRepository {
  constructor(private db: DrizzleDB) {}

  async findById(id: string) {
    const result = await this.db.query.users.findFirst({
      where: eq(users.id, id),
    });
    return result ?? null;
  }

  async findByEmail(email: string) {
    const result = await this.db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    });
    return result ?? null;
  }

  async findBySupabaseId(supabaseUserId: string) {
    const result = await this.db.query.users.findFirst({
      where: eq(users.supabaseUserId, supabaseUserId),
    });
    return result ?? null;
  }

  async findByOrganization(organizationId: string, options?: FindManyOptions) {
    return this.db.query.users.findMany({
      where: eq(users.organizationId, organizationId),
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      orderBy: this.buildOrderBy(options?.orderBy),
    });
  }

  async findMany(options?: FindManyOptions) {
    return this.db.query.users.findMany({
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      orderBy: this.buildOrderBy(options?.orderBy),
    });
  }

  async create(data: CreateUserInput) {
    const [user] = await this.db
      .insert(users)
      .values({
        ...data,
        email: data.email.toLowerCase(),
      })
      .returning();
    return user;
  }

  async update(id: string, data: UpdateUserInput) {
    const [user] = await this.db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user ?? null;
  }

  async delete(id: string) {
    const result = await this.db.update(users).set({ isActive: false }).where(eq(users.id, id));
    return result.rowCount > 0;
  }

  async activate(id: string) {
    const [user] = await this.db
      .update(users)
      .set({ isActive: true, activatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user ?? null;
  }

  async updateLastLogin(id: string) {
    await this.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, id));
  }

  async count(filter?: Record<string, unknown>) {
    const result = await this.db.select({ count: sql<number>`count(*)` }).from(users);
    return result[0]?.count ?? 0;
  }

  private buildOrderBy(orderBy?: { field: string; direction: 'asc' | 'desc' }) {
    if (!orderBy) return desc(users.createdAt);
    const column = users[orderBy.field as keyof typeof users];
    return orderBy.direction === 'asc' ? asc(column) : desc(column);
  }
}
```

```typescript
// apps/server/src/repositories/drizzle/index.ts
import type { DrizzleDB } from '../../lib/db';
import type { Repositories } from '@revbrain/contract';
import { DrizzleUserRepository } from './user.repository';
import { DrizzleOrganizationRepository } from './organization.repository';
import { DrizzlePlanRepository } from './plan.repository';
import { DrizzleProjectRepository } from './project.repository';
import { DrizzleAuditLogRepository } from './audit-log.repository';

export function createDrizzleRepositories(db: DrizzleDB): Repositories {
  return {
    users: new DrizzleUserRepository(db),
    organizations: new DrizzleOrganizationRepository(db),
    plans: new DrizzlePlanRepository(db),
    projects: new DrizzleProjectRepository(db),
    auditLogs: new DrizzleAuditLogRepository(db),
  };
}
```

### Step 3: Implement Supabase Engine

**Location:** `apps/server/src/repositories/supabase/`

```typescript
// apps/server/src/repositories/supabase/user.repository.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  UserRepository,
  FindManyOptions,
  CreateUserInput,
  UpdateUserInput,
} from '@revbrain/contract';

export class SupabaseUserRepository implements UserRepository {
  constructor(private client: SupabaseClient) {}

  async findById(id: string) {
    const { data, error } = await this.client.from('users').select('*').eq('id', id).single();

    if (error) throw error;
    return data;
  }

  async findByEmail(email: string) {
    const { data, error } = await this.client
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async findBySupabaseId(supabaseUserId: string) {
    const { data, error } = await this.client
      .from('users')
      .select('*')
      .eq('supabase_user_id', supabaseUserId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async findByOrganization(organizationId: string, options?: FindManyOptions) {
    let query = this.client.from('users').select('*').eq('organization_id', organizationId);

    query = this.applyOptions(query, options);

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  async findMany(options?: FindManyOptions) {
    let query = this.client.from('users').select('*');
    query = this.applyOptions(query, options);

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  async create(data: CreateUserInput) {
    const { data: user, error } = await this.client
      .from('users')
      .insert(this.toSnakeCase(data))
      .select()
      .single();

    if (error) throw error;
    return this.toCamelCase(user);
  }

  async update(id: string, data: UpdateUserInput) {
    const { data: user, error } = await this.client
      .from('users')
      .update({ ...this.toSnakeCase(data), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return this.toCamelCase(user);
  }

  async delete(id: string) {
    const { error } = await this.client.from('users').update({ is_active: false }).eq('id', id);

    return !error;
  }

  async activate(id: string) {
    const { data: user, error } = await this.client
      .from('users')
      .update({ is_active: true, activated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return this.toCamelCase(user);
  }

  async updateLastLogin(id: string) {
    await this.client
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', id);
  }

  async count(filter?: Record<string, unknown>) {
    const { count, error } = await this.client
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;
    return count ?? 0;
  }

  // Helper: Apply pagination and ordering
  private applyOptions(query: any, options?: FindManyOptions) {
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit ?? 100) - 1);
    }
    if (options?.orderBy) {
      const column = this.toSnakeCase({ [options.orderBy.field]: true });
      query = query.order(Object.keys(column)[0], {
        ascending: options.orderBy.direction === 'asc',
      });
    }
    return query;
  }

  // Helper: Convert camelCase to snake_case for Supabase
  private toSnakeCase(obj: Record<string, any>): Record<string, any> {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [
        key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
        value,
      ])
    );
  }

  // Helper: Convert snake_case to camelCase from Supabase
  private toCamelCase(obj: Record<string, any>): any {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [
        key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
        value,
      ])
    );
  }
}
```

```typescript
// apps/server/src/repositories/supabase/index.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Repositories } from '@revbrain/contract';
import { SupabaseUserRepository } from './user.repository';
import { SupabaseOrganizationRepository } from './organization.repository';
import { SupabasePlanRepository } from './plan.repository';
import { SupabaseProjectRepository } from './project.repository';
import { SupabaseAuditLogRepository } from './audit-log.repository';

export function createSupabaseRepositories(client: SupabaseClient): Repositories {
  return {
    users: new SupabaseUserRepository(client),
    organizations: new SupabaseOrganizationRepository(client),
    plans: new SupabasePlanRepository(client),
    projects: new SupabaseProjectRepository(client),
    auditLogs: new SupabaseAuditLogRepository(client),
  };
}
```

### Step 4: Repository Middleware

**Location:** `apps/server/src/middleware/repository.ts`

```typescript
import { createMiddleware } from 'hono/factory';
import type { Repositories } from '@revbrain/contract';
import { createDrizzleRepositories } from '../repositories/drizzle';
import { createSupabaseRepositories } from '../repositories/supabase';
import { db } from '../lib/db';
import { getSupabaseClient } from '../lib/supabase';

// Extend Hono context types
declare module 'hono' {
  interface ContextVariableMap {
    repos: Repositories;
    engine: 'drizzle' | 'supabase';
  }
}

export interface RepositoryMiddlewareOptions {
  // Force a specific engine (for testing or overrides)
  forceEngine?: 'drizzle' | 'supabase';
  // Use Supabase for simple CRUD when available
  preferAccelerated?: boolean;
}

export const repositoryMiddleware = (options: RepositoryMiddlewareOptions = {}) => {
  return createMiddleware(async (c, next) => {
    const engine = selectEngine(options);

    let repos: Repositories;

    if (engine === 'supabase') {
      const client = getSupabaseClient();
      repos = createSupabaseRepositories(client);
    } else {
      repos = createDrizzleRepositories(db);
    }

    c.set('repos', repos);
    c.set('engine', engine);

    await next();
  });
};

function selectEngine(options: RepositoryMiddlewareOptions): 'drizzle' | 'supabase' {
  // 1. Explicit override
  if (options.forceEngine) {
    return options.forceEngine;
  }

  // 2. Check if running in Supabase Edge environment
  const isSupabaseEdge = typeof Deno !== 'undefined' && !!Deno.env.get('SUPABASE_URL');

  // 3. Check header for per-request override
  // (Useful for testing or forcing Drizzle for complex queries)
  // Header: X-Use-Engine: drizzle

  // 4. Default: Use Supabase on Edge, Drizzle elsewhere
  if (isSupabaseEdge && options.preferAccelerated !== false) {
    return 'supabase';
  }

  return 'drizzle';
}

// Middleware for complex queries that should always use Drizzle
export const drizzleOnly = () => repositoryMiddleware({ forceEngine: 'drizzle' });
```

### Step 5: Usage in Routes

```typescript
// apps/server/src/v1/routes/users.ts
import { Hono } from 'hono';
import { repositoryMiddleware, drizzleOnly } from '../../middleware/repository';

const app = new Hono();

// Use default engine selection (Supabase on Edge, Drizzle elsewhere)
app.use('*', repositoryMiddleware({ preferAccelerated: true }));

// Simple CRUD - uses accelerated Supabase engine when available
app.get('/:id', async (c) => {
  const { id } = c.req.param();
  const user = await c.var.repos.users.findById(id);

  if (!user) {
    return c.json({ success: false, error: 'User not found' }, 404);
  }

  return c.json({ success: true, data: user });
});

// Complex query - force Drizzle for full SQL power
app.get('/analytics/by-role', drizzleOnly(), async (c) => {
  // This endpoint needs complex aggregations
  // Drizzle provides better support for this
  const stats = await c.var.repos.users.countByRole();
  return c.json({ success: true, data: stats });
});

export default app;
```

### Step 6: Hybrid Queries (Both Engines)

```typescript
// apps/server/src/repositories/hybrid/index.ts
import type { Repositories } from '@revbrain/contract';
import type { DrizzleDB } from '../../lib/db';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createDrizzleRepositories } from '../drizzle';
import { createSupabaseRepositories } from '../supabase';

/**
 * Hybrid repository that uses Supabase for simple queries
 * and Drizzle for complex ones
 */
export function createHybridRepositories(db: DrizzleDB, client: SupabaseClient): Repositories {
  const drizzle = createDrizzleRepositories(db);
  const supabase = createSupabaseRepositories(client);

  return {
    users: {
      // Simple queries -> Supabase (faster)
      findById: supabase.users.findById,
      findByEmail: supabase.users.findByEmail,
      findMany: supabase.users.findMany,
      create: supabase.users.create,
      update: supabase.users.update,
      delete: supabase.users.delete,

      // Complex queries -> Drizzle (more capable)
      findByOrganization: drizzle.users.findByOrganization,
      activate: drizzle.users.activate,
      count: drizzle.users.count,
    },
    // ... similar pattern for other repositories
  };
}
```

---

## Testing Strategy

### Unit Tests for Each Engine

```typescript
// apps/server/src/repositories/drizzle/__tests__/user.repository.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DrizzleUserRepository } from '../user.repository';

describe('DrizzleUserRepository', () => {
  const mockDb = {
    query: {
      users: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn() })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn() })) })) })),
  };

  let repo: DrizzleUserRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new DrizzleUserRepository(mockDb as any);
  });

  it('should find user by id', async () => {
    const mockUser = { id: '123', email: 'test@example.com' };
    mockDb.query.users.findFirst.mockResolvedValue(mockUser);

    const result = await repo.findById('123');

    expect(result).toEqual(mockUser);
    expect(mockDb.query.users.findFirst).toHaveBeenCalled();
  });

  // ... more tests
});
```

### Integration Tests

```typescript
// apps/server/src/repositories/__tests__/integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDrizzleRepositories } from '../drizzle';
import { createSupabaseRepositories } from '../supabase';

describe('Repository Integration', () => {
  describe('Drizzle Engine', () => {
    // Test against real database
  });

  describe('Supabase Engine', () => {
    // Test against Supabase
  });

  describe('Parity Check', () => {
    it('should return same data from both engines', async () => {
      const drizzleResult = await drizzleRepos.users.findById('123');
      const supabaseResult = await supabaseRepos.users.findById('123');

      expect(drizzleResult).toEqual(supabaseResult);
    });
  });
});
```

---

## Migration Guide

### Before (Direct Database Access)

```typescript
// Old code - coupled to Drizzle
import { db } from '../lib/db';
import { users } from '@revbrain/database';
import { eq } from 'drizzle-orm';

app.get('/users/:id', async (c) => {
  const user = await db.query.users.findFirst({
    where: eq(users.id, c.req.param('id')),
  });
  return c.json(user);
});
```

### After (Repository Pattern)

```typescript
// New code - decoupled, portable
app.get('/users/:id', async (c) => {
  const user = await c.var.repos.users.findById(c.req.param('id'));
  return c.json(user);
});
```

---

## File Structure

```
packages/
└── contract/
    └── src/
        └── repositories/
            ├── index.ts          # Re-exports
            └── types.ts          # Interfaces

apps/
└── server/
    └── src/
        ├── repositories/
        │   ├── drizzle/
        │   │   ├── index.ts
        │   │   ├── user.repository.ts
        │   │   ├── organization.repository.ts
        │   │   ├── plan.repository.ts
        │   │   ├── project.repository.ts
        │   │   └── audit-log.repository.ts
        │   ├── supabase/
        │   │   ├── index.ts
        │   │   ├── user.repository.ts
        │   │   ├── organization.repository.ts
        │   │   ├── plan.repository.ts
        │   │   ├── project.repository.ts
        │   │   └── audit-log.repository.ts
        │   └── hybrid/
        │       └── index.ts
        └── middleware/
            └── repository.ts
```

---

## Acceptance Criteria

- [ ] All repository interfaces defined in `@revbrain/contract`
- [ ] Drizzle engine implements all interfaces
- [ ] Supabase engine implements all interfaces
- [ ] Middleware correctly selects engine based on environment
- [ ] Unit tests for both engines
- [ ] Integration test verifying parity
- [ ] All existing routes migrated to use repositories
- [ ] Documentation for adding new repositories

---

## Performance Comparison

After implementation, benchmark both engines:

| Query Type     | Drizzle (TCP) | Supabase (HTTP) | Winner   |
| -------------- | ------------- | --------------- | -------- |
| findById       | ~50ms         | ~15ms           | Supabase |
| findMany (100) | ~80ms         | ~30ms           | Supabase |
| Complex Join   | ~100ms        | ~200ms+         | Drizzle  |
| Transaction    | ~60ms         | N/A             | Drizzle  |
| Aggregation    | ~70ms         | ~150ms          | Drizzle  |

---

## Notes

- **Drizzle remains the source of truth** for schema and migrations
- Supabase engine is for **performance optimization only**
- Complex queries should always use Drizzle
- Consider adding metrics to track which engine is used
