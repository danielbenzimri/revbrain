import { describe, it, expect, vi } from 'vitest';
import { cleanupExpiredFlows } from './oauth-flow-cleanup.ts';
import type { Repositories } from '@revbrain/contract';

function createMockRepos(cleanupResult: number): Repositories {
  return {
    oauthPendingFlows: {
      cleanupExpired: vi.fn().mockResolvedValue(cleanupResult),
      create: vi.fn(),
      findByNonce: vi.fn(),
      deleteByNonce: vi.fn(),
      upsertForProject: vi.fn(),
      findLiveByProjectAndRole: vi.fn(),
    },
    // Other repos not used by cleanup — stubs
    users: {} as never,
    organizations: {} as never,
    plans: {} as never,
    auditLogs: {} as never,
    projects: {} as never,
    salesforceConnections: {} as never,
    salesforceConnectionSecrets: {} as never,
    salesforceConnectionLogs: {} as never,
    assessmentRuns: {} as never,
    assessmentIRGraphs: {} as never,
    partnerProfiles: {} as never,
    feeAgreements: {} as never,
    feeAgreementTiers: {} as never,
    feeMilestones: {} as never,
  };
}

describe('cleanupExpiredFlows', () => {
  it('should call cleanupExpired and return deleted count', async () => {
    const repos = createMockRepos(3);

    const result = await cleanupExpiredFlows(repos);

    expect(result).toBe(3);
    expect(repos.oauthPendingFlows.cleanupExpired).toHaveBeenCalledOnce();
  });

  it('should return 0 when no expired flows exist', async () => {
    const repos = createMockRepos(0);

    const result = await cleanupExpiredFlows(repos);

    expect(result).toBe(0);
  });

  it('should return 0 and not throw on error', async () => {
    const repos = createMockRepos(0);
    vi.mocked(repos.oauthPendingFlows.cleanupExpired).mockRejectedValue(
      new Error('DB connection failed')
    );

    const result = await cleanupExpiredFlows(repos);

    expect(result).toBe(0);
  });
});
