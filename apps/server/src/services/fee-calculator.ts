/**
 * Fee Calculation Engine (SI Billing)
 *
 * Deterministic two-part fee computation. All math in integer cents + integer basis points.
 * No floating point anywhere. Pure functions with no side effects.
 *
 * Spec reference: SI-BILLING-SPEC.md §2
 */

export interface Bracket {
  /** Ceiling in cents. null = unlimited (final bracket). */
  ceiling: number | null;
  /** Rate in basis points (e.g. 800 = 8.00%). */
  rateBps: number;
}

export interface MigrationFeeResult {
  /** Raw fee from bracket calculation (before floor/cap). Cents. */
  rawTotalFee: number;
  /** Assessment credit applied (assessment fee or carried credit). Cents. */
  assessmentCredit: number;
  /** Total fee after floor and cap. Cents. */
  totalFee: number;
  /** Remaining fee after subtracting assessment credit. Cents. */
  remainingFee: number;
  /** Milestone amounts (empty if remainingFee == 0). Cents. */
  milestones: MilestoneAmount[];
  /** Per-bracket breakdown for display. */
  bracketBreakdown: BracketBreakdown[];
}

export interface MilestoneAmount {
  name: string;
  percentageBps: number;
  amount: number; // cents
}

export interface BracketBreakdown {
  ceiling: number | null;
  rateBps: number;
  bracketAmount: number; // cents applied to this bracket
  feeAmount: number; // cents of fee from this bracket
}

/**
 * Default rate brackets per spec §2.
 * $500K at 8%, $500K-$2M at 5%, above $2M at 3%.
 */
export function generateDefaultBrackets(): Bracket[] {
  return [
    { ceiling: 50_000_000, rateBps: 800 }, // $500K at 8%
    { ceiling: 200_000_000, rateBps: 500 }, // $2M at 5%
    { ceiling: null, rateBps: 300 }, // unlimited at 3%
  ];
}

/**
 * Validate that cap amount is >= assessment credit.
 * Returns false if cap is set and less than the credit.
 */
export function validateCapAmount(
  capAmount: number | null | undefined,
  assessmentCredit: number
): boolean {
  if (capAmount == null) return true;
  return capAmount >= assessmentCredit;
}

/**
 * Compute the raw fee from tiered brackets using integer arithmetic.
 * No floating point — uses integer division with bps.
 */
function computeRawFee(
  declaredValue: number,
  brackets: Bracket[]
): { rawFee: number; breakdown: BracketBreakdown[] } {
  let remaining = declaredValue;
  let rawFee = 0;
  const breakdown: BracketBreakdown[] = [];
  let prevCeiling = 0;

  for (const bracket of brackets) {
    if (remaining <= 0) break;

    const bracketSize = bracket.ceiling !== null ? bracket.ceiling - prevCeiling : remaining;
    const bracketAmount = Math.min(remaining, bracketSize);

    // Integer math: (amount * bps) / 10000
    // Since amount and bps are both integers, this is safe.
    // We do NOT round here — rounding happens at the total_fee level.
    const feeAmount = Math.floor((bracketAmount * bracket.rateBps) / 10_000);

    rawFee += feeAmount;
    breakdown.push({
      ceiling: bracket.ceiling,
      rateBps: bracket.rateBps,
      bracketAmount,
      feeAmount,
    });

    remaining -= bracketAmount;
    prevCeiling = bracket.ceiling ?? prevCeiling + bracketAmount;
  }

  return { rawFee, breakdown };
}

/**
 * Split remaining fee across milestones at 35/35/30 ratio.
 * Last milestone absorbs rounding remainder.
 */
export function splitMilestones(
  remainingFee: number,
  ratios: { name: string; bps: number }[] = [
    { name: 'Migration kickoff', bps: 3500 },
    { name: 'Migration plan approved', bps: 3500 },
    { name: 'Go-live validated', bps: 3000 },
  ]
): MilestoneAmount[] {
  if (remainingFee <= 0) return [];

  const milestones: MilestoneAmount[] = [];
  let allocated = 0;

  for (let i = 0; i < ratios.length; i++) {
    const isLast = i === ratios.length - 1;
    let amount: number;

    if (isLast) {
      // Last milestone absorbs remainder (rounding correction)
      amount = remainingFee - allocated;
    } else {
      // Integer division: (remaining * bps) / 10000
      amount = Math.floor((remainingFee * ratios[i].bps) / 10_000);
    }

    milestones.push({
      name: ratios[i].name,
      percentageBps: ratios[i].bps,
      amount,
    });
    allocated += amount;
  }

  return milestones;
}

/**
 * Full migration fee calculation following the 8-step deterministic sequence.
 *
 * Steps (from spec §2):
 * 1. raw_total_fee = tiered bracket calculation
 * 2. assessment_credit = COALESCE(M1.amount, carried_credit_amount, 0)
 * 3. total_fee = max(raw_total_fee, assessment_credit) — assessment IS the floor
 * 4. total_fee = min(total_fee, cap_amount) if cap exists
 * 5. Round total_fee UP to nearest whole cent
 * 6. remaining_fee = max(total_fee - assessment_credit, 0)
 * 7. Generate milestones if remaining > 0
 * 8. Last milestone absorbs rounding remainder
 */
export function calculateMigrationFee(input: {
  declaredValue: number;
  brackets: Bracket[];
  assessmentCredit: number;
  capAmount?: number | null;
}): MigrationFeeResult {
  const { declaredValue, brackets, assessmentCredit, capAmount } = input;

  // Step 1: Compute raw fee from brackets
  const { rawFee, breakdown } = computeRawFee(declaredValue, brackets);

  // Step 2: Assessment credit (already provided as input)
  // Step 3: Floor — assessment credit IS the floor
  let totalFee = Math.max(rawFee, assessmentCredit);

  // Step 4: Apply cap if exists
  if (capAmount != null && capAmount > 0) {
    totalFee = Math.min(totalFee, capAmount);
  }

  // Step 5: Round UP to nearest whole cent (already integers, but ensure no sub-cent)
  totalFee = Math.ceil(totalFee);

  // Step 6: Remaining fee
  const remainingFee = Math.max(totalFee - assessmentCredit, 0);

  // Steps 7-8: Generate milestones (35/35/30 split, last absorbs remainder)
  const milestones = splitMilestones(remainingFee);

  return {
    rawTotalFee: rawFee,
    assessmentCredit,
    totalFee,
    remainingFee,
    milestones,
    bracketBreakdown: breakdown,
  };
}
