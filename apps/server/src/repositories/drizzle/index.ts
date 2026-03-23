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
import {
  StubSalesforceConnectionRepository,
  StubSalesforceConnectionSecretsRepository,
  StubOauthPendingFlowRepository,
  StubSalesforceConnectionLogRepository,
} from '../salesforce-stubs.ts';
export type { DrizzleDB } from '@revbrain/database';

// Re-export individual repositories
export { DrizzleUserRepository } from './user.repository.ts';
export { DrizzleOrganizationRepository } from './organization.repository.ts';
export { DrizzlePlanRepository } from './plan.repository.ts';
export { DrizzleAuditLogRepository } from './audit-log.repository.ts';
export { DrizzleProjectRepository } from './project.repository.ts';

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
    // Salesforce repos — stubs replaced by real implementations in Task 1.6
    salesforceConnections: new StubSalesforceConnectionRepository(),
    salesforceConnectionSecrets: new StubSalesforceConnectionSecretsRepository(),
    oauthPendingFlows: new StubOauthPendingFlowRepository(),
    salesforceConnectionLogs: new StubSalesforceConnectionLogRepository(),
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
