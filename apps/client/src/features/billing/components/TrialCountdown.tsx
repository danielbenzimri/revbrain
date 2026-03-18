/**
 * TrialCountdown Component
 *
 * Displays the number of days remaining in a trial subscription.
 */
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';

interface TrialCountdownProps {
  trialEndDate: string;
  className?: string;
}

export function TrialCountdown({ trialEndDate, className = '' }: TrialCountdownProps) {
  const { t } = useTranslation();

  const endDate = new Date(trialEndDate);
  const now = new Date();
  const diffTime = endDate.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

  // Color based on urgency
  const colorClass =
    daysRemaining <= 1
      ? 'bg-red-100 text-red-800 border-red-200'
      : daysRemaining <= 3
        ? 'bg-amber-100 text-amber-800 border-amber-200'
        : 'bg-violet-100 text-blue-800 border-violet-200';

  if (daysRemaining === 0) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border bg-red-100 text-red-800 border-red-200 ${className}`}
      >
        <Clock className="h-4 w-4" />
        <span>{t('billing.trial.expired')}</span>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border ${colorClass} ${className}`}
    >
      <Clock className="h-4 w-4" />
      <span>
        {t('billing.trial.countdown', {
          count: daysRemaining,
          days: daysRemaining,
        })}
      </span>
    </div>
  );
}
