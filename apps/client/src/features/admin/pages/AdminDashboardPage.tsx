import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import {
  Users,
  Building2,
  CreditCard,
  FolderOpen,
  Plus,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { OnboardTenantDrawer } from '../components/OnboardTenantDrawer';
import { useAdminStats } from '../hooks';

function formatAction(action: string): string {
  return action
    .replace(/\./g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTimeAgo(dateStr: string, agoLabel: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ${agoLabel}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${agoLabel}`;
  const days = Math.floor(hours / 24);
  return `${days}d ${agoLabel}`;
}

export default function AdminDashboardPage() {
  const { t } = useTranslation();
  const [showOnboardDrawer, setShowOnboardDrawer] = useState(false);
  const { data: stats, isLoading, isError } = useAdminStats();

  const statCards = [
    {
      labelKey: 'admin.dashboard.stats.totalTenants',
      value: stats?.tenantCount,
      format: (v: number) => v.toLocaleString(),
      icon: Building2,
      color: 'text-violet-500 bg-violet-50',
    },
    {
      labelKey: 'admin.dashboard.stats.activeUsers',
      value: stats?.activeUserCount,
      format: (v: number) => v.toLocaleString(),
      icon: Users,
      color: 'text-violet-500 bg-violet-50',
    },
    {
      labelKey: 'admin.dashboard.stats.mrr',
      value: stats?.mrr,
      format: (v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`),
      icon: CreditCard,
      color: 'text-purple-500 bg-purple-50',
    },
    {
      labelKey: 'admin.dashboard.stats.activeProjects',
      value: stats?.activeProjectCount,
      format: (v: number) => v.toLocaleString(),
      icon: FolderOpen,
      color: 'text-amber-500 bg-amber-50',
    },
  ];

  const agoLabel = t('admin.dashboard.ago');

  return (
    <div className="p-6 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t('admin.dashboard.title')}</h1>
          <p className="text-slate-500">{t('admin.dashboard.welcomeBack')}</p>
        </div>
        <Button
          onClick={() => setShowOnboardDrawer(true)}
          className="bg-violet-500 hover:bg-violet-600"
        >
          <Plus className="h-4 w-4 me-2" />
          {t('admin.dashboard.onboardTenant')}
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => (
          <div
            key={stat.labelKey}
            className="bg-white p-6 rounded border border-slate-200 shadow-sm"
          >
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 rounded-lg ${stat.color}`}>
                <stat.icon className="h-6 w-6" />
              </div>
            </div>
            <h3 className="text-slate-500 text-sm font-medium">{t(stat.labelKey)}</h3>
            {isLoading ? (
              <Skeleton className="h-8 w-20 mt-1" />
            ) : stat.value != null ? (
              <p className="text-2xl font-bold text-slate-900 mt-1">{stat.format(stat.value)}</p>
            ) : (
              <p className="text-2xl font-bold text-slate-400 mt-1">--</p>
            )}
          </div>
        ))}
      </div>

      {/* Recent Activity + System Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white p-6 rounded border border-slate-200 shadow-sm min-h-[300px]">
          <h3 className="font-bold text-slate-800 mb-4">
            {t('admin.dashboard.recentActivity', 'Recent Activity')}
          </h3>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3 p-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <Skeleton className="h-3 w-12" />
                </div>
              ))}
            </div>
          ) : isError || !stats?.recentActivity ? (
            <div className="flex items-center gap-2 text-slate-400 p-4">
              <AlertCircle className="h-5 w-5" />
              <span>Unable to load recent activity</span>
            </div>
          ) : stats.recentActivity.length === 0 ? (
            <p className="text-slate-400 p-4">No recent activity</p>
          ) : (
            <div className="space-y-3">
              {stats.recentActivity.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 bg-violet-100 rounded-full flex items-center justify-center">
                      <Clock className="h-4 w-4 text-violet-500" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 text-sm">
                        {formatAction(entry.action)}
                      </p>
                      {entry.metadata && (entry.metadata as Record<string, unknown>).email ? (
                        <p className="text-xs text-slate-500">
                          {String((entry.metadata as Record<string, unknown>).email)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 whitespace-nowrap">
                    {formatTimeAgo(entry.createdAt, agoLabel)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* System Health */}
        <div className="bg-white p-6 rounded border border-slate-200 shadow-sm min-h-[300px]">
          <h3 className="font-bold text-slate-800 mb-4">{t('admin.dashboard.systemHealth')}</h3>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-14 w-full rounded-lg" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ) : isError ? (
            <div className="flex items-center gap-2 text-red-500 bg-red-50 p-4 rounded-lg mb-4">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">Unable to reach API</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-violet-600 bg-violet-50 p-4 rounded-lg mb-4">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">{t('admin.dashboard.allOperational')}</span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Tenants</span>
                  <span className="font-medium text-slate-900">
                    {stats?.tenantCount != null ? stats.tenantCount : '--'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Active Users</span>
                  <span className="font-medium text-slate-900">
                    {stats?.activeUserCount != null ? stats.activeUserCount : '--'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Active Projects</span>
                  <span className="font-medium text-slate-900">
                    {stats?.activeProjectCount != null ? stats.activeProjectCount : '--'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">MRR</span>
                  <span className="font-medium text-slate-900">
                    {stats?.mrr != null
                      ? stats.mrr >= 1000
                        ? `$${(stats.mrr / 1000).toFixed(1)}k`
                        : `$${stats.mrr.toFixed(0)}`
                      : '--'}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Onboard Drawer */}
      <OnboardTenantDrawer open={showOnboardDrawer} onOpenChange={setShowOnboardDrawer} />
    </div>
  );
}
