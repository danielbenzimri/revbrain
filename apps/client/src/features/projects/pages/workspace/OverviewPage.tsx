/**
 * Project Overview Page
 *
 * The workspace dashboard showing health strip, connection cards,
 * what's next guidance, top issues, and recent activity.
 */
import { memo, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  AlertOctagon,
  AlertTriangle,
  Info,
  Plug,
  RefreshCw,
  Unplug,
  TestTube,
  Plus,
  CheckCircle2,
  Circle,
  Sparkles,
  Database,
  ClipboardCheck,
  Rocket,
  ShieldCheck,
  Cloud,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getMockProjectWorkspaceData,
  type WorkspaceData,
  type HealthStripItem,
  type HealthStatus,
  type ConnectionCardData,
  type IssueItem,
  type ActivityItem,
  type IssueSeverity,
} from '../../mocks/workspace-mock-data';
import {
  useConnectSalesforce,
  useDisconnectSalesforce,
  useTestConnection,
  useSalesforceConnections,
} from '../../hooks/use-salesforce-connection';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function useFormatTimeAgo() {
  const { t } = useTranslation();
  return (isoDate: string): string => {
    const diff = Date.now() - new Date(isoDate).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t('workspace.timeAgo.justNow');
    if (minutes < 60) return t('workspace.timeAgo.minutesAgo', { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('workspace.timeAgo.hoursAgo', { count: hours });
    const days = Math.floor(hours / 24);
    return t('workspace.timeAgo.daysAgo', { count: days });
  };
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

// ---------------------------------------------------------------------------
// Health Strip
// ---------------------------------------------------------------------------

const healthStatusColor: Record<HealthStatus, string> = {
  done: 'bg-emerald-400',
  warning: 'bg-amber-400',
  pending: 'bg-slate-400',
  in_progress: 'bg-violet-400',
  error: 'bg-red-400',
};

const healthStatusTextColor: Record<HealthStatus, string> = {
  done: 'text-emerald-600',
  warning: 'text-amber-600',
  pending: 'text-slate-400',
  in_progress: 'text-violet-600',
  error: 'text-red-600',
};

const healthIcons: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  source: Plug,
  data: Database,
  assessment: ClipboardCheck,
  target: Cloud,
  deploy: Rocket,
  validate: ShieldCheck,
};

const HealthPill = memo(function HealthPill({
  item,
  projectId,
}: {
  item: HealthStripItem;
  projectId: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const Icon = healthIcons[item.id] || Circle;

  return (
    <button
      onClick={() => {
        if (item.route) {
          navigate(`/project/${projectId}/${item.route}`);
        }
      }}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-xl bg-white transition-all hover:shadow-sm shrink-0',
        item.route ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default'
      )}
      aria-label={`${t(item.translationKey)}: ${item.statusText}`}
    >
      <Icon size={14} className="text-slate-400 shrink-0" />
      <div className="flex flex-col items-start min-w-0">
        <span className="text-[11px] font-medium text-slate-500 leading-none">
          {t(item.translationKey)}
        </span>
        <div className="flex items-center gap-1.5 mt-0.5">
          <div className={cn('h-2 w-2 rounded-full shrink-0', healthStatusColor[item.status])} />
          <span
            className={cn(
              'text-xs font-medium leading-none truncate',
              healthStatusTextColor[item.status]
            )}
          >
            {t(item.statusTextKey, { ...item.statusTextParams, defaultValue: item.statusText })}
          </span>
        </div>
      </div>
    </button>
  );
});

function HealthStrip({ items, projectId }: { items: HealthStripItem[]; projectId: string }) {
  return (
    <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1 scrollbar-none">
      {items.map((item, i) => (
        <div key={item.id} className="flex items-center gap-2">
          <HealthPill item={item} projectId={projectId} />
          {i < items.length - 1 && (
            <ChevronRight size={14} className="text-slate-300 shrink-0 rtl:rotate-180" />
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connection Cards
// ---------------------------------------------------------------------------

const ConnectionCard = memo(function ConnectionCard({
  type,
  connection,
  projectId,
  formatTimeAgo,
  onConnect,
  onDisconnect,
  onTest,
  isConnecting,
  connectError,
}: {
  type: 'source' | 'target';
  connection: ConnectionCardData | null;
  projectId: string;
  formatTimeAgo: (date: string) => string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onTest?: () => void;
  isConnecting?: boolean;
  connectError?: Error | null;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isSource = type === 'source';

  if (!connection) {
    return (
      <div
        className="bg-white rounded-2xl p-6 flex flex-col items-center justify-center text-center min-h-[200px] cursor-pointer border border-transparent hover:border-violet-300 transition-colors"
        onClick={onConnect || (() => navigate(`/project/${projectId}`))}
        role="button"
        tabIndex={0}
      >
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <Plug size={20} className="text-slate-400" />
        </div>
        <h3 className="text-base font-semibold text-slate-900 mb-1">
          {isSource
            ? t('workspace.overview.connectionCards.connectSource')
            : t('workspace.overview.connectionCards.connectTarget')}
        </h3>
        <p className="text-sm text-slate-500 mb-5 max-w-[260px]">
          {isSource
            ? t('workspace.overview.connectionCards.noSourceDescription')
            : t('workspace.overview.connectionCards.noTargetDescription')}
        </p>
        <button
          onClick={(e) => {
            e.stopPropagation();
            (onConnect || (() => navigate(`/project/${projectId}`)))();
          }}
          disabled={isConnecting}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50"
          aria-label={t('workspace.overview.connectionCards.connect')}
        >
          {isConnecting ? <RefreshCw size={16} className="animate-spin" /> : <Plus size={16} />}
          {isConnecting ? 'Connecting...' : t('workspace.overview.connectionCards.connect')}
        </button>
        {connectError && (
          <p className="text-xs text-red-500 mt-2">
            {connectError instanceof Error ? connectError.message : 'Connection failed'}
          </p>
        )}
      </div>
    );
  }

  const healthLabel =
    connection.health === 'healthy'
      ? t('workspace.overview.connectionCards.healthy')
      : connection.health === 'degraded'
        ? t('workspace.overview.connectionCards.degraded')
        : t('workspace.overview.connectionCards.disconnected');

  const healthDotColor =
    connection.health === 'healthy'
      ? 'bg-emerald-400'
      : connection.health === 'degraded'
        ? 'bg-amber-400'
        : 'bg-red-400';

  return (
    <div className="bg-white rounded-2xl p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
            {isSource
              ? t('workspace.overview.connectionCards.source')
              : t('workspace.overview.connectionCards.target')}
          </p>
          <h3 className="text-base font-semibold text-slate-900">
            {connection.orgName.split('.')[0]}
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={cn('h-2 w-2 rounded-full', healthDotColor)} />
          <span className="text-xs text-slate-500">{healthLabel}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-5">
        <div>
          <p className="text-[11px] text-slate-400">
            {t('workspace.overview.connectionCards.orgType')}
          </p>
          <p className="text-sm font-medium text-slate-700">
            {t(`workspace.overview.connectionCards.orgTypes.${connection.orgType.toLowerCase()}`)}
          </p>
        </div>
        {connection.cpqVersion && (
          <div>
            <p className="text-[11px] text-slate-400">
              {t('workspace.overview.connectionCards.cpqVersion')}
            </p>
            <p className="text-sm font-medium text-slate-700">{connection.cpqVersion}</p>
          </div>
        )}
        <div>
          <p className="text-[11px] text-slate-400">
            {t('workspace.overview.connectionCards.apiVersion')}
          </p>
          <p className="text-sm font-medium text-slate-700">{connection.apiVersion}</p>
        </div>
        {connection.lastSync && (
          <div>
            <p className="text-[11px] text-slate-400">
              {t('workspace.overview.connectionCards.lastSync')}
            </p>
            <p className="text-sm font-medium text-slate-700">
              {formatTimeAgo(connection.lastSync)}
            </p>
          </div>
        )}
        {connection.objectCount !== null && (
          <div>
            <p className="text-[11px] text-slate-400">
              {t('workspace.overview.connectionCards.objects')}
            </p>
            <p className="text-sm font-medium text-slate-700">
              {formatNumber(connection.objectCount)}
            </p>
          </div>
        )}
        {connection.recordCount !== null && (
          <div>
            <p className="text-[11px] text-slate-400">
              {t('workspace.overview.connectionCards.records')}
            </p>
            <p className="text-sm font-medium text-slate-700">
              {formatNumber(connection.recordCount)}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-4 border-t border-slate-100">
        <button
          onClick={onTest}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors"
          aria-label={t('workspace.overview.connectionCards.test')}
        >
          <TestTube size={13} />
          {t('workspace.overview.connectionCards.test')}
        </button>
        {isSource && (
          <button
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors"
            aria-label={t('workspace.overview.connectionCards.reExtract')}
          >
            <RefreshCw size={13} />
            {t('workspace.overview.connectionCards.reExtract')}
          </button>
        )}
        <button
          onClick={onDisconnect}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors ms-auto"
          aria-label={t('workspace.overview.connectionCards.disconnect')}
        >
          <Unplug size={13} />
          {t('workspace.overview.connectionCards.disconnect')}
        </button>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// What's Next Card
// ---------------------------------------------------------------------------

function WhatsNextCard({
  data,
  projectId,
}: {
  data: WorkspaceData['whatsNext'];
  projectId: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const isSuccess = data.variant === 'success';

  return (
    <div className={cn('rounded-2xl p-6', isSuccess ? 'bg-emerald-50' : 'bg-violet-50')}>
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
            isSuccess ? 'bg-emerald-100' : 'bg-violet-100'
          )}
        >
          {isSuccess ? (
            <CheckCircle2 size={20} className="text-emerald-600" />
          ) : (
            <Sparkles size={20} className="text-violet-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3
            className={cn(
              'text-base font-semibold mb-1',
              isSuccess ? 'text-emerald-900' : 'text-violet-900'
            )}
          >
            {t(data.titleKey)}
          </h3>
          <p className={cn('text-sm mb-4', isSuccess ? 'text-emerald-700' : 'text-violet-700')}>
            {t(data.descriptionKey)}
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => navigate(`/project/${projectId}/${data.ctaRoute}`)}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors',
                isSuccess
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-violet-600 hover:bg-violet-700'
              )}
              aria-label={t(data.ctaLabelKey)}
            >
              {t(data.ctaLabelKey)}
              <ArrowRight size={14} className="rtl:rotate-180" />
            </button>
            {data.secondaryLabelKey && data.secondaryRoute !== null && (
              <button
                onClick={() => navigate(`/project/${projectId}/${data.secondaryRoute}`)}
                className={cn(
                  'text-sm font-medium transition-colors',
                  isSuccess
                    ? 'text-emerald-600 hover:text-emerald-800'
                    : 'text-violet-600 hover:text-violet-800'
                )}
                aria-label={t(data.secondaryLabelKey)}
              >
                {t(data.secondaryLabelKey)}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top Issues
// ---------------------------------------------------------------------------

const severityConfig: Record<
  IssueSeverity,
  { icon: React.ComponentType<{ size?: number; className?: string }>; color: string }
> = {
  blocker: { icon: AlertOctagon, color: 'text-red-500' },
  warning: { icon: AlertTriangle, color: 'text-amber-500' },
  info: { icon: Info, color: 'text-blue-500' },
};

const IssueRow = memo(function IssueRow({
  issue,
  formatTimeAgo,
}: {
  issue: IssueItem;
  formatTimeAgo: (date: string) => string;
}) {
  const config = severityConfig[issue.severity];
  const Icon = config.icon;

  return (
    <div className="flex items-start gap-3 py-3">
      <Icon size={16} className={cn('mt-0.5 shrink-0', config.color)} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-800 leading-snug">{issue.title}</p>
        <p className="text-xs text-slate-400 mt-0.5">{issue.object}</p>
      </div>
      <span className="text-[11px] text-slate-400 shrink-0">{formatTimeAgo(issue.createdAt)}</span>
    </div>
  );
});

function TopIssues({
  issues,
  projectId,
  formatTimeAgo,
}: {
  issues: IssueItem[];
  projectId: string;
  formatTimeAgo: (date: string) => string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="bg-white rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">
          {t('workspace.overview.topIssues.title')}
        </h3>
        {issues.length > 0 && (
          <button
            onClick={() => navigate(`/project/${projectId}/issues`)}
            className="text-xs font-medium text-violet-600 hover:text-violet-800 transition-colors inline-flex items-center gap-1"
            aria-label={t('workspace.overview.topIssues.viewAll')}
          >
            {t('workspace.overview.topIssues.viewAll')}
            <ArrowRight size={12} className="rtl:rotate-180" />
          </button>
        )}
      </div>
      {issues.length > 0 ? (
        <div className="divide-y divide-slate-100">
          {issues.map((issue) => (
            <IssueRow key={issue.id} issue={issue} formatTimeAgo={formatTimeAgo} />
          ))}
        </div>
      ) : (
        <div className="text-center py-6">
          <CheckCircle2 size={24} className="text-emerald-400 mx-auto mb-2" />
          <p className="text-sm text-slate-500">{t('workspace.overview.topIssues.noIssues')}</p>
          <p className="text-xs text-slate-400 mt-1">
            {t('workspace.overview.topIssues.noIssuesDescription')}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent Activity
// ---------------------------------------------------------------------------

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

const ActivityRow = memo(function ActivityRow({
  item,
  formatTimeAgo,
}: {
  item: ActivityItem;
  formatTimeAgo: (date: string) => string;
}) {
  const { t } = useTranslation();
  const Icon = activityTypeIcons[item.type] || Circle;

  return (
    <div className="flex items-start gap-3 py-3">
      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
        <Icon size={13} className="text-slate-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-800 leading-snug">
          {t(item.messageKey, { defaultValue: item.message })}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">{item.user}</p>
      </div>
      <span className="text-[11px] text-slate-400 shrink-0">{formatTimeAgo(item.timestamp)}</span>
    </div>
  );
});

function RecentActivity({
  items,
  projectId,
  formatTimeAgo,
}: {
  items: ActivityItem[];
  projectId: string;
  formatTimeAgo: (date: string) => string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="bg-white rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">
          {t('workspace.overview.recentActivity.title')}
        </h3>
        {items.length > 0 && (
          <button
            onClick={() => navigate(`/project/${projectId}/activity`)}
            className="text-xs font-medium text-violet-600 hover:text-violet-800 transition-colors inline-flex items-center gap-1"
            aria-label={t('workspace.overview.recentActivity.viewAll')}
          >
            {t('workspace.overview.recentActivity.viewAll')}
            <ArrowRight size={12} className="rtl:rotate-180" />
          </button>
        )}
      </div>
      {items.length > 0 ? (
        <div className="divide-y divide-slate-100">
          {items.map((item) => (
            <ActivityRow key={item.id} item={item} formatTimeAgo={formatTimeAgo} />
          ))}
        </div>
      ) : (
        <div className="text-center py-6">
          <p className="text-sm text-slate-500">
            {t('workspace.overview.recentActivity.noActivity')}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {t('workspace.overview.recentActivity.noActivityDescription')}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function OverviewPage() {
  const { id } = useParams<{ id: string }>();
  const formatTimeAgo = useFormatTimeAgo();

  const isMockMode = import.meta.env.VITE_AUTH_MODE === 'mock';

  const data = useMemo(() => {
    if (!id) return null;
    if (isMockMode) {
      return getMockProjectWorkspaceData(id);
    }
    return null;
  }, [id, isMockMode]);

  // Salesforce connection hooks
  const { data: sfConnections } = useSalesforceConnections(id);
  const {
    connect: connectSource,
    isConnecting: isConnectingSource,
    error: connectSourceError,
    reset: resetSourceConnect,
  } = useConnectSalesforce(id);
  const {
    connect: connectTarget,
    isConnecting: isConnectingTarget,
    error: connectTargetError,
    reset: resetTargetConnect,
  } = useConnectSalesforce(id);
  const disconnectMutation = useDisconnectSalesforce(id);
  const testMutation = useTestConnection(id);

  if (!id) return null;

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-sm text-slate-500">No data available yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Health Strip — enrich with real connection status from API */}
      <HealthStrip
        items={data.healthStrip.map((item) => {
          if (item.id === 'source' && sfConnections?.source) {
            return { ...item, status: 'done' as const, statusText: 'Connected' };
          }
          if (item.id === 'target' && sfConnections?.target) {
            return { ...item, status: 'done' as const, statusText: 'Connected' };
          }
          return item;
        })}
        projectId={id}
      />

      {/* Connection Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ConnectionCard
          type="source"
          connection={data.sourceConnection}
          projectId={id}
          formatTimeAgo={formatTimeAgo}
          onConnect={() => {
            resetSourceConnect();
            connectSource({ instanceType: 'production', connectionRole: 'source' });
          }}
          onDisconnect={() => disconnectMutation.mutate('source')}
          onTest={() => testMutation.mutate('source')}
          isConnecting={isConnectingSource}
          connectError={connectSourceError}
        />
        <ConnectionCard
          type="target"
          connection={data.targetConnection}
          projectId={id}
          formatTimeAgo={formatTimeAgo}
          onConnect={() => {
            resetTargetConnect();
            connectTarget({ instanceType: 'production', connectionRole: 'target' });
          }}
          onDisconnect={() => disconnectMutation.mutate('target')}
          onTest={() => testMutation.mutate('target')}
          isConnecting={isConnectingTarget}
          connectError={connectTargetError}
        />
      </div>

      {/* What's Next */}
      <WhatsNextCard data={data.whatsNext} projectId={id} />

      {/* Bottom Row: Issues + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopIssues issues={data.topIssues} projectId={id} formatTimeAgo={formatTimeAgo} />
        <RecentActivity items={data.recentActivity} projectId={id} formatTimeAgo={formatTimeAgo} />
      </div>
    </div>
  );
}
