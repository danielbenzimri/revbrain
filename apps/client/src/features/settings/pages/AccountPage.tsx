import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDeleteAccount } from '../hooks';
import { useAuthStore } from '@/stores/auth-store';

export default function AccountPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const deleteAccount = useDeleteAccount();
  const logout = useAuthStore((s) => s.logout);

  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isConfirmed = confirmation === 'DELETE';

  const handleDelete = async () => {
    setError(null);

    try {
      await deleteAccount.mutateAsync();
      logout();
      navigate('/login', { replace: true });
    } catch {
      setError(t('settings.account.deleteFailed'));
    }
  };

  return (
    <div className="max-w-2xl">
      {/* Danger Zone */}
      <div className="border-2 border-red-200 rounded-xl overflow-hidden">
        <div className="bg-red-50 px-6 py-4 border-b border-red-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h2 className="text-lg font-semibold text-red-900">
              {t('settings.account.dangerZone')}
            </h2>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <h3 className="font-medium text-slate-900">{t('settings.account.deleteTitle')}</h3>
            <p className="text-sm text-slate-500 mt-1">{t('settings.account.deleteDescription')}</p>
          </div>

          <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
            <li>{t('settings.account.deleteWarning1')}</li>
            <li>{t('settings.account.deleteWarning2')}</li>
            <li>{t('settings.account.deleteWarning3')}</li>
          </ul>

          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('settings.account.typeDelete')}
            </label>
            <input
              type="text"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder="DELETE"
              className="w-full max-w-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none text-sm font-mono"
            />
          </div>

          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!isConfirmed || deleteAccount.isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            {deleteAccount.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin me-2" />
                {t('settings.account.deleting')}
              </>
            ) : (
              t('settings.account.deleteButton')
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
