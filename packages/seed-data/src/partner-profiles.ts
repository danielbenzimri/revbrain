import type { PartnerProfileEntity } from '@revbrain/contract';
import { MOCK_IDS } from './constants.ts';
import { daysAgo } from './helpers.ts';

export const SEED_PARTNER_PROFILES: readonly PartnerProfileEntity[] = [
  {
    id: MOCK_IDS.PARTNER_PROFILE_ACME,
    organizationId: MOCK_IDS.ORG_ACME,
    tier: 'gold',
    cumulativeFeesPaid: 84200000, // $842,000 in cents
    completedProjectCount: 7,
    tierOverride: null,
    tierOverrideReason: null,
    tierOverrideSetBy: null,
    tierOverrideSetAt: null,
    createdAt: daysAgo(180),
    updatedAt: daysAgo(5),
  },
  {
    id: MOCK_IDS.PARTNER_PROFILE_BETA,
    organizationId: MOCK_IDS.ORG_BETA,
    tier: 'standard',
    cumulativeFeesPaid: 1500000, // $15,000 in cents
    completedProjectCount: 0,
    tierOverride: null,
    tierOverrideReason: null,
    tierOverrideSetBy: null,
    tierOverrideSetAt: null,
    createdAt: daysAgo(30),
    updatedAt: daysAgo(30),
  },
] as const;
