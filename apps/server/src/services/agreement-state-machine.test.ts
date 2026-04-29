import { describe, it, expect } from 'vitest';
import {
  transition,
  validateInvariants,
  createAmendment,
  isValidTransition,
  isTerminalStatus,
  AgreementTransitionError,
  type AgreementStatus,
  type AgreementTransition,
} from './agreement-state-machine.ts';
import type { FeeAgreementEntity } from '@revbrain/contract';

// Helper to create a minimal agreement entity for testing
function makeAgreement(overrides: Partial<FeeAgreementEntity> = {}): FeeAgreementEntity {
  return {
    id: 'agreement-1',
    projectId: 'project-1',
    supersedesAgreementId: null,
    version: 1,
    status: 'draft',
    assessmentFee: 1_500_000,
    declaredProjectValue: null,
    capAmount: null,
    calculatedTotalFee: null,
    calculatedRemainingFee: null,
    carriedCreditAmount: 0,
    carriedCreditSourceAgreementId: null,
    paymentTerms: 'net_30',
    currency: 'usd',
    createdBy: 'admin-1',
    assessmentTermsSnapshot: null,
    assessmentTermsSnapshotHash: null,
    acceptedBy: null,
    acceptedAt: null,
    acceptedFromIp: null,
    sowFileId: null,
    migrationTermsSnapshot: null,
    migrationTermsSnapshotHash: null,
    migrationAcceptedBy: null,
    migrationAcceptedAt: null,
    migrationAcceptedFromIp: null,
    assessmentCloseReason: null,
    assessmentCloseNotes: null,
    cancelledBy: null,
    cancellationReason: null,
    cancelledAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('Agreement State Machine', () => {
  describe('ACCEPT_ASSESSMENT (draft → active_assessment)', () => {
    it('transitions draft to active_assessment', () => {
      const agreement = makeAgreement({ status: 'draft' });
      const result = transition(agreement, 'ACCEPT_ASSESSMENT', {
        acceptedBy: 'user-1',
        acceptedFromIp: '10.0.0.1',
        assessmentTermsSnapshot: { fee: 1500000 },
        assessmentTermsSnapshotHash: 'hash-123',
      });

      expect(result).toHaveProperty('status', 'active_assessment');
      expect(result).toHaveProperty('acceptedBy', 'user-1');
      expect(result).toHaveProperty('acceptedFromIp', '10.0.0.1');
      expect(result).toHaveProperty('assessmentTermsSnapshot');
      expect(result).toHaveProperty('acceptedAt');
    });

    it('throws if already accepted', () => {
      const agreement = makeAgreement({ status: 'draft', acceptedAt: new Date() });
      expect(() =>
        transition(agreement, 'ACCEPT_ASSESSMENT', {
          acceptedBy: 'user-1',
          acceptedFromIp: '10.0.0.1',
          assessmentTermsSnapshot: {},
          assessmentTermsSnapshotHash: 'h',
        })
      ).toThrow(AgreementTransitionError);
    });

    it('throws from non-draft status', () => {
      const agreement = makeAgreement({ status: 'active_migration' });
      expect(() =>
        transition(agreement, 'ACCEPT_ASSESSMENT', {
          acceptedBy: 'u',
          acceptedFromIp: '1',
          assessmentTermsSnapshot: {},
          assessmentTermsSnapshotHash: 'h',
        })
      ).toThrow(AgreementTransitionError);
    });
  });

  describe('VALIDATE_SUBMIT_VALUE', () => {
    it('>$500K transitions to migration_pending_review', () => {
      const agreement = makeAgreement({ status: 'active_assessment', acceptedAt: new Date() });
      const result = transition(agreement, 'VALIDATE_SUBMIT_VALUE', {
        declaredProjectValue: 80_000_000, // $800K
        sowFileId: 'sow-1',
        m1Status: 'paid',
      });

      expect(result).toHaveProperty('status', 'migration_pending_review');
      expect(result).toHaveProperty('declaredProjectValue', 80_000_000);
      expect(result).toHaveProperty('sowFileId', 'sow-1');
    });

    it('≤$500K stays in active_assessment (compute-only)', () => {
      const agreement = makeAgreement({ status: 'active_assessment', acceptedAt: new Date() });
      const result = transition(agreement, 'VALIDATE_SUBMIT_VALUE', {
        declaredProjectValue: 30_000_000, // $300K
        sowFileId: 'sow-1',
        m1Status: 'paid',
      });

      expect(result).toHaveProperty('status', 'active_assessment');
    });

    it('throws if M1 not paid', () => {
      const agreement = makeAgreement({ status: 'active_assessment', acceptedAt: new Date() });
      expect(() =>
        transition(agreement, 'VALIDATE_SUBMIT_VALUE', {
          declaredProjectValue: 30_000_000,
          sowFileId: 'sow-1',
          m1Status: 'invoiced',
        })
      ).toThrow('M1 must be paid');
    });

    it('throws if value <= 0', () => {
      const agreement = makeAgreement({ status: 'active_assessment', acceptedAt: new Date() });
      expect(() =>
        transition(agreement, 'VALIDATE_SUBMIT_VALUE', {
          declaredProjectValue: 0,
          sowFileId: 'sow-1',
          m1Status: 'paid',
        })
      ).toThrow('positive');
    });

    it('accepts carried credit as M1 payment', () => {
      const agreement = makeAgreement({ status: 'active_assessment', acceptedAt: new Date() });
      const result = transition(agreement, 'VALIDATE_SUBMIT_VALUE', {
        declaredProjectValue: 30_000_000,
        sowFileId: 'sow-1',
        m1Status: 'not_paid',
        carriedCreditAmount: 1_500_000,
      });

      expect(result).toHaveProperty('status', 'active_assessment');
    });
  });

  describe('COMPUTE_MIGRATION_TERMS', () => {
    it('returns computed terms without state change', () => {
      const agreement = makeAgreement({ status: 'active_assessment', acceptedAt: new Date() });
      const result = transition(agreement, 'COMPUTE_MIGRATION_TERMS', {
        declaredProjectValue: 300_000_000,
        brackets: [
          { ceiling: 50_000_000, rateBps: 800 },
          { ceiling: 200_000_000, rateBps: 500 },
          { ceiling: null, rateBps: 300 },
        ],
        assessmentCredit: 1_500_000,
      });

      // Returns ComputedTerms, not AgreementUpdate
      expect(result).toHaveProperty('totalFee', 14_500_000);
      expect(result).toHaveProperty('remainingFee', 13_000_000);
      expect(result).toHaveProperty('milestones');
      expect(result).not.toHaveProperty('status');
    });
  });

  describe('APPROVE_MIGRATION', () => {
    it('transitions migration_pending_review → active_assessment', () => {
      const agreement = makeAgreement({
        status: 'migration_pending_review',
        declaredProjectValue: 80_000_000,
        sowFileId: 'sow-1',
      });
      const result = transition(agreement, 'APPROVE_MIGRATION');
      expect(result).toHaveProperty('status', 'active_assessment');
    });

    it('throws from wrong status', () => {
      const agreement = makeAgreement({ status: 'draft' });
      expect(() => transition(agreement, 'APPROVE_MIGRATION')).toThrow(AgreementTransitionError);
    });
  });

  describe('REQUEST_REVISION', () => {
    it('transitions migration_pending_review → active_assessment with cleared value', () => {
      const agreement = makeAgreement({
        status: 'migration_pending_review',
        declaredProjectValue: 80_000_000,
        sowFileId: 'sow-1',
      });
      const result = transition(agreement, 'REQUEST_REVISION');
      expect(result).toHaveProperty('status', 'active_assessment');
      expect(result).toHaveProperty('declaredProjectValue', null);
      expect(result).toHaveProperty('sowFileId', null);
    });
  });

  describe('ACCEPT_MIGRATION', () => {
    it('transitions active_assessment → active_migration', () => {
      const agreement = makeAgreement({ status: 'active_assessment', acceptedAt: new Date() });
      const result = transition(agreement, 'ACCEPT_MIGRATION', {
        migrationAcceptedBy: 'user-1',
        migrationAcceptedFromIp: '10.0.0.1',
        migrationTermsSnapshot: { totalFee: 14_500_000 },
        migrationTermsSnapshotHash: 'hash-mig',
        declaredProjectValue: 300_000_000,
        sowFileId: 'sow-1',
        calculatedTotalFee: 14_500_000,
        calculatedRemainingFee: 13_000_000,
      });

      expect(result).toHaveProperty('status', 'active_migration');
      expect(result).toHaveProperty('migrationAcceptedBy', 'user-1');
      expect(result).toHaveProperty('declaredProjectValue', 300_000_000);
      expect(result).toHaveProperty('calculatedTotalFee', 14_500_000);
    });
  });

  describe('CLOSE_ASSESSMENT', () => {
    it('transitions active_assessment → assessment_complete', () => {
      const agreement = makeAgreement({ status: 'active_assessment', acceptedAt: new Date() });
      const result = transition(agreement, 'CLOSE_ASSESSMENT', {
        assessmentCloseReason: 'budget',
        assessmentCloseNotes: 'Client ran out of budget',
        valueAlreadySubmitted: false,
      });

      expect(result).toHaveProperty('status', 'assessment_complete');
      expect(result).toHaveProperty('assessmentCloseReason', 'budget');
    });

    it('throws without reason', () => {
      const agreement = makeAgreement({ status: 'active_assessment', acceptedAt: new Date() });
      expect(() =>
        transition(agreement, 'CLOSE_ASSESSMENT', {
          assessmentCloseReason: '',
          valueAlreadySubmitted: false,
        })
      ).toThrow('reason is required');
    });

    it('throws if value already submitted', () => {
      const agreement = makeAgreement({ status: 'active_assessment', acceptedAt: new Date() });
      expect(() =>
        transition(agreement, 'CLOSE_ASSESSMENT', {
          assessmentCloseReason: 'budget',
          valueAlreadySubmitted: true,
        })
      ).toThrow('Cannot close assessment after project value');
    });
  });

  describe('COMPLETE', () => {
    it('transitions active_migration → complete when all milestones paid', () => {
      const agreement = makeAgreement({
        status: 'active_migration',
        migrationAcceptedAt: new Date(),
      });
      const result = transition(agreement, 'COMPLETE', {
        allMilestonesPaid: true,
        hasZeroFee: false,
      });

      expect(result).toHaveProperty('status', 'complete');
      expect(result).toHaveProperty('completedAt');
    });

    it('transitions zero-fee with admin action', () => {
      const agreement = makeAgreement({
        status: 'active_migration',
        migrationAcceptedAt: new Date(),
      });
      const result = transition(agreement, 'COMPLETE', {
        allMilestonesPaid: false,
        hasZeroFee: true,
      });

      expect(result).toHaveProperty('status', 'complete');
    });

    it('throws if milestones not paid and not zero-fee', () => {
      const agreement = makeAgreement({
        status: 'active_migration',
        migrationAcceptedAt: new Date(),
      });
      expect(() =>
        transition(agreement, 'COMPLETE', {
          allMilestonesPaid: false,
          hasZeroFee: false,
        })
      ).toThrow('All milestones must be paid');
    });
  });

  describe('CANCEL', () => {
    it('cancels from draft', () => {
      const agreement = makeAgreement({ status: 'draft' });
      const result = transition(agreement, 'CANCEL', {
        cancelledBy: 'admin-1',
        cancellationReason: 'Project cancelled',
      });

      expect(result).toHaveProperty('status', 'cancelled');
      expect(result).toHaveProperty('cancelledBy', 'admin-1');
      expect(result).toHaveProperty('cancelledAt');
    });

    it('cancels from active_assessment', () => {
      const agreement = makeAgreement({ status: 'active_assessment', acceptedAt: new Date() });
      const result = transition(agreement, 'CANCEL', {
        cancelledBy: 'admin-1',
        cancellationReason: 'No longer needed',
      });
      expect(result).toHaveProperty('status', 'cancelled');
    });

    it('cancels from active_migration', () => {
      const agreement = makeAgreement({
        status: 'active_migration',
        migrationAcceptedAt: new Date(),
      });
      const result = transition(agreement, 'CANCEL', {
        cancelledBy: 'admin-1',
        cancellationReason: 'Scope changed',
      });
      expect(result).toHaveProperty('status', 'cancelled');
    });

    it('throws without reason', () => {
      const agreement = makeAgreement({ status: 'draft' });
      expect(() =>
        transition(agreement, 'CANCEL', {
          cancelledBy: 'admin-1',
          cancellationReason: '',
        })
      ).toThrow('required');
    });

    it('throws from terminal status', () => {
      const agreement = makeAgreement({ status: 'complete' });
      expect(() =>
        transition(agreement, 'CANCEL', {
          cancelledBy: 'admin-1',
          cancellationReason: 'test',
        })
      ).toThrow(AgreementTransitionError);
    });
  });

  describe('Invalid transitions', () => {
    const invalidPairs: [AgreementStatus, AgreementTransition][] = [
      ['draft', 'APPROVE_MIGRATION'],
      ['draft', 'ACCEPT_MIGRATION'],
      ['draft', 'CLOSE_ASSESSMENT'],
      ['draft', 'COMPLETE'],
      ['active_assessment', 'ACCEPT_ASSESSMENT'],
      ['active_assessment', 'APPROVE_MIGRATION'],
      ['migration_pending_review', 'ACCEPT_ASSESSMENT'],
      ['migration_pending_review', 'CLOSE_ASSESSMENT'],
      ['active_migration', 'ACCEPT_ASSESSMENT'],
      ['active_migration', 'VALIDATE_SUBMIT_VALUE'],
      ['complete', 'CANCEL'],
      ['assessment_complete', 'CANCEL'],
      ['cancelled', 'ACCEPT_ASSESSMENT'],
      ['archived', 'CANCEL'],
    ];

    for (const [status, event] of invalidPairs) {
      it(`throws for ${status} → ${event}`, () => {
        const agreement = makeAgreement({ status });
        expect(() => transition(agreement, event)).toThrow(AgreementTransitionError);
      });
    }
  });

  describe('validateInvariants', () => {
    it('passes for valid draft', () => {
      const agreement = makeAgreement({ status: 'draft' });
      expect(() => validateInvariants(agreement)).not.toThrow();
    });

    it('fails for draft with acceptedAt', () => {
      const agreement = makeAgreement({ status: 'draft', acceptedAt: new Date() });
      expect(() => validateInvariants(agreement)).toThrow('acceptedAt');
    });

    it('passes for valid active_assessment', () => {
      const agreement = makeAgreement({
        status: 'active_assessment',
        acceptedAt: new Date(),
        declaredProjectValue: null,
      });
      expect(() => validateInvariants(agreement)).not.toThrow();
    });

    it('passes for active_assessment with carried credit (amendment)', () => {
      const agreement = makeAgreement({
        status: 'active_assessment',
        acceptedAt: null,
        carriedCreditAmount: 1_500_000,
        declaredProjectValue: null,
      });
      expect(() => validateInvariants(agreement)).not.toThrow();
    });

    it('fails for active_assessment with declaredProjectValue', () => {
      const agreement = makeAgreement({
        status: 'active_assessment',
        acceptedAt: new Date(),
        declaredProjectValue: 100_000_000,
      });
      expect(() => validateInvariants(agreement)).toThrow('declaredProjectValue IS NULL');
    });

    it('passes for valid migration_pending_review', () => {
      const agreement = makeAgreement({
        status: 'migration_pending_review',
        declaredProjectValue: 80_000_000,
        sowFileId: 'sow-1',
        migrationAcceptedAt: null,
      });
      expect(() => validateInvariants(agreement)).not.toThrow();
    });

    it('fails for migration_pending_review without sowFileId', () => {
      const agreement = makeAgreement({
        status: 'migration_pending_review',
        declaredProjectValue: 80_000_000,
        sowFileId: null,
      });
      expect(() => validateInvariants(agreement)).toThrow('sowFileId');
    });

    it('passes for valid cancelled', () => {
      const agreement = makeAgreement({
        status: 'cancelled',
        cancelledBy: 'admin-1',
        cancellationReason: 'test',
      });
      expect(() => validateInvariants(agreement)).not.toThrow();
    });

    it('fails for cancelled without reason', () => {
      const agreement = makeAgreement({
        status: 'cancelled',
        cancelledBy: 'admin-1',
        cancellationReason: null,
      });
      expect(() => validateInvariants(agreement)).toThrow('cancellationReason');
    });

    it('passes for valid assessment_complete', () => {
      const agreement = makeAgreement({
        status: 'assessment_complete',
        declaredProjectValue: null,
        assessmentCloseReason: 'budget',
      });
      expect(() => validateInvariants(agreement)).not.toThrow();
    });

    it('fails for assessment_complete without reason', () => {
      const agreement = makeAgreement({
        status: 'assessment_complete',
        declaredProjectValue: null,
        assessmentCloseReason: null,
      });
      expect(() => validateInvariants(agreement)).toThrow('assessmentCloseReason');
    });
  });

  describe('createAmendment', () => {
    it('creates amendment with carried credit and incremented version', () => {
      const oldAgreement = makeAgreement({
        id: 'old-agreement',
        status: 'active_migration',
        version: 1,
        assessmentFee: 1_500_000,
        acceptedBy: 'user-1',
        acceptedAt: new Date('2026-01-15'),
        acceptedFromIp: '10.0.0.1',
        assessmentTermsSnapshot: { fee: 1_500_000 },
        assessmentTermsSnapshotHash: 'hash-old',
      });

      const result = createAmendment({
        oldAgreement,
        assessmentFeePaid: 1_500_000,
      });

      expect(result.newAgreementData.status).toBe('active_assessment');
      expect(result.newAgreementData.version).toBe(2);
      expect(result.newAgreementData.supersedesAgreementId).toBe('old-agreement');
      expect(result.newAgreementData.carriedCreditAmount).toBe(1_500_000);
      expect(result.newAgreementData.carriedCreditSourceAgreementId).toBe('old-agreement');
      // Assessment acceptance carries forward
      expect(result.newAgreementData.acceptedBy).toBe('user-1');
      expect(result.newAgreementData.acceptedAt).toEqual(new Date('2026-01-15'));
      // Migration fields reset
      expect(result.newAgreementData.declaredProjectValue).toBeNull();
      expect(result.newAgreementData.migrationTermsSnapshot).toBeNull();
    });

    it('creates M1 milestone with paid_via=carried_credit', () => {
      const oldAgreement = makeAgreement({ id: 'old' });
      const result = createAmendment({
        oldAgreement,
        assessmentFeePaid: 1_500_000,
      });

      expect(result.m1Milestone.name).toBe('Assessment fee');
      expect(result.m1Milestone.phase).toBe('assessment');
      expect(result.m1Milestone.status).toBe('paid');
      expect(result.m1Milestone.paidVia).toBe('carried_credit');
      expect(result.m1Milestone.amount).toBe(1_500_000);
      expect(result.m1Milestone.sortOrder).toBe(100);
    });
  });

  describe('isValidTransition', () => {
    it('returns true for valid transitions', () => {
      expect(isValidTransition('draft', 'ACCEPT_ASSESSMENT')).toBe(true);
      expect(isValidTransition('draft', 'CANCEL')).toBe(true);
      expect(isValidTransition('active_assessment', 'VALIDATE_SUBMIT_VALUE')).toBe(true);
    });

    it('returns false for invalid transitions', () => {
      expect(isValidTransition('draft', 'COMPLETE')).toBe(false);
      expect(isValidTransition('complete', 'CANCEL')).toBe(false);
      expect(isValidTransition('cancelled', 'ACCEPT_ASSESSMENT')).toBe(false);
    });
  });

  describe('isTerminalStatus', () => {
    it('identifies terminal statuses', () => {
      expect(isTerminalStatus('complete')).toBe(true);
      expect(isTerminalStatus('assessment_complete')).toBe(true);
      expect(isTerminalStatus('cancelled')).toBe(true);
      expect(isTerminalStatus('archived')).toBe(true);
    });

    it('identifies non-terminal statuses', () => {
      expect(isTerminalStatus('draft')).toBe(false);
      expect(isTerminalStatus('active_assessment')).toBe(false);
      expect(isTerminalStatus('active_migration')).toBe(false);
    });
  });
});
