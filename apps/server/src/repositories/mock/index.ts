/**
 * Mock Repository Engine
 *
 * In-memory implementations of all repository interfaces.
 * Used when USE_MOCK_DATA=true — no database needed.
 */
import type { Repositories } from '@revbrain/contract';
import { MockUserRepository } from './user.repository.ts';
import { MockOrganizationRepository } from './organization.repository.ts';
import { MockPlanRepository } from './plan.repository.ts';
import { MockAuditLogRepository } from './audit-log.repository.ts';
import { MockProjectRepository } from './project.repository.ts';
import { MockTicketRepository } from './ticket.repository.ts';
import { MockCouponRepository } from './coupon.repository.ts';
import { MockOverrideRepository } from './override.repository.ts';
import {
  StubSalesforceConnectionRepository,
  StubSalesforceConnectionSecretsRepository,
  StubOauthPendingFlowRepository,
  StubSalesforceConnectionLogRepository,
} from '../salesforce-stubs.ts';

export { resetAllMockData as resetMockData } from '../../mocks/index.ts';
export { MockTicketRepository } from './ticket.repository.ts';
export { MockCouponRepository } from './coupon.repository.ts';
export { MockOverrideRepository } from './override.repository.ts';

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
    // Salesforce repos — stubs replaced by real implementations in Task 1.7
    salesforceConnections: new StubSalesforceConnectionRepository(),
    salesforceConnectionSecrets: new StubSalesforceConnectionSecretsRepository(),
    oauthPendingFlows: new StubOauthPendingFlowRepository(),
    salesforceConnectionLogs: new StubSalesforceConnectionLogRepository(),
  };
}

/**
 * Create ticket and coupon mock repositories.
 * These are not part of the core Repositories interface (yet)
 * but are used by admin service routes in mock mode.
 */
export function createMockAdminRepositories() {
  return {
    tickets: new MockTicketRepository(),
    coupons: new MockCouponRepository(),
    overrides: new MockOverrideRepository(),
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
