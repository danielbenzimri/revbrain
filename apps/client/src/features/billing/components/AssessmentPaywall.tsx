/**
 * Assessment Paywall Overlay
 *
 * Lock overlay shown on premium assessment sections when M1 hasn't been paid.
 * Shows teaser content behind a blur with a CTA to accept terms or pay.
 */
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '../hooks/use-partner-billing';
import type { AssessmentEntitlement } from '../hooks/use-assessment-entitlement';

export function AssessmentPaywall({
  entitlement,
  children,
}: {
  entitlement: AssessmentEntitlement;
  children: React.ReactNode;
}) {
  const { t } = useTranslation('billing');
  const navigate = useNavigate();

  if (entitlement.isUnlocked || entitlement.isLoading) {
    return <>{children}</>;
  }

  return (
    <div className="relative" data-testid="assessment-paywall">
      {/* Blurred content teaser */}
      <div
        className="pointer-events-none select-none"
        style={{ filter: 'blur(6px)', opacity: 0.5 }}
      >
        {children}
      </div>

      {/* Lock overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm rounded-xl">
        <div className="text-center max-w-sm px-6">
          <div className="w-12 h-12 rounded-full bg-violet-100 flex items-center justify-center mx-auto mb-4">
            <Lock className="h-6 w-6 text-violet-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            {t('paywall.title', 'Unlock Full Assessment')}
          </h3>
          <p className="text-sm text-slate-600 mb-4">
            {entitlement.assessmentFee
              ? t(
                  'paywall.description',
                  'Get the complete analysis, detailed risk matrix, and downloadable report for {{amount}}.',
                  { amount: formatCurrency(entitlement.assessmentFee) }
                )
              : t(
                  'paywall.descriptionNoPrice',
                  'Accept your assessment agreement to unlock the full report and detailed analysis.'
                )}
          </p>
          {entitlement.agreementId ? (
            <Button
              className="bg-violet-500 hover:bg-violet-600 text-white"
              onClick={() => navigate(`/billing/agreements/${entitlement.agreementId}/review`)}
              data-testid="paywall-cta"
            >
              {entitlement.hasPendingAgreement
                ? t('paywall.acceptTerms', 'Review & Accept Terms')
                : t('paywall.payNow', 'Pay Now')}
            </Button>
          ) : (
            <p className="text-xs text-slate-400">
              {t('paywall.contactAdmin', 'Contact your account manager to set up a fee agreement.')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Inline lock badge for tab labels
 */
export function LockedTabBadge() {
  return <Lock className="h-3 w-3 text-slate-400 ms-1" data-testid="locked-tab-badge" />;
}
