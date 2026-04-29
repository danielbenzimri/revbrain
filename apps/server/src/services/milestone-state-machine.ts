/**
 * Milestone State Machine (SI Billing)
 *
 * Pure functions — validates milestone transitions and returns state updates.
 * NO I/O (no DB, no Stripe). Route handlers do persistence.
 *
 * Spec reference: SI-BILLING-SPEC.md §4
 *
 * Lifecycle:
 *   M1/M2 (automatic): → invoiced → paid
 *   M3/M4 (admin_approved): pending → requested → completed → invoiced → paid
 *   Any invoiced: → overdue (payment terms exceeded)
 *   Any invoiced: → voided (Stripe webhook: invoice.voided)
 *   Cancellation: void all non-paid milestones
 */

import type { FeeMilestoneEntity } from '@revbrain/contract';

// ============================================================================
// TYPES
// ============================================================================

export type MilestoneStatus =
  | 'pending'
  | 'requested'
  | 'completed'
  | 'invoiced'
  | 'paid'
  | 'overdue'
  | 'voided';

export type MilestoneTransitionEvent =
  | 'AUTO_INVOICE'
  | 'REQUEST_COMPLETE'
  | 'APPROVE'
  | 'REJECT'
  | 'GENERATE_INVOICE'
  | 'MARK_PAID'
  | 'MARK_OVERDUE'
  | 'VOID';

export interface MilestoneUpdate {
  status: MilestoneStatus;
  [key: string]: unknown;
}

export interface RequestCompletePayload {
  requestedBy: string;
  requestReason?: string;
}

export interface ApprovePayload {
  completedBy: string;
  completionEvidence?: string;
}

export interface RejectPayload {
  rejectionReason: string;
}

export interface MarkPaidPayload {
  paidAt: Date;
  stripePaymentIntentId?: string;
}

export class MilestoneTransitionError extends Error {
  constructor(
    public readonly from: string,
    public readonly event: string,
    message: string
  ) {
    super(message);
    this.name = 'MilestoneTransitionError';
  }
}

// ============================================================================
// VALID TRANSITIONS
// ============================================================================

const VALID_TRANSITIONS: Record<string, MilestoneTransitionEvent[]> = {
  pending: ['REQUEST_COMPLETE', 'APPROVE', 'VOID', 'AUTO_INVOICE'],
  requested: ['APPROVE', 'REJECT', 'VOID'],
  completed: ['GENERATE_INVOICE', 'VOID'],
  invoiced: ['MARK_PAID', 'MARK_OVERDUE', 'VOID'],
  overdue: ['MARK_PAID', 'VOID'],
  paid: [], // terminal
  voided: [], // terminal
};

// ============================================================================
// TRANSITION FUNCTION
// ============================================================================

/**
 * Validate and compute a milestone state transition.
 * Returns the update to apply. Throws on invalid transition.
 * NEVER performs I/O.
 */
export function transitionMilestone(
  milestone: FeeMilestoneEntity,
  event: MilestoneTransitionEvent,
  payload?: unknown
): MilestoneUpdate {
  const status = milestone.status as MilestoneStatus;
  const allowed = VALID_TRANSITIONS[status] ?? [];

  if (!allowed.includes(event)) {
    throw new MilestoneTransitionError(
      status,
      event,
      `Cannot transition milestone from '${status}' via '${event}'`
    );
  }

  switch (event) {
    case 'AUTO_INVOICE':
      return {
        status: 'invoiced',
        invoicedAt: new Date(),
      };

    case 'REQUEST_COMPLETE': {
      const p = payload as RequestCompletePayload;
      if (!p?.requestedBy) {
        throw new MilestoneTransitionError(status, event, 'requestedBy is required');
      }
      return {
        status: 'requested',
        requestedBy: p.requestedBy,
        requestedAt: new Date(),
        requestReason: p.requestReason ?? null,
      };
    }

    case 'APPROVE': {
      const p = payload as ApprovePayload;
      if (!p?.completedBy) {
        throw new MilestoneTransitionError(status, event, 'completedBy is required');
      }
      return {
        status: 'completed',
        completedBy: p.completedBy,
        completedAt: new Date(),
        completionEvidence: p.completionEvidence ?? null,
        // Clear rejection reason from any prior reject cycle
        rejectionReason: null,
      };
    }

    case 'REJECT': {
      const p = payload as RejectPayload;
      if (!p?.rejectionReason) {
        throw new MilestoneTransitionError(status, event, 'rejectionReason is required');
      }
      return {
        status: 'pending',
        rejectionReason: p.rejectionReason,
        // Clear request fields
        requestedBy: null,
        requestedAt: null,
        requestReason: null,
      };
    }

    case 'GENERATE_INVOICE':
      return {
        status: 'invoiced',
        invoicedAt: new Date(),
      };

    case 'MARK_PAID': {
      const p = payload as MarkPaidPayload;
      return {
        status: 'paid',
        paidAt: p?.paidAt ?? new Date(),
        stripePaymentIntentId: p?.stripePaymentIntentId ?? null,
      };
    }

    case 'MARK_OVERDUE':
      return {
        status: 'overdue',
        overdueAt: new Date(),
      };

    case 'VOID':
      return {
        status: 'voided',
      };

    default:
      throw new MilestoneTransitionError(status, event, `Unknown event: ${event}`);
  }
}

// ============================================================================
// BULK OPERATIONS (for cancellation)
// ============================================================================

/**
 * Void all non-paid, non-voided milestones.
 * Used during agreement cancellation.
 * Returns the list of milestone IDs and their updates.
 */
export function voidAllPending(
  milestones: FeeMilestoneEntity[]
): { id: string; update: MilestoneUpdate }[] {
  const results: { id: string; update: MilestoneUpdate }[] = [];

  for (const m of milestones) {
    const status = m.status as MilestoneStatus;
    if (status === 'paid' || status === 'voided') continue;

    results.push({
      id: m.id,
      update: { status: 'voided' },
    });
  }

  return results;
}

/**
 * Auto-invoice completed-but-not-yet-invoiced milestones.
 * Used during agreement cancellation (work delivered = money owed).
 * Returns the list of milestone IDs that should be invoiced.
 */
export function autoInvoiceCompleted(
  milestones: FeeMilestoneEntity[]
): { id: string; update: MilestoneUpdate }[] {
  const results: { id: string; update: MilestoneUpdate }[] = [];

  for (const m of milestones) {
    if (m.status === 'completed') {
      results.push({
        id: m.id,
        update: {
          status: 'invoiced',
          invoicedAt: new Date(),
        },
      });
    }
  }

  return results;
}

/**
 * Check if a transition is valid from the given status.
 */
export function isValidMilestoneTransition(
  status: MilestoneStatus,
  event: MilestoneTransitionEvent
): boolean {
  const allowed = VALID_TRANSITIONS[status] ?? [];
  return allowed.includes(event);
}
