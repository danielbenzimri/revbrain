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
import { MockSalesforceConnectionRepository } from './salesforce-connection.repository.ts';
import { MockSalesforceConnectionSecretsRepository } from './salesforce-connection-secrets.repository.ts';
import { MockOauthPendingFlowRepository } from './oauth-pending-flow.repository.ts';
import { MockSalesforceConnectionLogRepository } from './salesforce-connection-log.repository.ts';
import { MockAssessmentRepository } from './assessment.repository.ts';
import { MockAssessmentIRRepository } from './assessment-ir.repository.ts';
import { MockPartnerProfileRepository } from './partner-profile.repository.ts';
import { MockFeeAgreementRepository } from './fee-agreement.repository.ts';
import { MockFeeAgreementTierRepository } from './fee-agreement-tier.repository.ts';
import { MockFeeMilestoneRepository } from './fee-milestone.repository.ts';

export { resetAllMockData as resetMockData } from '../../mocks/index.ts';
export { MockTicketRepository } from './ticket.repository.ts';
export { MockCouponRepository } from './coupon.repository.ts';
export { MockOverrideRepository } from './override.repository.ts';
export { MockAssessmentRepository } from './assessment.repository.ts';

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
    salesforceConnections: new MockSalesforceConnectionRepository(),
    salesforceConnectionSecrets: new MockSalesforceConnectionSecretsRepository(),
    oauthPendingFlows: new MockOauthPendingFlowRepository(),
    salesforceConnectionLogs: new MockSalesforceConnectionLogRepository(),
    assessmentRuns: new MockAssessmentRepository(),
    assessmentIRGraphs: new MockAssessmentIRRepository(),
    // SI Billing
    partnerProfiles: new MockPartnerProfileRepository(),
    feeAgreements: new MockFeeAgreementRepository(),
    feeAgreementTiers: new MockFeeAgreementTierRepository(),
    feeMilestones: new MockFeeMilestoneRepository(),
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
