/**
 * Mock Repository Engine
 *
 * In-memory implementations of all repository interfaces.
 * Used when USE_MOCK_DATA=true — no database needed.
 */
import type { Repositories } from '@revbrain/contract';
import { resetAllMockData } from '../../mocks/index.ts';
import { MockUserRepository } from './user.repository.ts';
import { MockOrganizationRepository } from './organization.repository.ts';
import { MockPlanRepository } from './plan.repository.ts';
import { MockAuditLogRepository } from './audit-log.repository.ts';
import { MockProjectRepository } from './project.repository.ts';

export { resetAllMockData as resetMockData } from '../../mocks/index.ts';

/**
 * Create all mock repositories.
 * Returns a Repositories instance backed by in-memory arrays.
 */
export function createMockRepositories(): Repositories {
  return {
    users: new MockUserRepository(),
    organizations: new MockOrganizationRepository(),
    plans: new MockPlanRepository(),
    auditLogs: new MockAuditLogRepository(),
    projects: new MockProjectRepository(),
  };
}

/**
 * Mock-aware transaction helper.
 * In mock mode: no isolation, just executes the callback directly.
 */
export async function mockWithTransaction<T>(
  callback: (repos: Repositories) => Promise<T>
): Promise<T> {
  return callback(createMockRepositories());
}
