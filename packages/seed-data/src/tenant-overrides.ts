/**
 * Seed Tenant Overrides
 *
 * 2 overrides in varied states: active grant, expired grant.
 */
import { MOCK_IDS } from './constants';
import { daysAgo } from './helpers';

export interface SeedTenantOverride {
  id: string;
  organizationId: string;
  feature: string; // e.g., 'data_validation', 'maxUsers'
  value: unknown; // true/false for modules, number for limits
  expiresAt: Date | null; // null = permanent
  grantedBy: string; // admin user ID
  reason: string; // mandatory
  revokedAt: Date | null; // null = active
  createdAt: Date;
}

export const SEED_TENANT_OVERRIDES: readonly SeedTenantOverride[] = [
  {
    id: MOCK_IDS.OVERRIDE_1,
    organizationId: MOCK_IDS.ORG_BETA,
    feature: 'data_validation',
    value: true,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    grantedBy: MOCK_IDS.USER_SYSTEM_ADMIN,
    reason: 'Trial access for evaluation',
    revokedAt: null,
    createdAt: daysAgo(2),
  },
  {
    id: MOCK_IDS.OVERRIDE_2,
    organizationId: MOCK_IDS.ORG_ACME,
    feature: 'advanced_reporting',
    value: true,
    expiresAt: daysAgo(5), // expired 5 days ago
    grantedBy: MOCK_IDS.USER_SYSTEM_ADMIN,
    reason: 'Temporary access for quarterly review',
    revokedAt: null,
    createdAt: daysAgo(35),
  },
] as const;
