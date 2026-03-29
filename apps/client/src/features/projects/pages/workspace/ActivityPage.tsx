/**
 * Activity Page
 *
 * Chronological project activity log or empty state.
 */
import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Activity, Database, ClipboardCheck, Plug, Rocket, Circle } from 'lucide-react';
import { getMockProjectWorkspaceData, type ActivityItem } from '../../mocks/workspace-mock-data';

const activityTypeIcons: Record<
  string,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  extraction: Database,
  assessment: ClipboardCheck,
  connection: Plug,
  deployment: Rocket,
  user: Circle,
  settings: Circle,
};

function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const Icon = activityTypeIcons[item.type] || Circle;

  return (
    <div className="flex items-start gap-4 py-4">
      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
        <Icon size={14} className="text-slate-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-800">{item.message}</p>
        <p className="text-xs text-slate-400 mt-0.5">
          {item.user} &middot; {formatTimeAgo(item.timestamp)}
        </p>
      </div>
    </div>
  );
}

export default function ActivityPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const isMockMode = import.meta.env.VITE_AUTH_MODE === 'mock';
  const data = useMemo(() => {
    if (!id) return null;
    if (isMockMode) {
      return getMockProjectWorkspaceData(id);
    }
    return null;
  }, [id, isMockMode]);

  if (!id) return null;

  const items = data?.recentActivity ?? [];

  if (items.length > 0) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-xl font-semibold text-slate-900">
          {t('workspace.placeholder.activity.title')}
        </h1>
        <div className="bg-white rounded-2xl p-6">
          <div className="divide-y divide-slate-100">
            {items.map((item) => (
              <ActivityRow key={item.id} item={item} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-6">
          <Activity size={28} className="text-slate-400" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900 mb-2">
          {t('workspace.placeholder.activity.heading')}
        </h1>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          {t('workspace.placeholder.activity.description')}
        </p>
        <button
          onClick={() => navigate(`/project/${id}`)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
          aria-label={t('workspace.placeholder.activity.cta')}
        >
          {t('workspace.placeholder.activity.cta')}
        </button>
        <p className="text-xs text-slate-400 mt-4">
          {t('workspace.placeholder.activity.noActivity')}
        </p>
      </div>
    </div>
  );
}
