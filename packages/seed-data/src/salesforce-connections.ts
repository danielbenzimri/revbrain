/**
 * Salesforce Connection Seed Data
 *
 * One source connection for the Q1 Migration project at Acme org.
 * Secrets are plaintext in mock mode (no encryption).
 */
import type {
  SalesforceConnectionEntity,
  SalesforceConnectionSecretsEntity,
} from '@revbrain/contract';
import { MOCK_IDS } from './constants.ts';
import { daysAgo, hoursAgo } from './helpers.ts';

export const SEED_SALESFORCE_CONNECTIONS: readonly SalesforceConnectionEntity[] = [
  {
    id: MOCK_IDS.SF_CONNECTION_ACME_SOURCE,
    projectId: MOCK_IDS.PROJECT_Q1_MIGRATION,
    organizationId: MOCK_IDS.ORG_ACME,
    connectionRole: 'source',
    salesforceOrgId: '00D5g00000MOCK01',
    salesforceInstanceUrl: 'https://acme-mock.my.salesforce.com',
    customLoginUrl: null,
    oauthBaseUrl: 'https://login.salesforce.com',
    salesforceUserId: '0055g00000MOCK01',
    salesforceUsername: 'admin@acme-mock.com',
    instanceType: 'production',
    apiVersion: 'v66.0',
    connectionMetadata: {
      cpqInstalled: true,
      cpqVersion: '242.1',
      rcaAvailable: false,
      apiVersion: 'v66.0',
      dailyApiLimit: 100000,
      dailyApiRemaining: 98500,
      sfEdition: 'Enterprise',
      authorizingUserProfile: 'System Administrator',
      missingPermissions: [],
    },
    status: 'active',
    lastUsedAt: hoursAgo(1),
    lastSuccessfulApiCallAt: hoursAgo(1),
    lastError: null,
    lastErrorAt: null,
    connectedBy: MOCK_IDS.USER_ACME_OWNER,
    disconnectedBy: null,
    disconnectedAt: null,
    createdAt: daysAgo(7),
    updatedAt: hoursAgo(1),
  },
] as const;

// Secrets are plaintext in mock mode (no encryption)
export const SEED_SALESFORCE_CONNECTION_SECRETS: readonly SalesforceConnectionSecretsEntity[] = [
  {
    id: MOCK_IDS.SF_CONNECTION_SECRET_ACME,
    connectionId: MOCK_IDS.SF_CONNECTION_ACME_SOURCE,
    accessToken: 'mock-access-token-00D5g00000MOCK01',
    refreshToken: 'mock-refresh-token-5Aep861mock',
    encryptionKeyVersion: 1,
    tokenVersion: 1,
    tokenIssuedAt: hoursAgo(1),
    tokenScopes: 'api refresh_token id',
    lastRefreshAt: hoursAgo(1),
    createdAt: daysAgo(7),
    updatedAt: hoursAgo(1),
  },
] as const;
