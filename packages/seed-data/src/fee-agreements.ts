import type { FeeAgreementEntity } from '@revbrain/contract';
import { MOCK_IDS } from './constants.ts';
import { daysAgo } from './helpers.ts';

/**
 * Seed fee agreements covering all major statuses:
 * 1. Draft (no acceptance yet)
 * 2. Active Assessment (M1 paid, awaiting migration)
 * 3. Active Migration ($3M project, $145K total, $130K remaining)
 * 4. Assessment Complete (M1 paid, client didn't sign)
 */
export const SEED_FEE_AGREEMENTS: readonly FeeAgreementEntity[] = [
  // 1. Draft — Acme's new project, not yet accepted
  {
    id: MOCK_IDS.FEE_AGREEMENT_DRAFT,
    projectId: MOCK_IDS.PROJECT_LEGACY_CLEANUP,
    supersedesAgreementId: null,
    version: 1,
    status: 'draft',
    assessmentFee: 1500000, // $15,000
    declaredProjectValue: null,
    capAmount: null,
    calculatedTotalFee: null,
    calculatedRemainingFee: null,
    carriedCreditAmount: 0,
    carriedCreditSourceAgreementId: null,
    paymentTerms: 'net_30',
    currency: 'usd',
    createdBy: MOCK_IDS.USER_SYSTEM_ADMIN,
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
    createdAt: daysAgo(2),
    updatedAt: daysAgo(2),
  },

  // 2. Active Assessment — Beta's project, M1 paid, doing assessment
  {
    id: MOCK_IDS.FEE_AGREEMENT_ASSESSMENT,
    projectId: MOCK_IDS.PROJECT_RCA_PILOT,
    supersedesAgreementId: null,
    version: 1,
    status: 'active_assessment',
    assessmentFee: 1500000, // $15,000
    declaredProjectValue: null,
    capAmount: null,
    calculatedTotalFee: null,
    calculatedRemainingFee: null,
    carriedCreditAmount: 0,
    carriedCreditSourceAgreementId: null,
    paymentTerms: 'net_30',
    currency: 'usd',
    createdBy: MOCK_IDS.USER_SYSTEM_ADMIN,
    assessmentTermsSnapshot: {
      assessmentFee: 1500000,
      paymentTerms: 'net_30',
      brackets: [
        { ceiling: 50000000, rateBps: 800 },
        { ceiling: 200000000, rateBps: 500 },
        { ceiling: null, rateBps: 300 },
      ],
    },
    assessmentTermsSnapshotHash: 'sha256-seed-assessment-hash',
    acceptedBy: MOCK_IDS.USER_BETA_OWNER,
    acceptedAt: daysAgo(25),
    acceptedFromIp: '192.168.1.100',
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
    createdAt: daysAgo(28),
    updatedAt: daysAgo(25),
  },

  // 3. Active Migration — Acme's Q1 project, $3M value, $145K total, $130K remaining
  {
    id: MOCK_IDS.FEE_AGREEMENT_MIGRATION,
    projectId: MOCK_IDS.PROJECT_Q1_MIGRATION,
    supersedesAgreementId: null,
    version: 1,
    status: 'active_migration',
    assessmentFee: 1500000, // $15,000
    declaredProjectValue: 300000000, // $3,000,000
    capAmount: null,
    calculatedTotalFee: 14500000, // $145,000
    calculatedRemainingFee: 13000000, // $130,000
    carriedCreditAmount: 0,
    carriedCreditSourceAgreementId: null,
    paymentTerms: 'net_30',
    currency: 'usd',
    createdBy: MOCK_IDS.USER_SYSTEM_ADMIN,
    assessmentTermsSnapshot: {
      assessmentFee: 1500000,
      paymentTerms: 'net_30',
      brackets: [
        { ceiling: 50000000, rateBps: 800 },
        { ceiling: 200000000, rateBps: 500 },
        { ceiling: null, rateBps: 300 },
      ],
    },
    assessmentTermsSnapshotHash: 'sha256-seed-assessment-hash-acme',
    acceptedBy: MOCK_IDS.USER_ACME_OWNER,
    acceptedAt: daysAgo(60),
    acceptedFromIp: '10.0.0.1',
    sowFileId: 'sow-acme-q1-migration.pdf',
    migrationTermsSnapshot: {
      declaredProjectValue: 300000000,
      assessmentFee: 1500000,
      totalFee: 14500000,
      remainingFee: 13000000,
      brackets: [
        { ceiling: 50000000, rateBps: 800, amount: 4000000 },
        { ceiling: 200000000, rateBps: 500, amount: 7500000 },
        { ceiling: null, rateBps: 300, amount: 3000000 },
      ],
      milestones: [
        { name: 'Migration kickoff', percentageBps: 3500, amount: 4550000 },
        { name: 'Migration plan approved', percentageBps: 3500, amount: 4550000 },
        { name: 'Go-live validated', percentageBps: 3000, amount: 3900000 },
      ],
    },
    migrationTermsSnapshotHash: 'sha256-seed-migration-hash-acme',
    migrationAcceptedBy: MOCK_IDS.USER_ACME_OWNER,
    migrationAcceptedAt: daysAgo(45),
    migrationAcceptedFromIp: '10.0.0.1',
    assessmentCloseReason: null,
    assessmentCloseNotes: null,
    cancelledBy: null,
    cancellationReason: null,
    cancelledAt: null,
    completedAt: null,
    createdAt: daysAgo(65),
    updatedAt: daysAgo(45),
  },

  // 4. Assessment Complete — Acme's Phase 2 project, client didn't sign
  {
    id: MOCK_IDS.FEE_AGREEMENT_COMPLETE,
    projectId: MOCK_IDS.PROJECT_PHASE2,
    supersedesAgreementId: null,
    version: 1,
    status: 'assessment_complete',
    assessmentFee: 1500000, // $15,000
    declaredProjectValue: null,
    capAmount: null,
    calculatedTotalFee: null,
    calculatedRemainingFee: null,
    carriedCreditAmount: 0,
    carriedCreditSourceAgreementId: null,
    paymentTerms: 'net_30',
    currency: 'usd',
    createdBy: MOCK_IDS.USER_SYSTEM_ADMIN,
    assessmentTermsSnapshot: {
      assessmentFee: 1500000,
      paymentTerms: 'net_30',
      brackets: [
        { ceiling: 50000000, rateBps: 800 },
        { ceiling: 200000000, rateBps: 500 },
        { ceiling: null, rateBps: 300 },
      ],
    },
    assessmentTermsSnapshotHash: 'sha256-seed-assessment-hash-phase2',
    acceptedBy: MOCK_IDS.USER_ACME_OWNER,
    acceptedAt: daysAgo(90),
    acceptedFromIp: '10.0.0.1',
    sowFileId: null,
    migrationTermsSnapshot: null,
    migrationTermsSnapshotHash: null,
    migrationAcceptedBy: null,
    migrationAcceptedAt: null,
    migrationAcceptedFromIp: null,
    assessmentCloseReason: 'client_did_not_proceed',
    assessmentCloseNotes: 'Client decided to defer migration to next fiscal year',
    cancelledBy: null,
    cancellationReason: null,
    cancelledAt: null,
    completedAt: null,
    createdAt: daysAgo(95),
    updatedAt: daysAgo(85),
  },
] as const;
