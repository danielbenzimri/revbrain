import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Mock Supabase client builder
// ---------------------------------------------------------------------------

/**
 * Creates a deeply chainable mock Supabase client.
 * Every query-builder method returns `this` so you can chain arbitrarily,
 * and the terminal methods (maybeSingle, single, then) resolve to whatever
 * `terminalResult` is configured before the call.
 */
function createMockSupabase(terminalResult: { data: unknown; error: unknown; count?: number | null }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: Record<string, any> = {};

  const chainMethods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in',
    'order', 'limit', 'range', 'filter',
  ];

  for (const method of chainMethods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }

  // Terminal methods
  builder.maybeSingle = vi.fn().mockResolvedValue(terminalResult);
  builder.single = vi.fn().mockResolvedValue(terminalResult);

  // When the query is awaited directly (findFindingsByRun, fetchMany, etc.)
  builder.then = vi.fn((resolve: (v: unknown) => void) =>
    resolve(terminalResult)
  );

  const supabase = {
    from: vi.fn().mockReturnValue(builder),
    // Expose builder for assertions
    _builder: builder,
  };

  return supabase as unknown as SupabaseClient & { _builder: typeof builder };
}

// ---------------------------------------------------------------------------
// Helpers: snake_case DB row factories
// ---------------------------------------------------------------------------

function makeConnectionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conn-1',
    project_id: 'proj-1',
    organization_id: 'org-1',
    connection_role: 'source',
    salesforce_org_id: '00D000000000001',
    salesforce_instance_url: 'https://test.salesforce.com',
    custom_login_url: null,
    oauth_base_url: 'https://login.salesforce.com',
    salesforce_user_id: null,
    salesforce_username: null,
    instance_type: 'production',
    api_version: '59.0',
    connection_metadata: null,
    status: 'active',
    last_used_at: null,
    last_successful_api_call_at: null,
    last_error: null,
    last_error_at: null,
    connected_by: 'user-1',
    disconnected_by: null,
    disconnected_at: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeRunRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    project_id: 'proj-1',
    organization_id: 'org-1',
    connection_id: 'conn-1',
    status: 'queued',
    status_reason: null,
    mode: 'full',
    raw_snapshot_mode: 'errors_only',
    progress: {},
    org_fingerprint: null,
    worker_id: null,
    lease_expires_at: null,
    last_heartbeat_at: null,
    retry_count: 0,
    max_retries: 3,
    idempotency_key: null,
    dispatched_at: null,
    started_at: null,
    completed_at: null,
    failed_at: null,
    cancel_requested_at: null,
    duration_ms: null,
    api_calls_used: null,
    records_extracted: null,
    completeness_pct: null,
    error: null,
    created_by: 'user-1',
    created_at: '2025-06-01T00:00:00Z',
    ...overrides,
  };
}

function makePendingFlowRow(overrides: Record<string, unknown> = {}) {
  return {
    nonce: 'nonce-abc',
    project_id: 'proj-1',
    organization_id: 'org-1',
    user_id: 'user-1',
    connection_role: 'source',
    code_verifier: 'verifier-xyz',
    oauth_base_url: 'https://login.salesforce.com',
    expires_at: new Date(Date.now() + 600_000).toISOString(), // 10 min from now
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeLogRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'log-1',
    connection_id: 'conn-1',
    event: 'connected',
    details: null,
    performed_by: 'user-1',
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeFindingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'finding-1',
    run_id: 'run-1',
    domain: 'pricing',
    collector_name: 'PriceBookCollector',
    artifact_type: 'PricebookEntry',
    artifact_name: 'Standard Price Book',
    artifact_id: '01s000000000001',
    finding_key: 'pricebook.archived',
    source_type: 'metadata',
    risk_level: 'medium',
    complexity_level: 'moderate',
    migration_relevance: 'high',
    rca_target_concept: 'PricingProcedure',
    rca_mapping_complexity: 'moderate',
    evidence_refs: [],
    notes: null,
    count_value: null,
    text_value: null,
    created_at: '2025-06-01T00:00:00Z',
    ...overrides,
  };
}

// ============================================================
// ASSESSMENT REPOSITORY
// ============================================================

describe('PostgRESTAssessmentRepository', () => {
  let supabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.resetModules();
  });

  it('createRun inserts and returns camelCase entity', async () => {
    const row = makeRunRow();
    supabase = createMockSupabase({ data: row, error: null });

    const { PostgRESTAssessmentRepository } = await import('./assessment.repository.ts');
    const repo = new PostgRESTAssessmentRepository(supabase);

    const result = await repo.createRun({
      projectId: 'proj-1',
      organizationId: 'org-1',
      connectionId: 'conn-1',
      createdBy: 'user-1',
    });

    expect(result.projectId).toBe('proj-1');
    expect(result.organizationId).toBe('org-1');
    expect(result.status).toBe('queued');
    expect(result.createdAt).toBeInstanceOf(Date);
    // Verify snake_case key is NOT present
    expect((result as unknown as Record<string, unknown>).project_id).toBeUndefined();
  });

  it('findRunById returns null when not found', async () => {
    supabase = createMockSupabase({ data: null, error: null });
    const { PostgRESTAssessmentRepository } = await import('./assessment.repository.ts');
    const repo = new PostgRESTAssessmentRepository(supabase);

    const result = await repo.findRunById('nonexistent');
    expect(result).toBeNull();
  });

  it('findRunById returns camelCase entity when found', async () => {
    const row = makeRunRow({ id: 'run-42', status: 'running' });
    supabase = createMockSupabase({ data: row, error: null });
    const { PostgRESTAssessmentRepository } = await import('./assessment.repository.ts');
    const repo = new PostgRESTAssessmentRepository(supabase);

    const result = await repo.findRunById('run-42');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('run-42');
    expect(result!.status).toBe('running');
  });

  it('findLatestRunByProject returns null when no runs exist', async () => {
    supabase = createMockSupabase({ data: null, error: null });
    const { PostgRESTAssessmentRepository } = await import('./assessment.repository.ts');
    const repo = new PostgRESTAssessmentRepository(supabase);

    const result = await repo.findLatestRunByProject('proj-empty');
    expect(result).toBeNull();
  });

  it('findRunsByProject returns empty array on no data', async () => {
    supabase = createMockSupabase({ data: null, error: null });
    const { PostgRESTAssessmentRepository } = await import('./assessment.repository.ts');
    const repo = new PostgRESTAssessmentRepository(supabase);

    const result = await repo.findRunsByProject('proj-1');
    expect(result).toEqual([]);
  });

  it('findRunsByProject returns camelCase entities', async () => {
    const rows = [makeRunRow({ id: 'run-a' }), makeRunRow({ id: 'run-b' })];
    supabase = createMockSupabase({ data: rows, error: null });
    const { PostgRESTAssessmentRepository } = await import('./assessment.repository.ts');
    const repo = new PostgRESTAssessmentRepository(supabase);

    const result = await repo.findRunsByProject('proj-1');
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('run-a');
    expect(result[1].id).toBe('run-b');
  });

  it('countActiveRuns returns 0 on error', async () => {
    supabase = createMockSupabase({ data: null, error: { message: 'fail' }, count: null });
    const { PostgRESTAssessmentRepository } = await import('./assessment.repository.ts');
    const repo = new PostgRESTAssessmentRepository(supabase);

    const result = await repo.countActiveRuns();
    expect(result).toBe(0);
  });

  it('countActiveRuns returns count from response', async () => {
    supabase = createMockSupabase({ data: null, error: null, count: 5 });
    const { PostgRESTAssessmentRepository } = await import('./assessment.repository.ts');
    const repo = new PostgRESTAssessmentRepository(supabase);

    const result = await repo.countActiveRuns();
    expect(result).toBe(5);
  });

  it('countFindingsByRun returns 0 when no findings', async () => {
    supabase = createMockSupabase({ data: null, error: null, count: 0 });
    const { PostgRESTAssessmentRepository } = await import('./assessment.repository.ts');
    const repo = new PostgRESTAssessmentRepository(supabase);

    const result = await repo.countFindingsByRun('run-1');
    expect(result).toBe(0);
  });

  it('findFindingsByRun returns camelCase findings', async () => {
    const rows = [makeFindingRow()];
    supabase = createMockSupabase({ data: rows, error: null });
    const { PostgRESTAssessmentRepository } = await import('./assessment.repository.ts');
    const repo = new PostgRESTAssessmentRepository(supabase);

    const result = await repo.findFindingsByRun('run-1');
    expect(result).toHaveLength(1);
    expect(result[0].runId).toBe('run-1');
    expect(result[0].collectorName).toBe('PriceBookCollector');
    expect(result[0].createdAt).toBeInstanceOf(Date);
    expect((result[0] as unknown as Record<string, unknown>).run_id).toBeUndefined();
  });

  it('casDispatch returns null when run is not in queued status', async () => {
    supabase = createMockSupabase({ data: null, error: null });
    const { PostgRESTAssessmentRepository } = await import('./assessment.repository.ts');
    const repo = new PostgRESTAssessmentRepository(supabase);

    const result = await repo.casDispatch('run-1');
    expect(result).toBeNull();
  });

  it('casDispatch returns updated entity on success', async () => {
    const row = makeRunRow({ status: 'dispatched', dispatched_at: '2025-06-01T01:00:00Z' });
    supabase = createMockSupabase({ data: row, error: null });
    const { PostgRESTAssessmentRepository } = await import('./assessment.repository.ts');
    const repo = new PostgRESTAssessmentRepository(supabase);

    const result = await repo.casDispatch('run-1');
    expect(result).not.toBeNull();
    expect(result!.status).toBe('dispatched');
    expect(result!.dispatchedAt).toBeInstanceOf(Date);
  });

  it('casDispatch throws on DB error', async () => {
    supabase = createMockSupabase({ data: null, error: { message: 'constraint violation' } });
    const { PostgRESTAssessmentRepository } = await import('./assessment.repository.ts');
    const repo = new PostgRESTAssessmentRepository(supabase);

    await expect(repo.casDispatch('run-1')).rejects.toThrow('constraint violation');
  });
});

// ============================================================
// SALESFORCE CONNECTION REPOSITORY
// ============================================================

describe('PostgRESTSalesforceConnectionRepository', () => {
  let supabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.resetModules();
  });

  it('findById returns null when not found', async () => {
    supabase = createMockSupabase({ data: null, error: null });
    const { PostgRESTSalesforceConnectionRepository } = await import('./salesforce-connection.repository.ts');
    const repo = new PostgRESTSalesforceConnectionRepository(supabase);

    const result = await repo.findById('nonexistent');
    expect(result).toBeNull();
  });

  it('findById returns camelCase entity', async () => {
    const row = makeConnectionRow();
    supabase = createMockSupabase({ data: row, error: null });
    const { PostgRESTSalesforceConnectionRepository } = await import('./salesforce-connection.repository.ts');
    const repo = new PostgRESTSalesforceConnectionRepository(supabase);

    const result = await repo.findById('conn-1');
    expect(result).not.toBeNull();
    expect(result!.projectId).toBe('proj-1');
    expect(result!.connectionRole).toBe('source');
    expect(result!.salesforceOrgId).toBe('00D000000000001');
    expect(result!.createdAt).toBeInstanceOf(Date);
    expect((result as unknown as Record<string, unknown>).project_id).toBeUndefined();
  });

  it('findByProject returns empty array when no connections', async () => {
    supabase = createMockSupabase({ data: [], error: null });
    const { PostgRESTSalesforceConnectionRepository } = await import('./salesforce-connection.repository.ts');
    const repo = new PostgRESTSalesforceConnectionRepository(supabase);

    const result = await repo.findByProject('proj-empty');
    expect(result).toEqual([]);
  });

  it('create returns camelCase entity', async () => {
    const row = makeConnectionRow();
    supabase = createMockSupabase({ data: row, error: null });
    const { PostgRESTSalesforceConnectionRepository } = await import('./salesforce-connection.repository.ts');
    const repo = new PostgRESTSalesforceConnectionRepository(supabase);

    const result = await repo.create({
      projectId: 'proj-1',
      organizationId: 'org-1',
      connectionRole: 'source',
      salesforceOrgId: '00D000000000001',
      salesforceInstanceUrl: 'https://test.salesforce.com',
      oauthBaseUrl: 'https://login.salesforce.com',
      instanceType: 'production',
      connectedBy: 'user-1',
    });

    expect(result.id).toBe('conn-1');
    expect(result.status).toBe('active');
    expect(supabase.from).toHaveBeenCalledWith('salesforce_connections');
  });

  it('updateStatus returns updated entity', async () => {
    const row = makeConnectionRow({ status: 'error', last_error: 'token expired' });
    supabase = createMockSupabase({ data: row, error: null });
    const { PostgRESTSalesforceConnectionRepository } = await import('./salesforce-connection.repository.ts');
    const repo = new PostgRESTSalesforceConnectionRepository(supabase);

    const result = await repo.updateStatus('conn-1', 'error', 'token expired');
    expect(result).not.toBeNull();
    expect(result!.status).toBe('error');
    expect(result!.lastError).toBe('token expired');
  });

  it('updateStatus returns null on DB error', async () => {
    supabase = createMockSupabase({ data: null, error: { message: 'fail' } });
    const { PostgRESTSalesforceConnectionRepository } = await import('./salesforce-connection.repository.ts');
    const repo = new PostgRESTSalesforceConnectionRepository(supabase);

    const result = await repo.updateStatus('conn-1', 'error');
    expect(result).toBeNull();
  });

  it('disconnect returns true on success', async () => {
    const row = makeConnectionRow({ status: 'disconnected' });
    supabase = createMockSupabase({ data: row, error: null });
    const { PostgRESTSalesforceConnectionRepository } = await import('./salesforce-connection.repository.ts');
    const repo = new PostgRESTSalesforceConnectionRepository(supabase);

    const result = await repo.disconnect('conn-1', 'user-1');
    expect(result).toBe(true);
  });

  it('disconnect returns false on error', async () => {
    supabase = createMockSupabase({ data: null, error: { message: 'fail' } });
    const { PostgRESTSalesforceConnectionRepository } = await import('./salesforce-connection.repository.ts');
    const repo = new PostgRESTSalesforceConnectionRepository(supabase);

    const result = await repo.disconnect('conn-1', 'user-1');
    expect(result).toBe(false);
  });
});

// ============================================================
// OAUTH PENDING FLOW REPOSITORY
// ============================================================

describe('PostgRESTOauthPendingFlowRepository', () => {
  let supabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.resetModules();
  });

  it('findByNonce returns null when not found', async () => {
    supabase = createMockSupabase({ data: null, error: null });
    const { PostgRESTOauthPendingFlowRepository } = await import('./oauth-pending-flow.repository.ts');
    const repo = new PostgRESTOauthPendingFlowRepository(supabase);

    const result = await repo.findByNonce('nonexistent');
    expect(result).toBeNull();
  });

  it('findByNonce returns camelCase entity', async () => {
    const row = makePendingFlowRow();
    supabase = createMockSupabase({ data: row, error: null });
    const { PostgRESTOauthPendingFlowRepository } = await import('./oauth-pending-flow.repository.ts');
    const repo = new PostgRESTOauthPendingFlowRepository(supabase);

    const result = await repo.findByNonce('nonce-abc');
    expect(result).not.toBeNull();
    expect(result!.nonce).toBe('nonce-abc');
    expect(result!.projectId).toBe('proj-1');
    expect(result!.codeVerifier).toBe('verifier-xyz');
    expect(result!.expiresAt).toBeInstanceOf(Date);
  });

  it('findLiveByProjectAndRole returns null when no flow exists', async () => {
    supabase = createMockSupabase({ data: null, error: null });
    const { PostgRESTOauthPendingFlowRepository } = await import('./oauth-pending-flow.repository.ts');
    const repo = new PostgRESTOauthPendingFlowRepository(supabase);

    const result = await repo.findLiveByProjectAndRole('proj-1', 'source');
    expect(result).toBeNull();
  });

  it('findLiveByProjectAndRole returns null for expired flow', async () => {
    const expiredRow = makePendingFlowRow({
      expires_at: '2020-01-01T00:00:00Z', // well in the past
    });
    supabase = createMockSupabase({ data: expiredRow, error: null });
    const { PostgRESTOauthPendingFlowRepository } = await import('./oauth-pending-flow.repository.ts');
    const repo = new PostgRESTOauthPendingFlowRepository(supabase);

    const result = await repo.findLiveByProjectAndRole('proj-1', 'source');
    expect(result).toBeNull();
  });

  it('findLiveByProjectAndRole returns entity for live flow', async () => {
    const futureDate = new Date(Date.now() + 600_000).toISOString();
    const liveRow = makePendingFlowRow({ expires_at: futureDate });
    supabase = createMockSupabase({ data: liveRow, error: null });
    const { PostgRESTOauthPendingFlowRepository } = await import('./oauth-pending-flow.repository.ts');
    const repo = new PostgRESTOauthPendingFlowRepository(supabase);

    const result = await repo.findLiveByProjectAndRole('proj-1', 'source');
    expect(result).not.toBeNull();
    expect(result!.connectionRole).toBe('source');
  });

  it('cleanupExpired returns 0 when no expired flows', async () => {
    supabase = createMockSupabase({ data: [], error: null });
    const { PostgRESTOauthPendingFlowRepository } = await import('./oauth-pending-flow.repository.ts');
    const repo = new PostgRESTOauthPendingFlowRepository(supabase);

    const result = await repo.cleanupExpired();
    expect(result).toBe(0);
  });

  it('cleanupExpired returns count of deleted rows', async () => {
    const deleted = [{ nonce: 'a' }, { nonce: 'b' }, { nonce: 'c' }];
    supabase = createMockSupabase({ data: deleted, error: null });
    const { PostgRESTOauthPendingFlowRepository } = await import('./oauth-pending-flow.repository.ts');
    const repo = new PostgRESTOauthPendingFlowRepository(supabase);

    const result = await repo.cleanupExpired();
    expect(result).toBe(3);
  });

  it('upsertForProject throws when a live flow already exists', async () => {
    // The first .from() call for the existence check returns a live flow
    const futureDate = new Date(Date.now() + 600_000).toISOString();
    const liveRow = makePendingFlowRow({ expires_at: futureDate });
    supabase = createMockSupabase({ data: liveRow, error: null });
    const { PostgRESTOauthPendingFlowRepository } = await import('./oauth-pending-flow.repository.ts');
    const repo = new PostgRESTOauthPendingFlowRepository(supabase);

    await expect(
      repo.upsertForProject({
        nonce: 'new-nonce',
        projectId: 'proj-1',
        organizationId: 'org-1',
        userId: 'user-1',
        connectionRole: 'source',
        codeVerifier: 'new-verifier',
        oauthBaseUrl: 'https://login.salesforce.com',
        expiresAt: new Date(Date.now() + 600_000),
      })
    ).rejects.toThrow('Connection flow already in progress');
  });

  it('upsertForProject succeeds when no existing flow', async () => {
    // First call (select) returns null, second call (insert) returns new row
    const newRow = makePendingFlowRow({ nonce: 'new-nonce' });

    // Build a mock where maybeSingle returns null first (no existing),
    // then single returns the inserted row
    supabase = createMockSupabase({ data: null, error: null });
    const { PostgRESTOauthPendingFlowRepository } = await import('./oauth-pending-flow.repository.ts');
    const repo = new PostgRESTOauthPendingFlowRepository(supabase);

    // Override single for the insert path
    supabase._builder.single.mockResolvedValue({ data: newRow, error: null });

    const result = await repo.upsertForProject({
      nonce: 'new-nonce',
      projectId: 'proj-1',
      organizationId: 'org-1',
      userId: 'user-1',
      connectionRole: 'source',
      codeVerifier: 'new-verifier',
      oauthBaseUrl: 'https://login.salesforce.com',
      expiresAt: new Date(Date.now() + 600_000),
    });

    expect(result.nonce).toBe('new-nonce');
  });
});

// ============================================================
// SALESFORCE CONNECTION LOG REPOSITORY
// ============================================================

describe('PostgRESTSalesforceConnectionLogRepository', () => {
  let supabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.resetModules();
  });

  it('create returns camelCase entity', async () => {
    const row = makeLogRow();
    supabase = createMockSupabase({ data: row, error: null });
    const { PostgRESTSalesforceConnectionLogRepository } = await import('./salesforce-connection-log.repository.ts');
    const repo = new PostgRESTSalesforceConnectionLogRepository(supabase);

    const result = await repo.create({
      connectionId: 'conn-1',
      event: 'connected',
      performedBy: 'user-1',
    });

    expect(result.id).toBe('log-1');
    expect(result.connectionId).toBe('conn-1');
    expect(result.event).toBe('connected');
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(supabase.from).toHaveBeenCalledWith('salesforce_connection_logs');
  });

  it('findByConnection returns empty array when no logs', async () => {
    supabase = createMockSupabase({ data: [], error: null });
    const { PostgRESTSalesforceConnectionLogRepository } = await import('./salesforce-connection-log.repository.ts');
    const repo = new PostgRESTSalesforceConnectionLogRepository(supabase);

    const result = await repo.findByConnection('conn-empty');
    expect(result).toEqual([]);
  });

  it('findByConnection returns camelCase entities', async () => {
    const rows = [
      makeLogRow({ id: 'log-1', event: 'connected' }),
      makeLogRow({ id: 'log-2', event: 'refreshed' }),
    ];
    supabase = createMockSupabase({ data: rows, error: null });
    const { PostgRESTSalesforceConnectionLogRepository } = await import('./salesforce-connection-log.repository.ts');
    const repo = new PostgRESTSalesforceConnectionLogRepository(supabase);

    const result = await repo.findByConnection('conn-1');
    expect(result).toHaveLength(2);
    expect(result[0].event).toBe('connected');
    expect(result[1].event).toBe('refreshed');
    expect((result[0] as unknown as Record<string, unknown>).connection_id).toBeUndefined();
  });

  it('findByConnection returns empty on DB error', async () => {
    supabase = createMockSupabase({ data: null, error: { message: 'fail' } });
    const { PostgRESTSalesforceConnectionLogRepository } = await import('./salesforce-connection-log.repository.ts');
    const repo = new PostgRESTSalesforceConnectionLogRepository(supabase);

    const result = await repo.findByConnection('conn-1');
    expect(result).toEqual([]);
  });
});

// ============================================================
// SALESFORCE CONNECTION SECRETS REPOSITORY
// ============================================================

describe('PostgRESTSalesforceConnectionSecretsRepository', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('can be instantiated without encryption key (lazy init)', async () => {
    const supabase = createMockSupabase({ data: null, error: null });
    const { PostgRESTSalesforceConnectionSecretsRepository } = await import(
      './salesforce-connection-secrets.repository.ts'
    );

    // Should NOT throw — key is only required when encrypt/decrypt methods are called
    const repo = new PostgRESTSalesforceConnectionSecretsRepository(supabase);
    expect(repo).toBeDefined();
    expect(typeof repo.findByConnectionId).toBe('function');
    expect(typeof repo.create).toBe('function');
    expect(typeof repo.updateTokens).toBe('function');
    expect(typeof repo.deleteByConnectionId).toBe('function');
  });
});

// ============================================================
// createPostgRESTRepositories — all 10 repos present
// ============================================================

describe('createPostgRESTRepositories', () => {
  it('returns all repository interfaces including 5 new ones', async () => {
    const supabase = createMockSupabase({ data: null, error: null });
    const { createPostgRESTRepositories } = await import('./index.ts');

    const repos = createPostgRESTRepositories(supabase);

    // Original 5
    expect(repos.users).toBeDefined();
    expect(repos.organizations).toBeDefined();
    expect(repos.plans).toBeDefined();
    expect(repos.auditLogs).toBeDefined();
    expect(repos.projects).toBeDefined();

    // New 5
    expect(repos.salesforceConnections).toBeDefined();
    expect(repos.salesforceConnectionSecrets).toBeDefined();
    expect(repos.oauthPendingFlows).toBeDefined();
    expect(repos.salesforceConnectionLogs).toBeDefined();
    expect(repos.assessmentRuns).toBeDefined();

    // Spot-check key methods on new repos
    expect(typeof repos.salesforceConnections.findByProject).toBe('function');
    expect(typeof repos.salesforceConnections.create).toBe('function');
    expect(typeof repos.salesforceConnections.updateStatus).toBe('function');
    expect(typeof repos.salesforceConnections.disconnect).toBe('function');

    expect(typeof repos.oauthPendingFlows.findByNonce).toBe('function');
    expect(typeof repos.oauthPendingFlows.findLiveByProjectAndRole).toBe('function');
    expect(typeof repos.oauthPendingFlows.upsertForProject).toBe('function');
    expect(typeof repos.oauthPendingFlows.cleanupExpired).toBe('function');

    expect(typeof repos.salesforceConnectionLogs.create).toBe('function');
    expect(typeof repos.salesforceConnectionLogs.findByConnection).toBe('function');

    expect(typeof repos.assessmentRuns.createRun).toBe('function');
    expect(typeof repos.assessmentRuns.findRunById).toBe('function');
    expect(typeof repos.assessmentRuns.findLatestRunByProject).toBe('function');
    expect(typeof repos.assessmentRuns.countActiveRuns).toBe('function');
    expect(typeof repos.assessmentRuns.countFindingsByRun).toBe('function');
    expect(typeof repos.assessmentRuns.casDispatch).toBe('function');
  });
});
