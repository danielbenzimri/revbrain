import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProjectsList, useCreateProjectAPI } from '../hooks/use-project-api';
import type {
  ProjectEntity,
  CreateProjectInput,
  UpdateProjectInput,
} from '../hooks/use-project-api';
import { usePrefetchProject, usePrefetchProjectWorkspace } from '@/hooks/use-prefetch';
import { ProjectFormSheet } from '../components/ProjectFormSheet';

function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-700';
    case 'on_hold':
      return 'bg-amber-100 text-amber-700';
    case 'completed':
      return 'bg-violet-100 text-violet-700';
    case 'cancelled':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

const ProjectRow = memo(function ProjectRow({
  project,
  onNavigate,
  onPrefetch,
}: {
  project: ProjectEntity;
  onNavigate: (id: string) => void;
  onPrefetch: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <tr
      className="hover:bg-slate-50 cursor-pointer"
      onClick={() => onNavigate(project.id)}
      onMouseEnter={() => onPrefetch(project.id)}
    >
      <td className="p-4 font-medium">{project.name}</td>
      <td className="p-4">
        <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(project.status)}`}>
          {t(`projects.status.${project.status}`)}
        </span>
      </td>
      <td className="p-4 text-sm text-slate-600">{project.description || '-'}</td>
    </tr>
  );
});

export default function ProjectsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(false);

  const { data, isLoading, error } = useProjectsList();
  const createMutation = useCreateProjectAPI();
  const prefetchProject = usePrefetchProject();
  const prefetchWorkspace = usePrefetchProjectWorkspace();

  const projects = data?.projects || [];

  const handleSave = async (formData: CreateProjectInput | UpdateProjectInput) => {
    // In ProjectsPage we only create, not edit
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
      <div className="p-4 bg-red-50 text-red-600 rounded-lg">
        Error loading projects: {(error as Error).message}
      </div>
    );
  }

  const hasProjects = projects.length > 0;
  const activeCount = projects.filter((p) => p.status === 'active').length;
  const completedCount = projects.filter((p) => p.status === 'completed').length;

  return (
    <div className="space-y-6">
      <div className="animate-fade-in-up flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('projects.title')}</h1>
          <p className="text-neutral-500 text-sm">{t('projects.subtitle')}</p>
        </div>
        {hasProjects && (
          <Button onClick={() => setFormOpen(true)} className="bg-violet-500 hover:bg-violet-600">
            <Plus className="h-4 w-4 me-1" />
            {t('projects.create')}
          </Button>
        )}
      </div>

      <div className="animate-fade-in-up delay-50 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded shadow-sm p-4 flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-neutral-100 flex items-center justify-center text-xl">
            📁
          </div>
          <div>
            <p className="text-2xl font-bold">{projects.length}</p>
            <p className="text-xs text-neutral-500">{t('projects.total')}</p>
          </div>
        </div>
        <div className="bg-white rounded shadow-sm p-4 flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center text-xl">
            🟢
          </div>
          <div>
            <p className="text-2xl font-bold">{activeCount}</p>
            <p className="text-xs text-neutral-500">{t('projects.active')}</p>
          </div>
        </div>
        <div className="bg-white rounded shadow-sm p-4 flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-violet-100 flex items-center justify-center text-xl">
            ✅
          </div>
          <div>
            <p className="text-2xl font-bold">{completedCount}</p>
            <p className="text-xs text-neutral-500">{t('projects.completed')}</p>
          </div>
        </div>
        <div className="bg-white rounded shadow-sm p-4 flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center text-xl">
            ⚠️
          </div>
          <div>
            <p className="text-2xl font-bold">0</p>
            <p className="text-xs text-neutral-500">{t('projects.attention')}</p>
          </div>
        </div>
      </div>

      {!hasProjects ? (
        <div className="animate-fade-in-up delay-100 bg-white rounded shadow-sm p-8 text-center">
          <div className="mx-auto w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mb-4 text-3xl">
            📂
          </div>
          <h3 className="font-semibold text-lg mb-2">{t('projects.empty')}</h3>
          <p className="text-neutral-500 text-sm mb-4">{t('projects.emptyDescription')}</p>
          <Button onClick={() => setFormOpen(true)} className="bg-violet-500 hover:bg-violet-600">
            <Plus className="h-4 w-4 me-1" />
            {t('projects.create')}
          </Button>
        </div>
      ) : (
        <div className="animate-fade-in-up delay-100 bg-white rounded shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-start p-4 text-sm font-medium text-slate-500">
                    {t('projects.colName')}
                  </th>
                  <th className="text-start p-4 text-sm font-medium text-slate-500">
                    {t('projects.colStatus')}
                  </th>
                  <th className="text-start p-4 text-sm font-medium text-slate-500">
                    {t('projects.form.description', 'Description')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    onNavigate={handleNavigate}
                    onPrefetch={handlePrefetch}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ProjectFormSheet open={formOpen} onOpenChange={setFormOpen} onSave={handleSave} />
    </div>
  );
}
