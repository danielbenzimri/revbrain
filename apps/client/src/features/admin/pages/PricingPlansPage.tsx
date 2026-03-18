import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Plus, Pencil, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PlanEditorDrawer } from '../components/PlanEditorDrawer';
import type { Plan } from '@geometrix/contract';
import { usePlans, useCreatePlan, useUpdatePlan, useDeletePlan } from '../hooks';

export default function PricingPlansPage() {
  const { t } = useTranslation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

  // React Query hooks - data cached for 5 minutes
  const { data: plans = [], isLoading } = usePlans();
  const createMutation = useCreatePlan();
  const updateMutation = useUpdatePlan();
  const deleteMutation = useDeletePlan();

  const handleNewPlan = () => {
    setSelectedPlan(null);
    setDrawerOpen(true);
  };

  const handleEditPlan = (plan: Plan) => {
    setSelectedPlan(plan);
    setDrawerOpen(true);
  };

  const handleSavePlan = async (planData: Plan) => {
    if (planData.id) {
      // Update
      await updateMutation.mutateAsync(planData);
    } else {
      // Create
      await createMutation.mutateAsync(planData);
    }
  };

  const handleDeletePlan = async (planId: string) => {
    await deleteMutation.mutateAsync(planId);
  };

  const getPriceDisplay = (plan: Plan) => {
    const price = `$${(plan.price / 100).toFixed(2).replace(/\.00$/, '')}`;
    if (plan.interval === 'month') return price + '/mo';
    if (plan.interval === 'year') return price + '/yr';
    return price;
  };

  const getFeatures = (plan: Plan) => {
    const features: string[] = [];

    // Users
    if (plan.limits.maxUsers === 0) {
      features.push(t('admin.pricing.features.unlimitedUsers', 'Unlimited Users'));
    } else {
      features.push(`${t('admin.pricing.planEditor.maxUsers')}: ${plan.limits.maxUsers}`);
    }

    // Projects
    if (plan.limits.maxProjects === 0) {
      features.push(t('admin.pricing.planEditor.maxProjects') + ': ∞');
    } else {
      features.push(`${t('admin.pricing.planEditor.maxProjects')}: ${plan.limits.maxProjects}`);
    }

    // Storage
    if (plan.limits.storageGB === 0) {
      features.push(t('admin.pricing.planEditor.storageGB') + ': ∞');
    } else {
      features.push(`${t('admin.pricing.planEditor.storageGB')}: ${plan.limits.storageGB}`);
    }

    // AI
    if (plan.features.aiLevel !== 'none') {
      const level = plan.features.aiLevel.charAt(0).toUpperCase() + plan.features.aiLevel.slice(1);
      features.push(`${t('admin.pricing.aiPrefix')}: ${level}`);
    }

    // Module count
    features.push(`${plan.features.modules.length} ${t('admin.pricing.planEditor.workModules')}`);

    return features;
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('admin.pricing.title')}</h1>
          <p className="text-slate-500">{t('admin.pricing.subtitle')}</p>
        </div>
        <Button onClick={handleNewPlan} className="bg-emerald-500 hover:bg-emerald-600">
          <Plus className="h-4 w-4 me-2" />
          {t('admin.pricing.newPlan')}
        </Button>
      </div>

      {plans.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
          <p className="text-slate-500">{t('admin.pricing.noPlans')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative bg-white rounded shadow-sm p-6 flex flex-col ${
                plan.isPublic
                  ? 'border-emerald-500 ring-1 ring-emerald-500 shadow-md'
                  : 'border-slate-200'
              }`}
            >
              {plan.isPublic && (
                <span className="absolute top-0 end-0 -translate-y-1/2 translate-x-1/2 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                  {t('admin.pricing.planVisibility.public')}
                </span>
              )}

              <div className="mb-4">
                <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                <p className="text-sm text-slate-500 mt-1">{plan.description}</p>
              </div>

              <div className="mb-6">
                <span className="text-3xl font-bold text-slate-900">
                  {getPriceDisplay(plan).split('/')[0]}
                </span>
                {getPriceDisplay(plan).includes('/') && (
                  <span className="text-slate-500 text-sm">
                    /{getPriceDisplay(plan).split('/').slice(1).join('/')}
                  </span>
                )}
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {getFeatures(plan).map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-sm text-slate-600">
                    <Check className="h-4 w-4 text-emerald-500 relative top-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Button
                onClick={() => handleEditPlan(plan)}
                variant={plan.isPublic ? 'default' : 'outline'}
                className={plan.isPublic ? 'bg-emerald-500 hover:bg-emerald-600' : ''}
              >
                <Pencil className="h-4 w-4 me-2" />
                {t('admin.pricing.editPlan')}
              </Button>
            </div>
          ))}
        </div>
      )}

      <PlanEditorDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        plan={selectedPlan}
        onSave={handleSavePlan}
        onDelete={handleDeletePlan}
      />
    </div>
  );
}
