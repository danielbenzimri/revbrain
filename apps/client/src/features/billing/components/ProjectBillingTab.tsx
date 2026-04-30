/**
 * Project Billing Tab (Assessment Phase)
 *
 * Shows agreement summary, M1 milestone status, and next steps.
 * Handles: empty, waiting for payment, proceed to migration, close assessment, pending review.
 *
 * Task: P4.3
 * Refs: SI-BILLING-SPEC.md §12.2.2
 */
import { useTranslation } from 'react-i18next';
import { Loader2, Check, Clock, CircleDot } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  useBillingAgreements,
  useBillingAgreementDetail,
  formatCurrency,
  type BillingMilestone,
} from '../hooks/use-partner-billing';
import { WaitingForPaymentCallout } from './WaitingForPaymentCallout';

function MilestoneStatusIcon({ status }: { status: string }) {
  if (status === 'paid') return <Check className="h-4 w-4 text-green-500" />;
  if (status === 'invoiced' || status === 'overdue')
    return <Clock className="h-4 w-4 text-amber-500" />;
  return <CircleDot className="h-4 w-4 text-slate-300" />;
}

function MilestoneStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation('billing');
  const styles: Record<string, string> = {
    paid: 'bg-green-100 text-green-700',
    invoiced: 'bg-blue-100 text-blue-700',
    overdue: 'bg-red-100 text-red-700',
    pending: 'bg-slate-100 text-slate-500',
    pending_approval: 'bg-amber-100 text-amber-700',
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${styles[status] ?? styles.pending}`}>
      {t(`projectBilling.milestoneStatus.${status}`, status)}
    </span>
  );
}

function AssessmentBillingView({
  agreement,
  milestones,
}: {
  agreement: {
    id: string;
    status: string;
    assessmentFee: number;
    paymentTerms: string;
    declaredProjectValue: number | null;
  };
  milestones: BillingMilestone[];
}) {
  const { t } = useTranslation('billing');
  const navigate = useNavigate();

  const m1 = milestones.find((m) => m.phase === 'assessment' && m.sortOrder === 1);
  const isM1Paid = m1?.status === 'paid';
  const isM1Invoiced = m1?.status === 'invoiced' || m1?.status === 'overdue';
  const isActiveAssessment = agreement.status === 'active_assessment';
  const isMigrationPendingReview = agreement.status === 'migration_pending_review';
  const hasSubmittedValue = agreement.declaredProjectValue !== null;

  return (
    <div className="space-y-4" data-testid="project-billing-assessment">
      {/* Agreement Summary */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
          {t('projectBilling.feeAgreement', 'Fee Agreement')}
        </h3>
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-sm text-slate-700">
            {t('projectBilling.assessmentFee', 'Assessment Fee')}:{' '}
            <strong>{formatCurrency(agreement.assessmentFee)}</strong>
          </span>
          <span className="text-sm text-slate-500">
            {t('projectBilling.terms', 'Terms')}: {agreement.paymentTerms}
          </span>
        </div>
      </div>

      {/* Waiting for Payment Callout */}
      {isM1Invoiced && m1 && (
        <WaitingForPaymentCallout milestoneName={m1.name} amount={m1.amount} />
      )}

      {/* Milestones */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
          {t('projectBilling.milestones', 'Milestones')}
        </h3>
        {milestones
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((milestone) => (
            <div
              key={milestone.id}
              className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
              data-testid={`milestone-${milestone.id}`}
            >
              <div className="flex items-center gap-3">
                <MilestoneStatusIcon status={milestone.status} />
                <span className="text-sm text-slate-700">{milestone.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-900">
                  {formatCurrency(milestone.amount)}
                </span>
                <MilestoneStatusBadge status={milestone.status} />
              </div>
            </div>
          ))}
      </div>

      {/* Migration Pending Review */}
      {isMigrationPendingReview && (
        <div
          className="bg-slate-50 border border-slate-200 rounded-xl p-5"
          data-testid="migration-pending-review"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
              {t('projectBilling.underReview', 'Under Review')}
            </span>
          </div>
          <p className="text-sm text-slate-600">
            {t(
              'projectBilling.pendingReviewMessage',
              "Your migration value of {{amount}} is under admin review. We'll email you when terms are ready to accept.",
              { amount: formatCurrency(agreement.declaredProjectValue ?? 0) }
            )}
          </p>
        </div>
      )}

      {/* Next Step */}
      {isActiveAssessment && isM1Paid && !isMigrationPendingReview && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
            {t('projectBilling.nextStep', 'Next Step')}
          </h3>
          <p className="text-sm text-slate-600 mb-4">
            {t(
              'projectBilling.nextStepMessage',
              'When your client signs the SOW, proceed to set up migration billing.'
            )}
          </p>
          <div className="flex gap-3 flex-wrap">
            <Button
              className="bg-violet-500 hover:bg-violet-600 text-white"
              onClick={() => navigate(`/billing/agreements/${agreement.id}/review`)}
              data-testid="proceed-to-migration-btn"
            >
              {t('projectBilling.proceedToMigration', 'Proceed to Migration')}
            </Button>
            {!hasSubmittedValue && (
              <Button variant="outline" data-testid="close-assessment-btn">
                {t('projectBilling.closeAssessment', 'Close as Assessment Only')}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectBillingTab({ projectId }: { projectId: string }) {
  const { t } = useTranslation('billing');
  const { data: agreements, isLoading: agreementsLoading } = useBillingAgreements();

  // Find the active agreement for this project
  const projectAgreement = agreements?.find((a) => a.projectId === projectId);

  const { data: detail, isLoading: detailLoading } = useBillingAgreementDetail(
    projectAgreement?.id ?? ''
  );

  const isLoading = agreementsLoading || (projectAgreement && detailLoading);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  // Empty state
  if (!projectAgreement || !detail) {
    return (
      <div
        className="text-center py-12 border border-dashed border-slate-200 rounded-xl"
        data-testid="project-billing-empty"
      >
        <p className="text-slate-500">
          {t(
            'projectBilling.emptyState',
            'Billing details will appear here once a fee agreement is set up.'
          )}
        </p>
      </div>
    );
  }

  return <AssessmentBillingView agreement={detail.agreement} milestones={detail.milestones} />;
}
