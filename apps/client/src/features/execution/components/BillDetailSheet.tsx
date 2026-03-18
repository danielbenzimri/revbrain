/**
 * Bill Detail Sheet
 *
 * Slide-out drawer for viewing execution bill details including:
 * - Bill metadata and status
 * - Items table with measurements
 * - Signature capture and display
 * - Workflow action buttons
 * - Export functionality
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  X,
  Edit,
  XCircle,
  RotateCcw,
  Download,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  FileText,
  PenTool,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast-utils';
import {
  useBill,
  useSubmitBill,
  useStartReview,
  useApproveBill,
  useRejectBill,
  useReopenBill,
  useDeleteBillItem,
  useExportBill,
  type BillStatus,
  type BillItem,
} from '../hooks/use-execution-bills';
import { useSignatureUpload } from '../hooks/use-signature';
import { useBillPermissions } from '../hooks/use-bill-permissions';
import { SignaturePad } from './SignaturePad';
import { BillStatusTimeline } from './BillStatusTimeline';

interface BillDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billId: string | null;
  onEdit?: () => void;
  onAddItems?: () => void;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('he-IL', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getStatusColor(status: BillStatus): string {
  switch (status) {
    case 'draft':
      return 'bg-slate-100 text-slate-700';
    case 'submitted':
      return 'bg-blue-100 text-blue-700';
    case 'under_review':
      return 'bg-amber-100 text-amber-700';
    case 'approved':
      return 'bg-green-100 text-green-700';
    case 'rejected':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

export function BillDetailSheet({
  open,
  onOpenChange,
  billId,
  onEdit,
  onAddItems,
}: BillDetailSheetProps) {
  const { t, i18n } = useTranslation('execution');
  const { t: tc } = useTranslation();
  const isRTL = i18n.language === 'he';

  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [signaturePadOpen, setSignaturePadOpen] = useState(false);
  const [signatureType, setSignatureType] = useState<'contractor' | 'inspector'>('contractor');

  const { data: bill, isLoading, refetch } = useBill(billId || undefined);

  // Get permissions based on user role and bill status
  const permissions = useBillPermissions(bill?.status);

  const submitMutation = useSubmitBill();
  const startReviewMutation = useStartReview();
  const approveMutation = useApproveBill();
  const rejectMutation = useRejectBill();
  const reopenMutation = useReopenBill();
  const deleteItemMutation = useDeleteBillItem();
  const exportMutation = useExportBill();
  const signatureUpload = useSignatureUpload();

  const handleClose = () => {
    setShowRejectForm(false);
    setRejectReason('');
    onOpenChange(false);
  };

  const toggleItem = (itemId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleAction = async (
    action: string,
    fn: () => Promise<unknown>,
    successMessage?: string,
    errorMessage?: string
  ) => {
    setActionLoading(action);
    try {
      await fn();
      if (successMessage) {
        toast.success(successMessage);
      }
    } catch (err) {
      const message = errorMessage || (err as Error).message || t('toast.error');
      toast.error(message);
    } finally {
      setActionLoading(null);
    }
  };

  // Open signature pad for contractor (before submit)
  const handleRequestContractorSignature = () => {
    setSignatureType('contractor');
    setSignaturePadOpen(true);
  };

  // Open signature pad for inspector (before approve)
  const handleRequestInspectorSignature = () => {
    setSignatureType('inspector');
    setSignaturePadOpen(true);
  };

  // Handle signature capture from pad
  const handleSignatureSave = async (dataUrl: string) => {
    if (!billId) return;

    setActionLoading('signature');
    try {
      // Upload signature to storage
      const result = await signatureUpload.mutateAsync({
        entityType: 'bill',
        entityId: billId,
        dataUrl,
      });

      setSignaturePadOpen(false);

      // Perform the appropriate workflow action
      if (signatureType === 'contractor') {
        await submitMutation.mutateAsync({
          id: billId,
          contractorSignatureUrl: result.url,
        });
        toast.success(t('toast.submitted'));
      } else {
        await approveMutation.mutateAsync({
          id: billId,
          inspectorSignatureUrl: result.url,
        });
        toast.success(t('toast.approved'));
      }

      // Refetch bill to show updated signatures
      await refetch();
    } catch (err) {
      const message = (err as Error).message || t('toast.error');
      toast.error(message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleStartReview = () =>
    handleAction(
      'review',
      () => startReviewMutation.mutateAsync(billId!),
      t('toast.reviewStarted'),
      t('toast.reviewError')
    );

  const handleReject = () =>
    handleAction(
      'reject',
      async () => {
        await rejectMutation.mutateAsync({ id: billId!, reason: rejectReason });
        setShowRejectForm(false);
        setRejectReason('');
      },
      t('toast.rejected'),
      t('toast.rejectError')
    );

  const handleReopen = () =>
    handleAction(
      'reopen',
      () => reopenMutation.mutateAsync(billId!),
      t('toast.reopened'),
      t('toast.reopenError')
    );

  const handleExport = () =>
    handleAction(
      'export',
      () => exportMutation.mutateAsync({ billId: billId!, billNumber: bill?.billNumber }),
      t('toast.exported'),
      t('toast.exportError')
    );

  const handleDeleteItem = (item: BillItem) =>
    handleAction(
      `delete-${item.id}`,
      () => deleteItemMutation.mutateAsync({ itemId: item.id, billId: billId! }),
      t('toast.itemDeleted'),
      t('toast.itemDeleteError')
    );

  if (!billId) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isRTL ? 'left' : 'right'}
        className="w-full sm:max-w-2xl p-0 flex flex-col"
        hideCloseButton
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-green-500 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex-1" />
            <div className="text-center">
              <h2 className="text-xl font-bold">
                {bill ? t('bill.title', { number: bill.billNumber }) : t('title')}
              </h2>
              {bill && (
                <Badge className={`${getStatusColor(bill.status)} mt-2`}>
                  {t(`status.${bill.status}`)}
                </Badge>
              )}
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
            </div>
          ) : bill ? (
            <div className="p-6 space-y-6">
              {/* Bill Info */}
              <div className="bg-white rounded shadow-sm p-4 space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500">{t('bill.period')}</p>
                    <p className="text-sm font-medium">
                      {bill.periodStart && bill.periodEnd
                        ? `${formatDate(bill.periodStart)} - ${formatDate(bill.periodEnd)}`
                        : formatDate(bill.periodStart) || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">{t('bill.createdAt')}</p>
                    <p className="text-sm font-medium">{formatDate(bill.createdAt)}</p>
                  </div>
                </div>
                {bill.remarks && (
                  <div>
                    <p className="text-xs text-slate-500">{t('bill.remarks')}</p>
                    <p className="text-sm">{bill.remarks}</p>
                  </div>
                )}
                {bill.rejectionReason && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-xs text-red-500 font-medium">{t('actions.rejectReason')}</p>
                    <p className="text-sm text-red-700">{bill.rejectionReason}</p>
                  </div>
                )}
              </div>

              {/* Financial Summary */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-emerald-600">{t('bill.subtotal')}</p>
                    <p className="text-lg font-bold font-mono text-emerald-800">
                      {formatCurrency(bill.subtotalCents)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-emerald-600">{t('bill.discount')}</p>
                    <p className="text-lg font-bold font-mono text-emerald-800">
                      -{formatCurrency(bill.discountCents)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-emerald-600">{t('bill.total')}</p>
                    <p className="text-lg font-bold font-mono text-emerald-800">
                      {formatCurrency(bill.totalCents)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Status Timeline */}
              <BillStatusTimeline
                status={bill.status}
                createdAt={bill.createdAt}
                submittedAt={bill.submittedAt}
                approvedAt={bill.approvedAt}
                rejectedAt={bill.rejectedAt}
                contractorSignatureUrl={bill.contractorSignatureUrl}
                inspectorSignatureUrl={bill.inspectorSignatureUrl}
                rejectionReason={bill.rejectionReason}
              />

              {/* Signatures Section */}
              {(bill.contractorSignatureUrl ||
                bill.inspectorSignatureUrl ||
                bill.status !== 'draft') && (
                <div className="bg-white rounded shadow-sm p-4 space-y-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <PenTool className="h-4 w-4" />
                    {t('signatures.title')}
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Contractor Signature */}
                    <div className="border rounded-lg p-3 space-y-2">
                      <p className="text-xs text-slate-500 font-medium">
                        {t('signatures.contractor')}
                      </p>
                      {bill.contractorSignatureUrl ? (
                        <div>
                          <img
                            src={bill.contractorSignatureUrl}
                            alt="Contractor signature"
                            className="h-16 object-contain bg-slate-50 rounded p-1"
                            loading="lazy"
                          />
                          <p className="text-xs text-slate-400 mt-1">
                            {formatDate(bill.submittedAt)}
                          </p>
                        </div>
                      ) : (
                        <div className="h-16 bg-slate-50 rounded flex items-center justify-center">
                          <span className="text-xs text-slate-400">{t('signatures.pending')}</span>
                        </div>
                      )}
                    </div>

                    {/* Inspector Signature */}
                    <div className="border rounded-lg p-3 space-y-2">
                      <p className="text-xs text-slate-500 font-medium">
                        {t('signatures.inspector')}
                      </p>
                      {bill.inspectorSignatureUrl ? (
                        <div>
                          <img
                            src={bill.inspectorSignatureUrl}
                            alt="Inspector signature"
                            className="h-16 object-contain bg-slate-50 rounded p-1"
                            loading="lazy"
                          />
                          <p className="text-xs text-slate-400 mt-1">
                            {formatDate(bill.approvedAt)}
                          </p>
                        </div>
                      ) : (
                        <div className="h-16 bg-slate-50 rounded flex items-center justify-center">
                          <span className="text-xs text-slate-400">{t('signatures.pending')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Items Table */}
              <div className="content-offscreen">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">{t('items.title')}</h3>
                  {permissions.canAddItems && onAddItems && (
                    <Button variant="outline" size="sm" onClick={onAddItems}>
                      <Plus className="h-4 w-4 me-1" />
                      {t('items.add')}
                    </Button>
                  )}
                </div>

                {bill.items.length === 0 ? (
                  <div className="bg-slate-50 rounded shadow-sm border-dashed p-8 text-center">
                    <FileText className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">{t('empty')}</p>
                    {permissions.canAddItems && onAddItems && (
                      <Button variant="outline" size="sm" className="mt-3" onClick={onAddItems}>
                        <Plus className="h-4 w-4 me-1" />
                        {t('items.add')}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {bill.items.map((item) => {
                      const isExpanded = expandedItems.has(item.id);
                      const itemAmount = Math.round(item.currentQuantity * item.unitPriceCents);
                      const discountAmount = Math.round((itemAmount * item.discountPercent) / 100);
                      const netAmount = itemAmount - discountAmount;

                      return (
                        <div key={item.id} className="bg-white rounded shadow-sm overflow-hidden">
                          {/* Item Header */}
                          <div
                            className="p-4 cursor-pointer hover:bg-slate-50"
                            onClick={() => toggleItem(item.id)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-sm text-slate-500">
                                    {item.boqCode}
                                  </span>
                                  {item.isException && (
                                    <Badge className="bg-amber-100 text-amber-700 text-xs">
                                      {t('items.exception')}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm font-medium truncate">{item.description}</p>
                              </div>
                              <div className="text-end shrink-0">
                                <p className="font-mono font-bold">{formatCurrency(netAmount)}</p>
                                <p className="text-xs text-slate-500">
                                  {item.currentQuantity} {item.unit}
                                </p>
                              </div>
                              <button className="shrink-0">
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-slate-400" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-slate-400" />
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Item Details */}
                          {isExpanded && (
                            <div className="border-t bg-slate-50 p-4 space-y-3">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                                <div>
                                  <p className="text-xs text-slate-500">{t('items.previousQty')}</p>
                                  <p className="font-mono">{item.previousQuantity}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-slate-500">{t('items.currentQty')}</p>
                                  <p className="font-mono font-medium">{item.currentQuantity}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-slate-500">
                                    {t('items.cumulativeQty')}
                                  </p>
                                  <p className="font-mono">{item.cumulativeQuantity}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-slate-500">{t('items.unitPrice')}</p>
                                  <p className="font-mono">{formatCurrency(item.unitPriceCents)}</p>
                                </div>
                              </div>

                              {item.discountPercent > 0 && (
                                <div className="text-sm">
                                  <p className="text-xs text-slate-500">{t('items.discount')}</p>
                                  <p className="font-mono">{item.discountPercent}%</p>
                                </div>
                              )}

                              {item.remarks && (
                                <div className="text-sm">
                                  <p className="text-xs text-slate-500">{t('items.remarks')}</p>
                                  <p>{item.remarks}</p>
                                </div>
                              )}

                              {/* Measurements */}
                              {item.measurements && item.measurements.length > 0 && (
                                <div>
                                  <p className="text-xs text-slate-500 mb-2">
                                    {t('measurements.title')} ({item.measurements.length})
                                  </p>
                                  <div className="space-y-1">
                                    {item.measurements.map((m) => (
                                      <div
                                        key={m.id}
                                        className="flex items-center justify-between text-sm bg-white rounded px-2 py-1"
                                      >
                                        <span>{m.location || '-'}</span>
                                        <span className="font-mono">{m.quantity}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Delete Item (only for contractor with draft bill) */}
                              {permissions.canDeleteItems && (
                                <div className="pt-2 border-t">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteItem(item)}
                                    disabled={actionLoading === `delete-${item.id}`}
                                    className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                  >
                                    {actionLoading === `delete-${item.id}` ? (
                                      <Loader2 className="h-4 w-4 animate-spin me-1" />
                                    ) : (
                                      <Trash2 className="h-4 w-4 me-1" />
                                    )}
                                    {t('items.remove')}
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Reject Form */}
              {showRejectForm && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="font-medium">{t('actions.reject')}</span>
                  </div>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder={t('actions.rejectReason')}
                    rows={3}
                    className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-red-500 outline-none"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowRejectForm(false);
                        setRejectReason('');
                      }}
                    >
                      {tc('common.cancel')}
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleReject}
                      disabled={!rejectReason.trim() || actionLoading === 'reject'}
                      className="bg-red-500 hover:bg-red-600"
                    >
                      {actionLoading === 'reject' ? (
                        <Loader2 className="h-4 w-4 animate-spin me-1" />
                      ) : (
                        <XCircle className="h-4 w-4 me-1" />
                      )}
                      {t('actions.reject')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 text-center text-slate-500">{tc('common.notFound')}</div>
          )}
        </div>

        {/* Footer Actions */}
        {bill && (
          <div className="border-t bg-white px-6 py-4">
            <div className="flex flex-wrap gap-2 justify-between">
              {/* Left side actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  disabled={actionLoading === 'export'}
                >
                  {actionLoading === 'export' ? (
                    <Loader2 className="h-4 w-4 animate-spin me-1" />
                  ) : (
                    <Download className="h-4 w-4 me-1" />
                  )}
                  {t('actions.export')}
                </Button>
              </div>

              {/* Right side workflow actions */}
              <div className="flex gap-2">
                {/* Contractor: Edit draft */}
                {permissions.canEdit && onEdit && (
                  <Button variant="outline" size="sm" onClick={onEdit}>
                    <Edit className="h-4 w-4 me-1" />
                    {t('actions.edit')}
                  </Button>
                )}

                {/* Contractor: Submit draft */}
                {permissions.canSubmit && (
                  <Button
                    size="sm"
                    onClick={handleRequestContractorSignature}
                    disabled={
                      actionLoading === 'submit' ||
                      actionLoading === 'signature' ||
                      bill.items.length === 0
                    }
                    className="bg-blue-500 hover:bg-blue-600"
                  >
                    {actionLoading === 'submit' || actionLoading === 'signature' ? (
                      <Loader2 className="h-4 w-4 animate-spin me-1" />
                    ) : (
                      <PenTool className="h-4 w-4 me-1" />
                    )}
                    {t('signatures.sign')} & {t('actions.submit')}
                  </Button>
                )}

                {/* Inspector: Start review of submitted bill */}
                {permissions.canStartReview && (
                  <Button
                    size="sm"
                    onClick={handleStartReview}
                    disabled={actionLoading === 'review'}
                    className="bg-amber-500 hover:bg-amber-600"
                  >
                    {actionLoading === 'review' ? (
                      <Loader2 className="h-4 w-4 animate-spin me-1" />
                    ) : null}
                    {t('actions.startReview', 'Start Review')}
                  </Button>
                )}

                {/* Inspector: Reject under review bill */}
                {permissions.canReject && !showRejectForm && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowRejectForm(true)}
                    className="border-red-200 text-red-600 hover:bg-red-50"
                  >
                    <XCircle className="h-4 w-4 me-1" />
                    {t('actions.reject')}
                  </Button>
                )}

                {/* Inspector: Approve under review bill */}
                {permissions.canApprove && !showRejectForm && (
                  <Button
                    size="sm"
                    onClick={handleRequestInspectorSignature}
                    disabled={actionLoading === 'approve' || actionLoading === 'signature'}
                    className="bg-green-500 hover:bg-green-600"
                  >
                    {actionLoading === 'approve' || actionLoading === 'signature' ? (
                      <Loader2 className="h-4 w-4 animate-spin me-1" />
                    ) : (
                      <PenTool className="h-4 w-4 me-1" />
                    )}
                    {t('signatures.sign')} & {t('actions.approve')}
                  </Button>
                )}

                {/* Contractor: Reopen rejected bill */}
                {permissions.canReopen && (
                  <Button
                    size="sm"
                    onClick={handleReopen}
                    disabled={actionLoading === 'reopen'}
                    className="bg-slate-500 hover:bg-slate-600"
                  >
                    {actionLoading === 'reopen' ? (
                      <Loader2 className="h-4 w-4 animate-spin me-1" />
                    ) : (
                      <RotateCcw className="h-4 w-4 me-1" />
                    )}
                    {t('actions.reopen', 'Reopen')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </SheetContent>

      {/* Signature Capture Pad */}
      <SignaturePad
        open={signaturePadOpen}
        onOpenChange={setSignaturePadOpen}
        onSave={handleSignatureSave}
        title={
          signatureType === 'contractor' ? t('signatures.contractor') : t('signatures.inspector')
        }
        isLoading={actionLoading === 'signature'}
      />
    </Sheet>
  );
}

export default BillDetailSheet;
