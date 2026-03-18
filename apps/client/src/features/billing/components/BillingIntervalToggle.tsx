/**
 * BillingIntervalToggle Component
 *
 * A premium pill-shaped toggle for switching between monthly and yearly billing.
 * Shows savings percentage badge for yearly option.
 * Supports RTL languages.
 */
import { useTranslation } from 'react-i18next';

interface BillingIntervalToggleProps {
  interval: 'month' | 'year';
  onChange: (interval: 'month' | 'year') => void;
  savingsPercent?: number;
}

export function BillingIntervalToggle({
  interval,
  onChange,
  savingsPercent,
}: BillingIntervalToggleProps) {
  const { t } = useTranslation();

  return (
    <div className="inline-flex items-center gap-3">
      {/* Toggle container - simple button group approach for RTL support */}
      <div className="inline-flex items-center p-1 bg-slate-100 rounded-full">
        {/* Monthly button */}
        <button
          type="button"
          onClick={() => onChange('month')}
          className={`px-5 py-2 text-sm font-medium rounded-full transition-all duration-200 ${
            interval === 'month'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {t('billing.interval.monthly')}
        </button>

        {/* Yearly button */}
        <button
          type="button"
          onClick={() => onChange('year')}
          className={`px-5 py-2 text-sm font-medium rounded-full transition-all duration-200 ${
            interval === 'year'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {t('billing.interval.yearly')}
        </button>
      </div>

      {/* Savings badge - only show if savingsPercent is provided and > 0 */}
      {savingsPercent != null && savingsPercent > 0 && (
        <span className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-violet-700 bg-violet-100 rounded-full">
          {t('billing.interval.savePercent', { percent: savingsPercent })}
        </span>
      )}
    </div>
  );
}
