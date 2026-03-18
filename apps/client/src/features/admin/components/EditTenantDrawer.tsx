import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useAllPlans, useUpdateTenant, type TenantForEdit } from '../hooks';

interface EditTenantDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant?: TenantForEdit | null;
}

export function EditTenantDrawer({ open, onOpenChange, tenant }: EditTenantDrawerProps) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';

  // React Query hooks - plans cached for 5 minutes (shared with PricingPlansPage/OnboardDrawer)
  const { data: plans = [] } = useAllPlans();
  const updateMutation = useUpdateTenant();

  // Track which tenant ID we've synced form data from
  const [syncedFromId, setSyncedFromId] = useState<string | null>(null);

  // Form state - initialize from tenant prop
  const getInitialFormData = (): TenantForEdit => ({
    id: tenant?.id || '',
    name: tenant?.name || '',
    planId: tenant?.planId || null,
    seatLimit: tenant?.seatLimit || 5,
    isActive: tenant?.isActive ?? true,
  });

  const [formData, setFormData] = useState<TenantForEdit>(getInitialFormData);

  // Reset form when tenant changes (React-recommended pattern for syncing state with props)
  if (open && tenant && tenant.id !== syncedFromId) {
    setSyncedFromId(tenant.id);
    setFormData({ ...tenant });
  }

  // UI state
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant?.id) return;

    setError(null);

    try {
      const { name, planId, seatLimit, isActive } = formData;
      await updateMutation.mutateAsync({ id: tenant.id, name, planId, seatLimit, isActive });
      onOpenChange(false);
    } catch (err: unknown) {
      console.error('[EditTenant] Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isRTL ? 'left' : 'right'}
        className="w-full sm:max-w-md p-0 flex flex-col"
        hideCloseButton
      >
        {/* Header */}
        <div className="bg-slate-900 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex-1" />
            <div className="text-center">
              <h2 className="text-xl font-bold">{t('admin.tenants.editTitle', 'Edit Tenant')}</h2>
              <p className="text-slate-400 text-sm mt-0.5">{tenant?.name}</p>
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
          <div className="p-6 space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('admin.tenants.orgName', 'Organization Name')}
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('admin.tenants.plan', 'Subscription Plan')}
                </label>
                <select
                  value={formData.planId || ''}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, planId: e.target.value || null }))
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-white"
                >
                  <option value="">{t('admin.tenants.noPlan', 'No Plan')}</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (
                      {p.isPublic
                        ? t('admin.pricing.planVisibility.public')
                        : t('admin.pricing.planVisibility.custom')}
                      )
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('admin.tenants.seatLimit', 'Seat Limit')}
                </label>
                <input
                  type="number"
                  value={formData.seatLimit}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, seatLimit: parseInt(e.target.value) || 0 }))
                  }
                  min={1}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                />
              </div>

              <div className="pt-4 border-t">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, isActive: e.target.checked }))
                    }
                    className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <p className="font-medium text-slate-900">
                      {t('admin.tenants.active', 'Active Status')}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t(
                        'admin.tenants.activeHint',
                        'Uncheck to suspend access for this organization'
                      )}
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex gap-3">
            <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              type="submit"
              disabled={updateMutation.isPending}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin me-2" />
                  {t('common.saving', 'Saving...')}
                </>
              ) : (
                t('common.save', 'Save Changes')
              )}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
