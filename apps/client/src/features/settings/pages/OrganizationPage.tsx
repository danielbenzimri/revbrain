/**
 * Organization Settings Page
 *
 * Allows org owners to manage billing contact email.
 *
 * Task: P4.1b
 * Refs: SI-BILLING-SPEC.md §9
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Save, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOrgSettings, useUpdateOrgSettings } from '../hooks/use-org-settings';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function OrgSettingsForm({
  orgName,
  billingContactEmail,
}: {
  orgName: string;
  billingContactEmail: string | null;
}) {
  const { t } = useTranslation();
  const updateOrg = useUpdateOrgSettings();

  const [email, setEmail] = useState(billingContactEmail ?? '');
  const [showSuccess, setShowSuccess] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const trimmed = email.trim();
    if (trimmed && !isValidEmail(trimmed)) {
      setValidationError(t('settings.organization.invalidEmail'));
      return;
    }

    try {
      await updateOrg.mutateAsync({
        billingContactEmail: trimmed || null,
      });
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <div className="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        {showSuccess && (
          <div className="flex items-center gap-2 bg-violet-50 text-violet-700 px-4 py-3 rounded-lg text-sm">
            <CheckCircle2 className="h-4 w-4" />
            {t('settings.organization.saved')}
          </div>
        )}

        {updateOrg.isError && (
          <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
            {t('settings.organization.saveFailed')}
          </div>
        )}

        {/* Org Name (read-only) */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            {t('settings.organization.name')}
          </label>
          <input
            type="text"
            value={orgName}
            disabled
            className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-500 text-sm cursor-not-allowed"
          />
        </div>

        {/* Billing Contact Email */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            {t('settings.organization.billingContactEmail')}
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setValidationError(null);
            }}
            placeholder="billing@company.com"
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500 outline-none text-sm ${
              validationError ? 'border-red-300' : 'border-slate-300'
            }`}
            data-testid="billing-contact-email-input"
          />
          {validationError && <p className="text-xs text-red-500 mt-1">{validationError}</p>}
          <p className="text-xs text-slate-400 mt-1">
            {t('settings.organization.billingContactHint')}
          </p>
        </div>

        <div className="pt-2">
          <Button
            type="submit"
            disabled={updateOrg.isPending}
            className="bg-violet-500 hover:bg-violet-600 text-white"
            data-testid="save-org-settings"
          >
            {updateOrg.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin me-2" />
                {t('common.saving')}
              </>
            ) : (
              <>
                <Save className="h-4 w-4 me-2" />
                {t('settings.organization.save')}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function OrganizationPage() {
  const { data: orgSettings, isLoading } = useOrgSettings();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!orgSettings) return null;

  return (
    <OrgSettingsForm
      key={orgSettings.id}
      orgName={orgSettings.name}
      billingContactEmail={orgSettings.billingContactEmail}
    />
  );
}
