/**
 * UsageDashboard Component
 *
 * Displays current usage statistics with progress bars for
 * users, projects, and storage.
 */
import { useTranslation } from 'react-i18next';
import { Users, FolderKanban, HardDrive, Loader2 } from 'lucide-react';
import { useUsage } from '../hooks/use-usage';

interface UsageItemProps {
  icon: React.ReactNode;
  label: string;
  current: number;
  limit: number;
  unit?: string;
  isUnlimited?: boolean;
}

function UsageItem({
  icon,
  label,
  current,
  limit,
  unit = '',
  isUnlimited = false,
}: UsageItemProps) {
  const { t } = useTranslation();
  const percentage = isUnlimited ? 0 : Math.min(100, (current / limit) * 100);
  const isWarning = !isUnlimited && percentage >= 80;
  const isCritical = !isUnlimited && percentage >= 95;

  const progressColor = isCritical ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div className="flex-1 min-w-[200px]">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-slate-400">{icon}</span>
        <span className="text-sm font-medium text-slate-700">{label}</span>
      </div>

      <div className="flex items-baseline gap-1 mb-2">
        <span className="text-2xl font-bold text-slate-900">
          {current}
          {unit}
        </span>
        <span className="text-sm text-slate-500">
          / {isUnlimited ? t('billing.usage.unlimited') : `${limit}${unit}`}
        </span>
      </div>

      {!isUnlimited && (
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${progressColor}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}

      {isUnlimited && (
        <div className="h-2 bg-gradient-to-r from-emerald-100 to-emerald-200 rounded-full" />
      )}
    </div>
  );
}

export function UsageDashboard() {
  const { t } = useTranslation();
  const { data: usage, isLoading, error } = useUsage();

  if (isLoading) {
    return (
      <div className="bg-white rounded shadow-sm border-slate-200 p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      </div>
    );
  }

  if (error || !usage) {
    return null;
  }

  return (
    <div className="bg-white rounded shadow-sm border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-900">{t('billing.usage.title')}</h2>
      </div>

      <div className="p-6">
        <div className="flex flex-wrap gap-8">
          <UsageItem
            icon={<Users className="h-5 w-5" />}
            label={t('billing.usage.users')}
            current={usage.users.used}
            limit={usage.users.limit}
            isUnlimited={usage.users.limit === 0}
          />

          <UsageItem
            icon={<FolderKanban className="h-5 w-5" />}
            label={t('billing.usage.projects')}
            current={usage.projects.used}
            limit={usage.projects.limit}
            isUnlimited={usage.projects.limit === 0}
          />

          <UsageItem
            icon={<HardDrive className="h-5 w-5" />}
            label={t('billing.usage.storage')}
            current={usage.storage.usedGB}
            limit={usage.storage.limitGB}
            unit=" GB"
            isUnlimited={usage.storage.limitGB === 0}
          />
        </div>
      </div>
    </div>
  );
}
