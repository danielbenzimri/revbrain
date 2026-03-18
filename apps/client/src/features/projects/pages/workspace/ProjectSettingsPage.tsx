/**
 * Project Settings Page
 *
 * Project configuration and management.
 * Uses server API via useProject and useUpdateProject hooks.
 */
import { useState, useRef } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  Settings,
  Save,
  Building2,
  Calendar,
  FileText,
  DollarSign,
  MapPin,
  CheckCircle,
  AlertCircle,
  Loader2,
  ClipboardList,
  Plus,
  Upload,
  Trash2,
  ImageIcon,
} from 'lucide-react';
import {
  useProject,
  useUpdateProject,
  type UpdateProjectInput,
} from '@/features/projects/hooks/use-project-api';
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
  BOQDashboard,
} from '@/features/boq/components';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

// Tab types
type SettingsTab = 'general' | 'contract' | 'parties' | 'boq';

interface TabConfig {
  id: SettingsTab;
  labelEn: string;
  labelHe: string;
  icon: React.ReactNode;
}

const TABS: TabConfig[] = [
  { id: 'general', labelEn: 'General', labelHe: 'כללי', icon: <Settings className="w-4 h-4" /> },
  { id: 'contract', labelEn: 'Contract', labelHe: 'חוזה', icon: <FileText className="w-4 h-4" /> },
  {
    id: 'boq',
    labelEn: 'Bill of Quantities',
    labelHe: 'כתב כמויות',
    icon: <ClipboardList className="w-4 h-4" />,
  },
  { id: 'parties', labelEn: 'Parties', labelHe: 'צדדים', icon: <Building2 className="w-4 h-4" /> },
];

export default function ProjectSettingsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { i18n } = useTranslation();
  const lang = i18n.language === 'he' ? 'he' : 'en';

  const { data: project, isLoading, error } = useProject(projectId);
  const updateMutation = useUpdateProject();

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  // Store only local edits (not full form data)
  const [localEdits, setLocalEdits] = useState<UpdateProjectInput>({});
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Logo upload refs and state
  const contractorLogoInputRef = useRef<HTMLInputElement>(null);
  const clientLogoInputRef = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState<'contractor' | 'client' | null>(null);

  // Get current logo URLs from project metadata or local edits
  const currentMetadata = { ...(project?.metadata || {}), ...(localEdits.metadata || {}) };
  const contractorLogoUrl = (currentMetadata.logoContractorUrl as string) || '';
  const clientLogoUrl = (currentMetadata.logoClientUrl as string) || '';

  const handleLogoUpload = async (side: 'contractor' | 'client', file: File) => {
    if (!file.type.startsWith('image/') || !projectId) return;
    if (file.size > 2 * 1024 * 1024) {
      alert(lang === 'he' ? 'הקובץ גדול מדי (מקסימום 2MB)' : 'File too large (max 2MB)');
      return;
    }

    setLogoUploading(side);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const orgId = project?.organizationId;
      if (!orgId) throw new Error('Missing organization ID');
      const path = `${orgId}/${projectId}/logos/${side}_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('project-files')
        .upload(path, file, { contentType: file.type, upsert: true });

      if (uploadError) throw uploadError;

      // Bucket is private, so use signed URL (long expiry)
      const { data: signedData, error: signedError } = await supabase.storage
        .from('project-files')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10); // 10 years

      if (signedError) throw signedError;
      const publicUrl = signedData.signedUrl;
      const key = side === 'contractor' ? 'logoContractorUrl' : 'logoClientUrl';

      // Save metadata with URL immediately (don't wait for the big "Save" button)
      const newMetadata = {
        ...(project?.metadata || {}),
        ...(localEdits.metadata || {}),
        [key]: publicUrl,
      };

      await updateMutation.mutateAsync({
        id: projectId,
        data: { metadata: newMetadata },
      });

      // Clear any pending metadata edits since we just saved
      setLocalEdits((prev) => {
        const next = { ...prev };
        delete next.metadata;
        return next;
      });
      setSaveSuccess(false);
    } catch (err) {
      console.error('Logo upload failed:', err);
      alert(lang === 'he' ? 'שגיאה בהעלאת הלוגו' : 'Error uploading logo');
    } finally {
      setLogoUploading(null);
    }
  };

  const handleLogoRemove = async (side: 'contractor' | 'client') => {
    if (!projectId) return;
    const key = side === 'contractor' ? 'logoContractorUrl' : 'logoClientUrl';

    try {
      const newMetadata = {
        ...(project?.metadata || {}),
        ...(localEdits.metadata || {}),
        [key]: null,
      };

      await updateMutation.mutateAsync({
        id: projectId,
        data: { metadata: newMetadata },
      });

      setLocalEdits((prev) => {
        const next = { ...prev };
        delete next.metadata;
        return next;
      });
      setSaveSuccess(false);
    } catch (err) {
      console.error('Logo remove failed:', err);
    }
  };

  // BoQ state
  const { data: boqItems, isLoading: boqLoading } = useBOQTree(projectId || '');
  const { data: boqFlatData } = useBOQItems(projectId || '');
  const createBOQItem = useCreateBOQItem();
  const updateBOQItem = useUpdateBOQItem();
  const deleteBOQItem = useDeleteBOQItem();
  const [boqImportOpen, setBoqImportOpen] = useState(false);
  const [boqItemFormOpen, setBoqItemFormOpen] = useState(false);
  const [selectedBoqItem, setSelectedBoqItem] = useState<BOQItem | null>(null);

  // Derive form data by merging project data with local edits
  const formData: UpdateProjectInput = project
    ? {
        name: project.name,
        description: project.description,
        contractNumber: project.contractNumber,
        contractDate: project.contractDate?.split('T')[0] || null,
        startDate: project.startDate?.split('T')[0] || null,
        endDate: project.endDate?.split('T')[0] || null,
        contractorName: project.contractorName,
        contractorId: project.contractorId,
        clientName: project.clientName,
        clientId: project.clientId,
        contractValueCents: project.contractValueCents,
        globalDiscountPercent: project.globalDiscountPercent,
        location: project.location,
        notes: project.notes,
        status: project.status,
        ...localEdits, // Override with local edits
      }
    : {};

  const hasChanges = Object.keys(localEdits).length > 0;

  const handleChange = (field: keyof UpdateProjectInput, value: unknown) => {
    setLocalEdits((prev) => ({ ...prev, [field]: value }));
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    if (!projectId || !hasChanges) return;

    try {
      await updateMutation.mutateAsync({ id: projectId, data: formData });
      setLocalEdits({}); // Clear local edits after successful save
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  };

  // Format currency for display
  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat(lang === 'he' ? 'he-IL' : 'en-US', {
      style: 'currency',
      currency: 'ILS',
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 h-full">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-4 md:p-8 h-full">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {lang === 'he' ? 'שגיאה בטעינת הגדרות הפרויקט' : 'Error loading project settings'}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-slate-900">
            {lang === 'he' ? 'הגדרות פרויקט' : 'Project Settings'}
          </h1>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={!hasChanges || updateMutation.isPending}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors',
            hasChanges
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          )}
        >
          {updateMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : saveSuccess ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {lang === 'he' ? 'שמור שינויים' : 'Save Changes'}
        </button>
      </div>

      {/* Success/Error messages */}
      {saveSuccess && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          {lang === 'he' ? 'ההגדרות נשמרו בהצלחה' : 'Settings saved successfully'}
        </div>
      )}
      {updateMutation.error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {lang === 'he' ? 'שגיאה בשמירת ההגדרות' : 'Error saving settings'}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-200">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 border-b-2 transition-colors',
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            {tab.icon}
            {lang === 'he' ? tab.labelHe : tab.labelEn}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        {activeTab === 'general' && (
          <div className="space-y-6">
            {/* Project Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {lang === 'he' ? 'שם הפרויקט' : 'Project Name'}
              </label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => handleChange('name', e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {lang === 'he' ? 'תיאור' : 'Description'}
              </label>
              <textarea
                value={formData.description || ''}
                onChange={(e) => handleChange('description', e.target.value)}
                rows={3}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                {lang === 'he' ? 'מיקום' : 'Location'}
              </label>
              <input
                type="text"
                value={formData.location || ''}
                onChange={(e) => handleChange('location', e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {lang === 'he' ? 'הערות' : 'Notes'}
              </label>
              <textarea
                value={formData.notes || ''}
                onChange={(e) => handleChange('notes', e.target.value)}
                rows={3}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {lang === 'he' ? 'סטטוס' : 'Status'}
              </label>
              <select
                value={formData.status || 'active'}
                onChange={(e) => handleChange('status', e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="active">{lang === 'he' ? 'פעיל' : 'Active'}</option>
                <option value="on_hold">{lang === 'he' ? 'מושהה' : 'On Hold'}</option>
                <option value="completed">{lang === 'he' ? 'הושלם' : 'Completed'}</option>
                <option value="cancelled">{lang === 'he' ? 'בוטל' : 'Cancelled'}</option>
              </select>
            </div>
          </div>
        )}

        {activeTab === 'contract' && (
          <div className="space-y-6">
            {/* Contract Number */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {lang === 'he' ? 'מספר חוזה' : 'Contract Number'}
              </label>
              <input
                type="text"
                value={formData.contractNumber || ''}
                onChange={(e) => handleChange('contractNumber', e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {lang === 'he' ? 'תאריך חוזה' : 'Contract Date'}
                </label>
                <input
                  type="date"
                  value={formData.contractDate || ''}
                  onChange={(e) => handleChange('contractDate', e.target.value)}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {lang === 'he' ? 'תאריך התחלה' : 'Start Date'}
                </label>
                <input
                  type="date"
                  value={formData.startDate || ''}
                  onChange={(e) => handleChange('startDate', e.target.value)}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {lang === 'he' ? 'תאריך סיום' : 'End Date'}
                </label>
                <input
                  type="date"
                  value={formData.endDate || ''}
                  onChange={(e) => handleChange('endDate', e.target.value)}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Contract Value */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                {lang === 'he' ? 'שווי חוזה (₪)' : 'Contract Value (₪)'}
              </label>
              <input
                type="number"
                value={(formData.contractValueCents || 0) / 100}
                onChange={(e) =>
                  handleChange('contractValueCents', Math.round(parseFloat(e.target.value) * 100))
                }
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {formData.contractValueCents ? (
                <p className="mt-1 text-sm text-slate-500">
                  {formatCurrency(formData.contractValueCents)}
                </p>
              ) : null}
            </div>

            {/* Global Discount */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {lang === 'he' ? 'הנחה גלובלית (%)' : 'Global Discount (%)'}
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={formData.globalDiscountPercent || 0}
                onChange={(e) => handleChange('globalDiscountPercent', parseFloat(e.target.value))}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {activeTab === 'parties' && (
          <div className="space-y-6">
            {/* Contractor Section */}
            <div className="border-b border-slate-200 pb-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                {lang === 'he' ? 'פרטי הקבלן' : 'Contractor Details'}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {lang === 'he' ? 'שם החברה' : 'Company Name'}
                  </label>
                  <input
                    type="text"
                    value={formData.contractorName || ''}
                    onChange={(e) => handleChange('contractorName', e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {lang === 'he' ? 'ח.פ / ע.מ' : 'Business ID'}
                  </label>
                  <input
                    type="text"
                    value={formData.contractorId || ''}
                    onChange={(e) => handleChange('contractorId', e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Contractor Logo */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  {lang === 'he' ? 'לוגו קבלן' : 'Contractor Logo'}
                </label>
                <input
                  ref={contractorLogoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleLogoUpload('contractor', file);
                    e.target.value = '';
                  }}
                />
                {logoUploading === 'contractor' ? (
                  <div className="flex items-center gap-2 px-4 py-3 text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {lang === 'he' ? 'מעלה לוגו...' : 'Uploading logo...'}
                  </div>
                ) : contractorLogoUrl ? (
                  <div className="flex items-center gap-4">
                    <div className="w-40 h-20 border border-slate-200 rounded-lg overflow-hidden bg-white flex items-center justify-center p-2">
                      <img
                        src={contractorLogoUrl}
                        alt="Contractor Logo"
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => contractorLogoInputRef.current?.click()}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        {lang === 'he' ? 'החלף' : 'Replace'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLogoRemove('contractor')}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {lang === 'he' ? 'הסר' : 'Remove'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => contractorLogoInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 rounded-lg hover:border-blue-400 hover:bg-blue-50/50 transition-colors text-slate-500 hover:text-blue-600"
                  >
                    <Upload className="w-4 h-4" />
                    {lang === 'he' ? 'העלה לוגו (עד 2MB)' : 'Upload logo (up to 2MB)'}
                  </button>
                )}
              </div>
            </div>

            {/* Client Section */}
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-green-600" />
                {lang === 'he' ? 'פרטי המזמין' : 'Client Details'}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {lang === 'he' ? 'שם החברה / גוף' : 'Company/Organization Name'}
                  </label>
                  <input
                    type="text"
                    value={formData.clientName || ''}
                    onChange={(e) => handleChange('clientName', e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {lang === 'he' ? 'ח.פ / ע.מ' : 'Business ID'}
                  </label>
                  <input
                    type="text"
                    value={formData.clientId || ''}
                    onChange={(e) => handleChange('clientId', e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Client Logo */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  {lang === 'he' ? 'לוגו מזמין' : 'Client Logo'}
                </label>
                <input
                  ref={clientLogoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleLogoUpload('client', file);
                    e.target.value = '';
                  }}
                />
                {logoUploading === 'client' ? (
                  <div className="flex items-center gap-2 px-4 py-3 text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {lang === 'he' ? 'מעלה לוגו...' : 'Uploading logo...'}
                  </div>
                ) : clientLogoUrl ? (
                  <div className="flex items-center gap-4">
                    <div className="w-40 h-20 border border-slate-200 rounded-lg overflow-hidden bg-white flex items-center justify-center p-2">
                      <img
                        src={clientLogoUrl}
                        alt="Client Logo"
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => clientLogoInputRef.current?.click()}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        {lang === 'he' ? 'החלף' : 'Replace'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLogoRemove('client')}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {lang === 'he' ? 'הסר' : 'Remove'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => clientLogoInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 rounded-lg hover:border-green-400 hover:bg-green-50/50 transition-colors text-slate-500 hover:text-green-600"
                  >
                    <Upload className="w-4 h-4" />
                    {lang === 'he' ? 'העלה לוגו (עד 2MB)' : 'Upload logo (up to 2MB)'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* BoQ tab renders outside the white card since it has its own layout */}
      {activeTab === 'boq' && (
        <div className="space-y-4 mt-6">
          <BOQSummaryCard projectId={projectId || ''} projectName={project?.name || ''} />

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white rounded-lg border border-slate-200 p-4">
            <div>
              <h3 className="font-semibold text-slate-900">
                {lang === 'he' ? 'סעיפי כתב כמויות' : 'BOQ Items'}
              </h3>
              <p className="text-sm text-slate-500">
                {lang === 'he'
                  ? 'ניהול סעיפי כתב הכמויות של הפרויקט'
                  : 'Manage project bill of quantities items'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedBoqItem(null);
                  setBoqItemFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4 me-1" />
                {lang === 'he' ? 'סעיף חדש' : 'Add Item'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setBoqImportOpen(true)}>
                <Upload className="h-4 w-4 me-1" />
                {lang === 'he' ? 'ייבוא מאקסל' : 'Import Excel'}
              </Button>
            </div>
          </div>

          {(boqItems?.length ?? 0) > 0 && <BOQDashboard items={boqItems || []} />}

          <BOQTree
            items={boqItems || []}
            isLoading={boqLoading}
            onItemClick={(item: BOQItem) => {
              setSelectedBoqItem(item);
              setBoqItemFormOpen(true);
            }}
            selectedId={selectedBoqItem?.id}
          />

          <BOQImportSheet
            open={boqImportOpen}
            onOpenChange={setBoqImportOpen}
            projectId={projectId || ''}
            onSuccess={() => {}}
          />

          <BOQItemFormSheet
            open={boqItemFormOpen}
            onOpenChange={setBoqItemFormOpen}
            projectId={projectId || ''}
            item={selectedBoqItem}
            parentItems={boqFlatData?.items || []}
            onSave={async (data: CreateBOQItemInput | UpdateBOQItemInput, isEdit: boolean) => {
              if (isEdit && selectedBoqItem) {
                await updateBOQItem.mutateAsync({
                  id: selectedBoqItem.id,
                  data: data as UpdateBOQItemInput,
                });
              } else {
                await createBOQItem.mutateAsync(data as CreateBOQItemInput);
              }
            }}
            onDelete={async (itemId: string) => {
              if (!projectId) return;
              await deleteBOQItem.mutateAsync({ id: itemId, projectId });
            }}
          />
        </div>
      )}
    </div>
  );
}
