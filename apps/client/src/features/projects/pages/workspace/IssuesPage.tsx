/**
 * Issues Page
 *
 * Shows migration issues with severity or contextual empty state.
 */
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, AlertOctagon, Info, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getMockProjectWorkspaceData,
  type IssueItem,
  type IssueSeverity,
} from '../../mocks/workspace-mock-data';

const severityConfig: Record<
  IssueSeverity,
  { icon: React.ComponentType<{ size?: number; className?: string }>; color: string; bg: string }
> = {
  blocker: { icon: AlertOctagon, color: 'text-red-500', bg: 'bg-red-50' },
  warning: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50' },
  info: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-50' },
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

function IssueCard({ issue }: { issue: IssueItem }) {
  const { t } = useTranslation();
  const config = severityConfig[issue.severity];
  const Icon = config.icon;

  return (
    <div className={cn('rounded-xl p-4 flex items-start gap-3', config.bg)}>
      <Icon size={18} className={cn('mt-0.5 shrink-0', config.color)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={cn('text-xs font-semibold uppercase', config.color)}>
            {t(`workspace.severity.${issue.severity}`)}
          </span>
          <span className="text-[11px] text-slate-400">{formatTimeAgo(issue.createdAt)}</span>
        </div>
        <p className="text-sm text-slate-800 leading-snug">{issue.title}</p>
        <p className="text-xs text-slate-500 mt-1">{issue.object}</p>
      </div>
    </div>
  );
}

export default function IssuesPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const isMockMode = import.meta.env.VITE_AUTH_MODE === 'mock';
  const data = useMemo(() => {
    if (!id) return null;
    if (isMockMode) {
      return getMockProjectWorkspaceData(id);
    }
    return null;
  }, [id, isMockMode]);

  if (!id) return null;

  const issues = data?.topIssues ?? [];

  if (issues.length > 0) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-900">
            {t('workspace.placeholder.issues.title')}
          </h1>
          <span className="text-sm text-slate-500">
            {issues.length} {issues.length === 1 ? 'issue' : 'issues'}
          </span>
        </div>
        <div className="space-y-3">
          {issues.map((issue) => (
            <IssueCard key={issue.id} issue={issue} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 size={28} className="text-emerald-400" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900 mb-2">
          {t('workspace.placeholder.issues.heading')}
        </h1>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          {t('workspace.placeholder.issues.description')}
        </p>
        <p className="text-xs text-emerald-600 font-medium">
          {t('workspace.placeholder.issues.noIssues')}
        </p>
      </div>
    </div>
  );
}
