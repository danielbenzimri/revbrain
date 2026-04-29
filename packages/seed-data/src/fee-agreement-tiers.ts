import type { FeeAgreementTierEntity } from '@revbrain/contract';
import { MOCK_IDS } from './constants.ts';
import { daysAgo } from './helpers.ts';

/**
 * Default rate brackets: 800/500/300 bps at $500K/$2M/unlimited.
 * Applied to each agreement that has brackets set.
 */
function defaultBrackets(
  feeAgreementId: string,
  createdAt: Date
): readonly FeeAgreementTierEntity[] {
  return [
    {
      id: `${feeAgreementId}-tier-1`,
      feeAgreementId,
      bracketCeiling: 50000000, // $500K in cents
      rateBps: 800,
      sortOrder: 100,
      createdAt,
    },
    {
      id: `${feeAgreementId}-tier-2`,
      feeAgreementId,
      bracketCeiling: 200000000, // $2M in cents
      rateBps: 500,
      sortOrder: 200,
      createdAt,
    },
    {
      id: `${feeAgreementId}-tier-3`,
      feeAgreementId,
      bracketCeiling: null, // unlimited
      rateBps: 300,
      sortOrder: 300,
      createdAt,
    },
  ];
}

export const SEED_FEE_AGREEMENT_TIERS: readonly FeeAgreementTierEntity[] = [
  ...defaultBrackets(MOCK_IDS.FEE_AGREEMENT_DRAFT, daysAgo(2)),
  ...defaultBrackets(MOCK_IDS.FEE_AGREEMENT_ASSESSMENT, daysAgo(28)),
  ...defaultBrackets(MOCK_IDS.FEE_AGREEMENT_MIGRATION, daysAgo(65)),
  ...defaultBrackets(MOCK_IDS.FEE_AGREEMENT_COMPLETE, daysAgo(95)),
] as const;
