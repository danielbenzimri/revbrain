import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Building2,
  CreditCard,
  BarChart3,
  Users,
  FolderKanban,
  Clock,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTenantDetail } from '../hooks';

const lifecycleBadgeStyles: Record<string, string> = {
  active: 'bg-green-50 text-green-700 border-green-200',
  trial: 'bg-blue-50 text-blue-700 border-blue-200',
  suspended: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  deactivated: 'bg-red-50 text-red-700 border-red-200',
};

function formatStorage(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CardSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6 animate-pulse">
      <div className="h-4 bg-slate-200 rounded w-1/3 mb-4" />
      <div className="space-y-3">
        <div className="h-3 bg-slate-100 rounded w-2/3" />
        <div className="h-3 bg-slate-100 rounded w-1/2" />
        <div className="h-3 bg-slate-100 rounded w-3/4" />
      </div>
    </div>
  );
}

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { data: tenant, isLoading, error } = useTenantDetail(id);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center gap-4">
          <div className="h-8 w-8 bg-slate-200 rounded animate-pulse" />
          <div className="space-y-2">
            <div className="h-6 bg-slate-200 rounded w-48 animate-pulse" />
            <div className="h-4 bg-slate-100 rounded w-32 animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="p-6">
        <div className="text-center py-20">
          <p className="text-slate-500">Tenant not found</p>
          <Link to="/admin/tenants">
            <Button variant="outline" className="mt-4">
              {t('admin.tenants.detail.backToList')}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const seatPercent =
    tenant.seatLimit > 0 ? Math.round((tenant.seatUsed / tenant.seatLimit) * 100) : 0;
  const badgeStyle = lifecycleBadgeStyles[tenant.lifecycleState] || lifecycleBadgeStyles.active;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/admin/tenants">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="h-10 w-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">{tenant.name}</h1>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${badgeStyle}`}
              >
                {t(`admin.tenants.lifecycle.${tenant.lifecycleState}`)}
              </span>
            </div>
            <p className="text-sm text-slate-500">{tenant.slug}</p>
          </div>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Overview Card */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="h-4 w-4 text-slate-400" />
            <h3 className="font-semibold text-slate-900">{t('admin.tenants.detail.overview')}</h3>
          </div>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">{t('admin.tenants.orgName')}</dt>
              <dd className="font-medium text-slate-900">{tenant.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Slug</dt>
              <dd className="font-medium text-slate-900">{tenant.slug}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">{t('admin.tenants.table.type')}</dt>
              <dd className="font-medium text-slate-900 capitalize">{tenant.type}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">{t('admin.tenants.table.status')}</dt>
              <dd>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium border ${badgeStyle}`}
                >
                  {t(`admin.tenants.lifecycle.${tenant.lifecycleState}`)}
                </span>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Created</dt>
              <dd className="font-medium text-slate-900">{formatDate(tenant.createdAt)}</dd>
            </div>
          </dl>
        </div>

        {/* Plan Card */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="h-4 w-4 text-slate-400" />
            <h3 className="font-semibold text-slate-900">{t('admin.tenants.detail.plan')}</h3>
          </div>
          {tenant.plan ? (
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">{t('admin.tenants.plan')}</dt>
                <dd className="font-medium text-slate-900">{tenant.plan.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Price</dt>
                <dd className="font-medium text-slate-900">
                  ${(tenant.plan.price / 100).toFixed(2)}/{tenant.plan.currency}
                </dd>
              </div>
              {tenant.plan.features && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">AI Level</dt>
                    <dd className="font-medium text-slate-900 capitalize">
                      {tenant.plan.features.aiLevel}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Modules</dt>
                    <dd className="font-medium text-slate-900">
                      {tenant.plan.features.modules.length}
                    </dd>
                  </div>
                </>
              )}
              {tenant.plan.limits && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Max Projects</dt>
                  <dd className="font-medium text-slate-900">
                    {tenant.plan.limits.maxProjects === 0
                      ? 'Unlimited'
                      : tenant.plan.limits.maxProjects}
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-sm text-slate-400">{t('admin.tenants.noPlan')}</p>
          )}
        </div>

        {/* Usage Card */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-slate-400" />
            <h3 className="font-semibold text-slate-900">{t('admin.tenants.detail.usage')}</h3>
          </div>
          <dl className="space-y-4 text-sm">
            <div>
              <div className="flex justify-between mb-1">
                <dt className="text-slate-500">Seats</dt>
                <dd className="font-medium text-slate-900">
                  {tenant.seatUsed} / {tenant.seatLimit}
                </dd>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${seatPercent > 90 ? 'bg-red-500' : seatPercent > 70 ? 'bg-yellow-500' : 'bg-violet-500'}`}
                  style={{ width: `${Math.min(seatPercent, 100)}%` }}
                />
              </div>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Storage</dt>
              <dd className="font-medium text-slate-900">
                {formatStorage(tenant.storageUsedBytes)}
              </dd>
            </div>
          </dl>
        </div>

        {/* Users Card */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-slate-400" />
            <h3 className="font-semibold text-slate-900">{t('admin.tenants.detail.users')}</h3>
          </div>
          <p className="text-3xl font-bold text-slate-900 mb-3">{tenant.userCount}</p>
          <Link
            to={`/admin/users?tenant=${tenant.id}`}
            className="text-sm text-violet-600 hover:text-violet-700 font-medium"
          >
            {t('admin.tenants.detail.viewUsers')} &rarr;
          </Link>
        </div>

        {/* Projects Card */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <FolderKanban className="h-4 w-4 text-slate-400" />
            <h3 className="font-semibold text-slate-900">{t('admin.tenants.detail.projects')}</h3>
          </div>
          <p className="text-3xl font-bold text-slate-900">{tenant.projectCount}</p>
        </div>

        {/* Recent Activity Card */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-slate-400" />
            <h3 className="font-semibold text-slate-900">{t('admin.tenants.detail.activity')}</h3>
          </div>
          {tenant.recentActivity.length === 0 ? (
            <p className="text-sm text-slate-400">{t('admin.tenants.detail.noActivity')}</p>
          ) : (
            <ul className="space-y-2">
              {tenant.recentActivity.map((entry) => (
                <li key={entry.id} className="flex justify-between text-sm">
                  <span className="text-slate-700 font-medium truncate">{entry.action}</span>
                  <span className="text-slate-400 text-xs whitespace-nowrap ms-2">
                    {formatDateTime(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Overrides Card */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-4 w-4 text-slate-400" />
            <h3 className="font-semibold text-slate-900">{t('admin.tenants.detail.overrides')}</h3>
          </div>
          <p className="text-3xl font-bold text-slate-900 mb-3">{tenant.overrides.length}</p>
          <Link
            to={`/admin/tenants?overrides=${tenant.id}`}
            className="text-sm text-violet-600 hover:text-violet-700 font-medium"
          >
            {t('admin.tenants.detail.manageOverrides')} &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
