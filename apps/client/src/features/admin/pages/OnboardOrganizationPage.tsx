import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Building2, User, Loader2, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Admin role for first user is always org_owner
 */
const ADMIN_ROLE = { value: 'org_owner', labelKey: 'admin.onboard.orgOwner' } as const;

/**
 * OnboardOrganizationPage
 *
 * System admin page to onboard new organizations.
 * Creates organization + first admin user in one atomic operation.
 *
 * Only accessible by system_admin role.
 */
export default function OnboardOrganizationPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);

  // Form state
  const [orgName, setOrgName] = useState('');
  const [seatLimit, setSeatLimit] = useState(10);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Check access
  if (user?.role !== 'system_admin') {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-slate-900 mb-2">{t('admin.onboard.accessDenied')}</h1>
        <p className="text-slate-600 mb-6">{t('admin.onboard.accessDeniedDesc')}</p>
        <Button onClick={() => navigate('/')} variant="outline">
          {t('admin.onboard.goToDashboard')}
        </Button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Use API adapter to transparently handle offline/online modes
      const api = (await import('@/lib/services')).getAPIAdapter();

      await api.post('/v1/admin/onboard', {
        organization: {
          name: orgName,
          seatLimit,
        },
        firstAdmin: {
          email: adminEmail,
          fullName: adminName,
          role: ADMIN_ROLE.value,
        },
      });

      setSuccess(true);
    } catch (err) {
      console.error('[Onboard] Error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Success state
  if (success) {
    return (
      <div className="max-w-lg mx-auto p-8 text-center">
        <div className="h-16 w-16 bg-violet-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Check className="h-8 w-8 text-violet-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          {t('admin.onboard.successTitle')}
        </h1>
        <p className="text-slate-600 mb-6">
          {t('admin.onboard.successMessage', { orgName, email: adminEmail })}
        </p>
        <div className="flex gap-3 justify-center">
          <Button
            onClick={() => {
              setSuccess(false);
              setOrgName('');
              setAdminEmail('');
              setAdminName('');
            }}
            variant="outline"
          >
            {t('admin.onboard.onboardAnother')}
          </Button>
          <Button onClick={() => navigate('/')} className="bg-violet-500 hover:bg-violet-600">
            {t('admin.onboard.goToDashboard')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('admin.onboard.title')}</h1>
          <p className="text-slate-500">{t('admin.onboard.subtitle')}</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg flex items-center gap-3">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Organization Section */}
        <div className="bg-white rounded shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-3 text-slate-700">
            <Building2 className="h-5 w-5" />
            <h2 className="font-semibold">{t('admin.onboard.orgDetails')}</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('admin.onboard.orgName')} *
              </label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder={t('admin.onboard.orgNamePlaceholder')}
                required
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('admin.onboard.seatLimit')} *
              </label>
              <input
                type="number"
                value={seatLimit}
                onChange={(e) => setSeatLimit(parseInt(e.target.value) || 1)}
                min={1}
                max={1000}
                required
                className="w-32 px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
              />
              <p className="text-xs text-slate-500 mt-1">{t('admin.onboard.seatLimitHint')}</p>
            </div>
          </div>
        </div>

        {/* Admin Section */}
        <div className="bg-white rounded shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-3 text-slate-700">
            <User className="h-5 w-5" />
            <h2 className="font-semibold">{t('admin.onboard.firstAdmin')}</h2>
          </div>

          <p className="text-sm text-slate-500">
            {t('admin.onboard.adminNote', { role: t(ADMIN_ROLE.labelKey) })}
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('admin.onboard.adminEmail')} *
              </label>
              <input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder={t('admin.onboard.adminEmailPlaceholder')}
                required
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('admin.onboard.adminName')} *
              </label>
              <input
                type="text"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder={t('admin.onboard.adminNamePlaceholder')}
                required
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            {t('admin.onboard.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || !orgName || !adminEmail || !adminName}
            className="bg-violet-500 hover:bg-violet-600"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t('admin.onboard.creating')}
              </>
            ) : (
              t('admin.onboard.create')
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
