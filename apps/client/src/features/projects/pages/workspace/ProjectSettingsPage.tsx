/**
 * Project Settings Page
 *
 * Project configuration: name, description, dates, status, notes.
 */
import { useState } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Settings, Save, Calendar, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import {
  useProject,
  useUpdateProject,
  type UpdateProjectInput,
} from '@/features/projects/hooks/use-project-api';
import { cn } from '@/lib/utils';

export default function ProjectSettingsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { i18n } = useTranslation();
  const lang = i18n.language === 'he' ? 'he' : 'en';

  const { data: project, isLoading, error } = useProject(projectId);
  const updateMutation = useUpdateProject();

  const [localEdits, setLocalEdits] = useState<UpdateProjectInput>({});
  const [saveSuccess, setSaveSuccess] = useState(false);

  const formData: UpdateProjectInput = project
    ? {
        name: project.name,
        description: project.description,
        startDate: project.startDate?.split('T')[0] || null,
        endDate: project.endDate?.split('T')[0] || null,
        notes: project.notes,
        status: project.status,
        ...localEdits,
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
      setLocalEdits({});
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 h-full">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
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
          <Settings className="w-6 h-6 text-violet-600" />
          <h1 className="text-2xl font-bold text-slate-900">
            {lang === 'he' ? 'הגדרות פרויקט' : 'Project Settings'}
          </h1>
        </div>
        <button
          onClick={handleSave}
          disabled={!hasChanges || updateMutation.isPending}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors',
            hasChanges
              ? 'bg-violet-600 text-white hover:bg-violet-700'
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

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-6">
        {/* Project Name */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            {lang === 'he' ? 'שם הפרויקט' : 'Project Name'}
          </label>
          <input
            type="text"
            value={formData.name || ''}
            onChange={(e) => handleChange('name', e.target.value)}
            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
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
            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {lang === 'he' ? 'תאריך התחלה' : 'Start Date'}
            </label>
            <input
              type="date"
              value={formData.startDate || ''}
              onChange={(e) => handleChange('startDate', e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
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
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
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
            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
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
            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="active">{lang === 'he' ? 'פעיל' : 'Active'}</option>
            <option value="on_hold">{lang === 'he' ? 'מושהה' : 'On Hold'}</option>
            <option value="completed">{lang === 'he' ? 'הושלם' : 'Completed'}</option>
            <option value="cancelled">{lang === 'he' ? 'בוטל' : 'Cancelled'}</option>
          </select>
        </div>
      </div>
    </div>
  );
}
