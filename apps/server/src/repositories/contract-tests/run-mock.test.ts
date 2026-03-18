/**
 * Run contract tests against mock repositories.
 * These tests run in all environments — no external dependencies.
 */
import { createMockRepositories, resetMockData } from '../mock/index.ts';
import { MOCK_IDS } from '../../mocks/constants.ts';
import { projectContractTests } from './project.contract.ts';
import { planContractTests } from './plan.contract.ts';
import { userContractTests } from './user.contract.ts';
import { organizationContractTests } from './organization.contract.ts';
import { auditLogContractTests } from './audit-log.contract.ts';

const repos = createMockRepositories();
const getRepos = () => repos;

projectContractTests(getRepos, resetMockData, MOCK_IDS.ORG_ACME, MOCK_IDS.USER_ACME_OWNER);
planContractTests(getRepos, resetMockData);
userContractTests(getRepos, resetMockData, MOCK_IDS.ORG_ACME);
organizationContractTests(getRepos, resetMockData);
auditLogContractTests(getRepos, resetMockData);
