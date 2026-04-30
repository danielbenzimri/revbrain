/**
 * Agreement Review Page (SI-facing)
 *
 * Renders Variant A (assessment acceptance) for draft agreements,
 * or Variant B (migration acceptance) for migration_pending_review — P5.2.
 *
 * Task: P4.2
 * Refs: SI-BILLING-SPEC.md §12.2.3
 */
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, CheckCircle2, XCircle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useBillingAgreementDetail,
  useAcceptAssessment,
  useAcceptMigration,
  formatCurrency,
  type BillingMilestone,
} from '../hooks/use-partner-billing';

function DeclineModal({
  onClose,
  onDecline,
  isPending,
}: {
  onClose: () => void;
  onDecline: (reason: string) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation('billing');
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6"
        data-testid="decline-modal"
      >
        <div className="flex items-center gap-2 mb-4">
          <XCircle className="h-5 w-5 text-red-500" />
          <h3 className="text-lg font-semibold text-slate-900">
            {t('review.declineTitle', 'Decline Agreement')}
          </h3>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          {t('review.declineDescription', 'Please provide a reason for declining this agreement.')}
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none text-sm resize-none mb-4"
          placeholder={t('review.declineReasonPlaceholder', 'Reason for declining...')}
          data-testid="decline-reason-input"
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {t('review.cancel', 'Cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || isPending}
            onClick={() => onDecline(reason.trim())}
            data-testid="decline-confirm-btn"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
            {t('review.declineConfirm', 'Decline')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function VariantA({
  agreement,
  tiers,
}: {
  agreement: {
    id: string;
    assessmentFee: number;
    paymentTerms: string;
    status: string;
  };
  tiers: { bracketCeiling: number | null; rateBps: number; sortOrder: number }[];
}) {
  const { t } = useTranslation('billing');
  const navigate = useNavigate();
  const acceptAssessment = useAcceptAssessment();
  const [attested, setAttested] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const handleAccept = async () => {
    try {
      await acceptAssessment.mutateAsync(agreement.id);
      setAccepted(true);
      setTimeout(() => navigate('/billing'), 2000);
    } catch {
      // handled by mutation
    }
  };

  const handleDecline = async (reason: string) => {
    // For now, just navigate back — P6/P7 will wire actual decline API
    console.log('Declined with reason:', reason);
    setShowDecline(false);
    navigate('/billing');
  };

  if (accepted) {
    return (
      <div className="max-w-2xl mx-auto mt-12 text-center" data-testid="accept-success">
        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">
          {t('review.acceptedTitle', 'Assessment Started!')}
        </h2>
        <p className="text-slate-600">
          {t('review.acceptedMessage', 'Your account manager has been notified. Redirecting...')}
        </p>
      </div>
    );
  }

  // Format bracket preview
  const bracketPreview = tiers
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((tier) => {
      const rate = (tier.rateBps / 100).toFixed(0);
      if (!tier.bracketCeiling) return `${t('review.above', 'Above')}: ${rate}%`;
      return `${t('review.upTo', 'Up to')} ${formatCurrency(tier.bracketCeiling)}: ${rate}%`;
    });

  return (
    <div className="max-w-2xl mx-auto" data-testid="variant-a-review">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">
        {t('review.startAssessment', 'Start Assessment')}
      </h1>

      {/* What's Included */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-4">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">
          {t('review.whatsIncluded', "What's Included")}
        </h2>
        <p className="text-sm text-slate-600 mb-3">
          {t(
            'review.assessmentDescription',
            "RevBrain will extract and analyze your client's CPQ org."
          )}
        </p>
        <div className="flex items-center gap-4 mb-3">
          <span className="text-lg font-bold text-slate-900">
            {t('review.assessmentFee', 'Assessment Fee')}: {formatCurrency(agreement.assessmentFee)}
          </span>
          <span className="text-sm text-slate-500">
            {t('review.paymentTerms', 'Payment Terms')}: {agreement.paymentTerms}
          </span>
        </div>
        <div className="flex flex-wrap gap-3 text-sm text-slate-600">
          <span className="flex items-center gap-1">
            <Check className="h-4 w-4 text-green-500" />
            {t('review.fullExtraction', 'Full CPQ extraction')}
          </span>
          <span className="flex items-center gap-1">
            <Check className="h-4 w-4 text-green-500" />
            {t('review.complexityAnalysis', 'Complexity analysis')}
          </span>
          <span className="flex items-center gap-1">
            <Check className="h-4 w-4 text-green-500" />
            {t('review.assessmentReport', 'Assessment report')}
          </span>
        </div>
      </div>

      {/* Migration Preview */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-4">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">
          {t('review.migrationPreview', 'If Your Client Proceeds to Migration')}
        </h2>
        <p className="text-sm text-slate-600 mb-3">
          {t(
            'review.migrationFeeExplanation',
            'Migration fee: percentage of project value (tiered brackets).'
          )}
        </p>
        {bracketPreview.length > 0 && (
          <ul className="text-sm text-slate-600 space-y-1 mb-3">
            {bracketPreview.map((line, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                {line}
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-violet-700 bg-violet-50 px-3 py-2 rounded-lg">
          {t(
            'review.creditExplanation',
            'The assessment fee is credited against the total migration fee.'
          )}
        </p>
      </div>

      {/* Terms Notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
        <p>
          {t(
            'review.termsNotice',
            'This is an assessment engagement. You will receive an invoice immediately. Migration pricing will be calculated later from the signed SOW; this fee will be credited.'
          )}
        </p>
      </div>

      {/* Attestation Checkbox */}
      <label
        className="flex items-start gap-3 mb-6 cursor-pointer"
        data-testid="attestation-checkbox"
      >
        <input
          type="checkbox"
          checked={attested}
          onChange={(e) => setAttested(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
        />
        <span className="text-sm text-slate-700">
          {t(
            'review.attestation',
            "I accept RevBrain's assessment terms and authorize the assessment fee of {{amount}}.",
            {
              amount: formatCurrency(agreement.assessmentFee),
            }
          )}
        </span>
      </label>

      {/* Action Buttons */}
      <div className="flex justify-between items-center">
        <Button variant="outline" onClick={() => setShowDecline(true)} data-testid="decline-btn">
          {t('review.decline', 'Decline')}
        </Button>
        <Button
          disabled={!attested || acceptAssessment.isPending}
          onClick={handleAccept}
          className="bg-violet-500 hover:bg-violet-600 text-white"
          data-testid="accept-assessment-btn"
        >
          {acceptAssessment.isPending ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
          {t('review.acceptAssessment', 'Accept & Start Assessment')}
        </Button>
      </div>

      {acceptAssessment.isError && (
        <div className="mt-4 bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
          {t('review.acceptFailed', 'Failed to accept. Please try again.')}
        </div>
      )}

      {showDecline && (
        <DeclineModal
          onClose={() => setShowDecline(false)}
          onDecline={handleDecline}
          isPending={false}
        />
      )}
    </div>
  );
}

function VariantB({
  agreement,
  tiers,
  milestones,
}: {
  agreement: {
    id: string;
    assessmentFee: number;
    declaredProjectValue: number | null;
    calculatedTotalFee: number | null;
    calculatedRemainingFee: number | null;
    paymentTerms: string;
    status: string;
  };
  tiers: { bracketCeiling: number | null; rateBps: number; sortOrder: number }[];
  milestones: BillingMilestone[];
}) {
  const { t } = useTranslation('billing');
  const navigate = useNavigate();
  const acceptMigration = useAcceptMigration();
  const [attested, setAttested] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const totalFee = agreement.calculatedTotalFee ?? 0;
  const remainingFee = agreement.calculatedRemainingFee ?? 0;
  const projectValue = agreement.declaredProjectValue ?? 0;
  const isZeroRemaining = remainingFee === 0;

  const migrationMilestones = milestones
    .filter((m) => m.phase === 'migration')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const handleAccept = async () => {
    try {
      await acceptMigration.mutateAsync({
        id: agreement.id,
        declaredProjectValue: projectValue,
      });
      setAccepted(true);
      setTimeout(() => navigate('/billing'), 2000);
    } catch {
      // handled by mutation
    }
  };

  const handleDecline = async () => {
    setShowDecline(false);
    navigate('/billing');
  };

  if (accepted) {
    return (
      <div className="max-w-2xl mx-auto mt-12 text-center" data-testid="migration-accept-success">
        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">
          {t('reviewB.acceptedTitle', 'Migration Started!')}
        </h2>
        <p className="text-slate-600">
          {t('reviewB.acceptedMessage', 'Your migration is now active. Redirecting...')}
        </p>
      </div>
    );
  }

  // Bracket breakdown — computed outside render to avoid reassignment lint error
  const sortedTiers = [...tiers].sort((a, b) => a.sortOrder - b.sortOrder);
  const bracketLines: { label: string; rate: string; fee: number }[] = [];
  {
    let rem = projectValue;
    for (let i = 0; i < sortedTiers.length; i++) {
      const tier = sortedTiers[i];
      const prevCeiling = i > 0 ? (sortedTiers[i - 1].bracketCeiling ?? 0) : 0;
      const ceiling = tier.bracketCeiling;
      const bracketSize = ceiling ? Math.min(rem, ceiling - prevCeiling) : rem;
      const fee = Math.round((bracketSize * tier.rateBps) / 10000);
      rem = ceiling ? Math.max(0, rem - (ceiling - prevCeiling)) : 0;
      const rate = (tier.rateBps / 100).toFixed(0);

      if (!ceiling) {
        bracketLines.push({
          label: t('reviewB.above', 'Above {{amount}}', { amount: formatCurrency(prevCeiling) }),
          rate: `${rate}%`,
          fee,
        });
      } else {
        bracketLines.push({
          label: `${formatCurrency(prevCeiling)} – ${formatCurrency(ceiling)}`,
          rate: `${rate}%`,
          fee,
        });
      }
    }
  }

  return (
    <div className="max-w-2xl mx-auto" data-testid="variant-b-review">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">
        {t('reviewB.title', 'Review Migration Terms')}
      </h1>

      {/* Project Value */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-4">
        <div className="text-sm text-slate-500 mb-1">
          {t('reviewB.projectValue', 'Project Value')}
        </div>
        <div className="text-2xl font-bold text-slate-900">{formatCurrency(projectValue)}</div>
      </div>

      {/* Fee Breakdown */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-4">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">
          {t('reviewB.feeBreakdown', 'Fee Breakdown')}
        </h2>
        <div className="space-y-2 mb-4">
          {bracketLines.map((line, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-slate-600">
                {line.label}: {line.rate}
              </span>
              <span className="font-medium text-slate-900">{formatCurrency(line.fee)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 pt-3 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">{t('reviewB.totalFee', 'Total Fee')}</span>
            <span className="font-bold text-slate-900">{formatCurrency(totalFee)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">{t('reviewB.assessmentPaid', 'Assessment Paid')}</span>
            <span className="text-green-600">-{formatCurrency(agreement.assessmentFee)}</span>
          </div>
          <div className="flex justify-between text-sm font-bold">
            <span className="text-slate-900">{t('reviewB.remaining', 'Remaining')}</span>
            <span className="text-slate-900">{formatCurrency(remainingFee)}</span>
          </div>
        </div>
      </div>

      {/* Migration Schedule or Zero-fee notice */}
      {isZeroRemaining ? (
        <div
          className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4"
          data-testid="zero-fee-notice"
        >
          <p className="text-sm text-green-800">
            {t(
              'reviewB.zeroFeeNotice',
              'No additional invoices will be issued for this project. Your assessment fee covers the full engagement.'
            )}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-6 mb-4">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">
            {t('reviewB.migrationSchedule', 'Migration Schedule')}
          </h2>
          {migrationMilestones.map((ms) => (
            <div
              key={ms.id}
              className="flex justify-between py-2 border-b border-slate-100 last:border-0 text-sm"
            >
              <span className="text-slate-700">
                {ms.sortOrder}. {ms.name}
              </span>
              <span className="font-medium text-slate-900">{formatCurrency(ms.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Attestation */}
      <label
        className="flex items-start gap-3 mb-6 cursor-pointer"
        data-testid="migration-attestation"
      >
        <input
          type="checkbox"
          checked={attested}
          onChange={(e) => setAttested(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
        />
        <span className="text-sm text-slate-700">
          {t(
            'reviewB.attestation',
            'I confirm the declared value of {{amount}} accurately represents the total migration engagement value.',
            { amount: formatCurrency(projectValue) }
          )}
        </span>
      </label>

      {/* Actions */}
      <div className="flex justify-between items-center">
        <Button
          variant="outline"
          onClick={() => setShowDecline(true)}
          data-testid="decline-migration-btn"
        >
          {t('review.decline', 'Decline')}
        </Button>
        <div className="text-end">
          <Button
            disabled={!attested || acceptMigration.isPending}
            onClick={handleAccept}
            className="bg-violet-500 hover:bg-violet-600 text-white"
            data-testid="accept-migration-btn"
          >
            {acceptMigration.isPending ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
            {isZeroRemaining
              ? t('reviewB.acceptConfirm', 'Accept & Confirm Migration')
              : t('reviewB.acceptStart', 'Accept & Start Migration')}
          </Button>
          {!isZeroRemaining && migrationMilestones[0] && (
            <p className="text-xs text-slate-500 mt-1">
              {t(
                'reviewB.invoiceNotice',
                'An invoice for {{amount}} will be generated immediately.',
                {
                  amount: formatCurrency(migrationMilestones[0].amount),
                }
              )}
            </p>
          )}
        </div>
      </div>

      {acceptMigration.isError && (
        <div className="mt-4 bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
          {t('review.acceptFailed', 'Failed to accept. Please try again.')}
        </div>
      )}

      {showDecline && (
        <DeclineModal
          onClose={() => setShowDecline(false)}
          onDecline={handleDecline}
          isPending={false}
        />
      )}
    </div>
  );
}

export default function AgreementReviewPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation('billing');
  const navigate = useNavigate();
  const { data, isLoading, isError } = useBillingAgreementDetail(id ?? '');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="max-w-2xl mx-auto mt-12 text-center">
        <p className="text-slate-500">{t('review.notFound', 'Agreement not found.')}</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/billing')}>
          {t('review.backToBilling', 'Back to Billing')}
        </Button>
      </div>
    );
  }

  const { agreement, tiers, milestones } = data;
  const tierData = tiers as { bracketCeiling: number | null; rateBps: number; sortOrder: number }[];

  // Variant A for draft status
  if (agreement.status === 'draft') {
    return (
      <div className="p-6">
        <VariantA agreement={agreement} tiers={tierData} />
      </div>
    );
  }

  // Variant B for migration-ready statuses
  if (
    agreement.status === 'active_assessment' ||
    agreement.status === 'migration_pending_review' ||
    agreement.status === 'active_migration'
  ) {
    return (
      <div className="p-6">
        <VariantB agreement={agreement} tiers={tierData} milestones={milestones} />
      </div>
    );
  }

  // Other statuses — redirect back
  navigate('/billing');
  return null;
}
