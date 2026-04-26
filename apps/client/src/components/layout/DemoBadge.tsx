import { useTranslation } from 'react-i18next';
import { FlaskConical } from 'lucide-react';

const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';

export function DemoBadge() {
  const { t } = useTranslation();
  if (!isDemoMode) return null;

  return (
    <div className="fixed bottom-4 end-4 z-50 flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 shadow-lg">
      <FlaskConical className="h-4 w-4 text-amber-600" />
      <span className="text-sm font-medium text-amber-700">
        {t('common.demoBadge', 'Demo Environment — Sample Data')}
      </span>
    </div>
  );
}
