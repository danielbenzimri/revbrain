import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  X,
  Trash2,
  AlertTriangle,
  Percent,
  DollarSign,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { usePlans } from '../hooks';
import type { Coupon, CouponCreateInput, CouponUpdateInput } from '../hooks';

interface CouponEditorDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coupon?: Coupon | null;
  onSave?: (data: CouponCreateInput | CouponUpdateInput, isEdit: boolean) => Promise<void>;
  onDelete?: (couponId: string) => Promise<void>;
  onSync?: (couponId: string) => Promise<void>;
}

const DEFAULT_COUPON: CouponCreateInput = {
  code: '',
  name: '',
  description: '',
  discountType: 'percent',
  discountValue: 10,
  currency: 'USD',
  maxUses: null,
  maxUsesPerUser: 1,
  validFrom: new Date().toISOString().split('T')[0],
  validUntil: null,
  applicablePlanIds: [],
  minimumAmountCents: 0,
  duration: 'once',
  durationInMonths: null,
  isActive: true,
};

export function CouponEditorDrawer({
  open,
  onOpenChange,
  coupon,
  onSave,
  onDelete,
  onSync,
}: CouponEditorDrawerProps) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const isEditMode = !!coupon?.id;

  // Fetch plans for restrictions
  const { data: plans = [] } = usePlans();

  // Form state
  const [formData, setFormData] = useState<CouponCreateInput>(DEFAULT_COUPON);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteConfirmRef = useRef<HTMLDivElement>(null);

  // Helper to select all text on focus (improves automation compatibility)
  // Uses setTimeout to ensure selection happens after all event handlers
  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    const target = e.target;
    // Immediate select
    target.select();
    // Delayed select as fallback (some browsers/automation tools clear selection)
    setTimeout(() => {
      target.select();
    }, 0);
  };

  // Prevent mouseup from clearing selection
  const handleInputMouseUp = (e: React.MouseEvent<HTMLInputElement>) => {
    e.preventDefault();
  };

  useEffect(() => {
    if (open) {
      if (coupon) {
        setFormData({
          code: coupon.code,
          name: coupon.name,
          description: coupon.description || '',
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          currency: coupon.currency,
          maxUses: coupon.maxUses,
          maxUsesPerUser: coupon.maxUsesPerUser,
          validFrom: coupon.validFrom?.split('T')[0] || '',
          validUntil: coupon.validUntil?.split('T')[0] || null,
          applicablePlanIds: coupon.applicablePlanIds || [],
          minimumAmountCents: coupon.minimumAmountCents,
          duration: coupon.duration,
          durationInMonths: coupon.durationInMonths,
          isActive: coupon.isActive,
        });
      } else {
        setFormData(DEFAULT_COUPON);
      }
      setShowDeleteConfirm(false);
      setError(null);
    }
  }, [coupon, open]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (onSave) {
        const apiData = {
          ...formData,
          validFrom: formData.validFrom ? new Date(formData.validFrom).toISOString() : undefined,
          validUntil: formData.validUntil ? new Date(formData.validUntil).toISOString() : null,
        };
        await onSave(apiData, isEditMode);
      }
      handleClose();
    } catch (err: unknown) {
      const errorMessage =
        (err as Error).message || t('admin.coupons.editor.saveError', 'Failed to save coupon');
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!coupon?.id || !onDelete) return;
    setIsSubmitting(true);

    try {
      await onDelete(coupon.id);
      handleClose();
    } catch (err) {
      setError((err as Error).message || 'Failed to delete coupon');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSync = async () => {
    if (!coupon?.id || !onSync) return;
    setIsSyncing(true);

    try {
      await onSync(coupon.id);
    } catch (err) {
      setError((err as Error).message || 'Failed to sync coupon');
    } finally {
      setIsSyncing(false);
    }
  };

  const togglePlan = (planId: string) => {
    const current = formData.applicablePlanIds || [];
    const newPlanIds = current.includes(planId)
      ? current.filter((id) => id !== planId)
      : [...current, planId];
    setFormData((prev) => ({ ...prev, applicablePlanIds: newPlanIds }));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isRTL ? 'left' : 'right'}
        className="w-full sm:max-w-2xl p-0 flex flex-col"
        hideCloseButton
      >
        {/* Header - Amber gradient for coupons */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex-1" />
            <div className="text-center">
              <h2 className="text-xl font-bold">
                {isEditMode
                  ? t('admin.coupons.editor.editTitle', 'Edit Coupon')
                  : t('admin.coupons.editor.createTitle', 'Create Coupon')}
              </h2>
              <p className="text-amber-100 text-sm mt-0.5">
                {isEditMode
                  ? t('admin.coupons.editor.editSubtitle', 'Update coupon details')
                  : t('admin.coupons.editor.createSubtitle', 'Add a new discount code')}
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

            {/* Stripe sync status for edit mode */}
            {isEditMode && coupon && (
              <div
                className={`flex items-center justify-between p-3 rounded-lg ${
                  coupon.stripeCouponId
                    ? 'bg-violet-50 border border-violet-200'
                    : 'bg-yellow-50 border border-yellow-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {coupon.stripeCouponId ? (
                    <>
                      <div className="h-2 w-2 rounded-full bg-violet-500" />
                      <span className="text-sm text-violet-700">
                        {t('admin.coupons.editor.syncedToStripe', 'Synced to Stripe')}
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="h-2 w-2 rounded-full bg-yellow-500" />
                      <span className="text-sm text-yellow-700">
                        {t('admin.coupons.editor.notSynced', 'Not synced to Stripe')}
                      </span>
                    </>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSync}
                  disabled={isSyncing}
                  className="text-slate-600"
                >
                  {isSyncing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  <span className="ms-1">{t('admin.coupons.editor.sync', 'Sync')}</span>
                </Button>
              </div>
            )}

            {/* Section 1: Basic Information */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-sm font-bold">
                  1
                </div>
                <h3 className="font-semibold text-slate-900">
                  {t('admin.coupons.editor.basicInfo', 'Basic Information')}
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Code */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('admin.coupons.editor.code', 'Coupon Code')} *
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))
                    }
                    required
                    disabled={isEditMode}
                    placeholder="SUMMER2024"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm uppercase disabled:bg-slate-100"
                  />
                  {isEditMode && (
                    <p className="text-xs text-slate-500 mt-1">
                      {t(
                        'admin.coupons.editor.codeReadonly',
                        'Code cannot be changed after creation'
                      )}
                    </p>
                  )}
                </div>

                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('admin.coupons.editor.name', 'Display Name')} *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    required
                    placeholder={t('admin.coupons.editor.namePlaceholder', 'Summer Sale 2024')}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
                  />
                </div>

                {/* Description */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('admin.coupons.editor.description', 'Description')}
                  </label>
                  <textarea
                    value={formData.description || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, description: e.target.value }))
                    }
                    rows={2}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm resize-none"
                  />
                </div>

                {/* Active toggle */}
                <div className="md:col-span-2">
                  <label className="flex items-center gap-3 cursor-pointer p-3 border rounded-lg hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, isActive: e.target.checked }))
                      }
                      className="w-5 h-5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    />
                    <div>
                      <span className="font-medium text-slate-700">
                        {t('admin.coupons.editor.isActive', 'Active')}
                      </span>
                      <p className="text-xs text-slate-500">
                        {t('admin.coupons.editor.isActiveHint', 'Coupon can be used at checkout')}
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </section>

            {/* Section 2: Discount Configuration */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-sm font-bold">
                  2
                </div>
                <h3 className="font-semibold text-slate-900">
                  {t('admin.coupons.editor.discountConfig', 'Discount Configuration')}
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Discount Type */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('admin.coupons.editor.discountType', 'Discount Type')}
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        !isEditMode && setFormData((prev) => ({ ...prev, discountType: 'percent' }))
                      }
                      disabled={isEditMode}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded shadow-sm transition-colors disabled:opacity-60 ${
                        formData.discountType === 'percent'
                          ? 'border-amber-500 bg-amber-50 text-amber-700'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <Percent className="h-4 w-4" />
                      {t('admin.coupons.editor.percent', 'Percentage')}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        !isEditMode && setFormData((prev) => ({ ...prev, discountType: 'fixed' }))
                      }
                      disabled={isEditMode}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded shadow-sm transition-colors disabled:opacity-60 ${
                        formData.discountType === 'fixed'
                          ? 'border-amber-500 bg-amber-50 text-amber-700'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <DollarSign className="h-4 w-4" />
                      {t('admin.coupons.editor.fixed', 'Fixed Amount')}
                    </button>
                  </div>
                </div>

                {/* Discount Value */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('admin.coupons.editor.discountValue', 'Discount Value')} *
                  </label>
                  <div className="relative">
                    {formData.discountType === 'fixed' && (
                      <span className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400">
                        $
                      </span>
                    )}
                    <input
                      type="number"
                      value={formData.discountValue}
                      onChange={(e) =>
                        !isEditMode &&
                        setFormData((prev) => ({
                          ...prev,
                          discountValue: parseInt(e.target.value) || 0,
                        }))
                      }
                      onFocus={handleInputFocus}
                      onMouseUp={handleInputMouseUp}
                      required
                      disabled={isEditMode}
                      min={1}
                      max={formData.discountType === 'percent' ? 100 : undefined}
                      className={`w-full py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm disabled:bg-slate-100 ${
                        formData.discountType === 'fixed' ? 'ps-7 pe-3' : 'px-3'
                      }`}
                    />
                    {formData.discountType === 'percent' && (
                      <Percent className="absolute end-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    )}
                  </div>
                </div>

                {/* Duration */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('admin.coupons.editor.duration', 'Duration')}
                  </label>
                  <select
                    value={formData.duration}
                    onChange={(e) =>
                      !isEditMode &&
                      setFormData((prev) => ({
                        ...prev,
                        duration: e.target.value as 'once' | 'forever' | 'repeating',
                      }))
                    }
                    disabled={isEditMode}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm bg-white disabled:bg-slate-100"
                  >
                    <option value="once">{t('admin.coupons.editor.durationOnce', 'Once')}</option>
                    <option value="forever">
                      {t('admin.coupons.editor.durationForever', 'Forever')}
                    </option>
                    <option value="repeating">
                      {t('admin.coupons.editor.durationRepeating', 'Multiple months')}
                    </option>
                  </select>
                </div>

                {/* Duration in months (only for repeating) */}
                {formData.duration === 'repeating' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      {t('admin.coupons.editor.durationMonths', 'Number of Months')}
                    </label>
                    <input
                      type="number"
                      value={formData.durationInMonths || ''}
                      onChange={(e) =>
                        !isEditMode &&
                        setFormData((prev) => ({
                          ...prev,
                          durationInMonths: parseInt(e.target.value) || null,
                        }))
                      }
                      onFocus={handleInputFocus}
                      onMouseUp={handleInputMouseUp}
                      disabled={isEditMode}
                      min={1}
                      max={36}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm disabled:bg-slate-100"
                    />
                  </div>
                )}
              </div>
            </section>

            {/* Section 3: Limits & Restrictions */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-sm font-bold">
                  3
                </div>
                <h3 className="font-semibold text-slate-900">
                  {t('admin.coupons.editor.limits', 'Limits & Restrictions')}
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Max uses */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('admin.coupons.editor.maxUses', 'Max Total Uses')}
                  </label>
                  <input
                    type="number"
                    value={formData.maxUses ?? ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        maxUses: e.target.value ? parseInt(e.target.value) : null,
                      }))
                    }
                    onFocus={handleInputFocus}
                    onMouseUp={handleInputMouseUp}
                    min={1}
                    placeholder={t('admin.coupons.editor.unlimited', 'Unlimited')}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
                  />
                </div>

                {/* Max uses per user */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('admin.coupons.editor.maxUsesPerUser', 'Max Uses Per Customer')}
                  </label>
                  <input
                    type="number"
                    value={formData.maxUsesPerUser ?? ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        maxUsesPerUser: e.target.value ? parseInt(e.target.value) : null,
                      }))
                    }
                    onFocus={handleInputFocus}
                    onMouseUp={handleInputMouseUp}
                    min={1}
                    placeholder={t('admin.coupons.editor.unlimited', 'Unlimited')}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
                  />
                </div>

                {/* Valid from */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    <Calendar className="h-4 w-4 inline me-1" />
                    {t('admin.coupons.editor.validFrom', 'Valid From')}
                  </label>
                  <input
                    type="date"
                    value={formData.validFrom || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, validFrom: e.target.value }))
                    }
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
                  />
                </div>

                {/* Valid until */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    <Calendar className="h-4 w-4 inline me-1" />
                    {t('admin.coupons.editor.validUntil', 'Valid Until')}
                  </label>
                  <input
                    type="date"
                    value={formData.validUntil || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, validUntil: e.target.value || null }))
                    }
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    {t('admin.coupons.editor.validUntilHint', 'Leave empty for no expiry')}
                  </p>
                </div>

                {/* Minimum amount */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('admin.coupons.editor.minimumAmount', 'Minimum Purchase')}
                  </label>
                  <div className="relative">
                    <span className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400">
                      $
                    </span>
                    <input
                      type="number"
                      value={(formData.minimumAmountCents || 0) / 100}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          minimumAmountCents: Math.round((parseFloat(e.target.value) || 0) * 100),
                        }))
                      }
                      onFocus={handleInputFocus}
                      onMouseUp={handleInputMouseUp}
                      min={0}
                      step="0.01"
                      className="w-full ps-7 pe-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Section 4: Plan Restrictions */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-sm font-bold">
                  4
                </div>
                <h3 className="font-semibold text-slate-900">
                  {t('admin.coupons.editor.planRestrictions', 'Plan Restrictions')}
                </h3>
              </div>

              <p className="text-sm text-slate-500">
                {t(
                  'admin.coupons.editor.planRestrictionsHint',
                  'Select which plans this coupon applies to. Leave all unchecked for all plans.'
                )}
              </p>

              <div className="grid grid-cols-2 gap-2">
                {plans
                  .filter((plan): plan is typeof plan & { id: string } => !!plan.id)
                  .map((plan) => (
                    <label
                      key={plan.id}
                      className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-all ${
                        (formData.applicablePlanIds || []).includes(plan.id)
                          ? 'border-amber-500 bg-amber-50 text-amber-700'
                          : 'border-slate-200 hover:border-slate-300 text-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={(formData.applicablePlanIds || []).includes(plan.id)}
                        onChange={() => togglePlan(plan.id)}
                        className="sr-only"
                      />
                      <div
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                          (formData.applicablePlanIds || []).includes(plan.id)
                            ? 'border-amber-500 bg-amber-500'
                            : 'border-slate-300'
                        }`}
                      >
                        {(formData.applicablePlanIds || []).includes(plan.id) && (
                          <svg
                            className="w-2.5 h-2.5 text-white"
                            fill="currentColor"
                            viewBox="0 0 12 12"
                          >
                            <path d="M10.28 2.28L3.989 8.575 1.695 6.28A1 1 0 00.28 7.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 2.28z" />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm font-medium">{plan.name}</span>
                    </label>
                  ))}
              </div>
            </section>

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
                      {t(
                        'admin.coupons.editor.deleteConfirm',
                        'Are you sure you want to deactivate this coupon?'
                      )}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowDeleteConfirm(false)}
                      >
                        {t('common.cancel', 'Cancel')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleDelete}
                        disabled={isSubmitting}
                        className="bg-red-500 hover:bg-red-600"
                      >
                        {t('admin.coupons.editor.deactivate', 'Deactivate')}
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
                {t('admin.coupons.editor.deactivate', 'Deactivate')}
              </Button>
            )}
            {!isEditMode && <div />}
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={handleClose}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !formData.code || !formData.name}
                className="bg-amber-500 hover:bg-amber-600"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin me-2" />
                    {t('common.saving', 'Saving...')}
                  </>
                ) : isEditMode ? (
                  t('common.save', 'Save')
                ) : (
                  t('admin.coupons.editor.create', 'Create Coupon')
                )}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
