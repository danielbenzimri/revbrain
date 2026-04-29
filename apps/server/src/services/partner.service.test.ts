import { describe, it, expect } from 'vitest';
import {
  calculateTier,
  getEffectiveTier,
  shouldPromote,
  recalculatePromotion,
  validateOverride,
} from './partner.service.ts';
import type { PartnerProfileEntity } from '@revbrain/contract';

function makeProfile(overrides: Partial<PartnerProfileEntity> = {}): PartnerProfileEntity {
  return {
    id: 'pp-1',
    organizationId: 'org-1',
    tier: 'standard',
    cumulativeFeesPaid: 0,
    completedProjectCount: 0,
    tierOverride: null,
    tierOverrideReason: null,
    tierOverrideSetBy: null,
    tierOverrideSetAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('Partner Tier Service', () => {
  describe('calculateTier', () => {
    it('$0 → Standard', () => {
      expect(calculateTier(0)).toBe('standard');
    });

    it('$249,999 → Standard (threshold not met)', () => {
      expect(calculateTier(24_999_900)).toBe('standard');
    });

    it('$250,000 → Silver', () => {
      expect(calculateTier(25_000_000)).toBe('silver');
    });

    it('$749,999 → Silver', () => {
      expect(calculateTier(74_999_900)).toBe('silver');
    });

    it('$750,000 → Gold', () => {
      expect(calculateTier(75_000_000)).toBe('gold');
    });

    it('$1,999,999 → Gold', () => {
      expect(calculateTier(199_999_900)).toBe('gold');
    });

    it('$2,000,000 → Platinum', () => {
      expect(calculateTier(200_000_000)).toBe('platinum');
    });

    it('$10,000,000 → Platinum', () => {
      expect(calculateTier(1_000_000_000)).toBe('platinum');
    });
  });

  describe('getEffectiveTier', () => {
    it('returns computed tier when no override', () => {
      const profile = makeProfile({ tier: 'gold', tierOverride: null });
      expect(getEffectiveTier(profile)).toBe('gold');
    });

    it('returns override tier when set', () => {
      const profile = makeProfile({ tier: 'standard', tierOverride: 'platinum' });
      expect(getEffectiveTier(profile)).toBe('platinum');
    });
  });

  describe('shouldPromote (ratchet)', () => {
    it('promotes standard → silver', () => {
      expect(shouldPromote('standard', 'silver')).toBe(true);
    });

    it('promotes silver → gold', () => {
      expect(shouldPromote('silver', 'gold')).toBe(true);
    });

    it('promotes gold → platinum', () => {
      expect(shouldPromote('gold', 'platinum')).toBe(true);
    });

    it('does NOT demote gold → silver', () => {
      expect(shouldPromote('gold', 'silver')).toBe(false);
    });

    it('does NOT demote platinum → gold', () => {
      expect(shouldPromote('platinum', 'gold')).toBe(false);
    });

    it('does NOT promote same tier', () => {
      expect(shouldPromote('gold', 'gold')).toBe(false);
    });
  });

  describe('recalculatePromotion', () => {
    it('promotes when fees cross threshold', () => {
      const result = recalculatePromotion('standard', 25_000_000); // $250K
      expect(result.promoted).toBe(true);
      expect(result.oldTier).toBe('standard');
      expect(result.newTier).toBe('silver');
    });

    it('does NOT demote (ratchet)', () => {
      // Gold partner with only $500K fees — would compute Silver, but ratchet keeps Gold
      const result = recalculatePromotion('gold', 50_000_000);
      expect(result.promoted).toBe(false);
      expect(result.oldTier).toBe('gold');
      expect(result.newTier).toBe('gold'); // ratcheted, not demoted to silver
    });

    it('stays same tier when no threshold crossed', () => {
      const result = recalculatePromotion('standard', 10_000_000); // $100K
      expect(result.promoted).toBe(false);
      expect(result.newTier).toBe('standard');
    });

    it('jumps multiple tiers', () => {
      const result = recalculatePromotion('standard', 200_000_000); // $2M → Platinum
      expect(result.promoted).toBe(true);
      expect(result.newTier).toBe('platinum');
    });
  });

  describe('validateOverride', () => {
    it('accepts valid tier with reason', () => {
      expect(validateOverride('gold', 'Strategic partnership')).toBeNull();
    });

    it('rejects invalid tier', () => {
      const error = validateOverride('diamond', 'test');
      expect(error).toContain('Invalid tier');
    });

    it('rejects missing reason', () => {
      expect(validateOverride('gold', null)).toContain('reason is required');
      expect(validateOverride('gold', '')).toContain('reason is required');
    });
  });
});
