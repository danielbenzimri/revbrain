/**
 * Agreement State Machine (SI Billing)
 *
 * Pure functions — validates transitions and returns state updates.
 * NO I/O (no DB, no Stripe, no email). Route handlers do persistence.
 *
 * Spec reference: SI-BILLING-SPEC.md §7
 */

import type { FeeAgreementEntity, FeeMilestoneEntity } from '@revbrain/contract';
import { calculateMigrationFee, generateDefaultBrackets, type Bracket } from './fee-calculator.ts';

// ============================================================================
// TYPES
// ============================================================================

export type AgreementStatus =
  | 'draft'
  | 'active_assessment'
  | 'migration_pending_review'
  | 'active_migration'
  | 'complete'
  | 'assessment_complete'
  | 'cancelled'
  | 'archived';

export type AgreementTransition =
  | 'ACCEPT_ASSESSMENT'
  | 'VALIDATE_SUBMIT_VALUE'
  | 'COMPUTE_MIGRATION_TERMS'
  | 'APPROVE_MIGRATION'
  | 'REQUEST_REVISION'
  | 'ACCEPT_MIGRATION'
  | 'CLOSE_ASSESSMENT'
  | 'COMPLETE'
  | 'CANCEL'
  | 'CREATE_AMENDMENT';

export interface AcceptAssessmentPayload {
  acceptedBy: string;
  acceptedFromIp: string;
  assessmentTermsSnapshot: unknown;
  assessmentTermsSnapshotHash: string;
}

export interface SubmitValuePayload {
  declaredProjectValue: number;
  sowFileId: string;
  m1Status: string; // must be 'paid' or carried credit
  carriedCreditAmount?: number;
}

export interface ComputeTermsPayload {
  declaredProjectValue: number;
  brackets: Bracket[];
  assessmentCredit: number;
  capAmount?: number | null;
}

export interface AcceptMigrationPayload {
  migrationAcceptedBy: string;
  migrationAcceptedFromIp: string;
  migrationTermsSnapshot: unknown;
  migrationTermsSnapshotHash: string;
  declaredProjectValue: number;
  sowFileId: string;
  calculatedTotalFee: number;
  calculatedRemainingFee: number;
}

export interface CloseAssessmentPayload {
  assessmentCloseReason: string;
  assessmentCloseNotes?: string;
  valueAlreadySubmitted: boolean;
}

export interface CancelPayload {
  cancelledBy: string;
  cancellationReason: string;
}

export interface CompletePayload {
  allMilestonesPaid: boolean;
  hasZeroFee: boolean;
}

/** Partial update to apply to the agreement (route handler persists). */
export interface AgreementUpdate {
  status: AgreementStatus;
  [key: string]: unknown;
}

/** Computed terms returned for ≤$500K preview (not persisted). */
export interface ComputedTerms {
  totalFee: number;
  remainingFee: number;
  milestones: { name: string; percentageBps: number; amount: number }[];
  bracketBreakdown: {
    ceiling: number | null;
    rateBps: number;
    bracketAmount: number;
    feeAmount: number;
  }[];
}

export interface AmendmentInput {
  oldAgreement: FeeAgreementEntity;
  assessmentFeePaid: number;
}

export interface AmendmentResult {
  newAgreementData: Partial<FeeAgreementEntity>;
  m1Milestone: {
    name: string;
    phase: string;
    triggerType: string;
    amount: number;
    status: string;
    paidVia: string;
    paidAt: Date;
    sortOrder: number;
  };
}

export class AgreementTransitionError extends Error {
  constructor(
    public readonly from: string,
    public readonly event: string,
    message: string
  ) {
    super(message);
    this.name = 'AgreementTransitionError';
  }
}

// ============================================================================
// VALID TRANSITIONS MAP
// ============================================================================

const VALID_TRANSITIONS: Record<string, AgreementTransition[]> = {
  draft: ['ACCEPT_ASSESSMENT', 'CANCEL'],
  active_assessment: [
    'VALIDATE_SUBMIT_VALUE',
    'COMPUTE_MIGRATION_TERMS',
    'ACCEPT_MIGRATION',
    'CLOSE_ASSESSMENT',
    'CANCEL',
  ],
  migration_pending_review: ['APPROVE_MIGRATION', 'REQUEST_REVISION', 'CANCEL'],
  active_migration: ['COMPLETE', 'CANCEL'],
  complete: [],
  assessment_complete: [],
  cancelled: [],
  archived: [],
};

// Terminal statuses — no transitions allowed
const TERMINAL_STATUSES: AgreementStatus[] = [
  'complete',
  'assessment_complete',
  'cancelled',
  'archived',
];

// ============================================================================
// TRANSITION FUNCTION
// ============================================================================

/**
 * Validate and compute a state transition. Returns the update to apply.
 * Throws AgreementTransitionError if the transition is invalid.
 *
 * This function NEVER performs I/O.
 */
export function transition(
  agreement: FeeAgreementEntity,
  event: AgreementTransition,
  payload?: unknown
): AgreementUpdate | ComputedTerms {
  const status = agreement.status as AgreementStatus;

  // Check if transition is valid from current status
  const allowed = VALID_TRANSITIONS[status] ?? [];
  if (!allowed.includes(event)) {
    throw new AgreementTransitionError(
      status,
      event,
      `Cannot transition from '${status}' via '${event}'`
    );
  }

  switch (event) {
    case 'ACCEPT_ASSESSMENT':
      return handleAcceptAssessment(agreement, payload as AcceptAssessmentPayload);
    case 'VALIDATE_SUBMIT_VALUE':
      return handleValidateSubmitValue(agreement, payload as SubmitValuePayload);
    case 'COMPUTE_MIGRATION_TERMS':
      return handleComputeMigrationTerms(payload as ComputeTermsPayload);
    case 'APPROVE_MIGRATION':
      return handleApproveMigration(agreement);
    case 'REQUEST_REVISION':
      return handleRequestRevision(agreement);
    case 'ACCEPT_MIGRATION':
      return handleAcceptMigration(agreement, payload as AcceptMigrationPayload);
    case 'CLOSE_ASSESSMENT':
      return handleCloseAssessment(agreement, payload as CloseAssessmentPayload);
    case 'COMPLETE':
      return handleComplete(agreement, payload as CompletePayload);
    case 'CANCEL':
      return handleCancel(agreement, payload as CancelPayload);
    default:
      throw new AgreementTransitionError(status, event, `Unknown transition: ${event}`);
  }
}

// ============================================================================
// TRANSITION HANDLERS
// ============================================================================

function handleAcceptAssessment(
  agreement: FeeAgreementEntity,
  payload: AcceptAssessmentPayload
): AgreementUpdate {
  if (agreement.acceptedAt) {
    throw new AgreementTransitionError(
      agreement.status,
      'ACCEPT_ASSESSMENT',
      'Agreement already accepted'
    );
  }

  return {
    status: 'active_assessment',
    acceptedBy: payload.acceptedBy,
    acceptedAt: new Date(),
    acceptedFromIp: payload.acceptedFromIp,
    assessmentTermsSnapshot: payload.assessmentTermsSnapshot,
    assessmentTermsSnapshotHash: payload.assessmentTermsSnapshotHash,
  };
}

function handleValidateSubmitValue(
  agreement: FeeAgreementEntity,
  payload: SubmitValuePayload
): AgreementUpdate {
  // Precondition: M1 must be paid (or carried credit)
  if (
    payload.m1Status !== 'paid' &&
    !(payload.carriedCreditAmount && payload.carriedCreditAmount > 0)
  ) {
    throw new AgreementTransitionError(
      agreement.status,
      'VALIDATE_SUBMIT_VALUE',
      'M1 must be paid before submitting project value'
    );
  }

  if (payload.declaredProjectValue <= 0) {
    throw new AgreementTransitionError(
      agreement.status,
      'VALIDATE_SUBMIT_VALUE',
      'Declared project value must be positive'
    );
  }

  const LARGE_DEAL_THRESHOLD = 50_000_000; // $500K in cents

  if (payload.declaredProjectValue > LARGE_DEAL_THRESHOLD) {
    // >$500K: transition to migration_pending_review
    return {
      status: 'migration_pending_review',
      declaredProjectValue: payload.declaredProjectValue,
      sowFileId: payload.sowFileId,
    };
  }

  // ≤$500K: stay in active_assessment (Variant B is UI-only, not a DB state)
  // Route handler will compute terms and show to SI without persisting
  return {
    status: 'active_assessment', // no status change
    _isSmallDeal: true, // signal to route handler
  } as AgreementUpdate;
}

function handleComputeMigrationTerms(payload: ComputeTermsPayload): ComputedTerms {
  // Pure computation — no state change, no persistence
  const result = calculateMigrationFee({
    declaredValue: payload.declaredProjectValue,
    brackets: payload.brackets,
    assessmentCredit: payload.assessmentCredit,
    capAmount: payload.capAmount,
  });

  return {
    totalFee: result.totalFee,
    remainingFee: result.remainingFee,
    milestones: result.milestones,
    bracketBreakdown: result.bracketBreakdown,
  };
}

function handleApproveMigration(agreement: FeeAgreementEntity): AgreementUpdate {
  // Admin approves >$500K value — generates terms, stays for SI acceptance
  // Route handler will compute fee and generate milestones
  return {
    status: 'active_assessment', // goes back to active_assessment for SI acceptance
    // (migration terms are generated by route handler, not by state machine)
  };
}

function handleRequestRevision(agreement: FeeAgreementEntity): AgreementUpdate {
  return {
    status: 'active_assessment',
    declaredProjectValue: null,
    sowFileId: null,
  };
}

function handleAcceptMigration(
  agreement: FeeAgreementEntity,
  payload: AcceptMigrationPayload
): AgreementUpdate {
  return {
    status: 'active_migration',
    migrationAcceptedBy: payload.migrationAcceptedBy,
    migrationAcceptedAt: new Date(),
    migrationAcceptedFromIp: payload.migrationAcceptedFromIp,
    migrationTermsSnapshot: payload.migrationTermsSnapshot,
    migrationTermsSnapshotHash: payload.migrationTermsSnapshotHash,
    declaredProjectValue: payload.declaredProjectValue,
    sowFileId: payload.sowFileId,
    calculatedTotalFee: payload.calculatedTotalFee,
    calculatedRemainingFee: payload.calculatedRemainingFee,
  };
}

function handleCloseAssessment(
  agreement: FeeAgreementEntity,
  payload: CloseAssessmentPayload
): AgreementUpdate {
  if (!payload.assessmentCloseReason) {
    throw new AgreementTransitionError(
      agreement.status,
      'CLOSE_ASSESSMENT',
      'Assessment close reason is required'
    );
  }

  // Cannot close if value already submitted (admin-only after that)
  if (payload.valueAlreadySubmitted) {
    throw new AgreementTransitionError(
      agreement.status,
      'CLOSE_ASSESSMENT',
      'Cannot close assessment after project value has been submitted. Admin must cancel instead.'
    );
  }

  return {
    status: 'assessment_complete',
    assessmentCloseReason: payload.assessmentCloseReason,
    assessmentCloseNotes: payload.assessmentCloseNotes ?? null,
  };
}

function handleComplete(agreement: FeeAgreementEntity, payload: CompletePayload): AgreementUpdate {
  if (!payload.allMilestonesPaid && !payload.hasZeroFee) {
    throw new AgreementTransitionError(
      agreement.status,
      'COMPLETE',
      'All milestones must be paid before completing (or zero-fee with admin action)'
    );
  }

  return {
    status: 'complete',
    completedAt: new Date(),
  };
}

function handleCancel(agreement: FeeAgreementEntity, payload: CancelPayload): AgreementUpdate {
  if (!payload.cancelledBy || !payload.cancellationReason) {
    throw new AgreementTransitionError(
      agreement.status,
      'CANCEL',
      'Cancelled by and cancellation reason are required'
    );
  }

  return {
    status: 'cancelled',
    cancelledBy: payload.cancelledBy,
    cancellationReason: payload.cancellationReason,
    cancelledAt: new Date(),
  };
}

// ============================================================================
// INVARIANT VALIDATION
// ============================================================================

/**
 * Validate all invariants for the given agreement.
 * Throws if any invariant is violated.
 */
export function validateInvariants(
  agreement: FeeAgreementEntity,
  milestones?: FeeMilestoneEntity[]
): void {
  const status = agreement.status as AgreementStatus;

  switch (status) {
    case 'draft':
      if (agreement.acceptedAt) {
        throw new Error(`Invariant violation: draft agreement has acceptedAt`);
      }
      break;

    case 'active_assessment':
      if (!agreement.acceptedAt && agreement.carriedCreditAmount <= 0) {
        throw new Error(
          `Invariant violation: active_assessment requires acceptedAt or carriedCredit`
        );
      }
      if (agreement.declaredProjectValue != null) {
        throw new Error(
          `Invariant violation: active_assessment must have declaredProjectValue IS NULL`
        );
      }
      if (milestones) {
        const migrationMilestones = milestones.filter((m) => m.phase === 'migration');
        if (migrationMilestones.length > 0) {
          throw new Error(
            `Invariant violation: active_assessment must have no migration milestones`
          );
        }
      }
      break;

    case 'migration_pending_review':
      if (agreement.declaredProjectValue == null) {
        throw new Error(
          `Invariant violation: migration_pending_review requires declaredProjectValue`
        );
      }
      if (!agreement.sowFileId) {
        throw new Error(`Invariant violation: migration_pending_review requires sowFileId`);
      }
      if (agreement.migrationAcceptedAt) {
        throw new Error(
          `Invariant violation: migration_pending_review must not have migrationAcceptedAt`
        );
      }
      break;

    case 'active_migration':
      if (!agreement.migrationAcceptedAt) {
        throw new Error(`Invariant violation: active_migration requires migrationAcceptedAt`);
      }
      if (!agreement.migrationTermsSnapshot) {
        throw new Error(`Invariant violation: active_migration requires migrationTermsSnapshot`);
      }
      break;

    case 'assessment_complete':
      if (agreement.declaredProjectValue != null) {
        throw new Error(
          `Invariant violation: assessment_complete must have declaredProjectValue IS NULL`
        );
      }
      if (!agreement.assessmentCloseReason) {
        throw new Error(`Invariant violation: assessment_complete requires assessmentCloseReason`);
      }
      break;

    case 'cancelled':
      if (!agreement.cancelledBy) {
        throw new Error(`Invariant violation: cancelled requires cancelledBy`);
      }
      if (!agreement.cancellationReason) {
        throw new Error(`Invariant violation: cancelled requires cancellationReason`);
      }
      break;

    case 'complete':
    case 'archived':
      // No specific field invariants beyond status
      break;
  }
}

// ============================================================================
// AMENDMENT CREATION
// ============================================================================

/**
 * Create amendment data for a new agreement version.
 * The old agreement should be cancelled first (by the route handler).
 *
 * Amendments skip draft and start in active_assessment with carried credit.
 * M1 is created with paid_via='carried_credit'.
 */
export function createAmendment(input: AmendmentInput): AmendmentResult {
  const { oldAgreement, assessmentFeePaid } = input;

  const newAgreementData: Partial<FeeAgreementEntity> = {
    projectId: oldAgreement.projectId,
    supersedesAgreementId: oldAgreement.id,
    version: oldAgreement.version + 1,
    status: 'active_assessment',
    assessmentFee: oldAgreement.assessmentFee,
    carriedCreditAmount: assessmentFeePaid,
    carriedCreditSourceAgreementId: oldAgreement.id,
    paymentTerms: oldAgreement.paymentTerms,
    currency: oldAgreement.currency,
    capAmount: oldAgreement.capAmount,
    // Assessment acceptance carries forward
    acceptedBy: oldAgreement.acceptedBy,
    acceptedAt: oldAgreement.acceptedAt,
    acceptedFromIp: oldAgreement.acceptedFromIp,
    assessmentTermsSnapshot: oldAgreement.assessmentTermsSnapshot,
    assessmentTermsSnapshotHash: oldAgreement.assessmentTermsSnapshotHash,
    // Migration fields reset
    declaredProjectValue: null,
    calculatedTotalFee: null,
    calculatedRemainingFee: null,
    sowFileId: null,
    migrationTermsSnapshot: null,
    migrationTermsSnapshotHash: null,
    migrationAcceptedBy: null,
    migrationAcceptedAt: null,
    migrationAcceptedFromIp: null,
  };

  // M1 milestone paid via carried credit (no Stripe invoice)
  const m1Milestone = {
    name: 'Assessment fee',
    phase: 'assessment' as const,
    triggerType: 'automatic' as const,
    amount: assessmentFeePaid,
    status: 'paid' as const,
    paidVia: 'carried_credit' as const,
    paidAt: new Date(),
    sortOrder: 100,
  };

  return { newAgreementData, m1Milestone };
}

/**
 * Check if a transition event is valid from the given status.
 */
export function isValidTransition(status: AgreementStatus, event: AgreementTransition): boolean {
  const allowed = VALID_TRANSITIONS[status] ?? [];
  return allowed.includes(event);
}

/**
 * Check if a status is terminal (no transitions allowed).
 */
export function isTerminalStatus(status: AgreementStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
