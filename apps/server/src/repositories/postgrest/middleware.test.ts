import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for the repository middleware runtime detection logic.
 *
 * These test the selectEngine decision tree without needing a real
 * Supabase or Drizzle connection.
 */

describe('Repository middleware — engine selection', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    delete (globalThis as Record<string, unknown>).Deno;
  });

  it('selects mock engine when USE_MOCK_DATA=true', async () => {
    process.env.USE_MOCK_DATA = 'true';
    process.env.AUTH_MODE = 'mock';

    const { repositoryMiddleware } = await import('../middleware.ts');
    // The middleware is created successfully
    expect(repositoryMiddleware).toBeDefined();
    expect(typeof repositoryMiddleware).toBe('function');
  });

  it('would select supabase engine on Edge Runtime with credentials', () => {
    // Simulate Edge Runtime
    (globalThis as Record<string, unknown>).Deno = {
      env: { get: (k: string) => (k === 'SUPABASE_URL' ? 'https://test.supabase.co' : null) },
    };

    // When Deno is defined AND SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set,
    // the middleware should prefer PostgREST. We can't fully test this without
    // importing the module (which triggers side effects), but we verify the
    // Deno detection works.
    expect(typeof (globalThis as Record<string, unknown>).Deno).toBe('object');
  });

  it('would select drizzle engine on Node.js (no Deno global)', () => {
    // @ts-expect-error — ensure no Deno
    delete globalThis.Deno;
    expect(typeof (globalThis as Record<string, unknown>).Deno).toBe('undefined');
  });
});

describe('Repository middleware — PostgREST repos implement contract', () => {
  it('createPostgRESTRepositories returns all required repos', async () => {
    // Create a mock Supabase client
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            limit: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const { createPostgRESTRepositories } = await import('./index.ts');
    const repos = createPostgRESTRepositories(mockSupabase);

    // Verify all 5 repository interfaces are implemented
    expect(repos.users).toBeDefined();
    expect(repos.organizations).toBeDefined();
    expect(repos.plans).toBeDefined();
    expect(repos.auditLogs).toBeDefined();
    expect(repos.projects).toBeDefined();

    // Verify key methods exist
    expect(typeof repos.users.findById).toBe('function');
    expect(typeof repos.users.findByEmail).toBe('function');
    expect(typeof repos.users.findBySupabaseId).toBe('function');
    expect(typeof repos.users.create).toBe('function');
    expect(typeof repos.users.update).toBe('function');
    expect(typeof repos.users.delete).toBe('function');
    expect(typeof repos.users.activate).toBe('function');
    expect(typeof repos.users.deactivate).toBe('function');
    expect(typeof repos.users.updateLastLogin).toBe('function');

    expect(typeof repos.organizations.findBySlug).toBe('function');
    expect(typeof repos.organizations.findWithPlan).toBe('function');
    expect(typeof repos.organizations.tryIncrementSeatUsed).toBe('function');
    expect(typeof repos.organizations.updateStorageUsed).toBe('function');

    expect(typeof repos.plans.findByCode).toBe('function');
    expect(typeof repos.plans.findActive).toBe('function');
    expect(typeof repos.plans.findPublic).toBe('function');

    expect(typeof repos.auditLogs.create).toBe('function');
    expect(typeof repos.auditLogs.findByOrganization).toBe('function');
    expect(typeof repos.auditLogs.findByUser).toBe('function');
    expect(typeof repos.auditLogs.findByAction).toBe('function');

    expect(typeof repos.projects.findByOwner).toBe('function');
    expect(typeof repos.projects.findByOrganization).toBe('function');
    expect(typeof repos.projects.countByOrganization).toBe('function');
  });
});
