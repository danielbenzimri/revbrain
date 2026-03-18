import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Loader2, X, Building2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useTenants, useCreateAdminUser } from '../hooks';

interface CreateUserDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId?: string;
  orgName?: string;
}

export function CreateUserDrawer({ open, onOpenChange, orgId, orgName }: CreateUserDrawerProps) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';

  // React Query hooks - tenants cached for 1 minute (shared with TenantListPage)
  const { data: tenants = [] } = useTenants();
  const createUserMutation = useCreateAdminUser();

  // Form
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('');
  const [targetOrgId, setTargetOrgId] = useState(orgId || '');
  const [userType, setUserType] = useState<'platform_admin' | 'org_member'>('org_member');

  // UI State
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Track whether drawer was previously open to detect open transitions
  const [wasOpen, setWasOpen] = useState(false);

  // Reset form when drawer opens (React-recommended pattern for syncing with props)
  if (open && !wasOpen) {
    setWasOpen(true);
    // Reset all form fields
    setEmail('');
    setFullName('');
    setRole('');
    setError(null);
    setSuccess(false);
    setTargetOrgId(orgId || '');
    setUserType('org_member');
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const finalRole = userType === 'platform_admin' ? 'system_admin' : role;

      // Validate
      if (userType === 'org_member' && !targetOrgId) {
        throw new Error(t('admin.users.selectOrgRequired'));
      }

      await createUserMutation.mutateAsync({
        email,
        name: fullName,
        role: finalRole,
        orgId: targetOrgId,
      });

      setSuccess(true);
    } catch (err: unknown) {
      const errorMessage = (err as Error).message || 'An error occurred';
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
              <h2 className="text-xl font-bold">
                {orgName
                  ? t('admin.users.inviteToOrg', { org: orgName })
                  : t('admin.users.inviteUser')}
              </h2>
              <p className="text-slate-400 text-sm mt-0.5">{t('admin.users.inviteSubtitle')}</p>
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

        <div className="flex-1 overflow-y-auto">
          {success ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <div className="h-16 w-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                <User className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">
                {t('admin.users.inviteSent')}
              </h3>
              <p className="text-slate-500 mb-6 max-w-xs">
                {t('admin.users.inviteSentDesc', { email })}
              </p>
              <Button
                onClick={handleClose}
                className="bg-emerald-600 hover:bg-emerald-700 w-full max-w-xs"
              >
                {t('common.done')}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* User Type Selection */}
              {!orgId && (
                <div className="bg-slate-50 p-1 rounded-lg flex border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setUserType('org_member')}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                      userType === 'org_member'
                        ? 'bg-white text-emerald-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {t('admin.users.userType.orgUser')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUserType('platform_admin');
                      setTargetOrgId(''); // Or set to system org if needed
                    }}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                      userType === 'platform_admin'
                        ? 'bg-white text-purple-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {t('admin.users.userType.systemAdmin')}
                  </button>
                </div>
              )}

              {/* Dynamic Content based on User Type */}
              {userType === 'platform_admin' ? (
                <div className="bg-purple-50 border border-purple-100 rounded-lg p-4 flex gap-3">
                  <Shield className="h-5 w-5 text-purple-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-purple-900 text-sm">
                      {t('admin.users.systemAdminTitle')}
                    </h4>
                    <p className="text-purple-700 text-xs mt-1">
                      {t('admin.users.systemAdminDesc')}
                    </p>
                  </div>
                </div>
              ) : (
                !orgId && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      {t('admin.users.selectOrg')}
                    </label>
                    <div className="relative">
                      <Building2 className="absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
                      <select
                        value={targetOrgId}
                        onChange={(e) => setTargetOrgId(e.target.value)}
                        required
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-white"
                      >
                        <option value="">{t('common.select')}</option>
                        {tenants.map((tenant) => (
                          <option key={tenant.id} value={tenant.id}>
                            {tenant.name} ({t(`admin.tenants.${tenant.type}`)})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('admin.users.fullName')}
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                  placeholder={t('admin.users.fullNamePlaceholder')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('admin.users.email')}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                  placeholder={t('admin.users.emailPlaceholder')}
                />
              </div>

              {userType === 'org_member' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('admin.users.role')}
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-white"
                  >
                    <option value="">{t('common.select')}</option>
                    <option value="contractor_ceo">
                      {t('admin.users.roles.contractor_ceo.label')}
                    </option>
                    <option value="client_owner">
                      {t('admin.users.roles.client_owner.label')}
                    </option>
                    {/* TODO: Add more roles as needed */}
                  </select>
                </div>
              )}

              <div className="pt-4">
                <Button
                  type="submit"
                  disabled={
                    createUserMutation.isPending ||
                    (userType === 'org_member' && (!targetOrgId || !role))
                  }
                  className={`w-full ${userType === 'platform_admin' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                >
                  {createUserMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin me-2" />
                      {t('common.sending')}
                    </>
                  ) : (
                    t('admin.users.sendInvite')
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
