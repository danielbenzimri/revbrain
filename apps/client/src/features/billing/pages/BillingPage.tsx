import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import {
  CreditCard,
  ExternalLink,
  Loader2,
  CheckCircle,
  AlertCircle,
  Receipt,
  Check,
  Sparkles,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useSubscription,
  usePaymentHistory,
  usePortal,
  usePlans,
  useCheckout,
  type Plan,
} from '../hooks';
import {
  UsageDashboard,
  TrialCountdown,
  UpgradePrompt,
  PlanUpgradeModal,
  BillingIntervalToggle,
  calculateYearlySavings,
} from '../components';

export default function BillingPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { data, isLoading, error } = useSubscription();
  const { data: payments, isLoading: paymentsLoading } = usePaymentHistory(5);
  const { data: plans = [], isLoading: plansLoading } = usePlans();
  const portalMutation = usePortal();
  const checkoutMutation = useCheckout();
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

  // Check for success/cancel from Stripe redirect
  const success = searchParams.get('success') === 'true';
  const canceled = searchParams.get('canceled') === 'true';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg">{t('billing.errorLoading')}</div>
    );
  }

  const { subscription, plan } = data || {};

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-100 text-emerald-800';
      case 'trialing':
        return 'bg-blue-100 text-blue-800';
      case 'past_due':
        return 'bg-amber-100 text-amber-800';
      case 'canceled':
      case 'unpaid':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <div className="animate-fade-in-up">
        <h1 className="text-2xl font-bold text-slate-900">{t('billing.title')}</h1>
        <p className="text-slate-500 mt-1">{t('billing.subtitle')}</p>
      </div>

      {/* Success/Cancel Messages */}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg flex items-center gap-3">
          <CheckCircle className="h-5 w-5" />
          <span>{t('billing.subscriptionSuccess')}</span>
        </div>
      )}

      {canceled && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5" />
          <span>{t('billing.checkoutCanceled')}</span>
        </div>
      )}

      {/* Usage Dashboard - Always show when subscribed */}
      {subscription && <UsageDashboard />}

      {/* Upgrade Prompt - Show when approaching limits */}
      {subscription && (
        <UpgradePrompt onUpgrade={() => setIsUpgradeModalOpen(true)} threshold={80} />
      )}

      {/* Current Plan Card */}
      <div className="animate-fade-in-up delay-100 bg-white rounded shadow-sm border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">{t('billing.currentPlan')}</h2>
          <div className="flex items-center gap-3">
            {/* Trial Countdown */}
            {subscription?.status === 'trialing' && subscription.trialEnd && (
              <TrialCountdown trialEndDate={subscription.trialEnd} />
            )}
            {subscription && (
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(subscription.status)}`}
              >
                {t(`billing.status.${subscription.status}`)}
              </span>
            )}
          </div>
        </div>

        <div className="p-6">
          {subscription && plan ? (
            <div className="space-y-6">
              {/* Plan Info */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xl font-semibold text-slate-900">{plan.name}</p>
                  <p className="text-slate-500 mt-1">{plan.description}</p>
                </div>
                <div className="text-end">
                  <p className="text-2xl font-bold text-slate-900">
                    ${(plan.price / 100).toFixed(2).replace(/\.00$/, '')}
                    <span className="text-sm font-normal text-slate-500">
                      /{t(`billing.per${plan.interval === 'month' ? 'Month' : 'Year'}`)}
                    </span>
                  </p>
                </div>
              </div>

              {/* Trial Warning */}
              {subscription.status === 'trialing' && subscription.trialEnd && (
                <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg">
                  {t('billing.trialEnds', { date: formatDate(subscription.trialEnd) })}
                </div>
              )}

              {/* Cancellation Warning */}
              {subscription.cancelAtPeriodEnd && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg">
                  {t('billing.cancelAtPeriodEnd', {
                    date: formatDate(subscription.currentPeriodEnd),
                  })}
                </div>
              )}

              {/* Period Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500">{t('billing.currentPeriod')}</p>
                  <p className="font-medium text-slate-900">
                    {formatDate(subscription.currentPeriodStart)} -{' '}
                    {formatDate(subscription.currentPeriodEnd)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">{t('billing.nextBillingDate')}</p>
                  <p className="font-medium text-slate-900">
                    {subscription.cancelAtPeriodEnd
                      ? t('billing.noBilling')
                      : formatDate(subscription.currentPeriodEnd)}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-slate-100 flex items-center gap-3">
                <Button
                  onClick={() => portalMutation.mutate()}
                  disabled={portalMutation.isPending}
                  className="bg-slate-900 text-white hover:bg-slate-800"
                >
                  {portalMutation.isPending ? (
                    <Loader2 className="h-4 w-4 me-2 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4 me-2" />
                  )}
                  {t('billing.manageBilling')}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => setIsUpgradeModalOpen(true)}
                  className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                >
                  <Sparkles className="h-4 w-4 me-2" />
                  {t('billing.upgrade.button')}
                </Button>
              </div>
              <p className="text-xs text-slate-500">{t('billing.manageDesc')}</p>
            </div>
          ) : (
            <PlanSelector
              plans={plans}
              isLoading={plansLoading}
              onSelectPlan={(planId) => checkoutMutation.mutate(planId)}
              isCheckoutPending={checkoutMutation.isPending}
              t={t}
            />
          )}
        </div>
      </div>

      {/* Payment History */}
      {subscription && (
        <div className="animate-fade-in-up delay-200 content-offscreen bg-white rounded shadow-sm border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">{t('billing.paymentHistory')}</h2>
          </div>

          <div className="divide-y divide-slate-100">
            {paymentsLoading ? (
              <div className="px-6 py-8 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400 mx-auto" />
              </div>
            ) : payments && payments.length > 0 ? (
              payments.map((payment) => (
                <div key={payment.id} className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className={`h-8 w-8 rounded-full flex items-center justify-center ${
                        payment.status === 'succeeded' ? 'bg-emerald-100' : 'bg-red-100'
                      }`}
                    >
                      <Receipt
                        className={`h-4 w-4 ${
                          payment.status === 'succeeded' ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900">{payment.amount}</p>
                        {payment.stripeInvoiceId && (
                          <span className="text-xs text-slate-400 font-mono">
                            {payment.stripeInvoiceId.replace('in_', '').slice(0, 8)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500">{formatDate(payment.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        payment.status === 'succeeded'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {t(`billing.paymentStatus.${payment.status}`)}
                    </span>
                    {payment.invoiceUrl && (
                      <a
                        href={payment.invoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                        title={t('billing.downloadInvoice')}
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    )}
                    {payment.receiptUrl && (
                      <a
                        href={payment.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                        title={t('billing.viewReceipt')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-8 text-center text-slate-500">{t('billing.noPayments')}</div>
            )}
          </div>
        </div>
      )}

      {/* Plan Upgrade Modal */}
      <PlanUpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
        currentPlanId={plan?.id}
        currentPlanPrice={plan?.price}
      />
    </div>
  );
}

/**
 * Plan selector component for users without a subscription
 */
interface PlanSelectorProps {
  plans: Plan[];
  isLoading: boolean;
  onSelectPlan: (planId: string) => void;
  isCheckoutPending: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
}

function PlanSelector({ plans, isLoading, onSelectPlan, isCheckoutPending, t }: PlanSelectorProps) {
  const [interval, setInterval] = useState<'month' | 'year'>('month');

  // Calculate yearly savings by comparing monthly vs yearly plans
  // Find any plan that has both monthly and yearly versions (e.g., Professional)
  const monthlyPlan = plans.find((p) => p.interval === 'month' && p.price > 0);
  const yearlyPlan = plans.find(
    (p) => p.interval === 'year' && p.name === monthlyPlan?.name && p.price > 0
  );
  const savingsPercent = calculateYearlySavings(monthlyPlan?.price, yearlyPlan?.price);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="text-center py-8">
        <CreditCard className="h-12 w-12 text-slate-300 mx-auto mb-4" />
        <p className="text-slate-500">{t('billing.noPlansAvailable')}</p>
      </div>
    );
  }

  // Filter plans by selected interval
  const filteredPlans = plans.filter((plan) => plan.interval === interval);

  const getPriceDisplay = (plan: Plan) => {
    const price = `$${(plan.price / 100).toFixed(2).replace(/\.00$/, '')}`;
    if (plan.interval === 'month') return { price, intervalText: t('billing.perMonth') };
    if (plan.interval === 'year') return { price, intervalText: t('billing.perYear') };
    return { price, intervalText: '' };
  };

  const getFeatures = (plan: Plan) => {
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

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-slate-500">{t('billing.choosePlan')}</p>
      </div>

      <BillingIntervalToggle
        interval={interval}
        onChange={setInterval}
        savingsPercent={savingsPercent ?? undefined}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPlans.map((plan) => {
          const { price, intervalText } = getPriceDisplay(plan);
          const features = getFeatures(plan);

          return (
            <div
              key={plan.id}
              className="border border-slate-200 rounded-xl p-6 flex flex-col hover:border-emerald-300 hover:shadow-md transition-all"
            >
              <div className="mb-4">
                <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                {plan.description && (
                  <p className="text-sm text-slate-500 mt-1">{plan.description}</p>
                )}
              </div>

              <div className="mb-6">
                <span className="text-3xl font-bold text-slate-900">{price}</span>
                {intervalText && <span className="text-slate-500 text-sm">/{intervalText}</span>}
              </div>

              <ul className="space-y-3 mb-6 flex-1">
                {features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-sm text-slate-600">
                    <Check className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Button
                onClick={() => onSelectPlan(plan.id)}
                disabled={isCheckoutPending}
                className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {isCheckoutPending ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : null}
                {t('billing.subscribe')}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
