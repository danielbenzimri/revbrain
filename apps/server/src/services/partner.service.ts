/**
 * Partner Tier Service (SI Billing)
 *
 * Tier calculation, ratchet mechanism, and manual override logic.
 * Uses repository interface — no direct DB access.
 *
 * Spec reference: SI-BILLING-SPEC.md §6
 *
 * Tier thresholds (cumulative fees paid, stripe_invoice only):
 *   Standard: $0+
 *   Silver:   $250K+  (25_000_000 cents)
 *   Gold:     $750K+  (75_000_000 cents)
 *   Platinum: $2M+    (200_000_000 cents)
 */

import type { PartnerProfileEntity } from '@revbrain/contract';

// ============================================================================
// TYPES
// ============================================================================

export type PartnerTier = 'standard' | 'silver' | 'gold' | 'platinum';

export interface TierThreshold {
  tier: PartnerTier;
  minCents: number;
}

export interface PromotionResult {
  promoted: boolean;
  oldTier: PartnerTier;
  newTier: PartnerTier;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TIER_THRESHOLDS: TierThreshold[] = [
  { tier: 'platinum', minCents: 200_000_000 }, // $2M
  { tier: 'gold', minCents: 75_000_000 }, // $750K
  { tier: 'silver', minCents: 25_000_000 }, // $250K
  { tier: 'standard', minCents: 0 },
];

const TIER_ORDER: Record<PartnerTier, number> = {
  standard: 0,
  silver: 1,
  gold: 2,
  platinum: 3,
};

// ============================================================================
// PURE FUNCTIONS
// ============================================================================

/**
 * Calculate the tier for a given cumulative fees paid amount.
 * Pure function — no side effects.
 */
export function calculateTier(cumulativeFeesPaidCents: number): PartnerTier {
  for (const threshold of TIER_THRESHOLDS) {
    if (cumulativeFeesPaidCents >= threshold.minCents) {
      return threshold.tier;
    }
  }
  return 'standard';
}

/**
 * Get the effective tier for a partner profile.
 * Effective tier = tier_override ?? computed tier.
 */
export function getEffectiveTier(profile: PartnerProfileEntity): PartnerTier {
  if (profile.tierOverride) {
    return profile.tierOverride as PartnerTier;
  }
  return profile.tier as PartnerTier;
}

/**
 * Check if a promotion should happen (ratchet: only goes up).
 * Returns true if newTier > currentTier.
 */
export function shouldPromote(currentTier: PartnerTier, newTier: PartnerTier): boolean {
  return TIER_ORDER[newTier] > TIER_ORDER[currentTier];
}

/**
 * Determine if recalculation would promote the partner.
 * Respects ratchet mechanism (never auto-demotes).
 * Does NOT apply override — override is checked separately by getEffectiveTier.
 */
export function recalculatePromotion(
  currentTier: PartnerTier,
  cumulativeFeesPaidCents: number
): PromotionResult {
  const newTier = calculateTier(cumulativeFeesPaidCents);

  if (shouldPromote(currentTier, newTier)) {
    return { promoted: true, oldTier: currentTier, newTier };
  }

  // Ratchet: keep current tier even if fees don't match
  return { promoted: false, oldTier: currentTier, newTier: currentTier };
}

/**
 * Validate a tier override.
 * Returns null if valid, error message if invalid.
 */
export function validateOverride(tier: string, reason: string | null | undefined): string | null {
  if (!Object.prototype.hasOwnProperty.call(TIER_ORDER, tier)) {
    return `Invalid tier: ${tier}. Must be one of: ${Object.keys(TIER_ORDER).join(', ')}`;
  }
  if (!reason) {
    return 'Override reason is required';
  }
  return null;
}
