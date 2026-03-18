/**
 * Bills List Component
 *
 * Displays a list of execution bills for a project with:
 * - Summary stats
 * - Status-based filtering
 * - Bill creation
 * - Navigation to bill detail
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  Plus,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useBills, useBillSummary, type BillStatus, type Bill } from '../hooks/use-execution-bills';

interface BillsListProps {
  projectId: string;
  onBillClick?: (bill: Bill) => void;
  onCreateBill?: () => void;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('he-IL', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getStatusIcon(status: BillStatus) {
  switch (status) {
    case 'draft':
      return <FileText className="h-4 w-4" />;
    case 'submitted':
      return <Clock className="h-4 w-4" />;
    case 'under_review':
      return <AlertCircle className="h-4 w-4" />;
    case 'approved':
      return <CheckCircle className="h-4 w-4" />;
    case 'rejected':
      return <XCircle className="h-4 w-4" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
}

function getStatusColor(status: BillStatus): string {
  switch (status) {
    case 'draft':
      return 'bg-slate-100 text-slate-700';
    case 'submitted':
      return 'bg-blue-100 text-blue-700';
    case 'under_review':
      return 'bg-amber-100 text-amber-700';
    case 'approved':
      return 'bg-green-100 text-green-700';
    case 'rejected':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

export function BillsList({ projectId, onBillClick, onCreateBill }: BillsListProps) {
  const { t } = useTranslation('execution');
  const [statusFilter, setStatusFilter] = useState<BillStatus | 'all'>('all');

  const { data: billsData, isLoading: billsLoading } = useBills(projectId);
  const { data: summary, isLoading: summaryLoading } = useBillSummary(projectId);

  const bills = billsData?.bills || [];
  const filteredBills =
    statusFilter === 'all' ? bills : bills.filter((b) => b.status === statusFilter);

  const isLoading = billsLoading || summaryLoading;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  const hasNoBills = bills.length === 0;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded shadow-sm p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
              <FileText className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary.totalBills}</p>
              <p className="text-xs text-neutral-500">{t('summary.totalBills')}</p>
            </div>
          </div>

          <div className="bg-white rounded shadow-sm p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {summary.submittedCount + summary.underReviewCount}
              </p>
              <p className="text-xs text-neutral-500">{t('summary.pendingApproval')}</p>
            </div>
          </div>

          <div className="bg-white rounded shadow-sm p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary.approvedCount}</p>
              <p className="text-xs text-neutral-500">{t('summary.approved')}</p>
            </div>
          </div>

          <div className="bg-white rounded shadow-sm p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <span className="font-mono text-sm text-emerald-600">$</span>
            </div>
            <div>
              <p className="text-lg font-bold font-mono">
                {formatCurrency(summary.totalValueCents)}
              </p>
              <p className="text-xs text-neutral-500">{t('summary.totalBilled')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Header with Create Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white rounded shadow-sm p-4">
        <div>
          <h3 className="font-semibold">{t('title')}</h3>
          <p className="text-sm text-neutral-500">{t('subtitle')}</p>
        </div>
        <Button onClick={onCreateBill} size="sm" className="bg-emerald-500 hover:bg-emerald-600">
          <Plus className="h-4 w-4 me-1" />
          {t('create')}
        </Button>
      </div>

      {/* Status Filters */}
      {!hasNoBills && (
        <div className="flex flex-wrap gap-2">
          {(['all', 'draft', 'submitted', 'under_review', 'approved', 'rejected'] as const).map(
            (status) => (
              <Button
                key={status}
                variant={statusFilter === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(status)}
                className={statusFilter === status ? 'bg-emerald-500 hover:bg-emerald-600' : ''}
              >
                {status === 'all' ? t('filters.all') : t(`status.${status}`)}
                {status !== 'all' && summary && (
                  <span className="ms-1 text-xs opacity-70">
                    (
                    {status === 'draft'
                      ? summary.draftCount
                      : status === 'submitted'
                        ? summary.submittedCount
                        : status === 'under_review'
                          ? summary.underReviewCount
                          : status === 'approved'
                            ? summary.approvedCount
                            : summary.rejectedCount}
                    )
                  </span>
                )}
              </Button>
            )
          )}
        </div>
      )}

      {/* Empty State */}
      {hasNoBills && (
        <div className="bg-white rounded shadow-sm p-8 text-center">
          <div className="mx-auto w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mb-4">
            <FileText className="h-8 w-8 text-neutral-400" />
          </div>
          <h3 className="font-semibold text-lg mb-2">{t('empty')}</h3>
          <p className="text-neutral-500 text-sm mb-4">{t('emptyDescription')}</p>
          <Button onClick={onCreateBill} className="bg-emerald-500 hover:bg-emerald-600">
            <Plus className="h-4 w-4 me-1" />
            {t('create')}
          </Button>
        </div>
      )}

      {/* Bills Table */}
      {!hasNoBills && filteredBills.length > 0 && (
        <div className="bg-white rounded shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-start p-4 text-sm font-medium text-slate-500">
                    {t('bill.title', { number: '' })}
                  </th>
                  <th className="text-start p-4 text-sm font-medium text-slate-500">
                    {t('bill.status')}
                  </th>
                  <th className="text-start p-4 text-sm font-medium text-slate-500">
                    {t('bill.period')}
                  </th>
                  <th className="text-end p-4 text-sm font-medium text-slate-500">
                    {t('bill.total')}
                  </th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filteredBills.map((bill) => (
                  <tr
                    key={bill.id}
                    className="border-b last:border-0 hover:bg-slate-50 cursor-pointer"
                    onClick={() => onBillClick?.(bill)}
                  >
                    <td className="p-4 font-medium">
                      {t('bill.title', { number: bill.billNumber })}
                    </td>
                    <td className="p-4">
                      <Badge
                        className={`${getStatusColor(bill.status)} flex w-fit items-center gap-1`}
                      >
                        {getStatusIcon(bill.status)}
                        {t(`status.${bill.status}`)}
                      </Badge>
                    </td>
                    <td className="p-4 text-sm text-slate-600">
                      {bill.periodStart && bill.periodEnd
                        ? `${formatDate(bill.periodStart)} - ${formatDate(bill.periodEnd)}`
                        : formatDate(bill.periodStart) || '-'}
                    </td>
                    <td className="p-4 text-end font-mono text-sm">
                      {formatCurrency(bill.totalCents)}
                    </td>
                    <td className="p-4">
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No results for filter */}
      {!hasNoBills && filteredBills.length === 0 && (
        <div className="bg-white rounded shadow-sm p-8 text-center">
          <p className="text-neutral-500">
            {t('filters.all')} - 0 {t('summary.totalBills').toLowerCase()}
          </p>
        </div>
      )}
    </div>
  );
}
