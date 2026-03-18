/**
 * Bill Summary Card
 *
 * Displays execution bill statistics for a project:
 * - Total bills by status
 * - Total billed and approved amounts
 * - Progress visualization
 */
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Send, Clock, CheckCircle, XCircle, TrendingUp } from 'lucide-react';
import { useBillSummary } from '../hooks/use-execution-bills';

interface BillSummaryCardProps {
  projectId: string;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export const BillSummaryCard = memo(function BillSummaryCard({ projectId }: BillSummaryCardProps) {
  const { t } = useTranslation('execution');
  const { data: summary, isLoading } = useBillSummary(projectId);

  if (isLoading) {
    return (
      <div className="bg-gradient-to-r from-emerald-500 to-green-500 rounded-xl p-6 text-white animate-pulse">
        <div className="h-6 bg-white/20 rounded w-48 mb-4"></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-white/20 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  const pendingCount = summary.submittedCount + summary.underReviewCount;
  const progressPercent =
    summary.totalBills > 0 ? Math.round((summary.approvedCount / summary.totalBills) * 100) : 0;

  return (
    <div className="bg-gradient-to-r from-emerald-500 to-green-500 rounded-xl p-6 text-white">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          {t('summary.title')}
        </h3>
        {summary.totalBills > 0 && (
          <span className="text-sm bg-white/20 px-3 py-1 rounded-full">
            {progressPercent}% {t('summary.approved')}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
        {/* Total Bills */}
        <div className="bg-white/10 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="h-4 w-4 opacity-80" />
            <span className="text-xs opacity-80">{t('summary.totalBills')}</span>
          </div>
          <p className="text-2xl font-bold font-mono">{summary.totalBills}</p>
        </div>

        {/* Drafts */}
        <div className="bg-white/10 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="h-4 w-4 opacity-80" />
            <span className="text-xs opacity-80">{t('filters.draft')}</span>
          </div>
          <p className="text-2xl font-bold font-mono">{summary.draftCount}</p>
        </div>

        {/* Pending Approval (Submitted + Under Review) */}
        <div className="bg-white/10 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 opacity-80" />
            <span className="text-xs opacity-80">{t('summary.pendingApproval')}</span>
          </div>
          <p className="text-2xl font-bold font-mono">{pendingCount}</p>
        </div>

        {/* Approved */}
        <div className="bg-white/10 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="h-4 w-4 opacity-80" />
            <span className="text-xs opacity-80">{t('summary.approved')}</span>
          </div>
          <p className="text-2xl font-bold font-mono">{summary.approvedCount}</p>
        </div>

        {/* Total Billed */}
        <div className="bg-white/10 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Send className="h-4 w-4 opacity-80" />
            <span className="text-xs opacity-80">{t('summary.totalBilled')}</span>
          </div>
          <p className="text-lg font-bold font-mono">{formatCurrency(summary.totalValueCents)}</p>
        </div>

        {/* Rejected */}
        {summary.rejectedCount > 0 && (
          <div className="bg-red-500/30 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="h-4 w-4 opacity-80" />
              <span className="text-xs opacity-80">{t('filters.rejected')}</span>
            </div>
            <p className="text-2xl font-bold font-mono">{summary.rejectedCount}</p>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {summary.totalBills > 0 && (
        <div className="mt-4">
          <div className="flex justify-between text-xs mb-1 opacity-80">
            <span>{t('filters.draft')}</span>
            <span>{t('summary.approved')}</span>
          </div>
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full flex">
              {/* Approved section */}
              <div
                className="bg-white/90 transition-all duration-500"
                style={{
                  width: `${(summary.approvedCount / summary.totalBills) * 100}%`,
                }}
              />
              {/* Under review section */}
              <div
                className="bg-white/50 transition-all duration-500"
                style={{
                  width: `${(summary.underReviewCount / summary.totalBills) * 100}%`,
                }}
              />
              {/* Submitted section */}
              <div
                className="bg-white/30 transition-all duration-500"
                style={{
                  width: `${(summary.submittedCount / summary.totalBills) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default BillSummaryCard;
