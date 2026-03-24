import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Loader2,
  FolderKanban,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Plus,
  Zap,
  TrendingUp,
  Cloud,
  CloudOff,
  CircleDot,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProjectsList } from '@/features/projects/hooks/use-project-api';
import { getMockProjectWorkspaceData } from '@/features/projects/mocks/workspace-mock-data';

// ─── Types ───────────────────────────────────────────────────

interface ProjectWithStage {
  id: string;
  name: string;
  status: string;
  description: string | null;
  updatedAt: string;
  stageKey: string;
  stageColor: string;
  sourceConnected: boolean;
  targetConnected: boolean;
  issueCount: number;
  sourceOrg: string | null;
}

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

function getProjectStage(projectId: string): {
  stageKey: string;
  stageColor: string;
  sourceConnected: boolean;
  targetConnected: boolean;
  issueCount: number;
  sourceOrg: string | null;
} {
  const workspace = getMockProjectWorkspaceData(projectId);
  if (!workspace) {
    return {
      stageKey: 'dashboard.stages.setup',
      stageColor: 'slate',
      sourceConnected: false,
      targetConnected: false,
      issueCount: 0,
      sourceOrg: null,
    };
  }

  const healthDone = workspace.healthStrip.filter((h) => h.status === 'done').length;
  const sourceConnected = workspace.sourceConnection !== null;
  const targetConnected = workspace.targetConnection !== null;
  const issueCount = workspace.topIssues.length;
  const sourceOrg = workspace.sourceConnection?.instanceUrl?.replace('https://', '') || null;

  if (healthDone >= 6)
    return {
      stageKey: 'dashboard.stages.complete',
      stageColor: 'emerald',
      sourceConnected,
      targetConnected,
      issueCount,
      sourceOrg,
    };
  if (healthDone >= 4)
    return {
      stageKey: 'dashboard.stages.deploying',
      stageColor: 'violet',
      sourceConnected,
      targetConnected,
      issueCount,
      sourceOrg,
    };
  if (healthDone >= 3)
    return {
      stageKey: 'dashboard.stages.assessed',
      stageColor: 'amber',
      sourceConnected,
      targetConnected,
      issueCount,
      sourceOrg,
    };
  if (healthDone >= 2)
    return {
      stageKey: 'dashboard.stages.extracted',
      stageColor: 'sky',
      sourceConnected,
      targetConnected,
      issueCount,
      sourceOrg,
    };
  if (healthDone >= 1)
    return {
      stageKey: 'dashboard.stages.connected',
      stageColor: 'emerald',
      sourceConnected,
      targetConnected,
      issueCount,
      sourceOrg,
    };
  return {
    stageKey: 'dashboard.stages.setup',
    stageColor: 'slate',
    sourceConnected,
    targetConnected,
    issueCount,
    sourceOrg,
  };
}

function stageColorClasses(color: string) {
  const map: Record<string, { bg: string; text: string; dot: string }> = {
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    violet: { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
    sky: { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
    slate: { bg: 'bg-slate-50', text: 'text-slate-600', dot: 'bg-slate-400' },
    red: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  };
  return map[color] || map.slate!;
}

// ─── Components ──────────────────────────────────────────────

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

const ProjectCard = memo(function ProjectCard({
  project,
  onNavigate,
  formatTimeAgo,
}: {
  project: ProjectWithStage;
  onNavigate: (id: string) => void;
  formatTimeAgo: (date: string) => string;
}) {
  const { t } = useTranslation();
  const colors = stageColorClasses(project.stageColor);

  return (
    <button
      onClick={() => onNavigate(project.id)}
      className="group w-full rounded-2xl bg-white p-5 text-start transition-all hover:shadow-md hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0 me-3">
          <h3 className="font-semibold text-slate-900 truncate group-hover:text-violet-700 transition-colors">
            {project.name}
          </h3>
          {project.sourceOrg && (
            <p className="text-xs text-slate-400 mt-0.5 truncate">{project.sourceOrg}</p>
          )}
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${colors.bg} ${colors.text}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
          {t(project.stageKey)}
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          {project.sourceConnected ? (
            <Cloud className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <CloudOff className="h-3.5 w-3.5 text-slate-300" />
          )}
          {t('dashboard.projectCard.source')}
        </span>
        <span className="inline-flex items-center gap-1">
          {project.targetConnected ? (
            <Cloud className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <CloudOff className="h-3.5 w-3.5 text-slate-300" />
          )}
          {t('dashboard.projectCard.target')}
        </span>
        {project.issueCount > 0 && (
          <span className="inline-flex items-center gap-1 text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            {project.issueCount} {t('dashboard.projectCard.issues')}
          </span>
        )}
        <span className="ms-auto text-slate-400 shrink-0">{formatTimeAgo(project.updatedAt)}</span>
      </div>

      <div className="mt-3 flex items-center text-xs font-medium text-violet-600 opacity-0 group-hover:opacity-100 transition-opacity">
        {t('dashboard.projectCard.viewProject')}
        <ArrowRight className="h-3.5 w-3.5 ms-1" />
      </div>
    </button>
  );
});

const EmptyDashboard = memo(function EmptyDashboard({
  onCreateProject,
}: {
  onCreateProject: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-violet-50 mb-6">
        <Zap className="h-10 w-10 text-violet-500" />
      </div>
      <h2 className="text-xl font-semibold text-slate-900 mb-2">{t('dashboard.empty.title')}</h2>
      <p className="text-sm text-slate-500 text-center max-w-md mb-6">
        {t('dashboard.empty.description')}
      </p>
      <Button onClick={onCreateProject} className="bg-violet-600 hover:bg-violet-700">
        <Plus className="h-4 w-4 me-2" />
        {t('dashboard.empty.createProject')}
      </Button>
    </div>
  );
});

// ─── Main Dashboard ──────────────────────────────────────────

export default function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading } = useProjectsList();
  const formatTimeAgo = useFormatTimeAgo();

  const projects = data?.projects || [];

  const handleNavigateToProject = useCallback(
    (id: string) => navigate(`/project/${id}`),
    [navigate]
  );

  const handleCreateProject = useCallback(() => navigate('/projects'), [navigate]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  // Enrich projects with stage data
  const enriched: ProjectWithStage[] = projects.map((p) => {
    const stageInfo = getProjectStage(p.id);
    return {
      id: p.id,
      name: p.name,
      status: p.status || 'active',
      description: p.description,
      updatedAt: p.updatedAt,
      ...stageInfo,
    };
  });

  const active = enriched.filter((p) => p.status === 'active');
  const completed = enriched.filter((p) => p.status === 'completed');
  const needsAttention = enriched.filter((p) => p.issueCount > 0 || p.status === 'on_hold');
  const total = enriched.length;

  if (total === 0) {
    return <EmptyDashboard onCreateProject={handleCreateProject} />;
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('dashboard.title')}</h1>
          <p className="text-sm text-slate-500">{t('dashboard.subtitle')}</p>
        </div>
        <Button onClick={handleCreateProject} className="bg-violet-600 hover:bg-violet-700">
          <Plus className="h-4 w-4 me-2" />
          {t('projects.create')}
        </Button>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          value={total}
          label={t('dashboard.stats.totalProjects')}
          icon={FolderKanban}
          color="slate"
        />
        <StatCard
          value={active.length}
          label={t('dashboard.stats.activeProjects')}
          icon={TrendingUp}
          color="violet"
        />
        <StatCard
          value={completed.length}
          label={t('dashboard.stats.completedProjects')}
          icon={CheckCircle2}
          color="emerald"
        />
        <StatCard
          value={needsAttention.length}
          label={t('dashboard.stats.needsAttention')}
          icon={AlertTriangle}
          color="amber"
        />
      </div>

      {/* Active Projects */}
      {active.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
              {t('dashboard.sections.activeProjects')}
            </h2>
            <span className="text-xs text-slate-400">
              {active.length} {t('dashboard.stats.totalProjects').toLowerCase()}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {active.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onNavigate={handleNavigateToProject}
                formatTimeAgo={formatTimeAgo}
              />
            ))}
          </div>
        </div>
      )}

      {/* Needs Attention */}
      {needsAttention.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
              {t('dashboard.sections.needsAttention')}
            </h2>
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs font-medium text-amber-700">
              {needsAttention.length}
            </span>
          </div>
          <div className="rounded-2xl bg-amber-50/50 p-4 space-y-2">
            {needsAttention.map((project) => (
              <button
                key={project.id}
                onClick={() => handleNavigateToProject(project.id)}
                className="flex w-full items-center justify-between rounded-xl bg-white p-3 text-start hover:shadow-sm transition-shadow"
              >
                <div className="flex items-center gap-3">
                  <CircleDot className="h-4 w-4 text-amber-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">{project.name}</p>
                    <p className="text-xs text-slate-500">
                      {project.issueCount > 0
                        ? `${project.issueCount} ${t('dashboard.attention.openBlockers')}`
                        : t('dashboard.attention.connectionLost')}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-300" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Completed Projects */}
      {completed.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
              {t('dashboard.sections.completedProjects')}
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {completed.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onNavigate={handleNavigateToProject}
                formatTimeAgo={formatTimeAgo}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
