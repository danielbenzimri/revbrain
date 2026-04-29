import { describe, it, expect } from 'vitest';
import {
  transitionMilestone,
  voidAllPending,
  autoInvoiceCompleted,
  isValidMilestoneTransition,
  MilestoneTransitionError,
  type MilestoneStatus,
  type MilestoneTransitionEvent,
} from './milestone-state-machine.ts';
import type { FeeMilestoneEntity } from '@revbrain/contract';

function makeMilestone(overrides: Partial<FeeMilestoneEntity> = {}): FeeMilestoneEntity {
  return {
    id: 'milestone-1',
    feeAgreementId: 'agreement-1',
    name: 'Test Milestone',
    phase: 'migration',
    triggerType: 'admin_approved',
    percentageBps: 3500,
    amount: 4_550_000,
    status: 'pending',
    paidVia: 'stripe_invoice',
    requestReason: null,
    requestedBy: null,
    requestedAt: null,
    rejectionReason: null,
    completedBy: null,
    completedAt: null,
    completionEvidence: null,
    stripeInvoiceId: null,
    stripeInvoiceUrl: null,
    stripePaymentIntentId: null,
    invoicedAt: null,
    paidAt: null,
    overdueAt: null,
    overdueReminderSentDay1At: null,
    overdueReminderSentDay7At: null,
    overdueReminderSentDay14At: null,
    sortOrder: 200,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('Milestone State Machine', () => {
  describe('AUTO_INVOICE (M1/M2 auto-invoiced)', () => {
    it('transitions pending → invoiced', () => {
      const m = makeMilestone({ status: 'pending' });
      const result = transitionMilestone(m, 'AUTO_INVOICE');
      expect(result.status).toBe('invoiced');
      expect(result).toHaveProperty('invoicedAt');
    });

    it('throws from paid', () => {
      const m = makeMilestone({ status: 'paid' });
      expect(() => transitionMilestone(m, 'AUTO_INVOICE')).toThrow(MilestoneTransitionError);
    });
  });

  describe('REQUEST_COMPLETE (SI requests completion)', () => {
    it('transitions pending → requested', () => {
      const m = makeMilestone({ status: 'pending' });
      const result = transitionMilestone(m, 'REQUEST_COMPLETE', {
        requestedBy: 'user-1',
        requestReason: 'Work is done',
      });
      expect(result.status).toBe('requested');
      expect(result).toHaveProperty('requestedBy', 'user-1');
      expect(result).toHaveProperty('requestReason', 'Work is done');
      expect(result).toHaveProperty('requestedAt');
    });

    it('throws without requestedBy', () => {
      const m = makeMilestone({ status: 'pending' });
      expect(() => transitionMilestone(m, 'REQUEST_COMPLETE', {})).toThrow('requestedBy');
    });

    it('throws from invoiced', () => {
      const m = makeMilestone({ status: 'invoiced' });
      expect(() => transitionMilestone(m, 'REQUEST_COMPLETE', { requestedBy: 'u' })).toThrow(
        MilestoneTransitionError
      );
    });
  });

  describe('APPROVE (admin approves)', () => {
    it('transitions requested → completed', () => {
      const m = makeMilestone({ status: 'requested' });
      const result = transitionMilestone(m, 'APPROVE', {
        completedBy: 'admin-1',
        completionEvidence: 'Verified in platform',
      });
      expect(result.status).toBe('completed');
      expect(result).toHaveProperty('completedBy', 'admin-1');
      expect(result).toHaveProperty('completionEvidence', 'Verified in platform');
      expect(result).toHaveProperty('rejectionReason', null);
    });

    it('also works from pending (admin direct approve)', () => {
      const m = makeMilestone({ status: 'pending' });
      const result = transitionMilestone(m, 'APPROVE', { completedBy: 'admin-1' });
      expect(result.status).toBe('completed');
    });

    it('throws without completedBy', () => {
      const m = makeMilestone({ status: 'requested' });
      expect(() => transitionMilestone(m, 'APPROVE', {})).toThrow('completedBy');
    });
  });

  describe('REJECT (admin rejects request)', () => {
    it('transitions requested → pending with reason', () => {
      const m = makeMilestone({ status: 'requested', requestedBy: 'user-1' });
      const result = transitionMilestone(m, 'REJECT', {
        rejectionReason: 'Not enough evidence',
      });
      expect(result.status).toBe('pending');
      expect(result).toHaveProperty('rejectionReason', 'Not enough evidence');
      expect(result).toHaveProperty('requestedBy', null);
      expect(result).toHaveProperty('requestedAt', null);
    });

    it('throws without reason', () => {
      const m = makeMilestone({ status: 'requested' });
      expect(() => transitionMilestone(m, 'REJECT', { rejectionReason: '' })).toThrow(
        'rejectionReason'
      );
    });

    it('throws from pending', () => {
      const m = makeMilestone({ status: 'pending' });
      expect(() => transitionMilestone(m, 'REJECT', { rejectionReason: 'test' })).toThrow(
        MilestoneTransitionError
      );
    });
  });

  describe('GENERATE_INVOICE', () => {
    it('transitions completed → invoiced', () => {
      const m = makeMilestone({ status: 'completed' });
      const result = transitionMilestone(m, 'GENERATE_INVOICE');
      expect(result.status).toBe('invoiced');
      expect(result).toHaveProperty('invoicedAt');
    });

    it('throws from pending', () => {
      const m = makeMilestone({ status: 'pending' });
      expect(() => transitionMilestone(m, 'GENERATE_INVOICE')).toThrow(MilestoneTransitionError);
    });
  });

  describe('MARK_PAID', () => {
    it('transitions invoiced → paid', () => {
      const m = makeMilestone({ status: 'invoiced' });
      const paidAt = new Date('2026-04-15');
      const result = transitionMilestone(m, 'MARK_PAID', {
        paidAt,
        stripePaymentIntentId: 'pi_123',
      });
      expect(result.status).toBe('paid');
      expect(result).toHaveProperty('paidAt', paidAt);
      expect(result).toHaveProperty('stripePaymentIntentId', 'pi_123');
    });

    it('transitions overdue → paid (late payment)', () => {
      const m = makeMilestone({ status: 'overdue' });
      const result = transitionMilestone(m, 'MARK_PAID', { paidAt: new Date() });
      expect(result.status).toBe('paid');
    });

    it('throws from pending', () => {
      const m = makeMilestone({ status: 'pending' });
      expect(() => transitionMilestone(m, 'MARK_PAID')).toThrow(MilestoneTransitionError);
    });
  });

  describe('MARK_OVERDUE', () => {
    it('transitions invoiced → overdue', () => {
      const m = makeMilestone({ status: 'invoiced' });
      const result = transitionMilestone(m, 'MARK_OVERDUE');
      expect(result.status).toBe('overdue');
      expect(result).toHaveProperty('overdueAt');
    });

    it('throws from pending', () => {
      const m = makeMilestone({ status: 'pending' });
      expect(() => transitionMilestone(m, 'MARK_OVERDUE')).toThrow(MilestoneTransitionError);
    });
  });

  describe('VOID', () => {
    it('transitions invoiced → voided (webhook)', () => {
      const m = makeMilestone({ status: 'invoiced' });
      const result = transitionMilestone(m, 'VOID');
      expect(result.status).toBe('voided');
    });

    it('transitions pending → voided (cancellation)', () => {
      const m = makeMilestone({ status: 'pending' });
      const result = transitionMilestone(m, 'VOID');
      expect(result.status).toBe('voided');
    });

    it('transitions requested → voided (cancellation)', () => {
      const m = makeMilestone({ status: 'requested' });
      const result = transitionMilestone(m, 'VOID');
      expect(result.status).toBe('voided');
    });

    it('transitions completed → voided (cancellation)', () => {
      const m = makeMilestone({ status: 'completed' });
      const result = transitionMilestone(m, 'VOID');
      expect(result.status).toBe('voided');
    });

    it('throws from paid (terminal)', () => {
      const m = makeMilestone({ status: 'paid' });
      expect(() => transitionMilestone(m, 'VOID')).toThrow(MilestoneTransitionError);
    });

    it('throws from voided (already terminal)', () => {
      const m = makeMilestone({ status: 'voided' });
      expect(() => transitionMilestone(m, 'VOID')).toThrow(MilestoneTransitionError);
    });
  });

  describe('Standard path: pending → requested → completed → invoiced → paid', () => {
    it('full lifecycle works', () => {
      let m = makeMilestone({ status: 'pending' });

      const r1 = transitionMilestone(m, 'REQUEST_COMPLETE', { requestedBy: 'user-1' });
      expect(r1.status).toBe('requested');

      m = makeMilestone({ ...m, status: 'requested' });
      const r2 = transitionMilestone(m, 'APPROVE', { completedBy: 'admin-1' });
      expect(r2.status).toBe('completed');

      m = makeMilestone({ ...m, status: 'completed' });
      const r3 = transitionMilestone(m, 'GENERATE_INVOICE');
      expect(r3.status).toBe('invoiced');

      m = makeMilestone({ ...m, status: 'invoiced' });
      const r4 = transitionMilestone(m, 'MARK_PAID', { paidAt: new Date() });
      expect(r4.status).toBe('paid');
    });
  });

  describe('Invalid transitions', () => {
    const invalidPairs: [MilestoneStatus, MilestoneTransitionEvent][] = [
      ['paid', 'AUTO_INVOICE'],
      ['paid', 'REQUEST_COMPLETE'],
      ['paid', 'VOID'],
      ['voided', 'MARK_PAID'],
      ['voided', 'AUTO_INVOICE'],
      ['pending', 'MARK_PAID'],
      ['pending', 'GENERATE_INVOICE'],
      ['pending', 'MARK_OVERDUE'],
      ['requested', 'GENERATE_INVOICE'],
      ['requested', 'MARK_PAID'],
      ['completed', 'MARK_PAID'],
      ['completed', 'REQUEST_COMPLETE'],
      ['overdue', 'REQUEST_COMPLETE'],
      ['overdue', 'APPROVE'],
    ];

    for (const [status, event] of invalidPairs) {
      it(`throws for ${status} → ${event}`, () => {
        const m = makeMilestone({ status });
        expect(() => transitionMilestone(m, event)).toThrow(MilestoneTransitionError);
      });
    }
  });

  describe('voidAllPending', () => {
    it('voids pending, requested, completed, invoiced milestones', () => {
      const milestones = [
        makeMilestone({ id: 'm1', status: 'paid' }),
        makeMilestone({ id: 'm2', status: 'pending' }),
        makeMilestone({ id: 'm3', status: 'requested' }),
        makeMilestone({ id: 'm4', status: 'invoiced' }),
        makeMilestone({ id: 'm5', status: 'completed' }),
        makeMilestone({ id: 'm6', status: 'voided' }),
      ];

      const results = voidAllPending(milestones);
      expect(results).toHaveLength(4); // m2, m3, m4, m5 voided
      expect(results.map((r) => r.id)).toEqual(['m2', 'm3', 'm4', 'm5']);
      for (const r of results) {
        expect(r.update.status).toBe('voided');
      }
    });

    it('returns empty for all-paid milestones', () => {
      const milestones = [
        makeMilestone({ id: 'm1', status: 'paid' }),
        makeMilestone({ id: 'm2', status: 'paid' }),
      ];
      expect(voidAllPending(milestones)).toHaveLength(0);
    });
  });

  describe('autoInvoiceCompleted', () => {
    it('invoices completed-but-not-yet-invoiced milestones', () => {
      const milestones = [
        makeMilestone({ id: 'm1', status: 'completed' }),
        makeMilestone({ id: 'm2', status: 'pending' }),
        makeMilestone({ id: 'm3', status: 'completed' }),
        makeMilestone({ id: 'm4', status: 'paid' }),
      ];

      const results = autoInvoiceCompleted(milestones);
      expect(results).toHaveLength(2); // m1, m3
      expect(results.map((r) => r.id)).toEqual(['m1', 'm3']);
      for (const r of results) {
        expect(r.update.status).toBe('invoiced');
        expect(r.update).toHaveProperty('invoicedAt');
      }
    });

    it('returns empty when no completed milestones', () => {
      const milestones = [
        makeMilestone({ id: 'm1', status: 'pending' }),
        makeMilestone({ id: 'm2', status: 'invoiced' }),
      ];
      expect(autoInvoiceCompleted(milestones)).toHaveLength(0);
    });
  });

  describe('isValidMilestoneTransition', () => {
    it('returns true for valid', () => {
      expect(isValidMilestoneTransition('pending', 'REQUEST_COMPLETE')).toBe(true);
      expect(isValidMilestoneTransition('invoiced', 'MARK_PAID')).toBe(true);
      expect(isValidMilestoneTransition('overdue', 'MARK_PAID')).toBe(true);
    });

    it('returns false for invalid', () => {
      expect(isValidMilestoneTransition('paid', 'VOID')).toBe(false);
      expect(isValidMilestoneTransition('pending', 'MARK_PAID')).toBe(false);
    });
  });
});
