/**
 * Drizzle Repository Engine
 *
 * Provides repository implementations using Drizzle ORM with direct TCP connection.
 * Best for: Complex queries, transactions, local development, Node.js environments.
 */

import type { Repositories } from '@geometrix/contract';
import { db as defaultDb } from '@geometrix/database';
import type { DrizzleDB } from '@geometrix/database';
import { DrizzleUserRepository } from './user.repository.ts';
import { DrizzleOrganizationRepository } from './organization.repository.ts';
import { DrizzlePlanRepository } from './plan.repository.ts';
import { DrizzleAuditLogRepository } from './audit-log.repository.ts';
import { DrizzleProjectRepository } from './project.repository.ts';
import { DrizzleBOQRepository } from './boq.repository.ts';
import { DrizzleBillRepository } from './bill.repository.ts';
import { DrizzleBillItemRepository } from './bill-item.repository.ts';
import { DrizzleMeasurementRepository } from './measurement.repository.ts';
import { DrizzleWorkLogRepository } from './work-log.repository.ts';
import { DrizzleTaskRepository } from './task.repository.ts';
import { DrizzleTaskAuditLogRepository } from './task-audit-log.repository.ts';
export type { DrizzleDB } from '@geometrix/database';

// Re-export individual repositories
export { DrizzleUserRepository } from './user.repository.ts';
export { DrizzleOrganizationRepository } from './organization.repository.ts';
export { DrizzlePlanRepository } from './plan.repository.ts';
export { DrizzleAuditLogRepository } from './audit-log.repository.ts';
export { DrizzleProjectRepository } from './project.repository.ts';
export { DrizzleBOQRepository } from './boq.repository.ts';
export { DrizzleBillRepository } from './bill.repository.ts';
export { DrizzleBillItemRepository } from './bill-item.repository.ts';
export { DrizzleMeasurementRepository } from './measurement.repository.ts';
export { DrizzleWorkLogRepository } from './work-log.repository.ts';
export { DrizzleTaskRepository } from './task.repository.ts';
export { DrizzleTaskAuditLogRepository } from './task-audit-log.repository.ts';
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
    boq: new DrizzleBOQRepository(instance),
    bills: new DrizzleBillRepository(instance),
    billItems: new DrizzleBillItemRepository(instance),
    measurements: new DrizzleMeasurementRepository(instance),
    workLogs: new DrizzleWorkLogRepository(instance),
    tasks: new DrizzleTaskRepository(instance),
    taskAuditLogs: new DrizzleTaskAuditLogRepository(instance),
  };
}

/**
 * Run a callback with all repositories scoped to a single DB transaction.
 *
 * All operations inside the callback share the same transaction.
 * If the callback throws, the transaction is rolled back automatically.
 *
 * @example
 * const result = await withTransaction(async (txRepos) => {
 *   const user = await txRepos.users.create({...});
 *   const org = await txRepos.organizations.create({...});
 *   return { user, org };
 * });
 */
export async function withTransaction<T>(
  callback: (repos: Repositories) => Promise<T>
): Promise<T> {
  return defaultDb.transaction(async (tx) => {
    const txRepos = createDrizzleRepositories(tx as unknown as DrizzleDB);
    return callback(txRepos);
  });
}
