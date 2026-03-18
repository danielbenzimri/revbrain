/**
 * Mode-aware Transaction Helper
 *
 * Routes transaction calls to mock or Drizzle based on environment.
 * Neither implementation knows about the other — switching happens here.
 *
 * In mock mode: executes callback directly with no isolation.
 * In real mode: wraps callback in a PostgreSQL transaction.
 */
import type { Repositories } from '@revbrain/contract';
import { isMockMode } from '../lib/mock-mode-guard.ts';

export async function withTransaction<T>(
  callback: (repos: Repositories) => Promise<T>
): Promise<T> {
  if (isMockMode(process.env)) {
    const { mockWithTransaction } = await import('./mock/index.ts');
    return mockWithTransaction(callback);
  }
  const { drizzleWithTransaction } = await import('./drizzle/index.ts');
  return drizzleWithTransaction(callback);
}
