import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Eye, EyeOff, Check, X, CheckCircle2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChangePassword } from '../hooks';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth-store';

const PASSWORD_RULES = [
  { id: 'length', test: (p: string) => p.length >= 12, labelKey: 'auth.pwRule.length' },
  { id: 'upper', test: (p: string) => /[A-Z]/.test(p), labelKey: 'auth.pwRule.upper' },
  { id: 'lower', test: (p: string) => /[a-z]/.test(p), labelKey: 'auth.pwRule.lower' },
  { id: 'number', test: (p: string) => /[0-9]/.test(p), labelKey: 'auth.pwRule.number' },
  { id: 'special', test: (p: string) => /[^A-Za-z0-9]/.test(p), labelKey: 'auth.pwRule.special' },
];

export default function SecurityPage() {
  const { t } = useTranslation();
  const changePassword = useChangePassword();
  const logout = useAuthStore((s) => s.logout);

  // Password change form
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Sign out everywhere
  const [signingOut, setSigningOut] = useState(false);

  const passwordStrength = PASSWORD_RULES.map((rule) => ({
    ...rule,
    passed: rule.test(newPassword),
  }));
  const allRulesPassed = passwordStrength.every((r) => r.passed);
  const passwordsMatch = newPassword === confirmPassword && newPassword.length > 0;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (!allRulesPassed) {
      setPasswordError(t('auth.passwordRequirementsNotMet'));
      return;
    }
    if (!passwordsMatch) {
      setPasswordError(t('auth.passwordsDoNotMatch'));
      return;
    }

    try {
      await changePassword.mutateAsync(newPassword);
      setPasswordSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(false), 5000);
    } catch {
      setPasswordError(t('auth.updateFailed'));
    }
  };

  const handleSignOutEverywhere = async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut({ scope: 'global' });
      logout();
    } catch {
      setSigningOut(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      {/* Change Password Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-1">
          {t('settings.security.changePassword')}
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          {t('settings.security.changePasswordDescription')}
        </p>

        <form onSubmit={handleChangePassword} className="space-y-4">
          {passwordSuccess && (
            <div className="flex items-center gap-2 bg-violet-50 text-violet-700 px-4 py-3 rounded-lg text-sm">
              <CheckCircle2 className="h-4 w-4" />
              {t('settings.security.passwordChanged')}
            </div>
          )}

          {passwordError && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
              {passwordError}
            </div>
          )}

          {/* New Password */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('auth.newPassword')}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none text-sm pe-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 end-0 px-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Password strength */}
          {newPassword.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500">{t('auth.passwordRequirements')}</p>
              <div className="grid grid-cols-2 gap-2">
                {passwordStrength.map((rule) => (
                  <div
                    key={rule.id}
                    className={`flex items-center gap-2 text-xs ${rule.passed ? 'text-violet-600' : 'text-slate-400'}`}
                  >
                    {rule.passed ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    {t(rule.labelKey)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('auth.confirmPassword')}
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500 outline-none text-sm transition-all ${
                confirmPassword && !passwordsMatch
                  ? 'border-red-300 bg-red-50'
                  : confirmPassword && passwordsMatch
                    ? 'border-violet-300 bg-violet-50'
                    : 'border-slate-300'
              }`}
              autoComplete="new-password"
            />
            {confirmPassword && !passwordsMatch && (
              <p className="text-xs text-red-500 mt-1">{t('auth.passwordsDoNotMatch')}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={changePassword.isPending || !allRulesPassed || !passwordsMatch}
            className="bg-violet-500 hover:bg-violet-600 text-white"
          >
            {changePassword.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin me-2" />
                {t('auth.updating')}
              </>
            ) : (
              t('settings.security.updatePassword')
            )}
          </Button>
        </form>
      </div>

      {/* Sign Out Everywhere Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-1">
          {t('settings.security.signOutEverywhere')}
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          {t('settings.security.signOutEverywhereDescription')}
        </p>

        <Button
          variant="outline"
          onClick={handleSignOutEverywhere}
          disabled={signingOut}
          className="text-red-600 border-red-200 hover:bg-red-50"
        >
          {signingOut ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin me-2" />
              {t('settings.security.signingOut')}
            </>
          ) : (
            <>
              <LogOut className="h-4 w-4 me-2" />
              {t('settings.security.signOutAll')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
