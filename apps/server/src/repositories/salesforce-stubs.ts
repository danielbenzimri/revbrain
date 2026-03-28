/**
 * Stub implementations for Salesforce repositories.
 *
 * These satisfy the Repositories interface during Phase 1 development.
 * Each stub throws on every method call — they exist only so the
 * codebase compiles while real implementations are being built.
 *
 * Replaced by real implementations in Tasks 1.6 (Drizzle) and 1.7 (Mock).
 */

import type {
  SalesforceConnectionRepository,
  SalesforceConnectionSecretsRepository,
  OauthPendingFlowRepository,
  SalesforceConnectionLogRepository,
  AssessmentRepository,
} from '@revbrain/contract';

const NOT_IMPLEMENTED = 'Salesforce repository not yet implemented — see Task 1.6/1.7';

function stub(): never {
  throw new Error(NOT_IMPLEMENTED);
}

export class StubSalesforceConnectionRepository implements SalesforceConnectionRepository {
  findById = stub;
  findByProjectAndRole = stub;
  findByProject = stub;
  findByOrganization = stub;
  findAllActive = stub;
  create = stub;
  updateStatus = stub;
  updateMetadata = stub;
  disconnect = stub;
  delete = stub;
}

export class StubSalesforceConnectionSecretsRepository implements SalesforceConnectionSecretsRepository {
  findByConnectionId = stub;
  create = stub;
  updateTokens = stub;
  deleteByConnectionId = stub;
}

export class StubOauthPendingFlowRepository implements OauthPendingFlowRepository {
  create = stub;
  findByNonce = stub;
  deleteByNonce = stub;
  upsertForProject = stub;
  findLiveByProjectAndRole = stub;
  cleanupExpired = stub;
}

export class StubSalesforceConnectionLogRepository implements SalesforceConnectionLogRepository {
  create = stub;
  findByConnection = stub;
}

export class StubAssessmentRepository implements AssessmentRepository {
  createRun = stub;
  findRunById = stub;
  findRunsByProject = stub;
  findActiveRunByOrg = stub;
  findLatestRunByProject = stub;
  updateRunStatus = stub;
  casDispatch = stub;
  findFindingsByRun = stub;
  countFindingsByRun = stub;
  countActiveRuns = stub;
  countActiveRunsByOrg = stub;
}
