/**
 * Project Billing Tab (Assessment Phase)
 *
 * Shows agreement summary, M1 milestone status, and next steps.
 * Handles: empty, waiting for payment, proceed to migration, close assessment, pending review.
 *
 * Task: P4.3
 * Refs: SI-BILLING-SPEC.md §12.2.2
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Check, Clock, CircleDot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useBillingAgreements,
  useBillingAgreementDetail,
  useRequestMilestoneComplete,
  formatCurrency,
  type BillingMilestone,
} from '../hooks/use-partner-billing';
import { WaitingForPaymentCallout } from './WaitingForPaymentCallout';
import { ProceedToMigrationDialog } from './ProceedToMigrationDialog';
import { AssessmentCloseDialog } from './AssessmentCloseDialog';

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
  const [showProceedDialog, setShowProceedDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);

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
              onClick={() => setShowProceedDialog(true)}
              data-testid="proceed-to-migration-btn"
            >
              {t('projectBilling.proceedToMigration', 'Proceed to Migration')}
            </Button>
            {!hasSubmittedValue && (
              <Button
                variant="outline"
                onClick={() => setShowCloseDialog(true)}
                data-testid="close-assessment-btn"
              >
                {t('projectBilling.closeAssessment', 'Close as Assessment Only')}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Proceed to Migration Dialog */}
      {showProceedDialog && (
        <ProceedToMigrationDialog
          agreementId={agreement.id}
          onClose={() => setShowProceedDialog(false)}
        />
      )}

      {/* Assessment Close Dialog */}
      {showCloseDialog && (
        <AssessmentCloseDialog
          agreementId={agreement.id}
          onClose={() => setShowCloseDialog(false)}
        />
      )}
    </div>
  );
}

function MigrationBillingView({
  agreement,
  milestones,
}: {
  agreement: {
    id: string;
    status: string;
    assessmentFee: number;
    declaredProjectValue: number | null;
    calculatedTotalFee: number | null;
    calculatedRemainingFee: number | null;
    paymentTerms: string;
  };
  milestones: BillingMilestone[];
}) {
  const { t } = useTranslation('billing');
  const requestComplete = useRequestMilestoneComplete();
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [requestNote, setRequestNote] = useState('');

  const totalFee = agreement.calculatedTotalFee ?? 0;
  const assessmentMilestones = milestones
    .filter((m) => m.phase === 'assessment')
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const migrationMilestones = milestones
    .filter((m) => m.phase === 'migration')
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const paidAmount = milestones
    .filter((m) => m.status === 'paid')
    .reduce((sum, m) => sum + m.amount, 0);
  const progress = totalFee > 0 ? Math.min((paidAmount / totalFee) * 100, 100) : 0;

  const handleRequestComplete = async (milestoneId: string) => {
    try {
      await requestComplete.mutateAsync({ id: milestoneId, reason: requestNote || undefined });
      setRequestingId(null);
      setRequestNote('');
    } catch {
      // handled by mutation
    }
  };

  return (
    <div className="space-y-4" data-testid="project-billing-migration">
      {/* Agreement Summary */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
          {t('projectBilling.feeAgreement', 'Fee Agreement')}
        </h3>
        <div className="flex items-center gap-4 flex-wrap text-sm">
          <span className="text-slate-700">
            {t('reviewB.projectValue', 'Project Value')}:{' '}
            <strong>{formatCurrency(agreement.declaredProjectValue ?? 0)}</strong>
          </span>
          <span className="text-slate-700">
            {t('reviewB.totalFee', 'Total Fee')}: <strong>{formatCurrency(totalFee)}</strong>
          </span>
          <span className="text-slate-500">
            {t('projectBilling.terms', 'Terms')}: {agreement.paymentTerms}
          </span>
        </div>
      </div>

      {/* Phase 1: Assessment */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
          {t('projectBilling.phaseAssessment', 'Phase 1: Assessment')}
        </h3>
        {assessmentMilestones.map((ms) => (
          <div
            key={ms.id}
            className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
          >
            <div className="flex items-center gap-3">
              <MilestoneStatusIcon status={ms.status} />
              <span className="text-sm text-slate-700">{ms.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-900">
                {formatCurrency(ms.amount)}
              </span>
              <MilestoneStatusBadge status={ms.status} />
            </div>
          </div>
        ))}
      </div>

      {/* Phase 2: Migration */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
          {t('projectBilling.phaseMigration', 'Phase 2: Migration')}
        </h3>
        {migrationMilestones.map((ms) => (
          <div key={ms.id} className="py-2 border-b border-slate-100 last:border-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MilestoneStatusIcon status={ms.status} />
                <span className="text-sm text-slate-700">{ms.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-900">
                  {formatCurrency(ms.amount)}
                </span>
                <MilestoneStatusBadge status={ms.status} />
              </div>
            </div>
            {/* Request Completion for pending milestones */}
            {ms.status === 'pending' && (
              <div className="ms-7 mt-2">
                {requestingId === ms.id ? (
                  <div className="flex gap-2 items-end">
                    <input
                      type="text"
                      value={requestNote}
                      onChange={(e) => setRequestNote(e.target.value)}
                      placeholder={t('projectBilling.requestNote', 'Optional note...')}
                      className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
                      data-testid={`request-note-${ms.id}`}
                    />
                    <Button
                      size="sm"
                      onClick={() => handleRequestComplete(ms.id)}
                      disabled={requestComplete.isPending}
                      className="bg-violet-500 hover:bg-violet-600 text-white"
                      data-testid={`confirm-request-${ms.id}`}
                    >
                      {t('projectBilling.confirm', 'Confirm')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRequestingId(null)}>
                      {t('proceedMigration.cancel', 'Cancel')}
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRequestingId(ms.id)}
                    data-testid={`request-complete-${ms.id}`}
                  >
                    {t('projectBilling.requestCompletion', 'Request Completion')}
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Payment Progress */}
      <div
        className="bg-white border border-slate-200 rounded-xl p-5"
        data-testid="payment-progress"
      >
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
          {t('projectBilling.paymentProgress', 'Payment Progress')}
        </h3>
        <div className="flex justify-between text-sm text-slate-600 mb-2">
          <span>{formatCurrency(paidAmount)}</span>
          <span>
            {formatCurrency(totalFee)} ({Math.round(progress)}%)
          </span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-3">
          <div
            className="bg-violet-500 h-3 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
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

  const isMigration =
    detail.agreement.status === 'active_migration' || detail.agreement.status === 'complete';

  if (isMigration) {
    return <MigrationBillingView agreement={detail.agreement} milestones={detail.milestones} />;
  }

  return <AssessmentBillingView agreement={detail.agreement} milestones={detail.milestones} />;
}
