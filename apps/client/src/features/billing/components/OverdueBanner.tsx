/**
 * Overdue Banner
 *
 * Shows a prominent banner when the org has overdue invoices.
 * At 30+ days, also blocks new project creation.
 *
 * Task: P8.2
 * Refs: SI-BILLING-SPEC.md §4.1, §12.2.1
 */
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';

export function OverdueBanner({
  overdueCount,
  daysOverdue,
}: {
  overdueCount: number;
  daysOverdue: number;
}) {
  const { t } = useTranslation('billing');

  if (overdueCount === 0) return null;

  const isBlocking = daysOverdue >= 30;

  return (
    <div
      className={`rounded-lg p-4 flex items-start gap-3 ${
        isBlocking ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'
      }`}
      data-testid="overdue-banner"
    >
      <AlertTriangle
        className={`h-5 w-5 shrink-0 mt-0.5 ${isBlocking ? 'text-red-600' : 'text-amber-600'}`}
      />
      <div>
        <p className={`text-sm font-medium ${isBlocking ? 'text-red-800' : 'text-amber-800'}`}>
          {overdueCount === 1
            ? t('overdue.singleInvoice', '1 overdue invoice')
            : t('overdue.multipleInvoices', '{{count}} overdue invoices', { count: overdueCount })}
        </p>
        {isBlocking && (
          <p className="text-sm text-red-700 mt-1">
            {t(
              'overdue.projectsBlocked',
              'New project creation is blocked until overdue invoices are resolved.'
            )}
          </p>
        )}
      </div>
    </div>
  );
}
