/**
 * PlanUpgradeModal Component
 *
 * Premium plan selection modal for upgrading, downgrading, or switching plans.
 * Features ultra-premium SaaS styling with clear visual hierarchy.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  Loader2,
  X,
  Sparkles,
  Crown,
  ArrowUp,
  ArrowDown,
  Shield,
  Zap,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePlans, useCheckout, type Plan } from '../hooks';
import { BillingIntervalToggle } from './BillingIntervalToggle';

interface PlanUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlanId?: string;
  currentPlanPrice?: number;
}

type PlanType = 'current' | 'upgrade' | 'downgrade';

export function PlanUpgradeModal({
  isOpen,
  onClose,
  currentPlanId,
  currentPlanPrice = 0,
}: PlanUpgradeModalProps) {
  const { t } = useTranslation();
  const [interval, setInterval] = useState<'month' | 'year'>('month');
  const [confirmDowngrade, setConfirmDowngrade] = useState<string | null>(null);
  const { data: plans = [], isLoading } = usePlans();
  const checkoutMutation = useCheckout();

  if (!isOpen) return null;

  // Find current plan from all plans
  const currentPlan = plans.find((p) => p.id === currentPlanId);
  const currentPrice = currentPlan?.price ?? currentPlanPrice;

  // Calculate price for a plan based on selected interval
  const getPlanPriceForInterval = (plan: Plan) => {
    if (interval === 'year') {
      // Yearly price = monthly * 12 * (1 - discount/100)
      const discount = plan.yearlyDiscountPercent ?? 0;
      return Math.round(plan.price * 12 * (1 - discount / 100));
    }
    return plan.price;
  };

  // All plans are monthly-based now, just show them all
  // Exclude Free plan in yearly view (Free doesn't have yearly option)
  // BUT always show the current plan so user knows where they are
  const filteredPlans = plans
    .filter((plan) => {
      // Always show current plan regardless of interval
      if (plan.id === currentPlanId) return true;
      // Exclude Free plan from yearly view
      if (interval === 'year' && plan.price === 0) return false;
      return true;
    })
    .sort((a, b) => a.price - b.price);

  // Get the best yearly savings from any plan that offers yearly discount
  const maxYearlyDiscount = plans.reduce(
    (max, p) => Math.max(max, p.yearlyDiscountPercent || 0),
    0
  );
  const savingsPercent = maxYearlyDiscount > 0 ? maxYearlyDiscount : null;

  // Determine plan type (current, upgrade, downgrade)
  const getPlanType = (plan: Plan): PlanType => {
    if (plan.id === currentPlanId) return 'current';
    // Compare monthly base prices for consistent ordering
    if (plan.price > currentPrice) return 'upgrade';
    return 'downgrade';
  };

  // Find the recommended plan (most popular - usually the middle-high tier)
  const recommendedPlanId =
    filteredPlans.length >= 2 ? filteredPlans[Math.ceil(filteredPlans.length / 2)]?.id : null;

  const handleSelectPlan = (plan: Plan) => {
    const planType = getPlanType(plan);

    if (planType === 'current') return;

    if (planType === 'downgrade' && confirmDowngrade !== plan.id) {
      setConfirmDowngrade(plan.id);
      return;
    }

    setConfirmDowngrade(null);
    checkoutMutation.mutate(plan.id);
  };

  const getPriceDisplay = (plan: Plan) => {
    if (interval === 'year') {
      // Calculate yearly price with discount
      const yearlyPrice = getPlanPriceForInterval(plan);
      const price = `$${(yearlyPrice / 100).toFixed(0)}`;
      // Monthly equivalent when paying yearly
      const monthlyEquivalent = `$${(yearlyPrice / 100 / 12).toFixed(0)}`;
      return { price, monthlyEquivalent, isYearly: true };
    }
    // Monthly price
    const price = `$${(plan.price / 100).toFixed(0)}`;
    return { price, monthlyEquivalent: null, isYearly: false };
  };

  const getFeatures = (plan: Plan): string[] => {
    const features: string[] = [];

    if (plan.limits) {
      if (plan.limits.maxUsers === 0) {
        features.push(t('billing.features.unlimitedUsers'));
      } else {
        features.push(t('billing.features.maxUsers', { count: plan.limits.maxUsers }));
      }

      if (plan.limits.maxProjects === 0) {
        features.push(t('billing.features.unlimitedProjects'));
      } else {
        features.push(t('billing.features.maxProjects', { count: plan.limits.maxProjects }));
      }

      if (plan.limits.storageGB > 0) {
        features.push(t('billing.features.storage', { gb: plan.limits.storageGB }));
      }
    }

    if (plan.features) {
      if (plan.features.aiLevel !== 'none') {
        features.push(t('billing.features.aiIncluded'));
      }
      if (plan.features.customBranding) {
        features.push(t('billing.features.customBranding'));
      }
      if (plan.features.sso) {
        features.push(t('billing.features.sso'));
      }
    }

    return features;
  };

  const getPlanIcon = (plan: Plan, planType: PlanType) => {
    if (planType === 'current') return <Shield className="h-5 w-5" />;
    if (plan.id === recommendedPlanId) return <Crown className="h-5 w-5" />;
    if (planType === 'upgrade') return <TrendingUp className="h-5 w-5" />;
    return <Zap className="h-5 w-5" />;
  };

  const getCardStyles = (plan: Plan, planType: PlanType) => {
    const isRecommended = plan.id === recommendedPlanId && planType !== 'current';
    const isConfirmingDowngrade = confirmDowngrade === plan.id;

    if (planType === 'current') {
      return {
        card: 'bg-gradient-to-br from-slate-50 to-slate-100 border-2 border-slate-300 ring-2 ring-slate-200',
        badge: 'bg-slate-700 text-white',
        icon: 'bg-slate-200 text-slate-600',
        button: 'bg-slate-300 text-slate-500 cursor-default',
        price: 'text-slate-600',
      };
    }

    if (isConfirmingDowngrade) {
      return {
        card: 'bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-400 shadow-lg shadow-amber-500/20',
        badge: 'bg-amber-500 text-white',
        icon: 'bg-amber-100 text-amber-600',
        button: 'bg-amber-500 hover:bg-amber-600 text-white',
        price: 'text-amber-700',
      };
    }

    if (isRecommended) {
      return {
        card: 'bg-gradient-to-br from-violet-50 via-white to-teal-50 border-2 border-violet-400 shadow-xl shadow-violet-500/20 scale-[1.02] z-10',
        badge: 'bg-gradient-to-r from-violet-500 to-teal-500 text-white',
        icon: 'bg-violet-100 text-violet-600',
        button:
          'bg-gradient-to-r from-violet-500 to-teal-500 hover:from-violet-600 hover:to-teal-600 text-white shadow-lg shadow-violet-500/30',
        price: 'text-violet-700',
      };
    }

    if (planType === 'upgrade') {
      return {
        card: 'bg-white border border-slate-200 hover:border-violet-300 hover:shadow-lg transition-all duration-300',
        badge: 'bg-violet-100 text-violet-700',
        icon: 'bg-violet-50 text-violet-500',
        button: 'bg-slate-900 hover:bg-slate-800 text-white',
        price: 'text-slate-900',
      };
    }

    // Downgrade
    return {
      card: 'bg-slate-50 border border-slate-200 hover:border-slate-300 opacity-90 hover:opacity-100 transition-all duration-300',
      badge: 'bg-slate-200 text-slate-600',
      icon: 'bg-slate-100 text-slate-500',
      button: 'bg-slate-600 hover:bg-slate-700 text-white',
      price: 'text-slate-700',
    };
  };

  const getButtonText = (plan: Plan, planType: PlanType) => {
    if (planType === 'current') return t('billing.plans.currentPlan');
    if (confirmDowngrade === plan.id) return t('billing.plans.confirmDowngrade');
    if (planType === 'downgrade') return t('billing.plans.downgrade');
    return t('billing.plans.upgrade');
  };

  const getBadgeText = (plan: Plan, planType: PlanType) => {
    if (planType === 'current') return t('billing.plans.currentPlan');
    if (plan.id === recommendedPlanId) return t('billing.plans.mostPopular');
    if (planType === 'upgrade') return t('billing.plans.upgrade');
    return t('billing.plans.downgrade');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop with blur */}
      <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-md" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-3xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        {/* Premium Header */}
        <div className="relative px-8 py-8 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden">
          {/* Decorative elements */}
          <div className="absolute inset-0 opacity-30">
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-500 rounded-full blur-3xl -translate-y-1/2" />
            <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-teal-500 rounded-full blur-3xl translate-y-1/2" />
          </div>

          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-400 to-teal-500 flex items-center justify-center shadow-lg shadow-violet-500/30">
                <Sparkles className="h-7 w-7 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">{t('billing.plans.title')}</h2>
                <p className="text-slate-400 mt-1">{t('billing.plans.subtitle')}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
            >
              <X className="h-5 w-5 text-white" />
            </button>
          </div>

          {/* Interval Toggle */}
          <div className="relative mt-8 flex justify-center">
            <BillingIntervalToggle
              interval={interval}
              onChange={setInterval}
              savingsPercent={savingsPercent ?? undefined}
            />
          </div>
        </div>

        {/* Content */}
        <div className="p-8 overflow-y-auto max-h-[calc(90vh-220px)] bg-gradient-to-b from-slate-50 to-white">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <Loader2 className="h-10 w-10 animate-spin text-violet-500 mx-auto" />
                <p className="text-slate-500 mt-4">{t('billing.plans.loading')}</p>
              </div>
            </div>
          ) : filteredPlans.length === 0 ? (
            <div className="text-center py-20">
              <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="h-8 w-8 text-slate-400" />
              </div>
              <p className="text-slate-500">{t('billing.noPlansAvailable')}</p>
            </div>
          ) : (
            <>
              {/* Plans Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredPlans.map((plan) => {
                  const planType = getPlanType(plan);
                  const styles = getCardStyles(plan, planType);
                  const { price, monthlyEquivalent } = getPriceDisplay(plan);
                  const features = getFeatures(plan);
                  const isRecommended = plan.id === recommendedPlanId && planType !== 'current';

                  return (
                    <div
                      key={plan.id}
                      className={`relative rounded-2xl p-6 flex flex-col transition-all duration-300 ${styles.card}`}
                    >
                      {/* Badge */}
                      <div className="absolute -top-3 inset-x-0 flex justify-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-full shadow-sm ${styles.badge}`}
                        >
                          {planType === 'upgrade' && !isRecommended && (
                            <ArrowUp className="h-3 w-3" />
                          )}
                          {planType === 'downgrade' && <ArrowDown className="h-3 w-3" />}
                          {isRecommended && <Crown className="h-3 w-3" />}
                          {planType === 'current' && <Shield className="h-3 w-3" />}
                          {getBadgeText(plan, planType)}
                        </span>
                      </div>

                      {/* Plan Icon & Name */}
                      <div className="flex items-center gap-3 mt-4 mb-4">
                        <div
                          className={`h-10 w-10 rounded-xl flex items-center justify-center ${styles.icon}`}
                        >
                          {getPlanIcon(plan, planType)}
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                          {/* Show yearly discount badge if viewing yearly and plan has discount */}
                          {interval === 'year' && plan.yearlyDiscountPercent > 0 && (
                            <p className="text-xs text-violet-600 font-medium">
                              {t('billing.interval.savePercent', {
                                percent: plan.yearlyDiscountPercent,
                              })}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Description */}
                      {plan.description && (
                        <p className="text-sm text-slate-500 mb-4 line-clamp-2">
                          {plan.description}
                        </p>
                      )}

                      {/* Price */}
                      <div className="mb-6">
                        <div className="flex items-baseline gap-1">
                          <span className={`text-4xl font-bold ${styles.price}`}>{price}</span>
                          <span className="text-slate-500 text-sm">
                            /{interval === 'month' ? t('billing.perMonth') : t('billing.perYear')}
                          </span>
                        </div>
                        {monthlyEquivalent && (
                          <p className="text-sm text-violet-600 mt-1 font-medium">
                            {monthlyEquivalent}/{t('billing.perMonth')}{' '}
                            {t('billing.interval.billedAnnually')}
                          </p>
                        )}
                      </div>

                      {/* Features */}
                      <ul className="space-y-3 mb-6 flex-1">
                        {features.map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-3 text-sm">
                            <div
                              className={`h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                                planType === 'current'
                                  ? 'bg-slate-200'
                                  : isRecommended
                                    ? 'bg-violet-100'
                                    : 'bg-slate-100'
                              }`}
                            >
                              <Check
                                className={`h-3 w-3 ${
                                  planType === 'current'
                                    ? 'text-slate-500'
                                    : isRecommended
                                      ? 'text-violet-600'
                                      : 'text-slate-600'
                                }`}
                              />
                            </div>
                            <span className="text-slate-700">{feature}</span>
                          </li>
                        ))}
                      </ul>

                      {/* CTA Button */}
                      <Button
                        onClick={() => handleSelectPlan(plan)}
                        disabled={planType === 'current' || checkoutMutation.isPending}
                        size="lg"
                        className={`w-full font-semibold transition-all duration-200 ${styles.button}`}
                      >
                        {checkoutMutation.isPending && confirmDowngrade !== plan.id ? (
                          <Loader2 className="h-4 w-4 me-2 animate-spin" />
                        ) : planType === 'upgrade' ? (
                          <ArrowUp className="h-4 w-4 me-2" />
                        ) : planType === 'downgrade' ? (
                          <ArrowDown className="h-4 w-4 me-2" />
                        ) : null}
                        {getButtonText(plan, planType)}
                      </Button>

                      {/* Downgrade warning */}
                      {confirmDowngrade === plan.id && (
                        <p className="text-xs text-amber-600 mt-3 text-center">
                          {t('billing.plans.downgradeWarning')}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Trust Badges */}
              <div className="mt-10 pt-8 border-t border-slate-200">
                <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-violet-500" />
                    <span>{t('billing.plans.cancelAnytime')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-violet-500" />
                    <span>{t('billing.plans.instantAccess')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-violet-500" />
                    <span>{t('billing.plans.securePayment')}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
