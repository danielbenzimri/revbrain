/**
 * @revbrain/seed-data
 *
 * Shared curated fixture data for RevBrain.
 * Used by:
 * - apps/server/src/mocks/ (in-memory mock stores)
 * - packages/database/src/seeders/ (DB seeding)
 * - tests (referential integrity, E2E fixtures)
 *
 * Single source of truth for all curated test data.
 */

// Constants (deterministic IDs)
export { MOCK_IDS } from './constants.ts';

// Helpers
export { daysAgo, hoursAgo, cloneArray } from './helpers.ts';

// Seed data arrays
export { SEED_PLANS } from './plans.ts';
export { SEED_ORGANIZATIONS } from './organizations.ts';
export { SEED_USERS } from './users.ts';
export { SEED_PROJECTS } from './projects.ts';
export { SEED_AUDIT_LOGS } from './audit-logs.ts';
export { SEED_TICKETS, SEED_TICKET_MESSAGES } from './support-tickets.ts';
export type { SeedTicket, SeedTicketMessage } from './support-tickets.ts';
export { SEED_COUPONS } from './coupons.ts';
export type { SeedCoupon } from './coupons.ts';
export { SEED_TENANT_OVERRIDES } from './tenant-overrides.ts';
export type { SeedTenantOverride } from './tenant-overrides.ts';
export { SEED_ASSESSMENT_RUNS } from './assessment-runs.ts';
export { SEED_ASSESSMENT_FINDINGS } from './assessment-findings.ts';
export {
  SEED_SALESFORCE_CONNECTIONS,
  SEED_SALESFORCE_CONNECTION_SECRETS,
} from './salesforce-connections.ts';

// SI Billing seed data
export { SEED_PARTNER_PROFILES } from './partner-profiles.ts';
export { SEED_FEE_AGREEMENTS } from './fee-agreements.ts';
export { SEED_FEE_AGREEMENT_TIERS } from './fee-agreement-tiers.ts';
export { SEED_FEE_MILESTONES } from './fee-milestones.ts';
