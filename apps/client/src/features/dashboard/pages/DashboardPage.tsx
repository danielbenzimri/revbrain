import { useTranslation } from 'react-i18next';
import { Loader2, FolderKanban, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { useProjectsList } from '@/features/projects/hooks/use-project-api';

export default function DashboardPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useProjectsList();

  const projects = data?.projects || [];
  const total = projects.length;
  const active = projects.filter((p) => p.status === 'active').length;
  const completed = projects.filter((p) => p.status === 'completed').length;
  const needsAttention = projects.filter((p) =>
    ['on_hold', 'draft'].includes(p.status || '')
  ).length;

  // Recent activity: last 5 updated projects
  const recentActivity = [...projects]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="animate-fade-in-up flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>
          <p className="text-neutral-500 text-sm">{t('dashboard.subtitle')}</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="animate-fade-in-up delay-50 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded shadow-sm p-4 flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-600">
            <FolderKanban className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{total}</p>
            <p className="text-xs text-neutral-500">{t('projects.total')}</p>
          </div>
        </div>
        <div className="bg-white rounded shadow-sm p-4 flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center text-green-600">
            <CheckCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{active}</p>
            <p className="text-xs text-neutral-500">{t('projects.active')}</p>
          </div>
        </div>
        <div className="bg-white rounded shadow-sm p-4 flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-violet-100 flex items-center justify-center text-violet-600">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{completed}</p>
            <p className="text-xs text-neutral-500">{t('projects.completed')}</p>
          </div>
        </div>
        <div className="bg-white rounded shadow-sm p-4 flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{needsAttention}</p>
            <p className="text-xs text-neutral-500">{t('projects.attention')}</p>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      {recentActivity.length > 0 ? (
        <div className="animate-fade-in-up delay-100 bg-white rounded shadow-sm p-6">
          <h3 className="font-semibold text-lg mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {recentActivity.map((project) => (
              <div
                key={project.id}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FolderKanban className="h-4 w-4 text-slate-400" />
                  <div>
                    <p className="text-sm font-medium text-slate-900 truncate max-w-md">
                      {project.name}
                    </p>
                    <p className="text-xs text-slate-500 capitalize">{project.status}</p>
                  </div>
                </div>
                <span className="text-xs text-slate-400">{formatTimeAgo(project.updatedAt)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="animate-fade-in-up delay-100 bg-white rounded shadow-sm p-8 text-center">
          <FolderKanban className="mx-auto h-12 w-12 text-slate-300 mb-4" />
          <h3 className="font-semibold text-lg mb-2">{t('dashboard.welcome')}</h3>
          <p className="text-neutral-500 text-sm">{t('dashboard.selectProject')}</p>
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
