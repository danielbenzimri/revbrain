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
export { MOCK_IDS } from './constants';

// Helpers
export { daysAgo, hoursAgo, cloneArray } from './helpers';

// Seed data arrays
export { SEED_PLANS } from './plans';
export { SEED_ORGANIZATIONS } from './organizations';
export { SEED_USERS } from './users';
export { SEED_PROJECTS } from './projects';
export { SEED_AUDIT_LOGS } from './audit-logs';
export { SEED_TICKETS, SEED_TICKET_MESSAGES } from './support-tickets';
export type { SeedTicket, SeedTicketMessage } from './support-tickets';
export { SEED_COUPONS } from './coupons';
export type { SeedCoupon } from './coupons';
export { SEED_TENANT_OVERRIDES } from './tenant-overrides';
export type { SeedTenantOverride } from './tenant-overrides';
