import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Eye } from 'lucide-react';
import { getAuthHeaders } from '@/lib/auth-headers';
import { useImpersonationStore } from '@/stores/impersonation-store';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

interface ImpersonationReasonSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant: { id: string; name: string } | null;
}

export function ImpersonationReasonSheet({
  open,
  onOpenChange,
  tenant,
}: ImpersonationReasonSheetProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const startImpersonation = useImpersonationStore((s) => s.startImpersonation);
  const isHebrew = i18n.language === 'he';

  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError(t('admin.impersonation.reasonRequired'));
      return;
    }
    if (!tenant) return;

    setError('');
    setIsSubmitting(true);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/admin/impersonate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          targetOrgId: tenant.id,
          reason: trimmed,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error?.message || 'Failed to start impersonation');
      }

      const result = await response.json();
      const { token, expiresAt, impersonatedUser, mode } = result.data ?? result;

      startImpersonation({
        token,
        expiresAt,
        user: {
          id: impersonatedUser.id,
          name: impersonatedUser.name,
          email: impersonatedUser.email,
          orgName: tenant.name,
        },
        reason: trimmed,
        mode,
      });

      onOpenChange(false);
      setReason('');
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (val: boolean) => {
    if (!val) {
      setReason('');
      setError('');
    }
    onOpenChange(val);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side={isHebrew ? 'left' : 'right'} className="overflow-y-auto">
        <SheetHeader className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-8 w-8 bg-violet-100 text-violet-600 rounded-lg flex items-center justify-center">
              <Eye className="h-4 w-4" />
            </div>
            <SheetTitle>{t('admin.impersonation.dialogTitle')}</SheetTitle>
          </div>
          <SheetDescription>{t('admin.impersonation.dialogSubtitle')}</SheetDescription>
          {tenant && <p className="text-sm font-medium text-slate-900 mt-2">{tenant.name}</p>}
        </SheetHeader>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('admin.impersonation.reasonLabel')}
            </label>
            <Textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError('');
              }}
              placeholder={t('admin.impersonation.reasonPlaceholder')}
              rows={3}
            />
            {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
          </div>

          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full bg-violet-500 hover:bg-violet-600"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 me-2 animate-spin" />
            ) : (
              <Eye className="h-4 w-4 me-2" />
            )}
            {t('admin.impersonation.startSession')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
