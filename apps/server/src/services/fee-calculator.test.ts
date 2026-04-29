import { describe, it, expect } from 'vitest';
import {
  calculateMigrationFee,
  generateDefaultBrackets,
  validateCapAmount,
  splitMilestones,
  type Bracket,
} from './fee-calculator.ts';

describe('Fee Calculator', () => {
  const defaultBrackets = generateDefaultBrackets();
  const defaultAssessment = 1_500_000; // $15,000

  describe('generateDefaultBrackets', () => {
    it('returns 3 brackets: 800/500/300 bps', () => {
      const brackets = generateDefaultBrackets();
      expect(brackets).toHaveLength(3);
      expect(brackets[0]).toEqual({ ceiling: 50_000_000, rateBps: 800 });
      expect(brackets[1]).toEqual({ ceiling: 200_000_000, rateBps: 500 });
      expect(brackets[2]).toEqual({ ceiling: null, rateBps: 300 });
    });
  });

  describe('validateCapAmount', () => {
    it('accepts null cap', () => {
      expect(validateCapAmount(null, defaultAssessment)).toBe(true);
    });

    it('accepts undefined cap', () => {
      expect(validateCapAmount(undefined, defaultAssessment)).toBe(true);
    });

    it('accepts cap >= assessment', () => {
      expect(validateCapAmount(1_500_000, 1_500_000)).toBe(true);
      expect(validateCapAmount(2_000_000, 1_500_000)).toBe(true);
    });

    it('rejects cap < assessment', () => {
      expect(validateCapAmount(1_000_000, 1_500_000)).toBe(false);
      expect(validateCapAmount(1, 1_500_000)).toBe(false);
    });
  });

  describe('splitMilestones', () => {
    it('splits $130,000 at 35/35/30', () => {
      const milestones = splitMilestones(13_000_000);
      expect(milestones).toHaveLength(3);
      expect(milestones[0].amount).toBe(4_550_000); // 35%
      expect(milestones[1].amount).toBe(4_550_000); // 35%
      expect(milestones[2].amount).toBe(3_900_000); // 30% (absorbs remainder)
      // Sum must equal input
      expect(milestones.reduce((s, m) => s + m.amount, 0)).toBe(13_000_000);
    });

    it('returns empty array for 0 remaining', () => {
      expect(splitMilestones(0)).toHaveLength(0);
    });

    it('returns empty array for negative remaining', () => {
      expect(splitMilestones(-100)).toHaveLength(0);
    });

    it('last milestone absorbs rounding remainder', () => {
      // Amount that doesn't divide evenly
      const milestones = splitMilestones(10_000_001);
      const sum = milestones.reduce((s, m) => s + m.amount, 0);
      expect(sum).toBe(10_000_001);
    });

    it('milestone names and percentages are correct', () => {
      const milestones = splitMilestones(10_000_000);
      expect(milestones[0].name).toBe('Migration kickoff');
      expect(milestones[0].percentageBps).toBe(3500);
      expect(milestones[1].name).toBe('Migration plan approved');
      expect(milestones[1].percentageBps).toBe(3500);
      expect(milestones[2].name).toBe('Go-live validated');
      expect(milestones[2].percentageBps).toBe(3000);
    });
  });

  describe('calculateMigrationFee', () => {
    it('$3M project → $145K total, $130K remaining', () => {
      const result = calculateMigrationFee({
        declaredValue: 300_000_000,
        brackets: defaultBrackets,
        assessmentCredit: defaultAssessment,
      });

      // $500K*8% + $1.5M*5% + $1M*3% = $40K + $75K + $30K = $145K
      expect(result.totalFee).toBe(14_500_000);
      expect(result.remainingFee).toBe(13_000_000);
      expect(result.milestones).toHaveLength(3);
      expect(result.milestones[0].amount).toBe(4_550_000);
      expect(result.milestones[1].amount).toBe(4_550_000);
      expect(result.milestones[2].amount).toBe(3_900_000);
    });

    it('$100K project → remaining $0, no milestones (floor kicks in)', () => {
      const result = calculateMigrationFee({
        declaredValue: 10_000_000, // $100K
        brackets: defaultBrackets,
        assessmentCredit: defaultAssessment,
      });

      // Raw: $100K * 8% = $8K. Floor = $15K assessment. Total = $15K.
      expect(result.rawTotalFee).toBe(800_000); // $8K
      expect(result.totalFee).toBe(defaultAssessment); // Floor applies
      expect(result.remainingFee).toBe(0);
      expect(result.milestones).toHaveLength(0);
    });

    it('$500K project → $40K total, $25K remaining', () => {
      const result = calculateMigrationFee({
        declaredValue: 50_000_000, // $500K
        brackets: defaultBrackets,
        assessmentCredit: defaultAssessment,
      });

      // $500K * 8% = $40K
      expect(result.totalFee).toBe(4_000_000);
      expect(result.remainingFee).toBe(4_000_000 - defaultAssessment); // $25K
      expect(result.milestones).toHaveLength(3);
      // Milestones sum = remaining
      const sum = result.milestones.reduce((s, m) => s + m.amount, 0);
      expect(sum).toBe(result.remainingFee);
    });

    it('cap $100K on $3M project → remaining $85K', () => {
      const result = calculateMigrationFee({
        declaredValue: 300_000_000,
        brackets: defaultBrackets,
        assessmentCredit: defaultAssessment,
        capAmount: 10_000_000, // $100K cap
      });

      expect(result.totalFee).toBe(10_000_000); // Capped
      expect(result.remainingFee).toBe(10_000_000 - defaultAssessment); // $85K
      expect(result.milestones).toHaveLength(3);
      const sum = result.milestones.reduce((s, m) => s + m.amount, 0);
      expect(sum).toBe(result.remainingFee);
    });

    it('uses carried credit as assessment credit', () => {
      const result = calculateMigrationFee({
        declaredValue: 300_000_000,
        brackets: defaultBrackets,
        assessmentCredit: 1_500_000, // carried credit same as assessment
      });

      expect(result.assessmentCredit).toBe(1_500_000);
      expect(result.remainingFee).toBe(result.totalFee - 1_500_000);
    });

    it('zero declared value → floor applies, remaining 0', () => {
      const result = calculateMigrationFee({
        declaredValue: 0,
        brackets: defaultBrackets,
        assessmentCredit: defaultAssessment,
      });

      expect(result.rawTotalFee).toBe(0);
      expect(result.totalFee).toBe(defaultAssessment); // Floor
      expect(result.remainingFee).toBe(0);
      expect(result.milestones).toHaveLength(0);
    });

    it('custom brackets work correctly', () => {
      const customBrackets: Bracket[] = [
        { ceiling: 100_000_000, rateBps: 1000 }, // 10% up to $1M
        { ceiling: null, rateBps: 500 }, // 5% above
      ];

      const result = calculateMigrationFee({
        declaredValue: 200_000_000, // $2M
        brackets: customBrackets,
        assessmentCredit: defaultAssessment,
      });

      // $1M * 10% + $1M * 5% = $100K + $50K = $150K
      expect(result.rawTotalFee).toBe(15_000_000);
      expect(result.totalFee).toBe(15_000_000);
      expect(result.remainingFee).toBe(15_000_000 - defaultAssessment);
    });

    it('produces bracket breakdown for display', () => {
      const result = calculateMigrationFee({
        declaredValue: 300_000_000,
        brackets: defaultBrackets,
        assessmentCredit: defaultAssessment,
      });

      expect(result.bracketBreakdown).toHaveLength(3);
      expect(result.bracketBreakdown[0]).toEqual({
        ceiling: 50_000_000,
        rateBps: 800,
        bracketAmount: 50_000_000,
        feeAmount: 4_000_000,
      });
      expect(result.bracketBreakdown[1]).toEqual({
        ceiling: 200_000_000,
        rateBps: 500,
        bracketAmount: 150_000_000,
        feeAmount: 7_500_000,
      });
      expect(result.bracketBreakdown[2]).toEqual({
        ceiling: null,
        rateBps: 300,
        bracketAmount: 100_000_000,
        feeAmount: 3_000_000,
      });
    });

    it('no floating point in any calculation path', () => {
      // Test with values that could produce non-integer results with float math
      const result = calculateMigrationFee({
        declaredValue: 333_333_333, // $3,333,333.33
        brackets: defaultBrackets,
        assessmentCredit: defaultAssessment,
      });

      expect(Number.isInteger(result.rawTotalFee)).toBe(true);
      expect(Number.isInteger(result.totalFee)).toBe(true);
      expect(Number.isInteger(result.remainingFee)).toBe(true);
      for (const m of result.milestones) {
        expect(Number.isInteger(m.amount)).toBe(true);
      }
    });

    it('milestones always sum exactly to remaining fee (no rounding leak)', () => {
      // Test several values including boundary cases
      const testValues = [
        50_000_000, // exactly $500K (first bracket boundary)
        50_000_001, // $500K + 1 cent
        200_000_000, // exactly $2M (second bracket boundary)
        200_000_001, // $2M + 1 cent
        999_999_999, // large odd number
        18_750_001, // $187,500.01 — near the floor boundary
      ];

      for (const value of testValues) {
        const result = calculateMigrationFee({
          declaredValue: value,
          brackets: defaultBrackets,
          assessmentCredit: defaultAssessment,
        });

        if (result.remainingFee > 0) {
          const sum = result.milestones.reduce((s, m) => s + m.amount, 0);
          expect(sum).toBe(result.remainingFee);
        }
      }
    });

    it('total_fee >= assessment_credit always holds', () => {
      const testValues = [0, 1, 100_000, 10_000_000, 100_000_000, 500_000_000];
      for (const value of testValues) {
        const result = calculateMigrationFee({
          declaredValue: value,
          brackets: defaultBrackets,
          assessmentCredit: defaultAssessment,
        });
        expect(result.totalFee).toBeGreaterThanOrEqual(result.assessmentCredit);
      }
    });

    it('bracket boundary: $500K exactly uses first bracket only', () => {
      const result = calculateMigrationFee({
        declaredValue: 50_000_000,
        brackets: defaultBrackets,
        assessmentCredit: defaultAssessment,
      });

      expect(result.bracketBreakdown[0].bracketAmount).toBe(50_000_000);
      expect(result.bracketBreakdown[0].feeAmount).toBe(4_000_000);
      // Second bracket should have 0 applied
      if (result.bracketBreakdown.length > 1) {
        expect(result.bracketBreakdown[1].bracketAmount).toBe(0);
      }
    });
  });
});
