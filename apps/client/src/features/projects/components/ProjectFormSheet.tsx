/**
 * Project Form Sheet
 *
 * Slide-out drawer for creating and editing projects.
 * Follows the CouponEditorDrawer pattern with:
 * - Create/Edit mode handling
 * - Numbered sections for organization
 * - Validation and error handling
 * - Delete confirmation
 */
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  X,
  Trash2,
  AlertTriangle,
  Calendar,
  Building2,
  User,
  FileText,
  MapPin,
  Percent,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import type {
  ProjectEntity,
  CreateProjectInput,
  UpdateProjectInput,
} from '../hooks/use-project-api';

interface ProjectFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: ProjectEntity | null;
  onSave?: (data: CreateProjectInput | UpdateProjectInput, isEdit: boolean) => Promise<void>;
  onDelete?: (projectId: string) => Promise<void>;
}

const DEFAULT_PROJECT: CreateProjectInput = {
  name: '',
  description: null,
  location: null,
  notes: null,
  contractNumber: null,
  contractDate: null,
  startDate: null,
  endDate: null,
  contractorName: null,
  contractorId: null,
  clientName: null,
  clientId: null,
  contractValueCents: 0,
  globalDiscountPercent: 0,
  chapterDiscounts: {},
};

export function ProjectFormSheet({
  open,
  onOpenChange,
  project,
  onSave,
  onDelete,
}: ProjectFormSheetProps) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const isEditMode = !!project?.id;

  // Form state
  const [formData, setFormData] = useState<CreateProjectInput>(DEFAULT_PROJECT);
  const [status, setStatus] = useState<'active' | 'on_hold' | 'completed' | 'cancelled'>('active');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const deleteConfirmRef = useRef<HTMLDivElement>(null);

  // Helper to select all text on focus
  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const target = e.target;
    if (target instanceof HTMLInputElement) {
      target.select();
      setTimeout(() => target.select(), 0);
    }
  };

  const handleInputMouseUp = (e: React.MouseEvent<HTMLInputElement>) => {
    e.preventDefault();
  };

  useEffect(() => {
    if (open) {
      if (project) {
        setFormData({
          name: project.name,
          description: project.description,
          location: project.location,
          notes: project.notes,
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
          chapterDiscounts: project.chapterDiscounts || {},
        });
        setStatus(project.status);
      } else {
        setFormData(DEFAULT_PROJECT);
        setStatus('active');
      }
      setShowDeleteConfirm(false);
      setError(null);
      setValidationErrors({});
    }
  }, [project, open]);

  const handleClose = () => {
    setShowDeleteConfirm(false);
    onOpenChange(false);
  };

  const handleShowDeleteConfirm = () => {
    setShowDeleteConfirm(true);
    setTimeout(() => {
      deleteConfirmRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name || formData.name.trim().length < 3) {
      errors.name = t('projects.validation.nameMinLength');
    }

    if (
      formData.globalDiscountPercent !== undefined &&
      (formData.globalDiscountPercent < 0 || formData.globalDiscountPercent > 100)
    ) {
      errors.globalDiscount = t('projects.validation.invalidDiscount');
    }

    if (formData.startDate && formData.endDate) {
      if (new Date(formData.endDate) < new Date(formData.startDate)) {
        errors.endDate = t('projects.validation.endDateBeforeStart');
      }
    }

    if (formData.contractValueCents !== undefined && formData.contractValueCents < 0) {
      errors.contractValue = t('projects.validation.contractValuePositive');
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (onSave) {
        const apiData: CreateProjectInput | UpdateProjectInput = {
          ...formData,
          contractDate: formData.contractDate || null,
          startDate: formData.startDate || null,
          endDate: formData.endDate || null,
        };

        // Add status for edit mode
        if (isEditMode) {
          (apiData as UpdateProjectInput).status = status;
        }

        await onSave(apiData, isEditMode);
      }
      handleClose();
    } catch (err: unknown) {
      const errorMessage = (err as Error).message || t('projects.toast.createError');
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!project?.id || !onDelete) return;
    setIsSubmitting(true);

    try {
      await onDelete(project.id);
      handleClose();
    } catch (err) {
      setError((err as Error).message || t('projects.toast.deleteError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateField = <K extends keyof CreateProjectInput>(
    field: K,
    value: CreateProjectInput[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear validation error when field is updated
    if (validationErrors[field]) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isRTL ? 'left' : 'right'}
        className="w-full sm:max-w-2xl p-0 flex flex-col"
        hideCloseButton
      >
        {/* Header - Emerald gradient for projects */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex-1" />
            <div className="text-center">
              <h2 className="text-xl font-bold">
                {isEditMode ? t('projects.edit') : t('projects.create')}
              </h2>
              <p className="text-emerald-100 text-sm mt-0.5">
                {isEditMode
                  ? t('projects.form.editSubtitle', 'Update project details')
                  : t('projects.form.createSubtitle', 'Add a new project')}
              </p>
            </div>
            <div className="flex-1 flex justify-end">
              <button
                onClick={handleClose}
                className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-8">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {error}
              </div>
            )}

            {/* Section 1: Basic Information */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-sm font-bold">
                  1
                </div>
                <h3 className="font-semibold text-slate-900">{t('projects.form.basicInfo')}</h3>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('projects.form.name')} *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    required
                    placeholder={t('projects.form.namePlaceholder')}
                    className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm ${
                      validationErrors.name ? 'border-red-300' : 'border-slate-300'
                    }`}
                  />
                  {validationErrors.name && (
                    <p className="text-xs text-red-500 mt-1">{validationErrors.name}</p>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('projects.form.description')}
                  </label>
                  <textarea
                    value={formData.description || ''}
                    onChange={(e) => updateField('description', e.target.value || null)}
                    rows={3}
                    placeholder={t('projects.form.descriptionPlaceholder')}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm resize-none"
                  />
                </div>

                {/* Location */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    <MapPin className="h-4 w-4 inline me-1" />
                    {t('projects.form.location')}
                  </label>
                  <input
                    type="text"
                    value={formData.location || ''}
                    onChange={(e) => updateField('location', e.target.value || null)}
                    placeholder={t('projects.form.locationPlaceholder')}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('projects.form.notes')}
                  </label>
                  <textarea
                    value={formData.notes || ''}
                    onChange={(e) => updateField('notes', e.target.value || null)}
                    rows={2}
                    placeholder={t('projects.form.notesPlaceholder')}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm resize-none"
                  />
                </div>
              </div>
            </section>

            {/* Section 2: Contract Details */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-sm font-bold">
                  2
                </div>
                <h3 className="font-semibold text-slate-900">
                  <FileText className="h-4 w-4 inline me-1" />
                  {t('projects.form.contractDetails')}
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Contract Number */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('projects.form.contractNumber')}
                  </label>
                  <input
                    type="text"
                    value={formData.contractNumber || ''}
                    onChange={(e) => updateField('contractNumber', e.target.value || null)}
                    placeholder={t('projects.form.contractNumberPlaceholder')}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                  />
                </div>

                {/* Contract Date */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    <Calendar className="h-4 w-4 inline me-1" />
                    {t('projects.form.contractDate')}
                  </label>
                  <input
                    type="date"
                    value={formData.contractDate || ''}
                    onChange={(e) => updateField('contractDate', e.target.value || null)}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                  />
                </div>

                {/* Start Date */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    <Calendar className="h-4 w-4 inline me-1" />
                    {t('projects.form.startDate')}
                  </label>
                  <input
                    type="date"
                    value={formData.startDate || ''}
                    onChange={(e) => updateField('startDate', e.target.value || null)}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                  />
                </div>

                {/* End Date */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    <Calendar className="h-4 w-4 inline me-1" />
                    {t('projects.form.endDate')}
                  </label>
                  <input
                    type="date"
                    value={formData.endDate || ''}
                    onChange={(e) => updateField('endDate', e.target.value || null)}
                    className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm ${
                      validationErrors.endDate ? 'border-red-300' : 'border-slate-300'
                    }`}
                  />
                  {validationErrors.endDate && (
                    <p className="text-xs text-red-500 mt-1">{validationErrors.endDate}</p>
                  )}
                </div>
              </div>
            </section>

            {/* Section 3: Contract Parties */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-sm font-bold">
                  3
                </div>
                <h3 className="font-semibold text-slate-900">{t('projects.form.parties')}</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Contractor Name */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    <Building2 className="h-4 w-4 inline me-1" />
                    {t('projects.form.contractorName')}
                  </label>
                  <input
                    type="text"
                    value={formData.contractorName || ''}
                    onChange={(e) => updateField('contractorName', e.target.value || null)}
                    placeholder={t('projects.form.contractorNamePlaceholder')}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                  />
                </div>

                {/* Contractor ID */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('projects.form.contractorId')}
                  </label>
                  <input
                    type="text"
                    value={formData.contractorId || ''}
                    onChange={(e) => updateField('contractorId', e.target.value || null)}
                    placeholder={t('projects.form.contractorIdPlaceholder')}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                  />
                </div>

                {/* Client Name */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    <User className="h-4 w-4 inline me-1" />
                    {t('projects.form.clientName')}
                  </label>
                  <input
                    type="text"
                    value={formData.clientName || ''}
                    onChange={(e) => updateField('clientName', e.target.value || null)}
                    placeholder={t('projects.form.clientNamePlaceholder')}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                  />
                </div>

                {/* Client ID */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('projects.form.clientId')}
                  </label>
                  <input
                    type="text"
                    value={formData.clientId || ''}
                    onChange={(e) => updateField('clientId', e.target.value || null)}
                    placeholder={t('projects.form.clientIdPlaceholder')}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                  />
                </div>
              </div>
            </section>

            {/* Section 4: Financial Details */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-sm font-bold">
                  4
                </div>
                <h3 className="font-semibold text-slate-900">{t('projects.form.financials')}</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Contract Value */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('projects.form.contractValue')}
                  </label>
                  <div className="relative">
                    <span className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400">
                      ₪
                    </span>
                    <input
                      type="number"
                      value={(formData.contractValueCents || 0) / 100}
                      onChange={(e) =>
                        updateField(
                          'contractValueCents',
                          Math.round((parseFloat(e.target.value) || 0) * 100)
                        )
                      }
                      onFocus={handleInputFocus}
                      onMouseUp={handleInputMouseUp}
                      min={0}
                      step="0.01"
                      placeholder={t('projects.form.contractValuePlaceholder')}
                      className={`w-full ps-8 pe-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm ${
                        validationErrors.contractValue ? 'border-red-300' : 'border-slate-300'
                      }`}
                    />
                  </div>
                  {validationErrors.contractValue && (
                    <p className="text-xs text-red-500 mt-1">{validationErrors.contractValue}</p>
                  )}
                </div>

                {/* Global Discount */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    <Percent className="h-4 w-4 inline me-1" />
                    {t('projects.form.globalDiscount')}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={formData.globalDiscountPercent || 0}
                      onChange={(e) =>
                        updateField('globalDiscountPercent', parseFloat(e.target.value) || 0)
                      }
                      onFocus={handleInputFocus}
                      onMouseUp={handleInputMouseUp}
                      min={0}
                      max={100}
                      step="0.01"
                      placeholder={t('projects.form.globalDiscountPlaceholder')}
                      className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm ${
                        validationErrors.globalDiscount ? 'border-red-300' : 'border-slate-300'
                      }`}
                    />
                    <Percent className="absolute end-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  </div>
                  {validationErrors.globalDiscount && (
                    <p className="text-xs text-red-500 mt-1">{validationErrors.globalDiscount}</p>
                  )}
                </div>
              </div>
            </section>

            {/* Section 5: Status (Edit mode only) */}
            {isEditMode && (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-sm font-bold">
                    5
                  </div>
                  <h3 className="font-semibold text-slate-900">
                    {t('projects.form.statusSection')}
                  </h3>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('projects.form.changeStatus')}
                  </label>
                  <select
                    value={status}
                    onChange={(e) =>
                      setStatus(e.target.value as 'active' | 'on_hold' | 'completed' | 'cancelled')
                    }
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm bg-white"
                  >
                    <option value="active">{t('projects.status.active')}</option>
                    <option value="on_hold">{t('projects.status.on_hold')}</option>
                    <option value="completed">{t('projects.status.completed')}</option>
                    <option value="cancelled">{t('projects.status.cancelled')}</option>
                  </select>
                  <p className="text-xs text-slate-500 mt-1">{t('projects.form.statusHelp')}</p>
                </div>
              </section>
            )}

            {/* Delete confirmation */}
            {isEditMode && showDeleteConfirm && (
              <div
                ref={deleteConfirmRef}
                className="bg-red-50 border border-red-200 rounded-lg p-4"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-red-700 font-medium">
                      {t('projects.deleteConfirm')}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowDeleteConfirm(false)}
                      >
                        {t('common.cancel')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleDelete}
                        disabled={isSubmitting}
                        className="bg-red-500 hover:bg-red-600"
                      >
                        {t('common.delete')}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex justify-between">
            {isEditMode && !showDeleteConfirm && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleShowDeleteConfirm}
                className="text-red-500 hover:text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4 me-2" />
                {t('projects.delete')}
              </Button>
            )}
            {!isEditMode && <div />}
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={handleClose}>
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !formData.name}
                className="bg-emerald-500 hover:bg-emerald-600"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin me-2" />
                    {t('projects.actions.saving')}
                  </>
                ) : isEditMode ? (
                  t('projects.actions.save')
                ) : (
                  t('projects.create')
                )}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export default ProjectFormSheet;
