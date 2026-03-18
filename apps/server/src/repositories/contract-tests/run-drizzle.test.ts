/**
 * Run contract tests against Drizzle repositories.
 * Only executes when TEST_DATABASE_URL is available.
 *
 * To run: TEST_DATABASE_URL=postgresql://... pnpm test
 */
import { describe, it } from 'vitest';

const hasDatabase = !!process.env.TEST_DATABASE_URL;

describe('Drizzle contract tests', () => {
  if (!hasDatabase) {
    it.skip('skipped — TEST_DATABASE_URL not set', () => {});
    return;
  }

  // TODO: When TEST_DATABASE_URL is available, import contract tests
  // and run against Drizzle repos:
  //
  // import { createDrizzleRepositories } from '../drizzle/index.ts';
  // import { projectContractTests } from './project.contract.ts';
  // ...
  // projectContractTests(() => createDrizzleRepositories(testDb), resetTestDb, ...);

  it.skip('placeholder — implement when TEST_DATABASE_URL is configured', () => {});
});
