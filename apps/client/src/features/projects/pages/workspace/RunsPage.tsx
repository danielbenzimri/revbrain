/**
 * Runs Page
 *
 * Shows extraction, assessment, deployment, and validation runs.
 */
import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Play, CheckCircle2, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getMockProjectWorkspaceData,
  type RunItem,
  type RunStatus,
} from '../../mocks/workspace-mock-data';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

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

const statusConfig: Record<
  RunStatus,
  { icon: React.ComponentType<{ size?: number; className?: string }>; color: string }
> = {
  completed: { icon: CheckCircle2, color: 'text-emerald-500' },
  running: { icon: Loader2, color: 'text-violet-500' },
  failed: { icon: AlertCircle, color: 'text-red-500' },
  queued: { icon: Clock, color: 'text-slate-400' },
};

function RunRow({ run }: { run: RunItem }) {
  const { t } = useTranslation();
  const config = statusConfig[run.status];
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-4 py-4">
      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
        <Icon size={16} className={cn(config.color, run.status === 'running' && 'animate-spin')} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-900">#{run.number}</span>
          <span className="text-xs text-slate-400">{t(`workspace.runType.${run.type}`)}</span>
        </div>
        <p className="text-xs text-slate-400 mt-0.5">
          {formatTimeAgo(run.startedAt)}
          {run.duration !== null && ` \u00B7 ${formatDuration(run.duration)}`}
        </p>
      </div>
      <div className="text-end shrink-0">
        <span className={cn('text-xs font-medium', config.color)}>
          {t(`workspace.runStatus.${run.status}`)}
        </span>
        {run.recordsProcessed !== null && (
          <p className="text-[11px] text-slate-400 mt-0.5">
            {run.recordsProcessed.toLocaleString()}{' '}
            {t('workspace.overview.connectionCards.records').toLowerCase()}
          </p>
        )}
      </div>
    </div>
  );
}

export default function RunsPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Mock data provides page skeleton; real API data overlaid via hooks
  const data = useMemo(() => {
    if (!id) return null;
    return getMockProjectWorkspaceData(id);
  }, [id]);

  if (!id) return null;

  const runs = data?.recentRuns ?? [];

  if (runs.length > 0) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-xl font-semibold text-slate-900">
          {t('workspace.placeholder.runs.title')}
        </h1>
        <div className="bg-white rounded-2xl p-6">
          <div className="divide-y divide-slate-100">
            {runs.map((run) => (
              <RunRow key={run.id} run={run} />
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
          <Play size={28} className="text-slate-400" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900 mb-2">
          {t('workspace.placeholder.runs.heading')}
        </h1>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          {t('workspace.placeholder.runs.description')}
        </p>
        <button
          onClick={() => navigate(`/project/${id}`)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
          aria-label={t('workspace.placeholder.runs.cta')}
        >
          {t('workspace.placeholder.runs.cta')}
        </button>
        <p className="text-xs text-slate-400 mt-4">{t('workspace.placeholder.runs.noRuns')}</p>
      </div>
    </div>
  );
}
