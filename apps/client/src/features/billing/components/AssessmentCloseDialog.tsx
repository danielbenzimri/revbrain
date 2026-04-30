/**
 * Assessment Close Dialog
 *
 * SI closes a project as assessment-only. Requires a reason.
 *
 * Task: P5.4
 * Refs: SI-BILLING-SPEC.md §4, §5
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCloseAssessment } from '../hooks/use-partner-billing';

const CLOSE_REASONS = [
  'client_not_proceeding',
  'budget_constraints',
  'timeline_mismatch',
  'competitive_solution',
  'other',
] as const;

export function AssessmentCloseDialog({
  agreementId,
  onClose,
  onClosed,
}: {
  agreementId: string;
  onClose: () => void;
  onClosed?: () => void;
}) {
  const { t } = useTranslation('billing');
  const closeMutation = useCloseAssessment();
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return;

    try {
      await closeMutation.mutateAsync({ id: agreementId, reason, notes: notes || undefined });
      onClosed?.();
      onClose();
    } catch {
      // handled by mutation
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6"
        data-testid="assessment-close-dialog"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">
            {t('closeAssessment.title', 'Close as Assessment Only')}
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-sm text-slate-600 mb-4">
          {t(
            'closeAssessment.description',
            'This will close the project as assessment-only. No migration fees will apply.'
          )}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('closeAssessment.reason', 'Reason')} *
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none"
              data-testid="close-reason-select"
              required
            >
              <option value="">{t('closeAssessment.selectReason', 'Select a reason...')}</option>
              {CLOSE_REASONS.map((r) => (
                <option key={r} value={r}>
                  {t(`closeAssessment.reasons.${r}`, r.replace(/_/g, ' '))}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('closeAssessment.notes', 'Additional Notes (optional)')}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none resize-none"
              placeholder={t('closeAssessment.notesPlaceholder', 'Any additional context...')}
              data-testid="close-notes-input"
            />
          </div>

          {closeMutation.isError && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
              {t('closeAssessment.failed', 'Failed to close. Please try again.')}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('proceedMigration.cancel', 'Cancel')}
            </Button>
            <Button
              type="submit"
              disabled={!reason || closeMutation.isPending}
              className="bg-amber-500 hover:bg-amber-600 text-white"
              data-testid="confirm-close-btn"
            >
              {closeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
              {t('closeAssessment.confirm', 'Close Assessment')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
