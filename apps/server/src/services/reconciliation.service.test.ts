import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReconciliationService } from './reconciliation.service.ts';
import type {
  PartnerProfileEntity,
  FeeAgreementEntity,
  FeeMilestoneEntity,
} from '@revbrain/contract';

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

function makeAgreement(overrides: Partial<FeeAgreementEntity> = {}): FeeAgreementEntity {
  return {
    id: 'fa-1',
    projectId: 'proj-1',
    supersedesAgreementId: null,
    version: 1,
    status: 'active_migration',
    assessmentFee: 1_500_000,
    declaredProjectValue: null,
    capAmount: null,
    calculatedTotalFee: null,
    calculatedRemainingFee: null,
    carriedCreditAmount: 0,
    carriedCreditSourceAgreementId: null,
    paymentTerms: 'net_30',
    currency: 'usd',
    createdBy: null,
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

function makeMilestone(overrides: Partial<FeeMilestoneEntity> = {}): FeeMilestoneEntity {
  return {
    id: 'ms-1',
    feeAgreementId: 'fa-1',
    name: 'Assessment fee',
    phase: 'assessment',
    triggerType: 'automatic',
    percentageBps: null,
    amount: 1_500_000,
    status: 'paid',
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
    sortOrder: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ReconciliationService', () => {
  let service: ReconciliationService;
  let mockPartnerRepo: any;
  let mockAgreementRepo: any;
  let mockMilestoneRepo: any;

  beforeEach(() => {
    mockPartnerRepo = {
      findMany: vi.fn(),
      updateCumulativeFees: vi.fn().mockResolvedValue(null),
      findById: vi.fn(),
      findByOrgId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    };
    mockAgreementRepo = {
      findByOrgId: vi.fn(),
      findById: vi.fn(),
      findByProjectId: vi.fn(),
      findActiveByProjectId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    };
    mockMilestoneRepo = {
      findByAgreementId: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
    };
    service = new ReconciliationService(mockPartnerRepo, mockAgreementRepo, mockMilestoneRepo);
  });

  describe('reconcilePartner', () => {
    it('reports no drift when values match', async () => {
      const profile = makeProfile({ cumulativeFeesPaid: 1_500_000, completedProjectCount: 0 });
      mockAgreementRepo.findByOrgId.mockResolvedValue([makeAgreement()]);
      mockMilestoneRepo.findByAgreementId.mockResolvedValue([
        makeMilestone({ amount: 1_500_000, status: 'paid', paidVia: 'stripe_invoice' }),
      ]);

      const result = await service.reconcilePartner(profile);

      expect(result.driftCents).toBe(0);
      expect(result.corrected).toBe(false);
      expect(mockPartnerRepo.updateCumulativeFees).not.toHaveBeenCalled();
    });

    it('auto-corrects drift ≤ $1 (100 cents)', async () => {
      // Stored: $15,000.00, Expected: $15,000.50 (50 cent drift)
      const profile = makeProfile({ cumulativeFeesPaid: 1_500_000 });
      mockAgreementRepo.findByOrgId.mockResolvedValue([makeAgreement()]);
      mockMilestoneRepo.findByAgreementId.mockResolvedValue([
        makeMilestone({ amount: 1_500_050, status: 'paid', paidVia: 'stripe_invoice' }),
      ]);

      const result = await service.reconcilePartner(profile);

      expect(result.driftCents).toBe(50);
      expect(result.corrected).toBe(true);
      expect(mockPartnerRepo.updateCumulativeFees).toHaveBeenCalledWith(profile.id, 1_500_050, 0);
    });

    it('does NOT auto-correct drift > $1', async () => {
      // Stored: $15,000, Expected: $25,000 ($10,000 drift)
      const profile = makeProfile({ cumulativeFeesPaid: 1_500_000 });
      mockAgreementRepo.findByOrgId.mockResolvedValue([makeAgreement()]);
      mockMilestoneRepo.findByAgreementId.mockResolvedValue([
        makeMilestone({ amount: 2_500_000, status: 'paid', paidVia: 'stripe_invoice' }),
      ]);

      const result = await service.reconcilePartner(profile);

      expect(result.driftCents).toBe(1_000_000);
      expect(result.corrected).toBe(false);
      expect(mockPartnerRepo.updateCumulativeFees).not.toHaveBeenCalled();
    });

    it('excludes carried_credit milestones from sum', async () => {
      const profile = makeProfile({ cumulativeFeesPaid: 1_500_000 });
      mockAgreementRepo.findByOrgId.mockResolvedValue([makeAgreement()]);
      mockMilestoneRepo.findByAgreementId.mockResolvedValue([
        makeMilestone({ amount: 1_500_000, status: 'paid', paidVia: 'stripe_invoice' }),
        makeMilestone({
          id: 'ms-carried',
          amount: 1_500_000,
          status: 'paid',
          paidVia: 'carried_credit',
        }),
      ]);

      const result = await service.reconcilePartner(profile);

      // Only stripe_invoice milestone counts
      expect(result.expectedFeesPaid).toBe(1_500_000);
      expect(result.driftCents).toBe(0);
    });

    it('handles partner with zero milestones', async () => {
      const profile = makeProfile({ cumulativeFeesPaid: 0 });
      mockAgreementRepo.findByOrgId.mockResolvedValue([]);

      const result = await service.reconcilePartner(profile);

      expect(result.expectedFeesPaid).toBe(0);
      expect(result.driftCents).toBe(0);
      expect(result.corrected).toBe(false);
    });

    it('counts completed agreements for project count', async () => {
      const profile = makeProfile({ completedProjectCount: 1 });
      mockAgreementRepo.findByOrgId.mockResolvedValue([
        makeAgreement({ id: 'fa-1', status: 'complete' }),
        makeAgreement({ id: 'fa-2', status: 'active_migration' }),
        makeAgreement({ id: 'fa-3', status: 'complete' }),
      ]);
      mockMilestoneRepo.findByAgreementId.mockResolvedValue([]);

      const result = await service.reconcilePartner(profile);

      expect(result.expectedProjectCount).toBe(2);
      expect(result.actualProjectCount).toBe(1);
    });
  });

  describe('reconcileAll', () => {
    it('processes all partners and returns summary', async () => {
      const profiles = [
        makeProfile({ id: 'pp-1', organizationId: 'org-1', cumulativeFeesPaid: 0 }),
        makeProfile({ id: 'pp-2', organizationId: 'org-2', cumulativeFeesPaid: 0 }),
      ];
      mockPartnerRepo.findMany.mockResolvedValue(profiles);
      mockAgreementRepo.findByOrgId.mockResolvedValue([]);

      const summary = await service.reconcileAll();

      expect(summary.totalPartners).toBe(2);
      expect(summary.partnersChecked).toBe(2);
      expect(summary.corrections).toBe(0);
      expect(summary.alerts).toBe(0);
      expect(summary.results).toHaveLength(2);
    });

    it('counts corrections and alerts correctly', async () => {
      const profiles = [
        // Small drift → auto-correct
        makeProfile({ id: 'pp-1', organizationId: 'org-1', cumulativeFeesPaid: 1_500_000 }),
        // Large drift → alert
        makeProfile({ id: 'pp-2', organizationId: 'org-2', cumulativeFeesPaid: 0 }),
      ];
      mockPartnerRepo.findMany.mockResolvedValue(profiles);

      // pp-1: 50 cent drift → auto-correct
      mockAgreementRepo.findByOrgId
        .mockResolvedValueOnce([makeAgreement({ id: 'fa-1' })])
        .mockResolvedValueOnce([makeAgreement({ id: 'fa-2' })]);
      mockMilestoneRepo.findByAgreementId
        .mockResolvedValueOnce([
          makeMilestone({ amount: 1_500_050, status: 'paid', paidVia: 'stripe_invoice' }),
        ])
        // pp-2: $15K drift → alert
        .mockResolvedValueOnce([
          makeMilestone({ amount: 1_500_000, status: 'paid', paidVia: 'stripe_invoice' }),
        ]);

      const summary = await service.reconcileAll();

      expect(summary.corrections).toBe(1);
      expect(summary.alerts).toBe(1);
    });
  });
});
