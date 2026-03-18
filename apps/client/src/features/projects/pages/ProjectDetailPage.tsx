/**
 * Project Detail Page
 *
 * Displays project details with overview tab.
 * Additional tabs will be added as RevBrain features are built.
 */
import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2, Calendar, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useProject, useUpdateProject, useDeleteProject } from '../hooks/use-project-api';
import type { UpdateProjectInput } from '../hooks/use-project-api';
import { ProjectFormSheet } from '../components/ProjectFormSheet';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-800';
    case 'on_hold':
      return 'bg-amber-100 text-amber-800';
    case 'completed':
      return 'bg-violet-100 text-violet-800';
    case 'cancelled':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-neutral-100 text-neutral-800';
  }
}

export default function ProjectDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editOpen, setEditOpen] = useState(false);

  const urlTab = searchParams.get('tab') || 'overview';

  const { data: project, isLoading, error } = useProject(id);
  const updateMutation = useUpdateProject();
  const deleteMutation = useDeleteProject();

  const handleSave = async (formData: UpdateProjectInput) => {
    if (!id) return;
    await updateMutation.mutateAsync({ id, data: formData });
  };

  const handleDelete = async () => {
    if (!id) return;
    await deleteMutation.mutateAsync(id);
    navigate('/projects');
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-4 bg-red-50 text-red-600 rounded-lg">
        {error instanceof Error ? error.message : t('projects.notFound')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/projects')}>
            <ArrowLeft className="h-4 w-4 me-1" />
            <span className="hidden sm:inline">{t('common.back')}</span>
          </Button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">{project.name}</h1>
            <Badge className={getStatusColor(project.status)}>
              {t(`projects.status.${project.status}`)}
            </Badge>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Edit className="h-4 w-4 me-1" />
          {t('projects.edit')}
        </Button>
      </div>

      {/* Tabs */}
      <Tabs
        value={urlTab}
        onValueChange={(value) => setSearchParams({ tab: value })}
        className="space-y-4"
      >
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="overview">{t('projects.tabs.overview')}</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Project Info Card */}
            <div className="bg-white rounded shadow-sm p-6 space-y-4">
              <h3 className="font-semibold text-lg">{t('projects.details.overview')}</h3>

              {project.description && <p className="text-neutral-600">{project.description}</p>}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-start gap-2">
                  <Calendar className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-neutral-500">{t('projects.details.timeline')}</p>
                    <p className="text-sm">
                      {formatDate(project.startDate)} - {formatDate(project.endDate)}
                    </p>
                  </div>
                </div>
              </div>

              {project.notes && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-neutral-500 mb-1">{t('projects.form.notes')}</p>
                  <p className="text-sm text-neutral-600">{project.notes}</p>
                </div>
              )}
            </div>

            {/* Dates Card */}
            <div className="bg-white rounded shadow-sm p-6 space-y-4">
              <h3 className="font-semibold text-lg">{t('projects.details.dates')}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-neutral-50 rounded-lg p-4">
                  <p className="text-xs text-neutral-500 mb-1">{t('projects.details.createdAt')}</p>
                  <p className="text-sm font-medium">{formatDate(project.createdAt)}</p>
                </div>
                <div className="bg-neutral-50 rounded-lg p-4">
                  <p className="text-xs text-neutral-500 mb-1">{t('projects.details.updatedAt')}</p>
                  <p className="text-sm font-medium">{formatDate(project.updatedAt)}</p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Form */}
      <ProjectFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        project={project}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}
