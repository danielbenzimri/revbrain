import type { OrganizationEntity } from '@revbrain/contract';
import { MOCK_IDS } from './constants.ts';
import { daysAgo } from './helpers.ts';

export const SEED_ORGANIZATIONS: readonly OrganizationEntity[] = [
  {
    id: MOCK_IDS.ORG_ACME,
    name: 'Acme Corp',
    slug: 'acme-corp',
    type: 'business',
    orgType: 'si_partner',
    seatLimit: 25,
    seatUsed: 4, // pending user not counted
    storageUsedBytes: 1024 * 1024 * 150, // 150 MB
    planId: MOCK_IDS.PLAN_PRO,
    billingContactEmail: 'billing@acme-corp.com',
    isActive: true,
    createdAt: daysAgo(60),
    createdBy: MOCK_IDS.USER_SYSTEM_ADMIN,
  },
  {
    id: MOCK_IDS.ORG_BETA,
    name: 'Beta Industries',
    slug: 'beta-industries',
    type: 'business',
    orgType: 'si_partner',
    seatLimit: 5,
    seatUsed: 2,
    storageUsedBytes: 1024 * 1024 * 10, // 10 MB
    planId: MOCK_IDS.PLAN_STARTER,
    billingContactEmail: null,
    isActive: true,
    createdAt: daysAgo(30),
    createdBy: MOCK_IDS.USER_SYSTEM_ADMIN,
  },
] as const;
