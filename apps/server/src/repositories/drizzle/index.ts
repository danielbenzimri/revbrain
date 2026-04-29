/**
 * Drizzle Repository Engine
 *
 * Provides repository implementations using Drizzle ORM with direct TCP connection.
 * Best for: Complex queries, transactions, local development, Node.js environments.
 */

import type { Repositories } from '@revbrain/contract';
import { db as defaultDb } from '@revbrain/database/client';
import type { DrizzleDB } from '@revbrain/database';
import { DrizzleUserRepository } from './user.repository.ts';
import { DrizzleOrganizationRepository } from './organization.repository.ts';
import { DrizzlePlanRepository } from './plan.repository.ts';
import { DrizzleAuditLogRepository } from './audit-log.repository.ts';
import { DrizzleProjectRepository } from './project.repository.ts';
import { DrizzleSalesforceConnectionRepository } from './salesforce-connection.repository.ts';
import { DrizzleSalesforceConnectionSecretsRepository } from './salesforce-connection-secrets.repository.ts';
import { DrizzleOauthPendingFlowRepository } from './oauth-pending-flow.repository.ts';
import { DrizzleSalesforceConnectionLogRepository } from './salesforce-connection-log.repository.ts';
import { DrizzleAssessmentRepository } from './assessment.repository.ts';
import { DrizzleAssessmentIRRepository } from './assessment-ir.repository.ts';
// SI Billing: using mock repos as temporary stubs until P2.6 implements drizzle versions
import { MockPartnerProfileRepository } from '../mock/partner-profile.repository.ts';
import { MockFeeAgreementRepository } from '../mock/fee-agreement.repository.ts';
import { MockFeeAgreementTierRepository } from '../mock/fee-agreement-tier.repository.ts';
import { MockFeeMilestoneRepository } from '../mock/fee-milestone.repository.ts';
export type { DrizzleDB } from '@revbrain/database';

// Re-export individual repositories
export { DrizzleUserRepository } from './user.repository.ts';
export { DrizzleOrganizationRepository } from './organization.repository.ts';
export { DrizzlePlanRepository } from './plan.repository.ts';
export { DrizzleAuditLogRepository } from './audit-log.repository.ts';
export { DrizzleProjectRepository } from './project.repository.ts';
export { DrizzleSalesforceConnectionRepository } from './salesforce-connection.repository.ts';
export { DrizzleSalesforceConnectionSecretsRepository } from './salesforce-connection-secrets.repository.ts';
export { DrizzleOauthPendingFlowRepository } from './oauth-pending-flow.repository.ts';
export { DrizzleSalesforceConnectionLogRepository } from './salesforce-connection-log.repository.ts';
export { DrizzleAssessmentRepository } from './assessment.repository.ts';
export { DrizzleAssessmentIRRepository } from './assessment-ir.repository.ts';

/**
 * Create all Drizzle repositories.
 *
 * Accepts an optional db/transaction instance. When omitted, uses the
 * default singleton connection. Pass a transaction to scope all
 * repository operations within that transaction.
 */
export function createDrizzleRepositories(dbOrTx?: DrizzleDB): Repositories {
  const instance = dbOrTx ?? defaultDb;
  return {
    users: new DrizzleUserRepository(instance),
    organizations: new DrizzleOrganizationRepository(instance),
    plans: new DrizzlePlanRepository(instance),
    auditLogs: new DrizzleAuditLogRepository(instance),
    projects: new DrizzleProjectRepository(instance),
    salesforceConnections: new DrizzleSalesforceConnectionRepository(instance),
    salesforceConnectionSecrets: new DrizzleSalesforceConnectionSecretsRepository(instance),
    oauthPendingFlows: new DrizzleOauthPendingFlowRepository(instance),
    salesforceConnectionLogs: new DrizzleSalesforceConnectionLogRepository(instance),
    assessmentRuns: new DrizzleAssessmentRepository(instance),
    assessmentIRGraphs: new DrizzleAssessmentIRRepository(instance),
    // SI Billing: mock stubs until P2.6 implements drizzle versions
    partnerProfiles: new MockPartnerProfileRepository(),
    feeAgreements: new MockFeeAgreementRepository(),
    feeAgreementTiers: new MockFeeAgreementTierRepository(),
    feeMilestones: new MockFeeMilestoneRepository(),
  };
}

/**
 * Run a callback with all repositories scoped to a single DB transaction.
 *
 * All operations inside the callback share the same transaction.
 * If the callback throws, the transaction is rolled back automatically.
 */
/**
 * Drizzle-specific transaction implementation.
 * Called by repositories/with-transaction.ts in real mode.
 */
export async function drizzleWithTransaction<T>(
  callback: (repos: Repositories) => Promise<T>
): Promise<T> {
  return defaultDb.transaction(async (tx) => {
    const txRepos = createDrizzleRepositories(tx as unknown as DrizzleDB);
    return callback(txRepos);
  });
}

// Backward-compatible alias — prefer importing from repositories/with-transaction.ts
export const withTransaction = drizzleWithTransaction;
