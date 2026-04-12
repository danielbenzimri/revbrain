import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Eye,
  EyeOff,
  Globe,
  ArrowRightLeft,
  Shield,
  BarChart3,
  CheckCircle,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useShallow } from 'zustand/shallow';
import { useAuthStore } from '@/stores/auth-store';
import type { UserRole } from '@/types/auth';
import { ROLE_DISPLAY_NAMES, ROLE_DESCRIPTIONS } from '@/types/auth';

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { login, simulateRole, isLoading, error, user } = useAuthStore(
    useShallow((s) => ({
      login: s.login,
      simulateRole: s.simulateRole,
      isLoading: s.isLoading,
      error: s.error,
      user: s.user,
    }))
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const isHebrew = i18n.language === 'he';

  const getRedirectPath = (role: UserRole) => {
    return role === 'system_admin' ? '/admin' : '/';
  };

  useEffect(() => {
    if (user) {
      navigate(getRedirectPath(user.role));
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(email, password);
  };

  const isMockMode = import.meta.env.VITE_AUTH_MODE === 'mock';
  const personaLoginEnabled = import.meta.env.VITE_PERSONA_LOGIN_ENABLED === 'true';
  const showPersonaPicker = isMockMode || personaLoginEnabled;

  const handleRoleSimulation = async (role: UserRole) => {
    if (isMockMode) {
      simulateRole(role);
      navigate(getRedirectPath(role));
      return;
    }

    // Staging mode — request a server-issued session via /v1/dev/persona-login
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const res = await fetch(`${apiUrl}/v1/dev/persona-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });

      if (!res.ok) return;

      const { data } = await res.json();

      // Import Supabase client dynamically to avoid pulling it in mock mode
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseKey) return;

      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.auth.setSession({
        access_token: data.accessToken,
        refresh_token: data.refreshToken,
      });

      // The auth state change listener in auth-store will pick up the new session
      navigate(getRedirectPath(role));
    } catch {
      // Silently fail — the persona login is a dev convenience, not critical
    }
  };

  const toggleLanguage = () => {
    const newLang = i18n.language === 'he' ? 'en' : 'he';
    i18n.changeLanguage(newLang);
    document.documentElement.dir = newLang === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = newLang;
  };

  const features = [
    {
      icon: <ArrowRightLeft className="h-5 w-5" />,
      title: 'CPQ to RCA Migration',
      description: 'Automated mapping and migration of products, pricing, and quote configurations',
    },
    {
      icon: <Shield className="h-5 w-5" />,
      title: 'Data Validation',
      description: 'Pre and post-migration validation ensures data integrity at every step',
    },
    {
      icon: <BarChart3 className="h-5 w-5" />,
      title: 'Migration Analytics',
      description: 'Real-time dashboards tracking progress, errors, and completion status',
    },
    {
      icon: <Zap className="h-5 w-5" />,
      title: 'Bulk Operations',
      description: 'Process thousands of records efficiently with intelligent batching',
    },
  ];

  const allRoles: UserRole[] = ['system_admin', 'org_owner', 'admin', 'operator', 'reviewer'];

  return (
    <div className="min-h-screen flex" dir={isHebrew ? 'rtl' : 'ltr'}>
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-[45%] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex-col justify-between p-12">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 bg-gradient-to-br from-violet-600 to-purple-700 rounded-xl flex items-center justify-center text-white shadow-lg">
              <ArrowRightLeft size={24} />
            </div>
            <span className="text-2xl font-bold tracking-tight">RevBrain</span>
          </div>
        </div>

        <div className="space-y-8">
          <div>
            <h1 className="text-4xl font-bold leading-tight">{t('auth.brandingTitle')}</h1>
            <p className="text-slate-400 text-lg mt-4 max-w-md">{t('auth.brandingSubtitle')}</p>
          </div>

          <div className="space-y-4">
            {features.map((feature, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="h-10 w-10 bg-violet-500/20 rounded-lg flex items-center justify-center text-violet-400 shrink-0 mt-0.5">
                  {feature.icon}
                </div>
                <div>
                  <p className="font-semibold text-sm">{feature.title}</p>
                  <p className="text-slate-400 text-sm">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-slate-500 text-sm">
          © {new Date().getFullYear()} RevBrain. {t('auth.rightsReserved')}
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md space-y-8">
          {/* Language Toggle */}
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={toggleLanguage} className="gap-2">
              <Globe className="h-4 w-4" />
              {isHebrew ? 'EN' : 'עב'}
            </Button>
          </div>

          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-3 justify-center">
            <div className="h-10 w-10 bg-gradient-to-br from-violet-600 to-purple-700 rounded-xl flex items-center justify-center text-white shadow-lg">
              <ArrowRightLeft size={20} />
            </div>
            <span className="text-xl font-bold text-slate-900">RevBrain</span>
          </div>

          {/* Header */}
          <div className="text-center lg:text-start">
            <h2 className="text-2xl font-bold text-slate-900">{t('auth.welcomeBack')}</h2>
            <p className="text-slate-500 mt-2">{t('auth.enterDetails')}</p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">{t('auth.email')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition-all"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-slate-700">{t('auth.password')}</label>
                <a
                  href="/forgot-password"
                  className="text-sm text-violet-600 hover:text-violet-700"
                >
                  {t('auth.forgotPassword')}
                </a>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition-all pe-10"
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

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="remember"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 text-violet-600 border-slate-300 rounded focus:ring-violet-500"
              />
              <label htmlFor="remember" className="text-sm text-slate-600">
                {t('auth.rememberMe')}
              </label>
            </div>

            <Button type="submit" className="w-full py-2.5" disabled={isLoading}>
              {isLoading ? t('auth.signingIn') : t('auth.signIn')}
            </Button>
          </form>

          {/* Dev Mode: Role Simulation */}
          {showPersonaPicker && (
            <div className="border-t pt-6">
              <div className="text-center mb-3">
                <span className="text-xs text-slate-400">{t('auth.simulateRole')}</span>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {allRoles.map((role) => (
                  <button
                    key={role}
                    onClick={() => handleRoleSimulation(role)}
                    className="flex items-center gap-3 p-2.5 border border-slate-200 rounded-lg hover:border-violet-400 hover:bg-violet-50 transition-all text-start"
                  >
                    <CheckCircle className="h-4 w-4 text-violet-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700">
                        {ROLE_DISPLAY_NAMES[role][isHebrew ? 'he' : 'en']}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {ROLE_DESCRIPTIONS[role][isHebrew ? 'he' : 'en']}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
