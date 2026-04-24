import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  Eye,
  EyeOff,
  Check,
  X,
  CheckCircle2,
  LogOut,
  ShieldCheck,
  Shield,
  Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChangePassword } from '../hooks';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth-store';
import { getAuthAdapter } from '@/lib/services';
import type { MFAFactor, MFAEnrollment } from '@/types/services';

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

      {/* Two-Factor Authentication Section */}
      <MFASection />

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

// =============================================================================
// MFA Section Component
// =============================================================================

type MFAState = 'loading' | 'idle' | 'enrolling' | 'verifying';

function MFASection() {
  const { t } = useTranslation();
  const [state, setState] = useState<MFAState>('loading');
  const [factors, setFactors] = useState<MFAFactor[]>([]);
  const [enrollment, setEnrollment] = useState<MFAEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [disabling, setDisabling] = useState(false);

  const verifiedFactors = factors.filter((f) => f.status === 'verified');
  const hasVerifiedMFA = verifiedFactors.length > 0;

  const loadFactors = useCallback(async () => {
    try {
      const adapter = getAuthAdapter();
      const result = await adapter.getMFAFactors();
      setFactors(result);
    } catch (err) {
      console.error('[MFA] Failed to load factors:', err);
    } finally {
      setState('idle');
    }
  }, []);

  useEffect(() => {
    loadFactors();
  }, [loadFactors]);

  const handleStartEnroll = async () => {
    setError(null);
    setState('enrolling');
    try {
      const adapter = getAuthAdapter();
      const result = await adapter.enrollMFA();
      setEnrollment(result);
    } catch (err) {
      console.error('[MFA] Enroll error:', err);
      setError(err instanceof Error ? err.message : 'Failed to start enrollment');
      setState('idle');
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollment || code.length !== 6) return;

    setError(null);
    setState('verifying');
    try {
      const adapter = getAuthAdapter();
      await adapter.challengeAndVerifyMFA(enrollment.factorId, code);
      setSuccess(true);
      setEnrollment(null);
      setCode('');
      await loadFactors();
      setTimeout(() => setSuccess(false), 5000);
    } catch {
      setError(t('settings.security.mfaVerifyFailed'));
      setState('enrolling');
    }
  };

  const handleDisable = async () => {
    if (!window.confirm(t('settings.security.mfaDisableConfirm'))) return;
    setDisabling(true);
    try {
      const adapter = getAuthAdapter();
      for (const factor of verifiedFactors) {
        await adapter.unenrollMFA(factor.id);
      }
      await loadFactors();
    } catch (err) {
      console.error('[MFA] Disable error:', err);
    } finally {
      setDisabling(false);
    }
  };

  const handleCancel = async () => {
    // Clean up the unverified factor we just created
    if (enrollment) {
      try {
        const adapter = getAuthAdapter();
        await adapter.unenrollMFA(enrollment.factorId);
      } catch {
        // Ignore — Supabase auto-cleans unverified factors
      }
    }
    setEnrollment(null);
    setCode('');
    setError(null);
    setState('idle');
  };

  const handleCopySecret = async () => {
    if (!enrollment) return;
    await navigator.clipboard.writeText(enrollment.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (state === 'loading') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">{t('settings.security.mfa')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <div className="flex items-start justify-between mb-1">
        <h2 className="text-lg font-semibold text-slate-900">{t('settings.security.mfa')}</h2>
        {hasVerifiedMFA && state === 'idle' && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-100 text-violet-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            {t('settings.security.mfaEnabled')}
          </span>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-6">{t('settings.security.mfaDescription')}</p>

      {success && (
        <div className="flex items-center gap-2 bg-violet-50 text-violet-700 px-4 py-3 rounded-lg text-sm mb-4">
          <CheckCircle2 className="h-4 w-4" />
          {t('settings.security.mfaSuccess')}
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>
      )}

      {/* Idle state: show enable/disable button */}
      {state === 'idle' && !hasVerifiedMFA && (
        <Button
          onClick={handleStartEnroll}
          className="bg-violet-500 hover:bg-violet-600 text-white"
        >
          <Shield className="h-4 w-4 me-2" />
          {t('settings.security.mfaEnable')}
        </Button>
      )}

      {state === 'idle' && hasVerifiedMFA && (
        <div className="space-y-3">
          {verifiedFactors.map((factor) => (
            <div key={factor.id} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-violet-500" />
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    {factor.friendlyName || 'Authenticator App'}
                  </p>
                  <p className="text-xs text-slate-400">
                    {t('settings.security.mfaEnrolledOn', {
                      date: new Date(factor.createdAt).toLocaleDateString(),
                    })}
                  </p>
                </div>
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            onClick={handleDisable}
            disabled={disabling}
            className="text-red-600 border-red-200 hover:bg-red-50"
          >
            {disabling ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin me-2" />
                {t('settings.security.mfaDisabling')}
              </>
            ) : (
              t('settings.security.mfaDisable')
            )}
          </Button>
        </div>
      )}

      {/* Enrollment flow: QR code + verification */}
      {(state === 'enrolling' || state === 'verifying') && enrollment && (
        <div className="space-y-6">
          {/* Step 1: QR Code */}
          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-1">
              {t('settings.security.mfaStep1')}
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              {t('settings.security.mfaStep1Description')}
            </p>
            <div className="flex justify-center p-4 bg-white border border-slate-200 rounded-lg w-fit mx-auto">
              <img src={enrollment.qrCode} alt="MFA QR Code" className="h-48 w-48" />
            </div>
            {/* Manual entry fallback */}
            <div className="mt-4">
              <p className="text-xs text-slate-500 mb-2">{t('settings.security.mfaManualEntry')}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 select-all break-all">
                  {enrollment.secret}
                </code>
                <Button variant="outline" size="sm" onClick={handleCopySecret} className="shrink-0">
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-violet-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Step 2: Verification code */}
          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-1">
              {t('settings.security.mfaStep2')}
            </h3>
            <p className="text-sm text-slate-500 mb-3">
              {t('settings.security.mfaStep2Description')}
            </p>
            <form onSubmit={handleVerify} className="flex items-end gap-3">
              <div className="flex-1 max-w-50">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder={t('settings.security.mfaCodePlaceholder')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none text-sm font-mono text-center tracking-[0.5em]"
                  autoFocus
                  autoComplete="one-time-code"
                />
              </div>
              <Button
                type="submit"
                disabled={code.length !== 6 || state === 'verifying'}
                className="bg-violet-500 hover:bg-violet-600 text-white"
              >
                {state === 'verifying' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin me-2" />
                    {t('settings.security.mfaVerifying')}
                  </>
                ) : (
                  t('settings.security.mfaVerify')
                )}
              </Button>
            </form>
          </div>

          {/* Cancel */}
          <Button variant="ghost" onClick={handleCancel} className="text-slate-500">
            {t('settings.security.mfaCancel')}
          </Button>
        </div>
      )}
    </div>
  );
}
