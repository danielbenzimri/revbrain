/**
 * Reconciliation Service (SI Billing)
 *
 * Nightly reconciliation of denormalized partner data against source-of-truth tables.
 * Verifies cumulative_fees_paid and completed_project_count on partner_profiles.
 *
 * Spec reference: SI-BILLING-SPEC.md §9 (reconciliation section)
 *
 * Rules:
 * - Sums only milestones with paid_via = 'stripe_invoice' (excludes carried_credit)
 * - Drift ≤ $1 (100 cents): auto-correct + audit log
 * - Drift > $1: do NOT correct, alert admin, log drift amount
 */

import type {
  PartnerProfileRepository,
  FeeMilestoneRepository,
  FeeAgreementRepository,
  PartnerProfileEntity,
} from '@revbrain/contract';

// ============================================================================
// TYPES
// ============================================================================

export interface ReconciliationResult {
  partnerId: string;
  organizationId: string;
  /** Expected cumulative fees from source-of-truth milestones */
  expectedFeesPaid: number;
  /** Actual value stored on partner_profiles */
  actualFeesPaid: number;
  /** Drift in cents (absolute value) */
  driftCents: number;
  /** Whether auto-correction was applied */
  corrected: boolean;
  /** Expected completed project count */
  expectedProjectCount: number;
  /** Actual stored project count */
  actualProjectCount: number;
}

export interface ReconciliationSummary {
  totalPartners: number;
  partnersChecked: number;
  corrections: number;
  alerts: number;
  results: ReconciliationResult[];
}

/** Maximum drift (in cents) for auto-correction. Above this, alert admin. */
const AUTO_CORRECT_THRESHOLD_CENTS = 100; // $1.00

// ============================================================================
// SERVICE
// ============================================================================

export class ReconciliationService {
  constructor(
    private partnerProfileRepo: PartnerProfileRepository,
    private feeAgreementRepo: FeeAgreementRepository,
    private feeMilestoneRepo: FeeMilestoneRepository
  ) {}

  /**
   * Reconcile a single partner's denormalized data.
   */
  async reconcilePartner(profile: PartnerProfileEntity): Promise<ReconciliationResult> {
    // Get all agreements for this org
    const agreements = await this.feeAgreementRepo.findByOrgId(profile.organizationId);

    // Compute expected fees paid: sum of all milestones with status='paid' AND paid_via='stripe_invoice'
    let expectedFeesPaid = 0;
    let expectedProjectCount = 0;

    for (const agreement of agreements) {
      const milestones = await this.feeMilestoneRepo.findByAgreementId(agreement.id);

      for (const m of milestones) {
        if (m.status === 'paid' && m.paidVia === 'stripe_invoice') {
          expectedFeesPaid += m.amount;
        }
      }

      // Count completed agreements
      if (agreement.status === 'complete') {
        expectedProjectCount++;
      }
    }

    const driftCents = Math.abs(expectedFeesPaid - profile.cumulativeFeesPaid);
    const projectCountDrift = expectedProjectCount !== profile.completedProjectCount;
    let corrected = false;

    if (driftCents > 0 || projectCountDrift) {
      if (driftCents <= AUTO_CORRECT_THRESHOLD_CENTS) {
        // Auto-correct: drift is within $1 (rounding)
        await this.partnerProfileRepo.updateCumulativeFees(
          profile.id,
          expectedFeesPaid,
          expectedProjectCount
        );
        corrected = true;
      }
      // Drift > $1: do NOT auto-correct. Caller handles alert.
    }

    return {
      partnerId: profile.id,
      organizationId: profile.organizationId,
      expectedFeesPaid,
      actualFeesPaid: profile.cumulativeFeesPaid,
      driftCents,
      corrected,
      expectedProjectCount,
      actualProjectCount: profile.completedProjectCount,
    };
  }

  /**
   * Reconcile all partners.
   */
  async reconcileAll(): Promise<ReconciliationSummary> {
    const profiles = await this.partnerProfileRepo.findMany({ limit: 10000 });
    const results: ReconciliationResult[] = [];
    let corrections = 0;
    let alerts = 0;

    for (const profile of profiles) {
      const result = await this.reconcilePartner(profile);
      results.push(result);

      if (result.corrected) corrections++;
      if (result.driftCents > AUTO_CORRECT_THRESHOLD_CENTS) alerts++;
    }

    return {
      totalPartners: profiles.length,
      partnersChecked: profiles.length,
      corrections,
      alerts,
      results,
    };
  }
}
