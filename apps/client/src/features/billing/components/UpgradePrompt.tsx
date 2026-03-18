/**
 * UpgradePrompt Component
 *
 * Shows a banner prompting users to upgrade when they're approaching
 * or have hit their plan limits.
 */
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUsage } from '../hooks/use-usage';

interface UpgradePromptProps {
  onUpgrade: () => void;
  threshold?: number; // Percentage at which to show the prompt (default 80)
}

export function UpgradePrompt({ onUpgrade, threshold = 80 }: UpgradePromptProps) {
  const { t } = useTranslation();
  const { data: usage } = useUsage();

  if (!usage) return null;

  // Check if any limit is above threshold (use pre-computed percentage from backend)
  const userPercent = usage.users.percentage;
  const projectPercent = usage.projects.percentage;
  const storagePercent = usage.storage.percentage;

  const maxPercent = Math.max(userPercent, projectPercent, storagePercent);

  if (maxPercent < threshold) return null;

  const isCritical = maxPercent >= 95;

  // Determine which limit is being approached
  let limitType = 'resources';
  if (userPercent >= threshold) limitType = 'users';
  else if (projectPercent >= threshold) limitType = 'projects';
  else if (storagePercent >= threshold) limitType = 'storage';

  return (
    <div
      className={`rounded shadow-sm p-4 flex items-center justify-between gap-4 ${
        isCritical ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
      }`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
            isCritical ? 'text-red-500' : 'text-amber-500'
          }`}
        />
        <div>
          <p className={`font-medium ${isCritical ? 'text-red-800' : 'text-amber-800'}`}>
            {isCritical
              ? t('billing.upgrade.limitReached', { type: limitType })
              : t('billing.upgrade.approaching', { type: limitType })}
          </p>
          <p className={`text-sm mt-1 ${isCritical ? 'text-red-600' : 'text-amber-600'}`}>
            {t('billing.upgrade.prompt')}
          </p>
        </div>
      </div>

      <Button
        onClick={onUpgrade}
        className={`flex-shrink-0 ${
          isCritical
            ? 'bg-red-600 hover:bg-red-700 text-white'
            : 'bg-amber-600 hover:bg-amber-700 text-white'
        }`}
      >
        {t('billing.upgrade.button')}
        <ArrowRight className="h-4 w-4 ms-2" />
      </Button>
    </div>
  );
}
