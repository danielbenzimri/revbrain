/**
 * Proceed to Migration Dialog
 *
 * Form where SI enters declared project value and uploads SOW.
 * For <=500K: navigates to Variant B review page.
 * For >500K: shows "under admin review" state.
 *
 * Task: P5.1b
 * Refs: SI-BILLING-SPEC.md §4, §12.2.2
 */
import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Loader2, Upload, FileText, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProceedToMigration, formatCurrency } from '../hooks/use-partner-billing';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/webp',
];
const SMALL_DEAL_THRESHOLD_CENTS = 50_000_000; // $500K

function isValidFileType(file: File): boolean {
  return ALLOWED_TYPES.includes(file.type);
}

export function ProceedToMigrationDialog({
  agreementId,
  onClose,
}: {
  agreementId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation('billing');
  const navigate = useNavigate();
  const proceedMutation = useProceedToMigration();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [valueDollars, setValueDollars] = useState('');
  const [sowFile, setSowFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [showPendingReview, setShowPendingReview] = useState(false);

  const valueCents = Math.round(parseFloat(valueDollars || '0') * 100);
  const isSmallDeal = valueCents <= SMALL_DEAL_THRESHOLD_CENTS;
  const isValid = valueCents > 0;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);

    if (!isValidFileType(file)) {
      setFileError(
        t('proceedMigration.invalidFileType', 'Only PDF, DOCX, and image files are allowed.')
      );
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError(t('proceedMigration.fileTooLarge', 'File must be under 25MB.'));
      return;
    }
    setSowFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    try {
      const result = await proceedMutation.mutateAsync({
        id: agreementId,
        declaredProjectValue: valueCents,
      });

      if (isSmallDeal) {
        // Navigate to Variant B review page
        navigate(`/billing/agreements/${agreementId}/review`);
      } else {
        // >$500K — show "under review" state
        setShowPendingReview(true);
        // result is stored server-side, status changes to migration_pending_review
        void result;
      }
    } catch {
      // handled by mutation
    }
  };

  if (showPendingReview) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div
          className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6"
          data-testid="pending-review-dialog"
        >
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <h3 className="text-lg font-semibold text-slate-900">
              {t('proceedMigration.underReviewTitle', 'Under Admin Review')}
            </h3>
          </div>
          <p className="text-sm text-slate-600 mb-4">
            {t(
              'proceedMigration.underReviewMessage',
              "Your declared project value of {{amount}} is being reviewed by our team. We'll email you when migration terms are ready to accept.",
              { amount: formatCurrency(valueCents) }
            )}
          </p>
          <div className="flex justify-end">
            <Button onClick={onClose}>{t('proceedMigration.understood', 'Understood')}</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6"
        data-testid="proceed-migration-dialog"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">
            {t('proceedMigration.title', 'Proceed to Migration')}
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Project Value */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('proceedMigration.declaredValue', 'Declared Project Value (USD)')}
            </label>
            <div className="relative">
              <span className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                $
              </span>
              <input
                type="number"
                min="1"
                step="1"
                value={valueDollars}
                onChange={(e) => setValueDollars(e.target.value)}
                placeholder="3,000,000"
                className="w-full ps-7 pe-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none text-sm"
                data-testid="project-value-input"
                required
              />
            </div>
            {valueCents > 0 && (
              <p className="text-xs text-slate-500 mt-1">
                {isSmallDeal
                  ? t('proceedMigration.smallDealHint', 'Terms will be computed immediately.')
                  : t(
                      'proceedMigration.largeDealHint',
                      'Values over $500,000 require admin review.'
                    )}
              </p>
            )}
          </div>

          {/* SOW Upload */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('proceedMigration.sowUpload', 'Upload SOW (optional)')}
            </label>
            {sowFile ? (
              <div className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg bg-slate-50">
                <FileText className="h-5 w-5 text-violet-500 shrink-0" />
                <span className="text-sm text-slate-700 truncate flex-1">{sowFile.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSowFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div
                className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center cursor-pointer hover:border-violet-300 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                data-testid="sow-dropzone"
              >
                <Upload className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">
                  {t('proceedMigration.dropzoneText', 'Click to upload PDF, DOCX, or image')}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {t('proceedMigration.maxSize', 'Max 25MB')}
                </p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={handleFileChange}
            />
            {fileError && <p className="text-xs text-red-500 mt-1">{fileError}</p>}
          </div>

          {proceedMutation.isError && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
              {t('proceedMigration.submitFailed', 'Failed to submit. Please try again.')}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('proceedMigration.cancel', 'Cancel')}
            </Button>
            <Button
              type="submit"
              disabled={!isValid || proceedMutation.isPending}
              className="bg-violet-500 hover:bg-violet-600 text-white"
              data-testid="submit-proceed-btn"
            >
              {proceedMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
              {isSmallDeal
                ? t('proceedMigration.reviewTerms', 'Review Terms')
                : t('proceedMigration.submitForReview', 'Submit for Review')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
