/**
 * Mock Data Central Export
 *
 * Mutable stores initialized from immutable seed data.
 * Seed data sourced from @revbrain/seed-data (shared package).
 * resetAllMockData() restores everything to initial state.
 */
import type {
  PlanEntity,
  OrganizationEntity,
  UserEntity,
  AuditLogEntity,
  ProjectEntity,
} from '@revbrain/contract';
import {
  MOCK_IDS as _MOCK_IDS,
  cloneArray,
  SEED_PLANS,
  SEED_ORGANIZATIONS,
  SEED_USERS,
  SEED_PROJECTS,
  SEED_AUDIT_LOGS,
  SEED_TICKETS,
  SEED_TICKET_MESSAGES,
  SEED_COUPONS,
  SEED_TENANT_OVERRIDES,
  type SeedTicket,
  type SeedTicketMessage,
  type SeedCoupon,
  type SeedTenantOverride,
} from '@revbrain/seed-data';

// Re-export everything from seed-data for backward compatibility
export { MOCK_IDS } from '@revbrain/seed-data';
export {
  SEED_PLANS,
  SEED_ORGANIZATIONS,
  SEED_USERS,
  SEED_PROJECTS,
  SEED_AUDIT_LOGS,
  SEED_TICKETS,
  SEED_TICKET_MESSAGES,
  SEED_COUPONS,
  SEED_TENANT_OVERRIDES,
} from '@revbrain/seed-data';
export type {
  SeedTicket,
  SeedTicketMessage,
  SeedCoupon,
  SeedTenantOverride,
} from '@revbrain/seed-data';

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
