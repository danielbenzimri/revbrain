/**
 * Project Detail Page
 *
 * Displays project details with tabs:
 * - Overview: Project information and status
 * - BOQ: Bill of Quantities with tree view and import
 * - Execution: Contractor bills and workflow
 * - Work Logs: Daily site reports with resources, equipment, and signatures
 */
import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Loader2,
  Calendar,
  Building2,
  User,
  FileText,
  MapPin,
  Edit,
  Upload,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useProject, useUpdateProject, useDeleteProject } from '../hooks/use-project-api';
import type { UpdateProjectInput } from '../hooks/use-project-api';
import { ProjectFormSheet } from '../components/ProjectFormSheet';
import {
  useBOQTree,
  useBOQItems,
  useCreateBOQItem,
  useUpdateBOQItem,
  useDeleteBOQItem,
} from '@/features/boq/hooks/use-boq';
import type { BOQItem, CreateBOQItemInput, UpdateBOQItemInput } from '@/features/boq/hooks/use-boq';
import {
  BOQTree,
  BOQImportSheet,
  BOQItemFormSheet,
  BOQSummaryCard,
} from '@/features/boq/components';
import { BillingView } from '@/features/execution/components';
import { WorkLogsView } from '@/features/worklogs/components';
import { TasksView } from '@/features/tasks/components';
import { useTeamMembers } from '@/features/org/hooks';


function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('he-IL', {
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
      return 'bg-blue-100 text-blue-800';
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
  const [importOpen, setImportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<BOQItem | null>(null);

  // Get tab from URL params
  const urlTab = searchParams.get('tab') || 'overview';

  const { data: project, isLoading, error } = useProject(id);
  const updateMutation = useUpdateProject();
  const deleteMutation = useDeleteProject();
  const { data: boqItems, isLoading: boqLoading } = useBOQTree(id || '');
  const { data: boqFlatData } = useBOQItems(id || '');
  const createBOQItem = useCreateBOQItem();
  const updateBOQItem = useUpdateBOQItem();
  const deleteBOQItem = useDeleteBOQItem();
  const { data: teamMembers = [] } = useTeamMembers();

  const handleSave = async (formData: UpdateProjectInput) => {
    if (!id) return;
    await updateMutation.mutateAsync({ id, data: formData });
  };

  const handleDelete = async () => {
    if (!id) return;
    await deleteMutation.mutateAsync(id);
    navigate('/projects');
  };

  const handleItemClick = (item: BOQItem) => {
    setSelectedItem(item);
    setItemFormOpen(true);
  };

  const handleCreateItem = () => {
    setSelectedItem(null);
    setItemFormOpen(true);
  };

  const handleItemSave = async (data: CreateBOQItemInput | UpdateBOQItemInput, isEdit: boolean) => {
    if (isEdit && selectedItem) {
      await updateBOQItem.mutateAsync({ id: selectedItem.id, data: data as UpdateBOQItemInput });
    } else {
      await createBOQItem.mutateAsync(data as CreateBOQItemInput);
    }
  };

  const handleItemDelete = async (itemId: string) => {
    if (!id) return;
    await deleteBOQItem.mutateAsync({ id: itemId, projectId: id });
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
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
            <div className="flex items-center gap-2 mt-1">
              <Badge className={getStatusColor(project.status)}>
                {t(`projects.status.${project.status}`)}
              </Badge>
              {project.contractNumber && (
                <span className="text-sm text-neutral-500">{project.contractNumber}</span>
              )}
            </div>
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
          <TabsTrigger value="boq">{t('projects.tabs.boq')}</TabsTrigger>
          <TabsTrigger value="tasks">{t('projects.tabs.tasks')}</TabsTrigger>
          <TabsTrigger value="execution">{t('projects.tabs.execution')}</TabsTrigger>
          <TabsTrigger value="worklogs">{t('projects.tabs.worklogs')}</TabsTrigger>
          {/* Modules tab removed — engineering calculation modules not needed for RevBrain */}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Project Info Card */}
            <div className="bg-white rounded shadow-sm p-6 space-y-4">
              <h3 className="font-semibold text-lg">{t('projects.details.overview')}</h3>

              {project.description && <p className="text-neutral-600">{project.description}</p>}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {project.location && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-neutral-500">{t('projects.form.location')}</p>
                      <p className="text-sm">{project.location}</p>
                    </div>
                  </div>
                )}

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

            {/* Contract Details Card */}
            <div className="bg-white rounded shadow-sm p-6 space-y-4">
              <h3 className="font-semibold text-lg">{t('projects.details.contract')}</h3>

              <div className="space-y-4">
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-neutral-500">{t('projects.form.contractNumber')}</p>
                    <p className="text-sm">
                      {project.contractNumber || t('projects.details.noContractNumber')}
                    </p>
                  </div>
                </div>

                {project.contractDate && (
                  <div className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-neutral-500">{t('projects.form.contractDate')}</p>
                      <p className="text-sm">{formatDate(project.contractDate)}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-2">
                  <Building2 className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-neutral-500">{t('projects.form.contractorName')}</p>
                    <p className="text-sm">
                      {project.contractorName || t('projects.details.noContractor')}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <User className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-neutral-500">{t('projects.form.clientName')}</p>
                    <p className="text-sm">
                      {project.clientName || t('projects.details.noClient')}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Financial Card */}
            <div className="bg-white rounded shadow-sm p-6 space-y-4 lg:col-span-2">
              <h3 className="font-semibold text-lg">{t('projects.details.financial')}</h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-neutral-50 rounded-lg p-4">
                  <p className="text-xs text-neutral-500 mb-1">
                    {t('projects.form.contractValue')}
                  </p>
                  <p className="text-lg font-bold font-mono">
                    {formatCurrency(project.contractValueCents)}
                  </p>
                </div>

                <div className="bg-neutral-50 rounded-lg p-4">
                  <p className="text-xs text-neutral-500 mb-1">
                    {t('projects.form.globalDiscount')}
                  </p>
                  <p className="text-lg font-bold font-mono">{project.globalDiscountPercent}%</p>
                </div>

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

        {/* BOQ Tab */}
        <TabsContent value="boq">
          <div className="space-y-4">
            {/* BOQ Summary */}
            <BOQSummaryCard projectId={id || ''} projectName={project.name} />

            {/* BOQ Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white rounded shadow-sm p-4">
              <div>
                <h3 className="font-semibold">{t('boq.title')}</h3>
                <p className="text-sm text-neutral-500">{t('boq.subtitle')}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCreateItem}>
                  <Plus className="h-4 w-4 me-1" />
                  {t('boq.item.create')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                  <Upload className="h-4 w-4 me-1" />
                  {t('boq.import.button')}
                </Button>
              </div>
            </div>

            {/* BOQ Tree */}
            <BOQTree
              items={boqItems || []}
              isLoading={boqLoading}
              onItemClick={handleItemClick}
              selectedId={selectedItem?.id}
            />
          </div>

          {/* Import Sheet */}
          <BOQImportSheet
            open={importOpen}
            onOpenChange={setImportOpen}
            projectId={id || ''}
            onSuccess={() => {
              // React Query will auto-refetch
            }}
          />

          {/* Item Form Sheet */}
          <BOQItemFormSheet
            open={itemFormOpen}
            onOpenChange={setItemFormOpen}
            projectId={id || ''}
            item={selectedItem}
            parentItems={boqFlatData?.items || []}
            onSave={handleItemSave}
            onDelete={handleItemDelete}
          />
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks">
          {/* Full-page Tasks/Kanban View (matches legacy layout) */}
          <TasksView projectId={id || ''} projectMembers={teamMembers} />
        </TabsContent>

        {/* Execution Tab */}
        <TabsContent value="execution">
          {/* Full-page Billing View (matches legacy layout) */}
          <BillingView
            projectId={id || ''}
            bills={[]}
            onUpdateBills={() => {}}
            boqItems={[]}
            onUpdateBoq={() => {}}
            projectData={{
              name: project.name,
              contractorName: project.contractorName || undefined,
              clientName: project.clientName || undefined,
              contractNumber: project.contractNumber || undefined,
            }}
          />
        </TabsContent>

        {/* Work Logs Tab */}
        <TabsContent value="worklogs">
          {/* Full-page Work Logs View (matches legacy layout) */}
          <WorkLogsView
            projectId={id || ''}
            projectData={{
              name: project.name,
              contractorName: project.contractorName || undefined,
              clientName: project.clientName || undefined,
              contractNumber: project.contractNumber || undefined,
            }}
          />
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
