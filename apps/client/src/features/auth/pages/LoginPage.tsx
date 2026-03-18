import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useShallow } from 'zustand/shallow';
import { useAuthStore } from '@/stores/auth-store';
import type { UserRole } from '@/types/auth';
import { ROLE_DISPLAY_NAMES, ROLE_DESCRIPTIONS, isDev } from '@/types/auth';

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

  // Effect to handle redirection after successful login/simulation
  useEffect(() => {
    if (user) {
      navigate(getRedirectPath(user.role));
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(email, password);
  };

  const handleRoleSimulation = (role: UserRole) => {
    simulateRole(role);
    navigate(getRedirectPath(role));
  };

  const toggleLanguage = () => {
    const newLang = i18n.language === 'he' ? 'en' : 'he';
    i18n.changeLanguage(newLang);
    document.documentElement.dir = newLang === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = newLang;
  };

  // Roles grouped by category
  const contractorRoles: UserRole[] = [
    'contractor_ceo',
    'contractor_pm',
    'execution_engineer',
    'quantity_surveyor',
  ];
  const clientRoles: UserRole[] = ['client_owner', 'client_pm', 'inspector'];

  return (
    <div className="min-h-screen flex" dir={isHebrew ? 'rtl' : 'ltr'}>
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-[45%] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex-col justify-between p-12">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 bg-emerald-500 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg">
              G
            </div>
            <span className="text-2xl font-bold">RevBrain</span>
          </div>
        </div>

        <div className="space-y-6">
          <h1 className="text-4xl font-bold leading-tight">
            {t('auth.brandingTitle')
              .split(' ')
              .map((word, i) =>
                i === 1 ? (
                  <span key={i} className="text-emerald-400 block">
                    {word}{' '}
                  </span>
                ) : (
                  <span key={i}>{word} </span>
                )
              )}
            {/* Note: The split logic above is primitive for the complex original HTML. 
                            Let's revert to a simpler localized string or keep the HTML structure but localized.
                            Actually, the keys include the full sentence.
                            Let's just use the string for now to be safe, or separate Title/Subtitle better.
                            The original had semantic breaks. 
                            let's just render the title. */}
            {t('auth.brandingTitle')}
          </h1>
          <p className="text-slate-400 text-lg max-w-md">{t('auth.brandingSubtitle')}</p>
        </div>

        <div className="text-slate-500 text-sm">© 2024 RevBrain. {t('auth.rightsReserved')}</div>
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
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-slate-700">{t('auth.password')}</label>
                <a
                  href="/forgot-password"
                  className="text-sm text-emerald-600 hover:text-emerald-700"
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
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all pe-10"
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
                className="h-4 w-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
              />
              <label htmlFor="remember" className="text-sm text-slate-600">
                {t('auth.rememberMe')}
              </label>
            </div>

            <Button
              type="submit"
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-2.5"
              disabled={isLoading}
            >
              {isLoading ? t('auth.signingIn') : t('auth.signIn')}
            </Button>
          </form>

          {/* Dev Mode: Mode Toggle and Role Simulation */}
          {isDev && (
            <div className="border-t pt-6">
              {/* Role Simulation */}
              <div className="text-center mb-4">
                <span className="text-xs text-slate-400">{t('auth.simulateRole')}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {contractorRoles.map((role) => (
                  <button
                    key={role}
                    onClick={() => handleRoleSimulation(role)}
                    className="p-3 border border-slate-200 rounded-lg hover:border-emerald-500 hover:bg-emerald-50 transition-all text-start"
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 bg-emerald-100 rounded flex items-center justify-center text-emerald-600 text-xs font-bold">
                        ק
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-700">
                          {ROLE_DISPLAY_NAMES[role][isHebrew ? 'he' : 'en']}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {ROLE_DESCRIPTIONS[role][isHebrew ? 'he' : 'en']}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}

                {clientRoles.map((role) => (
                  <button
                    key={role}
                    onClick={() => handleRoleSimulation(role)}
                    className="p-3 border border-slate-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-start"
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 bg-blue-100 rounded flex items-center justify-center text-blue-600 text-xs font-bold">
                        מ
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-700">
                          {ROLE_DISPLAY_NAMES[role][isHebrew ? 'he' : 'en']}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {ROLE_DESCRIPTIONS[role][isHebrew ? 'he' : 'en']}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}

                <button
                  onClick={() => handleRoleSimulation('system_admin')}
                  className="p-3 border border-slate-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all text-start col-span-2"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 bg-purple-100 rounded flex items-center justify-center text-purple-600 text-xs font-bold">
                      מ
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-700">
                        {ROLE_DISPLAY_NAMES['system_admin'][isHebrew ? 'he' : 'en']}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {ROLE_DESCRIPTIONS['system_admin'][isHebrew ? 'he' : 'en']}
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
