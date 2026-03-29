import { memo, useCallback, useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Loader2,
  Plus,
  FolderKanban,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Zap,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProjectsList, useCreateProjectAPI } from '../hooks/use-project-api';
import type {
  ProjectEntity,
  CreateProjectInput,
  UpdateProjectInput,
} from '../hooks/use-project-api';
import { usePrefetchProject, usePrefetchProjectWorkspace } from '@/hooks/use-prefetch';
import { ProjectFormSheet } from '../components/ProjectFormSheet';

// ─── Helpers ─────────────────────────────────────────────────

function useFormatTimeAgo() {
  const { t } = useTranslation();
  return (dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t('workspace.timeAgo.justNow');
    if (minutes < 60) return t('workspace.timeAgo.minutesAgo', { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('workspace.timeAgo.hoursAgo', { count: hours });
    const days = Math.floor(hours / 24);
    return t('workspace.timeAgo.daysAgo', { count: days });
  };
}

function getStatusConfig(status: string) {
  switch (status) {
    case 'active':
      return { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' };
    case 'on_hold':
      return { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' };
    case 'completed':
      return { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' };
    case 'cancelled':
      return { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' };
    default:
      return { bg: 'bg-slate-50', text: 'text-slate-600', dot: 'bg-slate-400' };
  }
}

// ─── Stat Card ───────────────────────────────────────────────

const StatCard = memo(function StatCard({
  value,
  label,
  icon: Icon,
  color,
}: {
  value: number;
  label: string;
  icon: React.ElementType;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    violet: 'bg-violet-50 text-violet-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    slate: 'bg-slate-50 text-slate-600',
  };

  return (
    <div className="rounded-2xl bg-white p-5 transition-shadow hover:shadow-sm">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${colorMap[color] || colorMap.slate}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      </div>
    </div>
  );
});

// ─── Project Card ────────────────────────────────────────────

const ProjectCard = memo(function ProjectCard({
  project,
  onNavigate,
  onPrefetch,
  formatTimeAgo,
}: {
  project: ProjectEntity;
  onNavigate: (id: string) => void;
  onPrefetch: (id: string) => void;
  formatTimeAgo: (date: string) => string;
}) {
  const { t } = useTranslation();
  const colors = getStatusConfig(project.status);

  return (
    <button
      onClick={() => onNavigate(project.id)}
      onMouseEnter={() => onPrefetch(project.id)}
      className="group w-full rounded-2xl bg-white p-5 text-start transition-all hover:shadow-md hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0 me-3">
          <h3 className="font-semibold text-slate-900 truncate group-hover:text-violet-700 transition-colors">
            {project.name}
          </h3>
          {project.description && (
            <p className="text-xs text-slate-400 mt-0.5 truncate">{project.description}</p>
          )}
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium shrink-0 ${colors.bg} ${colors.text}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
          {t(`projects.status.${project.status}`)}
        </span>
      </div>

      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-slate-400">{formatTimeAgo(project.updatedAt)}</span>
        <span className="text-xs font-medium text-violet-600 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1">
          {t('dashboard.projectCard.viewProject')}
          <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
        </span>
      </div>
    </button>
  );
});

// ─── Empty State ─────────────────────────────────────────────

const EmptyProjects = memo(function EmptyProjects({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-violet-50 mb-6">
        <Zap className="h-10 w-10 text-violet-500" />
      </div>
      <h2 className="text-xl font-semibold text-slate-900 mb-2">{t('projects.empty')}</h2>
      <p className="text-sm text-slate-500 text-center max-w-md mb-6">
        {t('projects.emptyDescription')}
      </p>
      <Button onClick={onCreate} className="bg-violet-600 hover:bg-violet-700">
        <Plus className="h-4 w-4 me-2" />
        {t('projects.create')}
      </Button>
    </div>
  );
});

// ─── Main Page ───────────────────────────────────────────────

// ─── Search/Filter Hook ─────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function ProjectsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [formOpen, setFormOpen] = useState(false);
  const formatTimeAgo = useFormatTimeAgo();

  const { data, isLoading, error } = useProjectsList();
  const createMutation = useCreateProjectAPI();
  const prefetchProject = usePrefetchProject();
  const prefetchWorkspace = usePrefetchProjectWorkspace();

  const projects = useMemo(() => data?.projects ?? [], [data?.projects]);

  // Filter state from URL params
  const searchInput = searchParams.get('search') || '';
  const statusFilter = searchParams.get('status') || '';
  const customerFilter = searchParams.get('customer') || '';

  const [localSearch, setLocalSearch] = useState(searchInput);
  const debouncedSearch = useDebounce(localSearch, 300);

  // Sync debounced search to URL params
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (debouncedSearch) {
      params.set('search', debouncedSearch);
    } else {
      params.delete('search');
    }
    setSearchParams(params, { replace: true });
  }, [debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams);
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  // Derive unique customer names from project metadata
  const uniqueCustomers = useMemo(() => {
    const names = new Set<string>();
    projects.forEach((p) => {
      const companyName = (p.metadata as Record<string, unknown>)?.clientCompanyName as
        | string
        | undefined;
      if (companyName) names.add(companyName);
    });
    return Array.from(names).sort();
  }, [projects]);

  // Apply filters
  const filteredProjects = useMemo(() => {
    let result = projects;
    const search = (searchParams.get('search') || '').toLowerCase();

    if (search) {
      result = result.filter((p) => p.name.toLowerCase().includes(search));
    }
    if (statusFilter) {
      result = result.filter((p) => p.status === statusFilter);
    }
    if (customerFilter) {
      result = result.filter(
        (p) => (p.metadata as Record<string, unknown>)?.clientCompanyName === customerFilter
      );
    }
    return result;
  }, [projects, searchParams, statusFilter, customerFilter]);

  const isFiltering = !!(searchParams.get('search') || statusFilter || customerFilter);

  const handleSave = async (formData: CreateProjectInput | UpdateProjectInput) => {
    await createMutation.mutateAsync(formData as CreateProjectInput);
  };

  const handleNavigate = useCallback((id: string) => navigate(`/project/${id}`), [navigate]);

  const handlePrefetch = useCallback(
    (id: string) => {
      prefetchProject(id);
      prefetchWorkspace(id);
    },
    [prefetchProject, prefetchWorkspace]
  );

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-600 rounded-2xl">
        Error loading projects: {(error as Error).message}
      </div>
    );
  }

  const hasProjects = projects.length > 0;
  const activeCount = projects.filter((p) => p.status === 'active').length;
  const completedCount = projects.filter((p) => p.status === 'completed').length;
  const needsAttention = projects.filter(
    (p) => p.status === 'on_hold' || (p.status as string) === 'draft'
  ).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('projects.title')}</h1>
          <p className="text-sm text-slate-500">{t('projects.subtitle')}</p>
        </div>
        {hasProjects && (
          <Button onClick={() => setFormOpen(true)} className="bg-violet-600 hover:bg-violet-700">
            <Plus className="h-4 w-4 me-2" />
            {t('projects.create')}
          </Button>
        )}
      </div>

      {!hasProjects ? (
        <EmptyProjects onCreate={() => setFormOpen(true)} />
      ) : (
        <>
          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder={t('projects.filters.searchPlaceholder')}
                className="w-full ps-10 pe-4 py-2.5 rounded-xl bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => updateFilter('status', e.target.value)}
              className="px-3 py-2.5 rounded-xl bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500 min-w-35"
            >
              <option value="">{t('projects.filters.allStatuses')}</option>
              <option value="active">{t('projects.status.active')}</option>
              <option value="completed">{t('projects.status.completed')}</option>
              <option value="on_hold">{t('projects.status.on_hold')}</option>
              <option value="draft">{t('projects.status.draft')}</option>
            </select>
            {uniqueCustomers.length > 0 && (
              <select
                value={customerFilter}
                onChange={(e) => updateFilter('customer', e.target.value)}
                className="px-3 py-2.5 rounded-xl bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500 min-w-35"
              >
                <option value="">{t('projects.filters.allCustomers')}</option>
                {uniqueCustomers.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Results count when filtering */}
          {isFiltering && (
            <p className="text-sm text-slate-500">
              {t('projects.filters.resultsCount', { count: filteredProjects.length })}
            </p>
          )}

          {/* Stats Strip */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              value={projects.length}
              label={t('projects.total')}
              icon={FolderKanban}
              color="slate"
            />
            <StatCard
              value={activeCount}
              label={t('projects.active')}
              icon={TrendingUp}
              color="violet"
            />
            <StatCard
              value={completedCount}
              label={t('projects.completed')}
              icon={CheckCircle2}
              color="emerald"
            />
            <StatCard
              value={needsAttention}
              label={t('projects.attention')}
              icon={AlertTriangle}
              color="amber"
            />
          </div>

          {/* Project Grid */}
          <div className="grid gap-3 md:grid-cols-2">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onNavigate={handleNavigate}
                onPrefetch={handlePrefetch}
                formatTimeAgo={formatTimeAgo}
              />
            ))}
          </div>

          {isFiltering && filteredProjects.length === 0 && (
            <div className="text-center py-12">
              <p className="text-sm text-slate-500">{t('customers.noResults')}</p>
            </div>
          )}
        </>
      )}

      <ProjectFormSheet open={formOpen} onOpenChange={setFormOpen} onSave={handleSave} />
    </div>
  );
}
