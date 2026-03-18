import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Check, X, Loader2, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getAuthAdapter } from '@/lib/services';
import { supabase } from '@/lib/supabase';

/**
 * Password strength rules
 */
const PASSWORD_RULES = [
  { id: 'length', test: (p: string) => p.length >= 12, label: 'At least 12 characters' },
  { id: 'upper', test: (p: string) => /[A-Z]/.test(p), label: 'One uppercase letter' },
  { id: 'lower', test: (p: string) => /[a-z]/.test(p), label: 'One lowercase letter' },
  { id: 'number', test: (p: string) => /[0-9]/.test(p), label: 'One number' },
  { id: 'special', test: (p: string) => /[^A-Za-z0-9]/.test(p), label: 'One special character' },
];

/**
 * SetPasswordPage
 *
 * Handles magic link tokens from invite emails.
 * Users land here after clicking the invite link.
 *
 * Flow:
 * 1. Extract tokens from URL hash (#access_token=...&refresh_token=...)
 * 2. Set session with tokens (already authenticated)
 * 3. User sets their password
 * 4. Call /v1/auth/activate to mark account as active
 * 5. Redirect to dashboard
 */
export default function SetPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { i18n } = useTranslation();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userName, setUserName] = useState<string>('');

  const isHebrew = i18n.language === 'he';

  // Parse tokens from URL (supports both PKCE code flow and implicit hash flow)
  useEffect(() => {
    const processTokens = async () => {
      try {
        const adapter = getAuthAdapter();

        // Strategy 1: PKCE flow — Supabase v2 sends ?code=... as a query parameter
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');

        if (code) {
          // Clear code from URL immediately for security
          window.history.replaceState(null, '', location.pathname);

          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError || !data.session) {
            throw new Error(exchangeError?.message || 'Failed to exchange code for session');
          }

          const user = data.session.user;
          setUserName(
            user.user_metadata?.full_name ||
              user.user_metadata?.name ||
              user.email?.split('@')[0] ||
              ''
          );
          setIsLoading(false);
          return;
        }

        // Strategy 2: Implicit flow — tokens in URL hash (#access_token=...&refresh_token=...)
        const hashParams = new URLSearchParams(location.hash.slice(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        // Clear hash from URL immediately for security
        window.history.replaceState(null, '', location.pathname);

        if (accessToken && refreshToken) {
          const result = await adapter.setSession(accessToken, refreshToken);
          setUserName(result.user.name || result.user.email.split('@')[0]);
          setIsLoading(false);
          return;
        }

        // Strategy 3: Check if Supabase already has a session (e.g. from auto-redirect)
        const existingSession = await adapter.getSession();
        if (existingSession) {
          const currentUser = await adapter.getCurrentUser();
          if (currentUser) {
            setUserName(currentUser.name || currentUser.email.split('@')[0]);
            setIsLoading(false);
            return;
          }
        }

        // No valid tokens found
        setError('Invalid or expired link. Please request a new invitation.');
        setIsLoading(false);
      } catch (err) {
        console.error('[SetPassword] Token processing failed:', err);
        setError('Failed to process invitation. Please request a new link.');
        setIsLoading(false);
      }
    };

    processTokens();
  }, [location]);

  // Check password strength
  const passwordStrength = PASSWORD_RULES.map((rule) => ({
    ...rule,
    passed: rule.test(password),
  }));
  const allRulesPassed = passwordStrength.every((r) => r.passed);
  const passwordsMatch = password === confirmPassword && password.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!allRulesPassed || !passwordsMatch) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const adapter = getAuthAdapter();

      // 1. Update password in Supabase
      await adapter.updatePassword(password);

      // 2. Activate account in our backend
      const session = await adapter.getSession();
      if (session) {
        const apiUrl = import.meta.env.VITE_API_URL || '/api';
        try {
          const activateRes = await fetch(`${apiUrl}/v1/auth/activate`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
              'Content-Type': 'application/json',
            },
          });
          if (!activateRes.ok) {
            // Log but don't block — /v1/auth/me has auto-activation fallback
            console.warn(
              '[SetPassword] Activation call failed:',
              activateRes.status,
              await activateRes.text().catch(() => '')
            );
          }
        } catch (activateErr) {
          // Log but don't block navigation — auto-activation in /me will handle it
          console.warn('[SetPassword] Activation call error:', activateErr);
        }
      }

      // 3. Navigate to dashboard
      navigate('/', { replace: true });
    } catch (err) {
      console.error('[SetPassword] Submit failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to set password. Please try again.');
      setIsSubmitting(false);
    }
  };

  const toggleLanguage = () => {
    const newLang = i18n.language === 'he' ? 'en' : 'he';
    i18n.changeLanguage(newLang);
    document.documentElement.dir = newLang === 'he' ? 'rtl' : 'ltr';
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mx-auto" />
          <p className="mt-4 text-slate-600">Setting up your account...</p>
        </div>
      </div>
    );
  }

  // Error state (invalid/expired link)
  if (error && isLoading === false && password === '') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="h-16 w-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <X className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Invalid Link</h1>
          <p className="text-slate-600 mb-6">{error}</p>
          <Button
            onClick={() => navigate('/login')}
            className="bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex" dir={isHebrew ? 'rtl' : 'ltr'}>
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-[45%] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex-col justify-between p-12">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 bg-emerald-500 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg">
              G
            </div>
            <span className="text-2xl font-bold">Geometrix</span>
          </div>
        </div>

        <div className="space-y-6">
          <h1 className="text-4xl font-bold leading-tight">
            Welcome to
            <br />
            <span className="text-emerald-400">Geometrix</span>
          </h1>
          <p className="text-slate-400 text-lg max-w-md">
            Set your password to complete your account setup and start using the platform.
          </p>
        </div>

        <div className="text-slate-500 text-sm">© 2024 Geometrix. All rights reserved.</div>
      </div>

      {/* Right Panel - Password Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md space-y-8">
          {/* Language Toggle */}
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={toggleLanguage} className="gap-2">
              <Globe className="h-4 w-4" />
              {isHebrew ? 'EN' : 'עב'}
            </Button>
          </div>

          {/* Header */}
          <div className="text-center lg:text-start">
            <h2 className="text-2xl font-bold text-slate-900">
              {userName ? `Hi ${userName}!` : 'Set Your Password'}
            </h2>
            <p className="text-slate-500 mt-2">Create a secure password for your account</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Password Field */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter a strong password"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all pe-10"
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

            {/* Password Strength */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500">Password requirements:</p>
              <div className="grid grid-cols-2 gap-2">
                {passwordStrength.map((rule) => (
                  <div
                    key={rule.id}
                    className={`flex items-center gap-2 text-xs ${rule.passed ? 'text-emerald-600' : 'text-slate-400'}`}
                  >
                    {rule.passed ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    {rule.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Confirm Password Field */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all ${
                  confirmPassword && !passwordsMatch
                    ? 'border-red-300 bg-red-50'
                    : confirmPassword && passwordsMatch
                      ? 'border-emerald-300 bg-emerald-50'
                      : 'border-slate-300'
                }`}
                autoComplete="new-password"
              />
              {confirmPassword && !passwordsMatch && (
                <p className="text-xs text-red-500">Passwords do not match</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-2.5"
              disabled={!allRulesPassed || !passwordsMatch || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Setting up...
                </>
              ) : (
                'Complete Setup'
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
