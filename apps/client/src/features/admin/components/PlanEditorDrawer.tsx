import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X, Trash2, AlertTriangle, Eye, EyeOff, Power, Percent } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import type { Plan } from '@geometrix/contract';

export const WORK_MODULES = [
  'earthworks',
  'concrete',
  'waterproofing',
  'electrical',
  'steel',
  'piles',
  'anchors',
  'landscaping',
  'gardening',
  'demolition',
  'paving',
  'traffic',
  'wetSystems',
  'reggie',
  'exceptions',
] as const;

export type WorkModule = (typeof WORK_MODULES)[number];

interface PlanEditorDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan?: Plan | null; // null = create mode, object = edit mode
  onSave?: (plan: Plan) => void;
  onDelete?: (planId: string) => void;
}

const DEFAULT_PLAN: Plan = {
  name: '',
  code: '', // Will be auto-generated from name on server
  description: '',
  price: 0,
  currency: 'USD',
  interval: 'month',
  yearlyDiscountPercent: 20, // Default 20% off for yearly
  isActive: true,
  isPublic: false,
  limits: {
    maxUsers: 0,
    maxProjects: 0,
    storageGB: 10,
  },
  features: {
    aiLevel: 'none',
    modules: [],
    customBranding: false,
    sso: false,
  },
};

export function PlanEditorDrawer({
  open,
  onOpenChange,
  plan,
  onSave,
  onDelete,
}: PlanEditorDrawerProps) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const isEditMode = !!plan?.id;

  // Form state
  const [formData, setFormData] = useState<Plan>(DEFAULT_PLAN);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ref for delete confirmation section to scroll into view
  const deleteConfirmRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      if (plan) {
        // Merge with DEFAULT_PLAN to ensure missing fields (like customBranding/sso) are present
        setFormData({
          ...DEFAULT_PLAN,
          ...plan,
          // Convert cents from API to dollars for UI
          price: plan.price / 100,
          description: plan.description || '', // Ensure it's never null
          limits: { ...DEFAULT_PLAN.limits, ...plan.limits },
          features: { ...DEFAULT_PLAN.features, ...plan.features },
        });
      } else {
        setFormData(DEFAULT_PLAN);
      }
      setShowDeleteConfirm(false);
    }
  }, [plan, open]);

  const handleClose = () => {
    setShowDeleteConfirm(false);
    onOpenChange(false);
  };

  const handleShowDeleteConfirm = () => {
    setShowDeleteConfirm(true);
    // Scroll to delete confirmation after state updates and renders
    setTimeout(() => {
      deleteConfirmRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); // Clear any previous errors
    setIsSubmitting(true);

    try {
      if (onSave) {
        // Convert dollars from UI back to cents for API (rounding to avoid float issues)
        const apiData: Plan = {
          ...formData,
          price: Math.round(formData.price * 100),
        };
        await onSave(apiData);
      }
      handleClose();
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errorMessage = (err as any).message || t('admin.pricing.planEditor.saveError');
      setError(errorMessage);
      console.error('Error saving plan:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!plan?.id || !onDelete) return;
    setIsSubmitting(true);

    try {
      await onDelete(plan.id);
      handleClose();
    } catch (err) {
      console.error('Error deleting plan:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleModule = (module: string) => {
    const currentModules = formData.features.modules;
    const newModules = currentModules.includes(module)
      ? currentModules.filter((m) => m !== module)
      : [...currentModules, module];

    setFormData((prev) => ({
      ...prev,
      features: {
        ...prev.features,
        modules: newModules,
      },
    }));
  };

  const selectAllModules = () => {
    setFormData((prev) => ({
      ...prev,
      features: { ...prev.features, modules: [...WORK_MODULES] },
    }));
  };

  const deselectAllModules = () => {
    setFormData((prev) => ({
      ...prev,
      features: { ...prev.features, modules: [] },
    }));
  };

  const updateLimit = (key: keyof Plan['limits'], value: number) => {
    setFormData((prev) => ({
      ...prev,
      limits: {
        ...prev.limits,
        [key]: value,
      },
    }));
  };

  const updateFeature = <K extends keyof Plan['features']>(key: K, value: Plan['features'][K]) => {
    setFormData((prev) => ({
      ...prev,
      features: {
        ...prev.features,
        [key]: value,
      },
    }));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isRTL ? 'left' : 'right'}
        className="w-full sm:max-w-2xl p-0 flex flex-col"
        hideCloseButton
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex-1" />
            <div className="text-center">
              <h2 className="text-xl font-bold">
                {isEditMode
                  ? t('admin.pricing.planEditor.editTitle')
                  : t('admin.pricing.planEditor.createTitle')}
              </h2>
              <p className="text-purple-200 text-sm mt-0.5">
                {isEditMode
                  ? t('admin.pricing.planEditor.editSubtitle')
                  : t('admin.pricing.planEditor.createSubtitle')}
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
                <div className="h-7 w-7 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-sm font-bold">
                  1
                </div>
                <h3 className="font-semibold text-slate-900">
                  {t('admin.pricing.planEditor.basicInfo')}
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Plan Name */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('admin.pricing.planEditor.planName')} *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    required
                    placeholder={t(
                      'admin.pricing.planEditor.planNamePlaceholder',
                      'e.g., Professional'
                    )}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm"
                  />
                </div>

                {/* Description */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('admin.pricing.planEditor.planDescription')}
                  </label>
                  <textarea
                    value={formData.description || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, description: e.target.value }))
                    }
                    rows={2}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm resize-none"
                  />
                </div>

                {/* Monthly Price */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('admin.pricing.planEditor.monthlyPrice', 'Monthly Price')}
                  </label>
                  <div className="relative">
                    <span className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400">
                      $
                    </span>
                    <input
                      type="number"
                      value={formData.price}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, price: parseFloat(e.target.value) || 0 }))
                      }
                      min={0}
                      className="w-full ps-7 pe-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm"
                    />
                    <span className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                      /{t('billing.perMonth')}
                    </span>
                  </div>
                </div>

                {/* Yearly Discount */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('admin.pricing.planEditor.yearlyDiscount', 'Yearly Discount')}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={formData.yearlyDiscountPercent ?? 0}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          yearlyDiscountPercent: Math.min(
                            100,
                            Math.max(0, parseInt(e.target.value) || 0)
                          ),
                        }))
                      }
                      min={0}
                      max={100}
                      className="w-full px-3 pe-10 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm"
                    />
                    <Percent className="absolute end-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  </div>
                  {formData.price > 0 && (formData.yearlyDiscountPercent ?? 0) > 0 && (
                    <p className="text-xs text-emerald-600 mt-1">
                      {t('admin.pricing.planEditor.yearlyPriceCalc', 'Yearly: ${{price}}/yr', {
                        price: Math.round(
                          formData.price * 12 * (1 - (formData.yearlyDiscountPercent ?? 0) / 100)
                        ),
                      })}
                    </p>
                  )}
                </div>

                {/* Visibility Toggles */}
                <div className="md:col-span-2 space-y-3 pt-2">
                  {/* isActive toggle */}
                  <label className="flex items-center gap-3 cursor-pointer p-3 border rounded-lg hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, isActive: e.target.checked }))
                      }
                      className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div className="flex items-center gap-2 flex-1">
                      <Power
                        className={`h-4 w-4 ${formData.isActive ? 'text-emerald-500' : 'text-slate-400'}`}
                      />
                      <div>
                        <span className="font-medium text-slate-700">
                          {t('admin.pricing.planEditor.isActive', 'Active')}
                        </span>
                        <p className="text-xs text-slate-500">
                          {t('admin.pricing.planEditor.isActiveHint', 'Plan can be subscribed to')}
                        </p>
                      </div>
                    </div>
                  </label>

                  {/* isPublic toggle */}
                  <label className="flex items-center gap-3 cursor-pointer p-3 border rounded-lg hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.isPublic}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, isPublic: e.target.checked }))
                      }
                      className="w-5 h-5 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                    />
                    <div className="flex items-center gap-2 flex-1">
                      {formData.isPublic ? (
                        <Eye className="h-4 w-4 text-purple-500" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-slate-400" />
                      )}
                      <div>
                        <span className="font-medium text-slate-700">
                          {t('admin.pricing.planEditor.isPublic', 'Public')}
                        </span>
                        <p className="text-xs text-slate-500">
                          {t(
                            'admin.pricing.planEditor.isPublicHint',
                            'Visible in upgrade modal and pricing page'
                          )}
                        </p>
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </section>

            {/* Section 2: Limits */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-sm font-bold">
                  2
                </div>
                <h3 className="font-semibold text-slate-900">
                  {t('admin.pricing.planEditor.limits')}
                </h3>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('admin.pricing.planEditor.maxUsers')}
                  </label>
                  <input
                    type="number"
                    value={formData.limits.maxUsers}
                    onChange={(e) => updateLimit('maxUsers', parseInt(e.target.value) || 0)}
                    min={0}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('admin.pricing.planEditor.maxProjects')}
                  </label>
                  <input
                    type="number"
                    value={formData.limits.maxProjects}
                    onChange={(e) => updateLimit('maxProjects', parseInt(e.target.value) || 0)}
                    min={0}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('admin.pricing.planEditor.storageGB')}
                  </label>
                  <input
                    type="number"
                    value={formData.limits.storageGB}
                    onChange={(e) => updateLimit('storageGB', parseInt(e.target.value) || 0)}
                    min={0}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('admin.pricing.planEditor.aiLevel')}
                  </label>
                  <select
                    value={formData.features.aiLevel}
                    onChange={(e) =>
                      updateFeature(
                        'aiLevel',
                        e.target.value as 'none' | 'basic' | 'advanced' | 'full'
                      )
                    }
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm bg-white"
                  >
                    <option value="none">{t('admin.pricing.planEditor.aiNone')}</option>
                    <option value="basic">{t('admin.pricing.planEditor.aiBasic')}</option>
                    <option value="advanced">{t('admin.pricing.planEditor.aiAdvanced')}</option>
                    <option value="full">{t('admin.pricing.planEditor.aiFull')}</option>
                  </select>
                </div>

                <div className="flex items-center gap-6 mt-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.features.customBranding}
                      onChange={(e) => updateFeature('customBranding', e.target.checked)}
                      className="w-5 h-5 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm font-medium text-slate-700">
                      {t('admin.pricing.planEditor.customBranding', 'Custom Branding')}
                    </span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.features.sso}
                      onChange={(e) => updateFeature('sso', e.target.checked)}
                      className="w-5 h-5 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm font-medium text-slate-700">
                      {t('admin.pricing.planEditor.sso', 'SSO')}
                    </span>
                  </label>
                </div>
              </div>
            </section>

            {/* Section 3: Work Modules */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-sm font-bold">
                    3
                  </div>
                  <h3 className="font-semibold text-slate-900">
                    {t('admin.pricing.planEditor.workModules')}
                  </h3>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAllModules}
                    className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                  >
                    {t('admin.pricing.planEditor.selectAll')}
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={deselectAllModules}
                    className="text-xs text-slate-500 hover:text-slate-700 font-medium"
                  >
                    {t('admin.pricing.planEditor.deselectAll')}
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-500">
                {t('admin.pricing.planEditor.workModulesHint')}
              </p>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {WORK_MODULES.map((module) => (
                  <label
                    key={module}
                    className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-all ${
                      formData.features.modules.includes(module)
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-slate-200 hover:border-slate-300 text-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.features.modules.includes(module)}
                      onChange={() => toggleModule(module)}
                      className="sr-only"
                    />
                    <div
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                        formData.features.modules.includes(module)
                          ? 'border-purple-500 bg-purple-500'
                          : 'border-slate-300'
                      }`}
                    >
                      {formData.features.modules.includes(module) && (
                        <svg
                          className="w-2.5 h-2.5 text-white"
                          fill="currentColor"
                          viewBox="0 0 12 12"
                        >
                          <path d="M10.28 2.28L3.989 8.575 1.695 6.28A1 1 0 00.28 7.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 2.28z" />
                        </svg>
                      )}
                    </div>
                    <span className="text-sm font-medium">
                      {t(`admin.pricing.planEditor.modules.${module}`)}
                    </span>
                  </label>
                ))}
              </div>
            </section>

            {isEditMode && showDeleteConfirm && (
              <div
                ref={deleteConfirmRef}
                className="bg-red-50 border border-red-200 rounded-lg p-4"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-red-700 font-medium">
                      {t('admin.pricing.planEditor.deleteConfirm')}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowDeleteConfirm(false)}
                      >
                        {t('admin.pricing.planEditor.cancel')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleDelete}
                        disabled={isSubmitting}
                        className="bg-red-500 hover:bg-red-600"
                      >
                        {t('admin.pricing.planEditor.delete')}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex justify-between">
            {isEditMode && !showDeleteConfirm && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleShowDeleteConfirm}
                className="text-red-500 hover:text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4 me-2" />
                {t('admin.pricing.planEditor.delete')}
              </Button>
            )}
            {!isEditMode && <div />}
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={handleClose}>
                {t('admin.pricing.planEditor.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !formData.name}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin me-2" />
                    {t('admin.pricing.planEditor.saving')}
                  </>
                ) : isEditMode ? (
                  t('admin.pricing.planEditor.save')
                ) : (
                  t('admin.pricing.planEditor.create')
                )}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
