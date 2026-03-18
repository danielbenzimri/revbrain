import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Check, X, Loader2, AlertCircle } from 'lucide-react';
import { getAuthAdapter } from '@/lib/services';
import { supabase } from '@/lib/supabase';

/**
 * Password strength rules (same as SetPasswordPage)
 */
const PASSWORD_RULES = [
  { id: 'length', test: (p: string) => p.length >= 12, labelKey: 'auth.pwRule.length' },
  { id: 'upper', test: (p: string) => /[A-Z]/.test(p), labelKey: 'auth.pwRule.upper' },
  { id: 'lower', test: (p: string) => /[a-z]/.test(p), labelKey: 'auth.pwRule.lower' },
  { id: 'number', test: (p: string) => /[0-9]/.test(p), labelKey: 'auth.pwRule.number' },
  { id: 'special', test: (p: string) => /[^A-Za-z0-9]/.test(p), labelKey: 'auth.pwRule.special' },
];

/**
 * ResetPasswordPage
 *
 * Handles the password reset flow after user clicks the reset link from email.
 *
 * Flow:
 * 1. User clicks reset link in email → Supabase redirects to /reset-password with tokens
 * 2. Supabase client detects PASSWORD_RECOVERY event and establishes session
 * 3. User enters new password (must meet strength requirements)
 * 4. Calls updatePassword via auth adapter
 * 5. Redirects to login
 */
export default function ResetPasswordPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isHebrew = i18n.language === 'he';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  // Listen for Supabase PASSWORD_RECOVERY event + handle PKCE code flow
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true);
        setCheckingSession(false);
      }
    });

    // Handle PKCE code flow: exchange ?code=... for session
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
      window.history.replaceState(null, '', window.location.pathname);
      supabase.auth.exchangeCodeForSession(code).then(({ data, error: exchangeError }) => {
        if (!exchangeError && data.session) {
          setSessionReady(true);
        }
        setCheckingSession(false);
      });
    } else {
      // Also check if we already have a session (e.g. page refresh after redirect)
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setSessionReady(true);
        }
        setCheckingSession(false);
      });
    }

    return () => subscription.unsubscribe();
  }, []);

  // Password validation
  const passwordStrength = PASSWORD_RULES.map((rule) => ({
    ...rule,
    passed: rule.test(password),
  }));
  const allRulesPassed = passwordStrength.every((r) => r.passed);
  const passwordsMatch = password === confirmPassword && password.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!allRulesPassed) {
      setError(t('auth.passwordRequirementsNotMet'));
      return;
    }

    if (!passwordsMatch) {
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }

    setLoading(true);
    try {
      await getAuthAdapter().updatePassword(password);
      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.updateFailed'));
    } finally {
      setLoading(false);
    }
  };

  // Loading state while checking session
  if (checkingSession) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-slate-100 p-4"
        dir={isHebrew ? 'rtl' : 'ltr'}
      >
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mx-auto" />
          <p className="mt-4 text-slate-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // No valid session — link expired or invalid
  if (!sessionReady) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-slate-100 p-4"
        dir={isHebrew ? 'rtl' : 'ltr'}
      >
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 text-center space-y-4">
          <div className="mx-auto w-14 h-14 bg-red-100 rounded-full flex items-center justify-center">
            <AlertCircle className="h-7 w-7 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{t('auth.linkExpired')}</h1>
          <p className="text-slate-500 text-sm">{t('auth.linkExpiredDescription')}</p>
          <Button
            onClick={() => navigate('/forgot-password')}
            className="bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            {t('auth.requestNewLink')}
          </Button>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-slate-100 p-4"
        dir={isHebrew ? 'rtl' : 'ltr'}
      >
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 text-center space-y-4">
          <div className="mx-auto w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
            <Check className="h-6 w-6 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{t('auth.passwordUpdated')}</h1>
          <p className="text-slate-500">{t('auth.redirectingLogin')}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-slate-100 p-4"
      dir={isHebrew ? 'rtl' : 'ltr'}
    >
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('auth.setNewPassword')}</h1>
          <p className="text-slate-500 mt-2 text-sm">{t('auth.enterNewPassword')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>}

          {/* Password field */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">{t('auth.newPassword')}</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none pe-10"
                autoComplete="new-password"
                required
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

          {/* Password strength checklist */}
          {password.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500">{t('auth.passwordRequirements')}</p>
              <div className="grid grid-cols-2 gap-2">
                {passwordStrength.map((rule) => (
                  <div
                    key={rule.id}
                    className={`flex items-center gap-2 text-xs ${rule.passed ? 'text-emerald-600' : 'text-slate-400'}`}
                  >
                    {rule.passed ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    {t(rule.labelKey)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Confirm password */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">
              {t('auth.confirmPassword')}
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all ${
                confirmPassword && !passwordsMatch
                  ? 'border-red-300 bg-red-50'
                  : confirmPassword && passwordsMatch
                    ? 'border-emerald-300 bg-emerald-50'
                    : 'border-slate-300'
              }`}
              autoComplete="new-password"
              required
            />
            {confirmPassword && !passwordsMatch && (
              <p className="text-xs text-red-500">{t('auth.passwordsDoNotMatch')}</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
            disabled={loading || !allRulesPassed || !passwordsMatch}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin me-2" />
                {t('auth.updating')}
              </>
            ) : (
              t('auth.updatePassword')
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
