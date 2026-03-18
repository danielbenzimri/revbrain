import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Loader2, Check, X, Upload, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useAllPlans, useOnboardTenant } from '../hooks';
import type { Plan } from '@revbrain/contract';

interface OnboardTenantDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OnboardTenantDrawer({ open, onOpenChange }: OnboardTenantDrawerProps) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';

  // React Query hooks - plans cached for 5 minutes (shared with PricingPlansPage)
  const { data: plans = [], isLoading: isLoadingPlans } = useAllPlans();
  const onboardMutation = useOnboardTenant();

  // Form state - Company Details
  const [orgName, setOrgName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');

  // Form state - Plan (track if we've auto-selected)
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [hasAutoSelected, setHasAutoSelected] = useState(false);

  // Form state - Admin
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const adminRoleKey = 'admin.onboard.orgOwner';

  // Auto-select default plan when plans load (React-recommended pattern)
  if (plans.length > 0 && !selectedPlanId && !hasAutoSelected) {
    const defaultPlan = plans.find((p) => p.isPublic) || plans[0];
    if (defaultPlan) {
      setHasAutoSelected(true);
      setSelectedPlanId(defaultPlan.id!);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const selectedPlan = plans.find((p) => p.id === selectedPlanId);

      await onboardMutation.mutateAsync({
        organization: {
          name: orgName,
          seatLimit: selectedPlan?.limits.maxUsers || 5,
          planId: selectedPlanId,
        },
        admin: {
          email: adminEmail,
          fullName: adminName,
          role: 'org_owner',
        },
      });

      setSuccess(true);
    } catch (err: unknown) {
      console.error('[Onboard] Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
    }
  };

  const resetForm = () => {
    setOrgName('');
    setPhone('');
    setAddress('');
    setDescription('');
    // Don't reset plan selection to avoid flashing
    setAdminEmail('');
    setAdminName('');
    setSuccess(false);
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const formatPrice = (plan: Plan) => {
    const price = `$${plan.price}`;
    if (plan.interval === 'month') return price + '/mo';
    if (plan.interval === 'year') return price + '/yr';
    return price;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isRTL ? 'left' : 'right'}
        className="w-full sm:max-w-2xl p-0 flex flex-col"
        hideCloseButton
      >
        {/* Modern Header */}
        <div className="bg-gradient-to-r from-violet-500 to-teal-500 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex-1" />
            <div className="text-center">
              <h2 className="text-xl font-bold">{t('admin.onboard.title')}</h2>
              <p className="text-violet-100 text-sm mt-0.5">{t('admin.onboard.subtitle')}</p>
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

        {success ? (
          // Success State
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="h-20 w-20 bg-violet-100 rounded-full flex items-center justify-center mb-6">
              <Check className="h-10 w-10 text-violet-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              {t('admin.onboard.successTitle')}
            </h2>
            <p className="text-slate-600 mb-8 max-w-md">
              {t('admin.onboard.successMessage', { orgName, email: adminEmail })}
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={resetForm}>
                {t('admin.onboard.onboardAnother')}
              </Button>
              <Button onClick={handleClose} className="bg-violet-500 hover:bg-violet-600">
                {t('admin.onboard.close')}
              </Button>
            </div>
          </div>
        ) : (
          // Form
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-8">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* Section 1: Company Details */}
              <section className="space-y-5">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-sm font-bold">
                    1
                  </div>
                  <h3 className="font-semibold text-slate-900">{t('admin.onboard.step1')}</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Org Name */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      {t('admin.onboard.orgName')} *
                    </label>
                    <input
                      type="text"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder={t('admin.onboard.orgNamePlaceholder')}
                      required
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none text-sm"
                    />
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      {t('admin.onboard.phone')}
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder={t('admin.onboard.phonePlaceholder')}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none text-sm"
                    />
                  </div>

                  {/* Address */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      {t('admin.onboard.address')}
                    </label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder={t('admin.onboard.addressPlaceholder')}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none text-sm"
                    />
                  </div>

                  {/* Description */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      {t('admin.onboard.description')}
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={t('admin.onboard.descriptionPlaceholder')}
                      rows={2}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none text-sm resize-none"
                    />
                  </div>

                  {/* Logo Upload Placeholder */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      {t('admin.onboard.logo')}
                    </label>
                    <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 flex items-center justify-center gap-3 text-slate-400 hover:border-slate-300 transition-colors cursor-pointer">
                      <Upload className="h-5 w-5" />
                      <span className="text-sm">{t('admin.onboard.logoHint')}</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* Section 2: Select Plan */}
              <section className="space-y-5">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-sm font-bold">
                    2
                  </div>
                  <h3 className="font-semibold text-slate-900">{t('admin.onboard.step2')}</h3>
                </div>

                <p className="text-sm text-slate-500">{t('admin.onboard.planHint')}</p>

                {isLoadingPlans ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {plans.map((plan) => (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setSelectedPlanId(plan.id!)}
                        className={`relative p-4 border-2 rounded-xl text-center transition-all ${
                          selectedPlanId === plan.id
                            ? 'border-violet-500 bg-violet-50 ring-1 ring-violet-500'
                            : plan.isPublic
                              ? 'border-purple-200 hover:border-purple-300'
                              : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {plan.isPublic && (
                          <div className="absolute -top-2.5 inset-x-0 flex justify-center">
                            <span className="bg-purple-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Sparkles className="h-3 w-3" />
                              {t('admin.pricing.popular')}
                            </span>
                          </div>
                        )}
                        <p className="font-bold text-slate-900 text-sm truncate">{plan.name}</p>
                        <p className="text-lg font-bold text-slate-900 mt-1">{formatPrice(plan)}</p>
                        {selectedPlanId === plan.id && (
                          <div className="absolute top-2 end-2">
                            <div className="h-5 w-5 bg-violet-500 rounded-full flex items-center justify-center">
                              <Check className="h-3 w-3 text-white" />
                            </div>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* Section 3: First Admin */}
              <section className="space-y-5">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-sm font-bold">
                    3
                  </div>
                  <h3 className="font-semibold text-slate-900">{t('admin.onboard.step3')}</h3>
                </div>

                <div className="bg-slate-50 p-3 rounded-lg text-xs text-slate-600 flex items-start gap-2">
                  <User className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                  {t('admin.onboard.adminNote', { role: t(adminRoleKey) })}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      {t('admin.onboard.adminEmail')} *
                    </label>
                    <input
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder={t('admin.onboard.adminEmailPlaceholder')}
                      required
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      {t('admin.onboard.adminName')} *
                    </label>
                    <input
                      type="text"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      placeholder={t('admin.onboard.adminNamePlaceholder')}
                      required
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none text-sm"
                    />
                  </div>
                </div>
              </section>
            </div>

            {/* Sticky Footer */}
            <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex gap-3">
              <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
                {t('admin.onboard.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={
                  onboardMutation.isPending ||
                  !orgName ||
                  !adminEmail ||
                  !adminName ||
                  !selectedPlanId
                }
                className="flex-1 bg-violet-500 hover:bg-violet-600"
              >
                {onboardMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin me-2" />
                    {t('admin.onboard.creating')}
                  </>
                ) : (
                  t('admin.onboard.create')
                )}
              </Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
