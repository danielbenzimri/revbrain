/**
 * Waiting for Payment Callout
 *
 * Shown when M1 (assessment milestone) is invoiced but not yet paid.
 *
 * Task: P4.3
 * Refs: SI-BILLING-SPEC.md §12.2.2
 */
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../hooks/use-partner-billing';

export function WaitingForPaymentCallout({
  milestoneName,
  amount,
}: {
  milestoneName: string;
  amount: number;
}) {
  const { t } = useTranslation('billing');

  return (
    <div
      className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3"
      data-testid="waiting-payment-callout"
    >
      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-medium text-amber-800">
          {t('projectBilling.waitingForPayment', 'Waiting for payment')}
        </p>
        <p className="text-sm text-amber-700 mt-1">
          {milestoneName} — {formatCurrency(amount)}
        </p>
      </div>
    </div>
  );
}
