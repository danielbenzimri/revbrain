/**
 * Bill Form Sheet
 *
 * Slide-out drawer for creating and editing execution bills.
 * Features:
 * - Create/Edit mode handling
 * - Period date selection
 * - Remarks field
 * - Validation
 */
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X, Trash2, AlertTriangle, Calendar, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import type { Bill, CreateBillInput, UpdateBillInput } from '../hooks/use-execution-bills';

interface BillFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  bill?: Bill | null;
  onSave?: (data: CreateBillInput | UpdateBillInput, isEdit: boolean) => Promise<void>;
  onDelete?: (billId: string) => Promise<void>;
}

interface FormData {
  periodStart: string;
  periodEnd: string;
  remarks: string;
}

const DEFAULT_FORM: FormData = {
  periodStart: '',
  periodEnd: '',
  remarks: '',
};

function formatDateForInput(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toISOString().split('T')[0];
}

export function BillFormSheet({
  open,
  onOpenChange,
  projectId,
  bill,
  onSave,
  onDelete,
}: BillFormSheetProps) {
  const { t, i18n } = useTranslation('execution');
  const { t: tc } = useTranslation();
  const isRTL = i18n.language === 'he';
  const isEditMode = !!bill?.id;

  // Form state
  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const deleteConfirmRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      if (bill) {
        setFormData({
          periodStart: formatDateForInput(bill.periodStart),
          periodEnd: formatDateForInput(bill.periodEnd),
          remarks: bill.remarks || '',
        });
      } else {
        // Default to current month for new bills
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        setFormData({
          periodStart: firstDay.toISOString().split('T')[0],
          periodEnd: lastDay.toISOString().split('T')[0],
          remarks: '',
        });
      }
      setShowDeleteConfirm(false);
      setError(null);
      setValidationErrors({});
    }
  }, [bill, open]);

  const handleClose = () => {
    setShowDeleteConfirm(false);
    onOpenChange(false);
  };

  const handleShowDeleteConfirm = () => {
    setShowDeleteConfirm(true);
    setTimeout(() => {
      deleteConfirmRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    // End date must be after or equal to start date
    if (formData.periodStart && formData.periodEnd) {
      if (new Date(formData.periodEnd) < new Date(formData.periodStart)) {
        errors.periodEnd = t('validation.periodRequired');
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (onSave) {
        const apiData: CreateBillInput | UpdateBillInput = isEditMode
          ? {
              periodStart: formData.periodStart || null,
              periodEnd: formData.periodEnd || null,
              remarks: formData.remarks || null,
            }
          : {
              projectId,
              periodStart: formData.periodStart || null,
              periodEnd: formData.periodEnd || null,
              remarks: formData.remarks || null,
            };

        await onSave(apiData, isEditMode);
      }
      handleClose();
    } catch (err: unknown) {
      const errorMessage = (err as Error).message || t('notifications.created');
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!bill?.id || !onDelete) return;
    setIsSubmitting(true);

    try {
      await onDelete(bill.id);
      handleClose();
    } catch (err) {
      setError((err as Error).message || tc('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (validationErrors[field]) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isRTL ? 'left' : 'right'}
        className="w-full sm:max-w-lg p-0 flex flex-col"
        hideCloseButton
      >
        {/* Header - Emerald gradient for execution */}
        <div className="bg-gradient-to-r from-emerald-500 to-green-500 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex-1" />
            <div className="text-center">
              <h2 className="text-xl font-bold">{isEditMode ? t('actions.edit') : t('create')}</h2>
              <p className="text-emerald-100 text-sm mt-0.5">
                {isEditMode ? t('bill.title', { number: bill?.billNumber }) : t('subtitle')}
              </p>
            </div>
            <div className="flex-1 flex justify-end">
              <button
                onClick={handleClose}
                className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {error}
              </div>
            )}

            {/* Billing Period */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {t('bill.period')}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5">
                    {t('bill.periodStart')}
                  </label>
                  <input
                    type="date"
                    value={formData.periodStart}
                    onChange={(e) => updateField('periodStart', e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5">
                    {t('bill.periodEnd')}
                  </label>
                  <input
                    type="date"
                    value={formData.periodEnd}
                    onChange={(e) => updateField('periodEnd', e.target.value)}
                    className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm ${
                      validationErrors.periodEnd ? 'border-red-300' : 'border-slate-300'
                    }`}
                  />
                  {validationErrors.periodEnd && (
                    <p className="text-xs text-red-500 mt-1">{validationErrors.periodEnd}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Remarks */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                <FileText className="h-4 w-4 inline me-1" />
                {t('bill.remarks')}
              </label>
              <textarea
                value={formData.remarks}
                onChange={(e) => updateField('remarks', e.target.value)}
                rows={4}
                placeholder={t('bill.remarks')}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm resize-none"
              />
            </div>

            {/* Info box for new bills */}
            {!isEditMode && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <p className="text-sm text-emerald-700">{t('emptyDescription')}</p>
              </div>
            )}

            {/* Delete confirmation */}
            {isEditMode && showDeleteConfirm && (
              <div
                ref={deleteConfirmRef}
                className="bg-red-50 border border-red-200 rounded-lg p-4"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-red-700 font-medium">{t('actions.submitConfirm')}</p>
                    <div className="flex gap-2 mt-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowDeleteConfirm(false)}
                      >
                        {tc('common.cancel')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleDelete}
                        disabled={isSubmitting}
                        className="bg-red-500 hover:bg-red-600"
                      >
                        {tc('common.delete')}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex justify-between">
            {isEditMode && !showDeleteConfirm && bill?.status === 'draft' && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleShowDeleteConfirm}
                className="text-red-500 hover:text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4 me-2" />
                {t('actions.delete')}
              </Button>
            )}
            {(!isEditMode || bill?.status !== 'draft') && <div />}
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={handleClose}>
                {tc('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-emerald-500 hover:bg-emerald-600"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin me-2" />
                    {tc('common.saving')}
                  </>
                ) : isEditMode ? (
                  tc('common.save')
                ) : (
                  t('create')
                )}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export default BillFormSheet;
