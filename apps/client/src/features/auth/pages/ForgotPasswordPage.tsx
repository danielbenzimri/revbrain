import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getAuthAdapter } from '@/lib/services';

export default function ForgotPasswordPage() {
  const { t, i18n } = useTranslation();
  const isHebrew = i18n.language === 'he';

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await getAuthAdapter().resetPassword(email);
      setSent(true);
    } catch {
      // Always show success to avoid revealing if email exists
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-slate-100 p-4"
        dir={isHebrew ? 'rtl' : 'ltr'}
      >
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 text-center space-y-4">
          <div className="mx-auto w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center">
            <CheckCircle2 className="h-7 w-7 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{t('auth.checkEmail')}</h1>
          <p className="text-slate-500 text-sm">{t('auth.resetEmailSent', { email })}</p>
          <a
            href="/login"
            className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700 font-medium mt-4"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('auth.backToSignIn')}
          </a>
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
        <a
          href="/login"
          className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('auth.backToSignIn')}
        </a>

        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('auth.resetPassword')}</h1>
          <p className="text-slate-500 mt-2 text-sm">{t('auth.resetDescription')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>}

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">{t('auth.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              required
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
            />
          </div>

          <Button
            type="submit"
            disabled={loading || !email}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-2.5"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin me-2" />
                {t('auth.sending')}
              </>
            ) : (
              <>
                <Mail className="h-4 w-4 me-2" />
                {t('auth.sendResetLink')}
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
