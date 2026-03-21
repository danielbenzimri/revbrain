import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useImpersonationStore } from '@/stores/impersonation-store';
import { getAuthHeaders } from '@/lib/auth-headers';
import { Button } from '@/components/ui/button';
import { Eye, X } from 'lucide-react';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

function formatCountdown(expiresAt: string): string {
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return '00:00';
  const totalSeconds = Math.floor(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function ImpersonationBanner() {
  const { t } = useTranslation();
  const { isImpersonating, impersonatedUser, reason, mode, expiresAt, endImpersonation } =
    useImpersonationStore();
  const [countdown, setCountdown] = useState(() => (expiresAt ? formatCountdown(expiresAt) : ''));

  useEffect(() => {
    if (!isImpersonating || !expiresAt) return;

    const interval = setInterval(() => {
      const remaining = new Date(expiresAt).getTime() - Date.now();
      if (remaining <= 0) {
        clearInterval(interval);
        endImpersonation();
        return;
      }
      setCountdown(formatCountdown(expiresAt));
    }, 1000);

    return () => clearInterval(interval);
  }, [isImpersonating, expiresAt, endImpersonation]);

  if (!isImpersonating || !impersonatedUser) return null;

  const handleEndSession = async () => {
    try {
      const headers = await getAuthHeaders();
      await fetch(`${apiUrl}/v1/admin/end-impersonation`, {
        method: 'POST',
        headers,
      });
    } catch {
      // End locally even if server call fails
    }
    endImpersonation();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-gradient-to-r from-violet-600 to-purple-700 text-white px-4 py-2 flex items-center justify-center gap-3 text-sm font-medium z-50 shrink-0"
    >
      <Eye className="h-4 w-4 shrink-0" />

      <span>
        {t('admin.impersonation.banner.viewingAs')} <strong>{impersonatedUser.orgName}</strong>{' '}
        &mdash; {impersonatedUser.name}
      </span>

      <span className="text-violet-200">|</span>

      {mode === 'read_only' && (
        <>
          <span className="bg-white/20 px-2 py-0.5 rounded text-xs">
            {t('admin.impersonation.banner.readOnly')}
          </span>
          <span className="text-violet-200">|</span>
        </>
      )}

      <span className="text-violet-100">
        {t('admin.impersonation.banner.reason')}: {reason}
      </span>

      <span className="text-violet-200">|</span>

      <span className="tabular-nums">
        {t('admin.impersonation.banner.expiresIn')} {countdown}
      </span>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleEndSession}
        className="ms-2 h-7 text-white hover:bg-white/20 hover:text-white border border-white/30 text-xs gap-1"
      >
        <X className="h-3 w-3" />
        {t('admin.impersonation.banner.endSession')}
      </Button>
    </div>
  );
}
