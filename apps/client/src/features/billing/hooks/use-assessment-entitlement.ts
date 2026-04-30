/**
 * Assessment Entitlement Hook
 *
 * Checks whether the current SI partner has paid for full assessment access.
 * Used to gate domain detail tabs, report export, and PDF parity sections.
 *
 * Free: overview tab, extraction, complexity score
 * Locked: domain tabs, report export, detailed sections
 */
import { useBillingAgreements, useBillingAgreementDetail } from './use-partner-billing';

export interface AssessmentEntitlement {
  /** True if full assessment is unlocked (M1 paid) */
  isUnlocked: boolean;
  /** True if an agreement exists but hasn't been paid yet */
  hasPendingAgreement: boolean;
  /** True if no agreement exists at all */
  needsAgreement: boolean;
  /** Agreement ID for CTA link (to review page) */
  agreementId: string | null;
  /** Assessment fee amount in cents */
  assessmentFee: number | null;
  /** Loading state */
  isLoading: boolean;
}

export function useAssessmentEntitlement(projectId: string | undefined): AssessmentEntitlement {
  const { data: agreements, isLoading: agreementsLoading } = useBillingAgreements();

  const projectAgreement = agreements?.find((a) => a.projectId === projectId);

  const { data: detail, isLoading: detailLoading } = useBillingAgreementDetail(
    projectAgreement?.id ?? ''
  );

  const isLoading = agreementsLoading || (!!projectAgreement && detailLoading);

  if (isLoading || !agreements) {
    return {
      isUnlocked: false,
      hasPendingAgreement: false,
      needsAgreement: false,
      agreementId: null,
      assessmentFee: null,
      isLoading: true,
    };
  }

  // No agreement for this project — show pricing CTA
  if (!projectAgreement) {
    return {
      isUnlocked: false,
      hasPendingAgreement: false,
      needsAgreement: true,
      agreementId: null,
      assessmentFee: null,
      isLoading: false,
    };
  }

  // Draft agreement — not yet accepted
  if (projectAgreement.status === 'draft') {
    return {
      isUnlocked: false,
      hasPendingAgreement: true,
      needsAgreement: false,
      agreementId: projectAgreement.id,
      assessmentFee: projectAgreement.assessmentFee,
      isLoading: false,
    };
  }

  // Check if M1 is paid
  if (detail) {
    const m1 = detail.milestones.find((m) => m.phase === 'assessment' && m.sortOrder === 1);
    const isPaid = m1?.status === 'paid';

    return {
      isUnlocked:
        isPaid ||
        projectAgreement.status === 'active_migration' ||
        projectAgreement.status === 'complete',
      hasPendingAgreement: !isPaid,
      needsAgreement: false,
      agreementId: projectAgreement.id,
      assessmentFee: projectAgreement.assessmentFee,
      isLoading: false,
    };
  }

  // Agreement exists but detail not loaded — assume pending
  return {
    isUnlocked: false,
    hasPendingAgreement: true,
    needsAgreement: false,
    agreementId: projectAgreement.id,
    assessmentFee: projectAgreement.assessmentFee,
    isLoading: false,
  };
}
