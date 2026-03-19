/**
 * Mock Data Central Export
 *
 * Mutable stores initialized from immutable seed data.
 * resetAllMockData() restores everything to initial state.
 */
import type {
  PlanEntity,
  OrganizationEntity,
  UserEntity,
  AuditLogEntity,
  ProjectEntity,
} from '@revbrain/contract';
import { cloneArray } from './helpers.ts';
import { SEED_PLANS } from './plans.ts';
import { SEED_ORGANIZATIONS } from './organizations.ts';
import { SEED_USERS } from './users.ts';
import { SEED_PROJECTS } from './projects.ts';
import { SEED_AUDIT_LOGS } from './audit-logs.ts';
import {
  SEED_TICKETS,
  SEED_TICKET_MESSAGES,
  type SeedTicket,
  type SeedTicketMessage,
} from './support-tickets.ts';
import { SEED_COUPONS, type SeedCoupon } from './coupons.ts';
import { SEED_TENANT_OVERRIDES, type SeedTenantOverride } from './tenant-overrides.ts';

// Re-export constants and seeds for direct access
export { MOCK_IDS } from './constants.ts';
export { SEED_PLANS } from './plans.ts';
export { SEED_ORGANIZATIONS } from './organizations.ts';
export { SEED_USERS } from './users.ts';
export { SEED_PROJECTS } from './projects.ts';
export { SEED_AUDIT_LOGS } from './audit-logs.ts';
export { SEED_TICKETS, SEED_TICKET_MESSAGES } from './support-tickets.ts';
export { SEED_COUPONS } from './coupons.ts';
export { SEED_TENANT_OVERRIDES } from './tenant-overrides.ts';

// Re-export types for repository use
export type { SeedTicket, SeedTicketMessage } from './support-tickets.ts';
export type { SeedCoupon } from './coupons.ts';
export type { SeedTenantOverride } from './tenant-overrides.ts';

// Mutable stores — these are what mock repositories read/write
export let mockPlans: PlanEntity[] = cloneArray(SEED_PLANS);
export let mockOrganizations: OrganizationEntity[] = cloneArray(SEED_ORGANIZATIONS);
export let mockUsers: UserEntity[] = cloneArray(SEED_USERS);
export let mockProjects: ProjectEntity[] = cloneArray(SEED_PROJECTS);
export let mockAuditLogs: AuditLogEntity[] = cloneArray(SEED_AUDIT_LOGS);
export let mockTickets: SeedTicket[] = cloneArray(SEED_TICKETS);
export let mockTicketMessages: SeedTicketMessage[] = cloneArray(SEED_TICKET_MESSAGES);
export let mockCoupons: SeedCoupon[] = cloneArray(SEED_COUPONS);
export let mockTenantOverrides: SeedTenantOverride[] = cloneArray(SEED_TENANT_OVERRIDES);

/**
 * Reset all mutable stores to their initial seed state.
 * Uses structuredClone to prevent mutation leakage.
 */
export function resetAllMockData(): void {
  mockPlans = cloneArray(SEED_PLANS);
  mockOrganizations = cloneArray(SEED_ORGANIZATIONS);
  mockUsers = cloneArray(SEED_USERS);
  mockProjects = cloneArray(SEED_PROJECTS);
  mockAuditLogs = cloneArray(SEED_AUDIT_LOGS);
  mockTickets = cloneArray(SEED_TICKETS);
  mockTicketMessages = cloneArray(SEED_TICKET_MESSAGES);
  mockCoupons = cloneArray(SEED_COUPONS);
  mockTenantOverrides = cloneArray(SEED_TENANT_OVERRIDES);
}
