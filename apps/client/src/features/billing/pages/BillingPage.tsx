/**
 * SI Partner Billing Page
 *
 * Replaces the subscription-based BillingPage with the SI partner billing view.
 * Shows: partner status, active projects, recent invoices, billing summary.
 *
 * Task: P4.4
 * Refs: SI-BILLING-SPEC.md §12.2.1
 */
import { useTranslation } from 'react-i18next';
import { Loader2, Star, AlertTriangle } from 'lucide-react';
import {
  usePartnerStatus,
  useBillingAgreements,
  useBillingInvoices,
  formatCurrency,
  getTierProgress,
} from '../hooks/use-partner-billing';

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    standard: 'bg-slate-100 text-slate-700',
    silver: 'bg-gray-200 text-gray-800',
    gold: 'bg-amber-100 text-amber-800',
    platinum: 'bg-violet-100 text-violet-800',
  };
  return (
    <span
      className={`px-2 py-1 text-xs font-medium rounded-full ${colors[tier] ?? colors.standard}`}
    >
      {tier.charAt(0).toUpperCase() + tier.slice(1)}
    </span>
  );
}

export default function BillingPage() {
  const { t } = useTranslation('billing');
  const { data: partner, isLoading: partnerLoading } = usePartnerStatus();
  const { data: agreements = [], isLoading: agreementsLoading } = useBillingAgreements();
  const { data: invoices = [], isLoading: invoicesLoading } = useBillingInvoices();

  const isLoading = partnerLoading || agreementsLoading || invoicesLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  const tierInfo = partner ? getTierProgress(partner.cumulativeFeesPaid) : null;
  const activeAgreements = agreements.filter(
    (a) =>
      a.status === 'active_assessment' ||
      a.status === 'active_migration' ||
      a.status === 'migration_pending_review'
  );
  const overdueInvoices = invoices.filter((i) => i.status === 'overdue');

  // Calculate billing summary
  const totalInvoiced = invoices.reduce(
    (sum, i) => sum + (i.status !== 'voided' ? i.amount : 0),
    0
  );
  const totalPaid = invoices.reduce((sum, i) => sum + (i.status === 'paid' ? i.amount : 0), 0);
  const outstanding = totalInvoiced - totalPaid;

  return (
    <div className="p-6 space-y-6" data-testid="billing-page">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('title', 'Billing & Invoices')}</h1>
        <p className="text-slate-500">{t('subtitle', 'Your partner billing overview')}</p>
      </div>

      {/* Overdue Banner */}
      {overdueInvoices.length > 0 && (
        <div
          className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3"
          data-testid="overdue-banner"
        >
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">
              {overdueInvoices.length} overdue invoice(s)
            </p>
          </div>
        </div>
      )}

      {/* Partner Status Card */}
      {partner ? (
        <div
          className="bg-white border border-slate-200 rounded-xl p-6"
          data-testid="partner-status"
        >
          <div className="flex items-center gap-3 mb-3">
            <Star className="h-5 w-5 text-amber-500" />
            <TierBadge tier={partner.tierOverride ?? tierInfo?.currentTier ?? 'standard'} />
            <span className="text-sm text-slate-500">Partner</span>
          </div>
          <p className="text-sm text-slate-600 mb-2">
            {t('feesPaid', 'Fees paid to date')}: {formatCurrency(partner.cumulativeFeesPaid)}
          </p>
          {tierInfo && tierInfo.nextTier && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>{formatCurrency(partner.cumulativeFeesPaid)}</span>
                <span>
                  {formatCurrency(tierInfo.nextThreshold)} to {tierInfo.nextTier}
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className="bg-violet-500 h-2 rounded-full"
                  style={{ width: `${tierInfo.progress}%` }}
                />
              </div>
            </div>
          )}
          <p className="text-sm text-slate-500 mt-2">
            {t('projectsCompleted', 'Projects completed')}: {partner.completedProjectCount}
            {' · '}
            {t('active', 'Active')}: {activeAgreements.length}
          </p>
        </div>
      ) : (
        <div
          className="bg-white border border-slate-200 rounded-xl p-6"
          data-testid="partner-empty"
        >
          <p className="text-slate-500">
            {t(
              'emptyPartner',
              'Standard Partner. No projects yet. Billing appears here once a fee agreement is created.'
            )}
          </p>
        </div>
      )}

      {/* Active Projects */}
      {activeAgreements.length > 0 && (
        <div className="space-y-3" data-testid="active-projects">
          <h2 className="text-lg font-semibold text-slate-900">
            {t('activeProjects', 'Active Projects')}
          </h2>
          {activeAgreements.map((agreement) => {
            const isAssessment =
              agreement.status === 'active_assessment' ||
              agreement.status === 'migration_pending_review';
            const total = agreement.calculatedTotalFee ?? agreement.assessmentFee;
            const paidAmount = invoices
              .filter((i) => i.feeAgreementId === agreement.id && i.status === 'paid')
              .reduce((sum, i) => sum + i.amount, 0);
            const progress = total > 0 ? (paidAmount / total) * 100 : 0;

            return (
              <div
                key={agreement.id}
                className="bg-white border border-slate-200 rounded-lg p-4"
                data-testid={`project-card-${agreement.id}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium text-slate-900">
                      {isAssessment
                        ? `Assessment — ${formatCurrency(agreement.assessmentFee)}`
                        : `Migration — ${formatCurrency(total)}`}
                    </p>
                    {isAssessment ? (
                      <p className="text-sm text-slate-500">
                        {t('assessmentInProgress', 'Assessment in progress — migration fee TBD')}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-500">
                        {t('paid', 'Paid')}: {formatCurrency(paidAmount)}
                      </p>
                    )}
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                    {agreement.status.replace(/_/g, ' ')}
                  </span>
                </div>
                {!isAssessment && (
                  <div className="w-full bg-slate-100 rounded-full h-2 mt-2">
                    <div
                      className="bg-violet-500 h-2 rounded-full"
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Recent Invoices */}
      {invoices.length > 0 && (
        <div data-testid="recent-invoices">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">
            {t('recentInvoices', 'Recent Invoices')}
          </h2>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-start px-4 py-2 text-xs font-medium text-slate-500">
                    {t('milestone', 'Milestone')}
                  </th>
                  <th className="text-start px-4 py-2 text-xs font-medium text-slate-500">
                    {t('amount', 'Amount')}
                  </th>
                  <th className="text-start px-4 py-2 text-xs font-medium text-slate-500">
                    {t('status', 'Status')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.slice(0, 10).map((invoice) => (
                  <tr key={invoice.id} className="border-b border-slate-100">
                    <td className="px-4 py-2 text-sm">{invoice.name}</td>
                    <td className="px-4 py-2 text-sm">{formatCurrency(invoice.amount)}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          invoice.status === 'paid'
                            ? 'bg-green-100 text-green-700'
                            : invoice.status === 'overdue'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {invoice.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Billing Summary */}
      <div
        className="bg-white border border-slate-200 rounded-xl p-4"
        data-testid="billing-summary"
      >
        <h3 className="text-sm font-medium text-slate-700 mb-2">
          {t('billingSummary', 'Billing Summary')}
        </h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-slate-500">{t('totalInvoiced', 'Invoiced')}</p>
            <p className="font-medium">{formatCurrency(totalInvoiced)}</p>
          </div>
          <div>
            <p className="text-slate-500">{t('totalPaid', 'Paid')}</p>
            <p className="font-medium">{formatCurrency(totalPaid)}</p>
          </div>
          <div>
            <p className="text-slate-500">{t('outstanding', 'Outstanding')}</p>
            <p className="font-medium">{formatCurrency(outstanding)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
