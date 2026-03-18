/**
 * BOQ Item Form Sheet
 *
 * Slide-out drawer for creating and editing BOQ items.
 * Features:
 * - Create/Edit mode handling
 * - Parent item selection
 * - Quantity and price inputs
 * - Validation
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X, Trash2, AlertTriangle, Hash, FileText, Ruler } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import type { BOQItem, CreateBOQItemInput, UpdateBOQItemInput } from '../hooks/use-boq';

interface BOQItemFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  item?: BOQItem | null;
  parentItems?: BOQItem[]; // Flat list of possible parent items
  onSave?: (data: CreateBOQItemInput | UpdateBOQItemInput, isEdit: boolean) => Promise<void>;
  onDelete?: (itemId: string) => Promise<void>;
}

const DEFAULT_ITEM: Omit<CreateBOQItemInput, 'projectId'> = {
  code: '',
  description: '',
  unit: null,
  contractQuantity: null,
  unitPriceCents: null,
  parentId: null,
};

// Common construction units
const COMMON_UNITS = ['m', 'm²', 'm³', 'kg', 'ton', 'unit', 'L.S.', 'day', 'hour'];

export function BOQItemFormSheet({
  open,
  onOpenChange,
  projectId,
  item,
  parentItems = [],
  onSave,
  onDelete,
}: BOQItemFormSheetProps) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const isEditMode = !!item?.id;

  // Form state
  const [formData, setFormData] = useState<Omit<CreateBOQItemInput, 'projectId'>>(DEFAULT_ITEM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const deleteConfirmRef = useRef<HTMLDivElement>(null);

  // Filter out the current item and its children from possible parents
  const availableParents = useMemo(() => {
    if (!item?.id) return parentItems;

    const excludeIds = new Set<string>();
    excludeIds.add(item.id);

    // Recursively collect all children IDs
    const collectChildIds = (parentId: string) => {
      parentItems.forEach((p) => {
        if (p.parentId === parentId) {
          excludeIds.add(p.id);
          collectChildIds(p.id);
        }
      });
    };
    collectChildIds(item.id);

    return parentItems.filter((p) => !excludeIds.has(p.id));
  }, [parentItems, item?.id]);

  // Helper to select all text on focus
  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
    setTimeout(() => e.target.select(), 0);
  };

  const handleInputMouseUp = (e: React.MouseEvent<HTMLInputElement>) => {
    e.preventDefault();
  };

  useEffect(() => {
    if (open) {
      if (item) {
        setFormData({
          code: item.code,
          description: item.description,
          unit: item.unit,
          contractQuantity: item.contractQuantity,
          unitPriceCents: item.unitPriceCents,
          parentId: item.parentId,
        });
      } else {
        setFormData(DEFAULT_ITEM);
      }
      setShowDeleteConfirm(false);
      setError(null);
      setValidationErrors({});
    }
  }, [item, open]);

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

    if (!formData.code || formData.code.trim().length === 0) {
      errors.code = t('boq.validation.codeRequired');
    }

    if (!formData.description || formData.description.trim().length === 0) {
      errors.description = t('boq.validation.descriptionRequired');
    }

    if (formData.contractQuantity != null && formData.contractQuantity < 0) {
      errors.quantity = t('boq.validation.quantityPositive');
    }

    if (formData.unitPriceCents != null && formData.unitPriceCents < 0) {
      errors.unitPrice = t('boq.validation.pricePositive');
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
        const apiData: CreateBOQItemInput | UpdateBOQItemInput = isEditMode
          ? {
              code: formData.code,
              description: formData.description,
              unit: formData.unit,
              contractQuantity: formData.contractQuantity,
              unitPriceCents: formData.unitPriceCents,
              parentId: formData.parentId,
            }
          : {
              projectId,
              code: formData.code,
              description: formData.description,
              unit: formData.unit,
              contractQuantity: formData.contractQuantity,
              unitPriceCents: formData.unitPriceCents,
              parentId: formData.parentId,
            };

        await onSave(apiData, isEditMode);
      }
      handleClose();
    } catch (err: unknown) {
      const errorMessage = (err as Error).message || t('boq.import.error');
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!item?.id || !onDelete) return;
    setIsSubmitting(true);

    try {
      await onDelete(item.id);
      handleClose();
    } catch (err) {
      setError((err as Error).message || t('boq.import.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateField = <K extends keyof Omit<CreateBOQItemInput, 'projectId'>>(
    field: K,
    value: Omit<CreateBOQItemInput, 'projectId'>[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (validationErrors[field]) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  // Calculate total price for display
  const totalPrice =
    formData.contractQuantity != null && formData.unitPriceCents != null
      ? Math.round(formData.contractQuantity * formData.unitPriceCents)
      : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isRTL ? 'left' : 'right'}
        className="w-full sm:max-w-lg p-0 flex flex-col"
        hideCloseButton
      >
        {/* Header - Teal gradient for BOQ */}
        <div className="bg-gradient-to-r from-teal-500 to-cyan-500 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex-1" />
            <div className="text-center">
              <h2 className="text-xl font-bold">
                {isEditMode ? t('boq.item.edit') : t('boq.item.create')}
              </h2>
              <p className="text-teal-100 text-sm mt-0.5">
                {isEditMode
                  ? t('boq.item.editSubtitle', 'Update item details')
                  : t('boq.item.createSubtitle', 'Add a new BOQ item')}
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

            {/* Code and Parent */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Code */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  <Hash className="h-4 w-4 inline me-1" />
                  {t('boq.item.code')} *
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => updateField('code', e.target.value)}
                  required
                  placeholder="1.1.1"
                  className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none text-sm font-mono ${
                    validationErrors.code ? 'border-red-300' : 'border-slate-300'
                  }`}
                />
                {validationErrors.code && (
                  <p className="text-xs text-red-500 mt-1">{validationErrors.code}</p>
                )}
              </div>

              {/* Parent Item */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('boq.item.parent')}
                </label>
                <select
                  value={formData.parentId || ''}
                  onChange={(e) => updateField('parentId', e.target.value || null)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none text-sm bg-white"
                >
                  <option value="">{t('boq.item.noParent')}</option>
                  {availableParents.map((parent) => (
                    <option key={parent.id} value={parent.id}>
                      {parent.code} - {parent.description.slice(0, 30)}
                      {parent.description.length > 30 ? '...' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                <FileText className="h-4 w-4 inline me-1" />
                {t('boq.item.description')} *
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => updateField('description', e.target.value)}
                required
                rows={3}
                placeholder={t('boq.item.descriptionPlaceholder', 'Enter item description')}
                className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none text-sm resize-none ${
                  validationErrors.description ? 'border-red-300' : 'border-slate-300'
                }`}
              />
              {validationErrors.description && (
                <p className="text-xs text-red-500 mt-1">{validationErrors.description}</p>
              )}
            </div>

            {/* Unit and Quantity */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Unit */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  <Ruler className="h-4 w-4 inline me-1" />
                  {t('boq.item.unit')}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    list="unit-suggestions"
                    value={formData.unit || ''}
                    onChange={(e) => updateField('unit', e.target.value || null)}
                    placeholder="m²"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none text-sm"
                  />
                  <datalist id="unit-suggestions">
                    {COMMON_UNITS.map((unit) => (
                      <option key={unit} value={unit} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Contract Quantity */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('boq.item.quantity')}
                </label>
                <input
                  type="number"
                  value={formData.contractQuantity ?? ''}
                  onChange={(e) =>
                    updateField(
                      'contractQuantity',
                      e.target.value ? parseFloat(e.target.value) : null
                    )
                  }
                  onFocus={handleInputFocus}
                  onMouseUp={handleInputMouseUp}
                  min={0}
                  step="0.0001"
                  placeholder="0"
                  className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none text-sm ${
                    validationErrors.quantity ? 'border-red-300' : 'border-slate-300'
                  }`}
                />
                {validationErrors.quantity && (
                  <p className="text-xs text-red-500 mt-1">{validationErrors.quantity}</p>
                )}
              </div>
            </div>

            {/* Unit Price */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('boq.item.unitPrice')}
              </label>
              <div className="relative">
                <span className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400">₪</span>
                <input
                  type="number"
                  value={formData.unitPriceCents != null ? formData.unitPriceCents / 100 : ''}
                  onChange={(e) =>
                    updateField(
                      'unitPriceCents',
                      e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null
                    )
                  }
                  onFocus={handleInputFocus}
                  onMouseUp={handleInputMouseUp}
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  className={`w-full ps-8 pe-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none text-sm ${
                    validationErrors.unitPrice ? 'border-red-300' : 'border-slate-300'
                  }`}
                />
              </div>
              {validationErrors.unitPrice && (
                <p className="text-xs text-red-500 mt-1">{validationErrors.unitPrice}</p>
              )}
            </div>

            {/* Total Price (Calculated) */}
            {totalPrice !== null && (
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-teal-700">
                    {t('boq.item.totalPrice')}
                  </span>
                  <span className="text-lg font-bold font-mono text-teal-800">
                    {new Intl.NumberFormat('he-IL', {
                      style: 'currency',
                      currency: 'ILS',
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    }).format(totalPrice / 100)}
                  </span>
                </div>
                <p className="text-xs text-teal-600 mt-1">
                  {formData.contractQuantity} × ₪{((formData.unitPriceCents || 0) / 100).toFixed(2)}
                </p>
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
                    <p className="text-sm text-red-700 font-medium">
                      {t('boq.item.deleteConfirm')}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowDeleteConfirm(false)}
                      >
                        {t('common.cancel')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleDelete}
                        disabled={isSubmitting}
                        className="bg-red-500 hover:bg-red-600"
                      >
                        {t('common.delete')}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex justify-between">
            {isEditMode && !showDeleteConfirm && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleShowDeleteConfirm}
                className="text-red-500 hover:text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4 me-2" />
                {t('boq.item.delete')}
              </Button>
            )}
            {!isEditMode && <div />}
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={handleClose}>
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !formData.code || !formData.description}
                className="bg-teal-500 hover:bg-teal-600"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin me-2" />
                    {t('common.saving')}
                  </>
                ) : isEditMode ? (
                  t('common.save')
                ) : (
                  t('boq.item.create')
                )}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export default BOQItemFormSheet;
