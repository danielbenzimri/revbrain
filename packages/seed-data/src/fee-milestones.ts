import type { FeeMilestoneEntity } from '@revbrain/contract';
import { MOCK_IDS } from './constants.ts';
import { daysAgo } from './helpers.ts';

const nullTimestamps = {
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
};

/**
 * Seed milestones:
 * - Draft agreement: no milestones (not yet activated)
 * - Active Assessment (Beta): M1 paid
 * - Active Migration (Acme Q1): M1 paid, M2 paid, M3 invoiced, M4 requested
 * - Assessment Complete (Acme Phase2): M1 paid
 *
 * Migration amounts for $3M project:
 *   Total: $145,000 | Assessment: $15,000 | Remaining: $130,000
 *   M2 (35%): $45,500 | M3 (35%): $45,500 | M4 (30%): $39,000
 */
export const SEED_FEE_MILESTONES: readonly FeeMilestoneEntity[] = [
  // --- Active Assessment (Beta): M1 paid ---
  {
    id: `${MOCK_IDS.FEE_AGREEMENT_ASSESSMENT}-m1`,
    feeAgreementId: MOCK_IDS.FEE_AGREEMENT_ASSESSMENT,
    name: 'Assessment fee',
    phase: 'assessment',
    triggerType: 'automatic',
    percentageBps: null,
    amount: 1500000, // $15,000
    status: 'paid',
    paidVia: 'stripe_invoice',
    ...nullTimestamps,
    invoicedAt: daysAgo(25),
    paidAt: daysAgo(22),
    sortOrder: 100,
    createdAt: daysAgo(25),
    updatedAt: daysAgo(22),
  },

  // --- Active Migration (Acme Q1): 4 milestones ---
  // M1: Assessment fee — paid
  {
    id: `${MOCK_IDS.FEE_AGREEMENT_MIGRATION}-m1`,
    feeAgreementId: MOCK_IDS.FEE_AGREEMENT_MIGRATION,
    name: 'Assessment fee',
    phase: 'assessment',
    triggerType: 'automatic',
    percentageBps: null,
    amount: 1500000, // $15,000
    status: 'paid',
    paidVia: 'stripe_invoice',
    ...nullTimestamps,
    invoicedAt: daysAgo(60),
    paidAt: daysAgo(55),
    sortOrder: 100,
    createdAt: daysAgo(60),
    updatedAt: daysAgo(55),
  },
  // M2: Migration kickoff (35% of $130K = $45,500) — paid
  {
    id: `${MOCK_IDS.FEE_AGREEMENT_MIGRATION}-m2`,
    feeAgreementId: MOCK_IDS.FEE_AGREEMENT_MIGRATION,
    name: 'Migration kickoff',
    phase: 'migration',
    triggerType: 'automatic',
    percentageBps: 3500,
    amount: 4550000, // $45,500
    status: 'paid',
    paidVia: 'stripe_invoice',
    ...nullTimestamps,
    invoicedAt: daysAgo(45),
    paidAt: daysAgo(40),
    sortOrder: 200,
    createdAt: daysAgo(45),
    updatedAt: daysAgo(40),
  },
  // M3: Migration plan approved (35% of $130K = $45,500) — invoiced
  {
    id: `${MOCK_IDS.FEE_AGREEMENT_MIGRATION}-m3`,
    feeAgreementId: MOCK_IDS.FEE_AGREEMENT_MIGRATION,
    name: 'Migration plan approved',
    phase: 'migration',
    triggerType: 'admin_approved',
    percentageBps: 3500,
    amount: 4550000, // $45,500
    status: 'invoiced',
    paidVia: 'stripe_invoice',
    ...nullTimestamps,
    completedBy: MOCK_IDS.USER_SYSTEM_ADMIN,
    completedAt: daysAgo(15),
    invoicedAt: daysAgo(14),
    sortOrder: 300,
    createdAt: daysAgo(45),
    updatedAt: daysAgo(14),
  },
  // M4: Go-live validated (30% of $130K = $39,000) — requested
  {
    id: `${MOCK_IDS.FEE_AGREEMENT_MIGRATION}-m4`,
    feeAgreementId: MOCK_IDS.FEE_AGREEMENT_MIGRATION,
    name: 'Go-live validated',
    phase: 'migration',
    triggerType: 'admin_approved',
    percentageBps: 3000,
    amount: 3900000, // $39,000
    status: 'requested',
    paidVia: 'stripe_invoice',
    ...nullTimestamps,
    requestReason: 'Go-live completed, validation checks all passing.',
    requestedBy: MOCK_IDS.USER_ACME_OWNER,
    requestedAt: daysAgo(3),
    sortOrder: 400,
    createdAt: daysAgo(45),
    updatedAt: daysAgo(3),
  },

  // --- Assessment Complete (Acme Phase2): M1 paid ---
  {
    id: `${MOCK_IDS.FEE_AGREEMENT_COMPLETE}-m1`,
    feeAgreementId: MOCK_IDS.FEE_AGREEMENT_COMPLETE,
    name: 'Assessment fee',
    phase: 'assessment',
    triggerType: 'automatic',
    percentageBps: null,
    amount: 1500000, // $15,000
    status: 'paid',
    paidVia: 'stripe_invoice',
    ...nullTimestamps,
    invoicedAt: daysAgo(90),
    paidAt: daysAgo(85),
    sortOrder: 100,
    createdAt: daysAgo(90),
    updatedAt: daysAgo(85),
  },
] as const;
