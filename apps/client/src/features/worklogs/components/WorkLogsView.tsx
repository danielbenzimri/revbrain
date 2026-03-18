/**
 * WorkLogsView Component
 *
 * Full-page work logs view that matches the legacy WorkLogsView layout exactly:
 * - Left sidebar (w-80) with tabs for status filtering (drafts/submitted/approved)
 * - Main content area with gradient header and collapsible sections
 * - Dual resource tables (contractorResources/externalResources)
 * - Dual work descriptions and notes (contractor/supervisor)
 * - Status workflow actions (Save/Submit for contractor, Approve for supervisor)
 */
import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Calendar,
  Plus,
  Save,
  Check,
  Sun,
  Cloud,
  CloudRain,
  Thermometer,
  CloudLightning,
  Snowflake,
  FileText,
  Paperclip,
  Edit,
  Clock,
  Printer,
  AlertTriangle,
  PenTool,
  Wind,
  CloudSnow,
  CloudFog,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CollapsibleSection } from './CollapsibleSection';
import { WorkLogResourceTable } from './WorkLogResourceTable';
import { WorkLogPrintModal } from './WorkLogPrintModal';
import {
  useWorkLogs,
  useCreateWorkLog,
  useUpdateWorkLog,
  useSubmitWorkLog,
  useApproveWorkLog,
  type WorkLog,
  type WeatherType,
  type WorkLogResourceEntry,
} from '../hooks/use-work-logs';

interface WorkLogsViewProps {
  projectId: string;
  projectData: {
    name: string;
    contractorName?: string;
    clientName?: string;
    contractNumber?: string;
  };
  currentUser?: {
    id: string;
    name: string;
    role: string;
    group?: string;
    signature?: string;
    workerTitle?: string;
  };
}

// Weather icons mapping
const WEATHER_ICONS: Record<WeatherType, { icon: React.ElementType; color: string }> = {
  sunny: { icon: Sun, color: 'text-yellow-500' },
  cloudy: { icon: Cloud, color: 'text-gray-500' },
  rainy: { icon: CloudRain, color: 'text-blue-500' },
  hot: { icon: Thermometer, color: 'text-red-500' },
  stormy: { icon: CloudLightning, color: 'text-purple-500' },
  cold: { icon: Snowflake, color: 'text-cyan-500' },
  windy: { icon: Wind, color: 'text-gray-400' },
  snowy: { icon: CloudSnow, color: 'text-blue-300' },
  foggy: { icon: CloudFog, color: 'text-gray-400' },
};

// Default resource types for contractor
const DEFAULT_CONTRACTOR_RESOURCES = [
  'Work Manager',
  'Workers',
  'Welder',
  'JCB',
  'Excavator',
  'Compactor',
];

// Default resource types for external
const DEFAULT_EXTERNAL_RESOURCES = [
  'Traffic Controllers',
  'Safety Advisor',
  'Project Planner',
  'Authority Inspector',
];

export function WorkLogsView({ projectId, projectData, currentUser }: WorkLogsViewProps) {
  const { t, i18n } = useTranslation('workLogs');
  const isRTL = i18n.language === 'he';

  // Check permissions
  const isInspector =
    currentUser?.role === 'reviewer' ||
    currentUser?.role === 'org_owner' ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'system_admin';
  const isContractor = currentUser?.group === 'contractor' || currentUser?.role === 'system_admin';

  // Fetch work logs
  const { data, isLoading } = useWorkLogs(projectId, { limit: 100 });
  const logs = useMemo(() => data?.workLogs || [], [data?.workLogs]);

  // Mutations
  const createWorkLog = useCreateWorkLog();
  const updateWorkLog = useUpdateWorkLog();
  const submitWorkLog = useSubmitWorkLog();
  const approveWorkLog = useApproveWorkLog();

  // State
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'drafts' | 'submitted' | 'approved'>('drafts');
  const [showAddResourceModal, setShowAddResourceModal] = useState<
    'contractor' | 'external' | null
  >(null);
  const [newResourceType, setNewResourceType] = useState('');
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  // Auto-hide notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Initialize selected log (derive from logs if not yet selected)
  const effectiveSelectedLogId = selectedLogId ?? (logs.length > 0 ? logs[0].id : null);

  // Current log
  const selectedLog = useMemo(
    () => logs.find((l) => l.id === effectiveSelectedLogId) || null,
    [logs, effectiveSelectedLogId]
  );

  // Permission helpers
  const canContractorEdit = useMemo(() => {
    return isContractor && selectedLog?.status === 'draft';
  }, [isContractor, selectedLog?.status]);

  const canSupervisorEdit = useMemo(() => {
    return isInspector && selectedLog?.status === 'submitted';
  }, [isInspector, selectedLog?.status]);

  // Update log helper
  const handleUpdateLog = async (updates: Partial<WorkLog>) => {
    if (!effectiveSelectedLogId || !selectedLog) return;
    await updateWorkLog.mutateAsync({
      id: effectiveSelectedLogId,
      projectId,
      data: updates,
    });
  };

  // Update resource
  const handleUpdateResource = async (
    resourceId: string,
    field: 'contractorCount' | 'supervisorCount',
    value: number,
    isExternal: boolean
  ) => {
    if (!selectedLog) return;
    if (field === 'contractorCount' && !canContractorEdit) return;
    if (field === 'supervisorCount' && !canSupervisorEdit) return;

    const key = isExternal ? 'externalResources' : 'contractorResources';
    const resources = selectedLog[key].map((r) =>
      r.id === resourceId ? { ...r, [field]: value } : r
    );
    await handleUpdateLog({ [key]: resources });
  };

  // Add resource type
  const handleAddResourceType = async () => {
    if (!selectedLog || !newResourceType.trim() || !showAddResourceModal) return;
    if (!canContractorEdit) return;

    const key = showAddResourceModal === 'external' ? 'externalResources' : 'contractorResources';
    const newResource: WorkLogResourceEntry = {
      id: `${showAddResourceModal === 'external' ? 'er' : 'cr'}-${Date.now()}`,
      type: newResourceType.trim(),
      contractorCount: 0,
      supervisorCount: 0,
    };
    await handleUpdateLog({ [key]: [...selectedLog[key], newResource] });
    setNewResourceType('');
    setShowAddResourceModal(null);
  };

  // Delete resource
  const handleDeleteResource = async (resourceId: string, isExternal: boolean) => {
    if (!selectedLog || !canContractorEdit) return;
    const key = isExternal ? 'externalResources' : 'contractorResources';
    await handleUpdateLog({ [key]: selectedLog[key].filter((r) => r.id !== resourceId) });
  };

  // Create new log
  const handleCreateNewLog = async () => {
    const newLog = await createWorkLog.mutateAsync({
      projectId,
      logDate: new Date().toISOString().split('T')[0],
      contractorResources: DEFAULT_CONTRACTOR_RESOURCES.map((type, idx) => ({
        id: `cr-${idx}`,
        type,
        contractorCount: 0,
        supervisorCount: 0,
      })),
      externalResources: DEFAULT_EXTERNAL_RESOURCES.map((type, idx) => ({
        id: `er-${idx}`,
        type,
        contractorCount: 0,
        supervisorCount: 0,
      })),
    });
    setSelectedLogId(newLog.id);
    setNotification({ message: t('notifications.created'), type: 'success' });
  };

  // Save draft
  const handleSaveLog = async () => {
    if (!selectedLog || !canContractorEdit) return;
    await handleUpdateLog({});
    setNotification({ message: t('notifications.updated'), type: 'success' });
  };

  // Submit log
  const handleSubmitLog = async () => {
    if (!selectedLog || !canContractorEdit) return;
    if (!currentUser?.signature) {
      setNotification({ message: t('warnings.noSignatureDetails'), type: 'error' });
      return;
    }
    await submitWorkLog.mutateAsync({ id: selectedLog.id, projectId });
    setNotification({ message: t('notifications.submitted'), type: 'success' });
    setSidebarTab('submitted');
  };

  // Approve log
  const handleApproveLog = async () => {
    if (!selectedLog || !canSupervisorEdit) return;
    if (!currentUser?.signature) {
      setNotification({ message: t('warnings.noSignatureDetails'), type: 'error' });
      return;
    }
    await approveWorkLog.mutateAsync({ id: selectedLog.id, projectId });
    setNotification({ message: t('notifications.approved'), type: 'success' });
    setSidebarTab('approved');
  };

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const locale = i18n.language === 'he' ? 'he-IL' : 'en-US';
    return date.toLocaleDateString(locale, {
      weekday: 'short',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
  };

  // Filter logs by status
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (sidebarTab === 'drafts') return log.status === 'draft';
      if (sidebarTab === 'submitted') return log.status === 'submitted';
      return log.status === 'approved';
    });
  }, [logs, sidebarTab]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
      </div>
    );
  }

  // Empty state
  if (!selectedLog) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 py-16">
        <Calendar size={64} className="mb-4 opacity-30" />
        <p className="text-lg">{t('empty')}</p>
        <Button onClick={handleCreateNewLog} className="mt-4 gap-2">
          <Plus size={18} />
          {t('createNew')}
        </Button>
      </div>
    );
  }

  return (
    <div
      className="flex gap-6 h-[calc(100vh-200px)] animate-in fade-in duration-300 relative"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* Notification Toast */}
      {notification && (
        <div
          className={`absolute top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-lg shadow-xl flex items-center gap-3 animate-in slide-in-from-top-5 ${
            notification.type === 'success'
              ? 'bg-emerald-600 text-white'
              : notification.type === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-slate-800 text-white'
          }`}
        >
          {notification.type === 'success' ? <Check size={20} /> : <AlertTriangle size={20} />}
          <span className="font-medium">{notification.message}</span>
        </div>
      )}

      {/* Left Sidebar - Logs List with Tabs */}
      <div className="w-80 flex flex-col bg-white rounded shadow-sm overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-800">{t('title')}</h2>
            <Button
              onClick={handleCreateNewLog}
              size="sm"
              className="gap-1 bg-emerald-500 hover:bg-emerald-600"
            >
              <Plus size={16} />
              {t('createNew')}
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setSidebarTab('drafts')}
            className={`flex-1 py-3 text-sm font-medium transition ${
              sidebarTab === 'drafts'
                ? 'text-emerald-600 border-b-2 border-emerald-500 bg-emerald-50/50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Edit size={14} />
              {t('sidebar.drafts')}
              <span className="bg-slate-200 text-slate-600 text-xs px-1.5 py-0.5 rounded-full">
                {logs.filter((l) => l.status === 'draft').length}
              </span>
            </div>
          </button>
          <button
            onClick={() => setSidebarTab('submitted')}
            className={`flex-1 py-3 text-sm font-medium transition ${
              sidebarTab === 'submitted'
                ? 'text-blue-600 border-b-2 border-blue-500 bg-blue-50/50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Clock size={14} />
              {t('sidebar.submitted')}
              <span className="bg-slate-200 text-slate-600 text-xs px-1.5 py-0.5 rounded-full">
                {logs.filter((l) => l.status === 'submitted').length}
              </span>
            </div>
          </button>
          <button
            onClick={() => setSidebarTab('approved')}
            className={`flex-1 py-3 text-sm font-medium transition ${
              sidebarTab === 'approved'
                ? 'text-green-600 border-b-2 border-green-500 bg-green-50/50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Check size={14} />
              {t('sidebar.approved')}
              <span className="bg-slate-200 text-slate-600 text-xs px-1.5 py-0.5 rounded-full">
                {logs.filter((l) => l.status === 'approved').length}
              </span>
            </div>
          </button>
        </div>

        {/* Logs List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredLogs.map((log) => (
            <div
              key={log.id}
              onClick={() => setSelectedLogId(log.id)}
              className={`p-3 rounded border cursor-pointer transition ${
                effectiveSelectedLogId === log.id
                  ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-200'
                  : 'bg-white border-slate-200 hover:border-emerald-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="font-bold text-slate-800">
                  {t('log.logNumber', { number: log.logNumber })}
                </span>
                {log.status === 'approved' && (
                  <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                    <Check size={12} /> {t('status.approved')}
                  </span>
                )}
                {log.status === 'submitted' && (
                  <span className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    <Clock size={12} /> {t('warnings.pendingApproval')}
                  </span>
                )}
                {log.status === 'draft' && (
                  <span className="flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                    <Edit size={12} /> {t('status.draft')}
                  </span>
                )}
              </div>
              <div className="text-sm text-slate-500">{formatDate(log.logDate)}</div>
              {log.auditLog && log.auditLog.length > 0 && (
                <div className="mt-2 text-xs text-slate-400">
                  {log.auditLog.length} {t('sidebar.signatures')}
                </div>
              )}
            </div>
          ))}

          {/* Empty State */}
          {filteredLogs.length === 0 && (
            <div className="text-center py-8 text-slate-400">
              <FileText size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                {sidebarTab === 'drafts'
                  ? t('sidebar.emptyDrafts')
                  : sidebarTab === 'submitted'
                    ? t('sidebar.emptySubmitted')
                    : t('sidebar.emptyApproved')}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 rounded shadow-sm">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 p-6 text-white">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-2xl font-bold mb-1">
                {t('log.logNumber', { number: selectedLog.logNumber })}
              </h1>
              <p className="text-slate-400 text-sm">{formatDate(selectedLog.logDate)}</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => setShowPrintModal(true)}
                className="gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white"
              >
                <Printer size={18} />
                {t('actions.print')}
              </Button>
              {canContractorEdit && (
                <>
                  <Button
                    variant="secondary"
                    onClick={handleSaveLog}
                    className="gap-2 bg-white text-slate-700 hover:bg-slate-100"
                  >
                    <Save size={18} />
                    {t('actions.saveDraft')}
                  </Button>
                  <Button onClick={handleSubmitLog} className="gap-2 bg-blue-600 hover:bg-blue-700">
                    <Check size={18} />
                    {t('actions.submitToInspector')}
                  </Button>
                </>
              )}
              {canSupervisorEdit && (
                <Button
                  onClick={handleApproveLog}
                  className="gap-2 bg-emerald-500 hover:bg-emerald-600"
                >
                  <Check size={18} />
                  {t('actions.approveLog')}
                </Button>
              )}
            </div>
          </div>

          {/* Signature Warning */}
          {(canContractorEdit || canSupervisorEdit) && !currentUser?.signature && (
            <div className="bg-amber-500/20 border border-amber-400/40 rounded-lg p-3 mb-4 flex items-center gap-3">
              <AlertTriangle size={20} className="text-amber-300 shrink-0" />
              <div className="text-sm">
                <span className="text-amber-200">{t('warnings.noSignature')}</span>
                <span className="text-amber-100 ms-1">{t('warnings.noSignatureDetails')}</span>
              </div>
            </div>
          )}

          {/* Project Info Grid */}
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="bg-white/10 rounded-lg p-3">
              <div className="text-slate-400 text-xs mb-1">{t('projectInfo.projectName')}</div>
              <div className="font-medium">{projectData.name}</div>
            </div>
            <div className="bg-white/10 rounded-lg p-3">
              <div className="text-slate-400 text-xs mb-1">{t('projectInfo.contractorName')}</div>
              <div className="font-medium">{projectData.contractorName || '-'}</div>
            </div>
            <div className="bg-white/10 rounded-lg p-3">
              <div className="text-slate-400 text-xs mb-1">{t('projectInfo.clientName')}</div>
              <div className="font-medium">{projectData.clientName || '-'}</div>
            </div>
            <div className="bg-white/10 rounded-lg p-3">
              <div className="text-sky-200 text-xs mb-1">{t('projectInfo.contractNumber')}</div>
              <div className="font-medium">{projectData.contractNumber || '-'}</div>
            </div>
            <div className="bg-white/10 rounded-lg p-3">
              <div className="text-sky-200 text-xs mb-1">{t('projectInfo.workName')}</div>
              <div className="font-medium">{projectData.name}</div>
            </div>
            <div className="bg-white/10 rounded-lg p-3">
              <div className="text-sky-200 text-xs mb-1">{t('projectInfo.siteName')}</div>
              <div className="font-medium">{projectData.name}</div>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Date & Weather Row */}
          <div className="bg-white rounded shadow-sm p-4">
            <div className="grid grid-cols-4 gap-4">
              {/* Log Number */}
              <div className="flex items-center gap-3">
                <div className="text-slate-500 text-sm">{t('log.number')}</div>
                <div className="text-2xl font-bold text-sky-600">{selectedLog.logNumber}</div>
              </div>

              {/* Date */}
              <div>
                <div className="text-slate-500 text-sm mb-1">{t('log.date')}</div>
                <div className="flex items-center gap-2">
                  <Calendar size={18} className="text-sky-500" />
                  <input
                    type="date"
                    value={selectedLog.logDate.split('T')[0]}
                    onChange={(e) => handleUpdateLog({ logDate: e.target.value })}
                    className="p-2 border border-slate-200 rounded focus:border-sky-400 focus:ring-1 focus:ring-sky-200 outline-none"
                    disabled={!canContractorEdit}
                  />
                </div>
              </div>

              {/* Status */}
              <div>
                <div className="text-slate-500 text-sm mb-1">{t('status.title')}</div>
                <div className="w-full p-2 border border-slate-200 rounded bg-slate-50 text-slate-700 font-medium">
                  {selectedLog.status === 'draft'
                    ? t('status.draft')
                    : selectedLog.status === 'submitted'
                      ? t('status.submitted')
                      : t('status.approved')}
                </div>
              </div>

              {/* Weather */}
              <div>
                <div className="text-slate-500 text-sm mb-1">{t('log.weather')}</div>
                <select
                  value={selectedLog.weatherType || 'sunny'}
                  onChange={(e) => handleUpdateLog({ weatherType: e.target.value as WeatherType })}
                  className="w-full p-2 border border-slate-200 rounded bg-white focus:border-sky-400 focus:ring-1 focus:ring-sky-200 outline-none"
                  disabled={!canContractorEdit}
                >
                  {Object.entries(WEATHER_ICONS).map(([key]) => (
                    <option key={key} value={key}>
                      {t(`weather.${key}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Address */}
            <div className="mt-4">
              <div className="text-slate-500 text-sm mb-1">{t('log.address')}</div>
              <input
                type="text"
                value={selectedLog.exactAddress || ''}
                onChange={(e) => handleUpdateLog({ exactAddress: e.target.value })}
                placeholder={t('log.address')}
                className={`w-full p-2 border rounded outline-none ${
                  canContractorEdit
                    ? 'border-slate-200 focus:border-sky-400 focus:ring-1 focus:ring-sky-200'
                    : 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed'
                }`}
                readOnly={!canContractorEdit}
              />
            </div>
          </div>

          {/* Resources Tables */}
          <div className="grid grid-cols-2 gap-6">
            <WorkLogResourceTable
              resources={selectedLog.contractorResources || []}
              title={t('contractorResources.title')}
              isExternal={false}
              canContractorEdit={canContractorEdit}
              canSupervisorEdit={canSupervisorEdit}
              onUpdateResource={(id, field, value) => handleUpdateResource(id, field, value, false)}
              onDeleteResource={(id) => handleDeleteResource(id, false)}
              onAddResource={() => setShowAddResourceModal('contractor')}
            />
            <WorkLogResourceTable
              resources={selectedLog.externalResources || []}
              title={t('externalResources.title')}
              isExternal={true}
              canContractorEdit={canContractorEdit}
              canSupervisorEdit={canSupervisorEdit}
              onUpdateResource={(id, field, value) => handleUpdateResource(id, field, value, true)}
              onDeleteResource={(id) => handleDeleteResource(id, true)}
              onAddResource={() => setShowAddResourceModal('external')}
            />
          </div>

          {/* Work Descriptions */}
          <CollapsibleSection title={t('sections.workDescriptions')}>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-slate-600">
                    {t('descriptions.contractor')}
                  </label>
                  <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                    {projectData.contractorName}
                  </span>
                </div>
                <textarea
                  value={selectedLog.contractorWorkDescription || ''}
                  onChange={(e) => handleUpdateLog({ contractorWorkDescription: e.target.value })}
                  rows={4}
                  className={`w-full p-3 border rounded resize-none ${
                    canContractorEdit
                      ? 'border-blue-200 bg-blue-50/50 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none'
                      : 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed'
                  }`}
                  placeholder={t('descriptions.contractorPlaceholder')}
                  readOnly={!canContractorEdit}
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-slate-600">
                    {t('descriptions.supervisor')}
                  </label>
                  {canSupervisorEdit ? (
                    <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                      {t('warnings.canEdit')}
                    </span>
                  ) : (
                    <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">
                      {t('warnings.inspectorOnly')}
                    </span>
                  )}
                </div>
                <textarea
                  value={selectedLog.supervisorWorkDescription || ''}
                  onChange={(e) => handleUpdateLog({ supervisorWorkDescription: e.target.value })}
                  rows={4}
                  className={`w-full p-3 border rounded resize-none ${
                    canSupervisorEdit
                      ? 'border-green-200 bg-green-50/50 focus:border-green-400 focus:ring-1 focus:ring-green-200 outline-none'
                      : 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed'
                  }`}
                  placeholder={t('descriptions.supervisorPlaceholder')}
                  readOnly={!canSupervisorEdit}
                />
              </div>
            </div>
          </CollapsibleSection>

          {/* Notes */}
          <CollapsibleSection title={t('sections.notes')}>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-slate-600">
                    {t('notes.contractor')}
                  </label>
                  <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                    {projectData.contractorName}
                  </span>
                </div>
                <textarea
                  value={selectedLog.contractorNotes || ''}
                  onChange={(e) => handleUpdateLog({ contractorNotes: e.target.value })}
                  rows={3}
                  className={`w-full p-3 border rounded resize-none ${
                    canContractorEdit
                      ? 'border-blue-200 bg-blue-50/50 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none'
                      : 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed'
                  }`}
                  placeholder={t('notes.contractorPlaceholder')}
                  readOnly={!canContractorEdit}
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-slate-600">
                    {t('notes.supervisor')}
                  </label>
                  {canSupervisorEdit ? (
                    <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                      {t('warnings.canEdit')}
                    </span>
                  ) : (
                    <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">
                      {t('warnings.inspectorOnly')}
                    </span>
                  )}
                </div>
                <textarea
                  value={selectedLog.supervisorNotes || ''}
                  onChange={(e) => handleUpdateLog({ supervisorNotes: e.target.value })}
                  rows={3}
                  className={`w-full p-3 border rounded resize-none ${
                    canSupervisorEdit
                      ? 'border-green-200 bg-green-50/50 focus:border-green-400 focus:ring-1 focus:ring-green-200 outline-none'
                      : 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed'
                  }`}
                  placeholder={t('notes.supervisorPlaceholder')}
                  readOnly={!canSupervisorEdit}
                />
              </div>
            </div>
          </CollapsibleSection>

          {/* Traffic Controllers */}
          <CollapsibleSection title={t('log.trafficControllers')}>
            <textarea
              value={selectedLog.trafficControllersInfo || ''}
              onChange={(e) => handleUpdateLog({ trafficControllersInfo: e.target.value })}
              rows={3}
              className={`w-full p-3 border rounded resize-none ${
                canContractorEdit
                  ? 'border-slate-200 bg-slate-50 focus:border-sky-400 focus:ring-1 focus:ring-sky-200 outline-none'
                  : 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed'
              }`}
              placeholder={t('log.trafficControllersPlaceholder')}
              readOnly={!canContractorEdit}
            />
          </CollapsibleSection>

          {/* Attachments */}
          <CollapsibleSection title={t('attachments.title')}>
            <div>
              {canContractorEdit && (
                <Button className="gap-2 bg-sky-600 hover:bg-sky-700">
                  <Paperclip size={18} />
                  {t('attachments.add')}
                </Button>
              )}
              {selectedLog.attachments && selectedLog.attachments.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {selectedLog.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg"
                    >
                      <FileText size={16} className="text-slate-400" />
                      <span className="text-sm">{att.name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400 mt-2">{t('attachments.empty')}</p>
              )}
            </div>
          </CollapsibleSection>

          {/* Signatures */}
          <CollapsibleSection title={t('signatures.title')}>
            <div>
              {!selectedLog.auditLog || selectedLog.auditLog.length === 0 ? (
                <div className="py-8 text-center text-slate-400">
                  <PenTool size={32} className="mx-auto mb-2 opacity-50" />
                  <p>{t('audit.empty')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {selectedLog.auditLog
                    .filter((entry) => entry.action === 'signed')
                    .map((sig) => (
                      <div
                        key={sig.id}
                        className={`p-4 rounded shadow-sm-2 ${
                          sig.role === 'contractor'
                            ? 'bg-blue-50 border-blue-200'
                            : 'bg-green-50 border-green-200'
                        }`}
                      >
                        <div className="text-xs font-medium text-slate-500 mb-2">
                          {sig.role === 'contractor'
                            ? t('signatures.contractor')
                            : t('signatures.inspector')}
                        </div>
                        <div className="text-sm">
                          <div className="font-medium text-slate-800">{sig.userName}</div>
                          <div className="text-slate-500">{sig.company}</div>
                          <div className="text-xs text-slate-400">
                            {sig.role} •{' '}
                            {new Date(sig.timestamp).toLocaleDateString(
                              i18n.language === 'he' ? 'he-IL' : 'en-US'
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </CollapsibleSection>

          {/* Audit Log */}
          <CollapsibleSection title={t('audit.title')}>
            <div>
              {selectedLog.auditLog && selectedLog.auditLog.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-start border-b border-slate-200">
                      <th className="pb-2 font-medium text-slate-500">
                        {t('audit.actions.signed')}
                      </th>
                      <th className="pb-2 font-medium text-slate-500">
                        {t('projectInfo.contractorName')}
                      </th>
                      <th className="pb-2 font-medium text-slate-500">{t('log.date')}</th>
                      <th className="pb-2 font-medium text-slate-500">{t('status.title')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedLog.auditLog.map((entry) => (
                      <tr key={entry.id} className="border-b border-slate-100">
                        <td className="py-2 font-medium text-sky-600">{entry.userName}</td>
                        <td className="py-2">{entry.company}</td>
                        <td className="py-2">
                          {new Date(entry.timestamp).toLocaleString(
                            i18n.language === 'he' ? 'he-IL' : 'en-US'
                          )}
                        </td>
                        <td className="py-2">{t(`audit.actions.${entry.action}`)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-slate-400">{t('audit.empty')}</p>
              )}
            </div>
          </CollapsibleSection>
        </div>
      </div>

      {/* Add Resource Modal */}
      {showAddResourceModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded shadow-2xl w-full max-w-sm animate-in zoom-in-95">
            <div className="p-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800">
                {showAddResourceModal === 'external'
                  ? t('externalResources.add')
                  : t('contractorResources.add')}
              </h3>
            </div>
            <div className="p-4">
              <input
                type="text"
                value={newResourceType}
                onChange={(e) => setNewResourceType(e.target.value)}
                placeholder={t('resources.trade')}
                className="w-full p-3 border border-slate-200 rounded focus:border-sky-400 focus:ring-1 focus:ring-sky-200 outline-none"
                autoFocus
              />
            </div>
            <div className="p-4 border-t border-slate-200 flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowAddResourceModal(null)}>
                {t('actions.cancel')}
              </Button>
              <Button onClick={handleAddResourceType} disabled={!newResourceType.trim()}>
                {t('actions.add')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Print Modal */}
      {showPrintModal && selectedLog && (
        <WorkLogPrintModal
          workLog={selectedLog}
          projectData={projectData}
          onClose={() => setShowPrintModal(false)}
        />
      )}
    </div>
  );
}
