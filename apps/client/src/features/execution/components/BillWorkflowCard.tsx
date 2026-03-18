/**
 * Bill Workflow Card
 *
 * Action card for bill workflow operations:
 * - Draft: Edit, Delete, Submit (requires signature)
 * - Submitted: Start Review
 * - Under Review: Approve (requires signature), Reject (requires reason)
 * - Approved: Export, View Only
 * - Rejected: Reopen, View Rejection Reason
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Send,
  CheckCircle,
  XCircle,
  RotateCcw,
  Edit,
  Trash2,
  FileSpreadsheet,
  Eye,
  AlertCircle,
  PenTool,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import type { BillStatus } from '../hooks/use-execution-bills';

interface BillWorkflowCardProps {
  status: BillStatus;
  billNumber: number;
  contractorSignatureUrl?: string | null;
  inspectorSignatureUrl?: string | null;
  rejectionReason?: string | null;
  onEdit?: () => void;
  onDelete?: () => void;
  onSubmit?: () => void;
  onStartReview?: () => void;
  onApprove?: () => void;
  onReject?: (reason: string) => void;
  onReopen?: () => void;
  onExport?: () => void;
  onRequestContractorSignature?: () => void;
  onRequestInspectorSignature?: () => void;
  isSubmitting?: boolean;
  isDeleting?: boolean;
  isReviewing?: boolean;
  isApproving?: boolean;
  isRejecting?: boolean;
  isReopening?: boolean;
  isExporting?: boolean;
}

export function BillWorkflowCard({
  status,
  billNumber,
  contractorSignatureUrl,
  inspectorSignatureUrl,
  rejectionReason,
  onEdit,
  onDelete,
  onSubmit,
  onStartReview,
  onApprove,
  onReject,
  onReopen,
  onExport,
  onRequestContractorSignature,
  onRequestInspectorSignature,
  isSubmitting,
  isDeleting,
  isReviewing,
  isApproving,
  isRejecting,
  isReopening,
  isExporting,
}: BillWorkflowCardProps) {
  const { t } = useTranslation('execution');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const handleRejectConfirm = () => {
    if (rejectReason.trim() && onReject) {
      onReject(rejectReason.trim());
      setShowRejectDialog(false);
      setRejectReason('');
    }
  };

  const handleDeleteConfirm = () => {
    if (onDelete) {
      onDelete();
      setShowDeleteDialog(false);
    }
  };

  // Determine which actions are available based on status
  const canEdit = status === 'draft';
  const canDelete = status === 'draft';
  const canSubmit = status === 'draft';
  const canStartReview = status === 'submitted';
  const canApprove = status === 'under_review';
  const canReject = status === 'under_review';
  const canReopen = status === 'rejected';
  const canExport = status === 'approved';

  // Check if signatures are needed
  const needsContractorSignature = canSubmit && !contractorSignatureUrl;
  const needsInspectorSignature = canApprove && !inspectorSignatureUrl;

  return (
    <>
      <div className="bg-white rounded shadow-sm p-4">
        <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Edit className="h-4 w-4 text-slate-500" />
          {t('actions.title', 'Actions')}
        </h4>

        <div className="space-y-3">
          {/* Draft Actions */}
          {canEdit && onEdit && (
            <Button variant="outline" className="w-full justify-start gap-2" onClick={onEdit}>
              <Edit className="h-4 w-4" />
              {t('actions.edit', 'Edit Bill')}
            </Button>
          )}

          {canSubmit && (
            <div className="space-y-2">
              {needsContractorSignature && onRequestContractorSignature ? (
                <Button
                  variant="default"
                  className="w-full justify-start gap-2 bg-blue-600 hover:bg-blue-700"
                  onClick={onRequestContractorSignature}
                >
                  <PenTool className="h-4 w-4" />
                  {t('actions.signAndSubmit', 'Sign & Submit')}
                </Button>
              ) : (
                <Button
                  variant="default"
                  className="w-full justify-start gap-2 bg-emerald-600 hover:bg-emerald-700"
                  onClick={onSubmit}
                  disabled={isSubmitting}
                >
                  <Send className="h-4 w-4" />
                  {isSubmitting
                    ? t('actions.submitting', 'Submitting...')
                    : t('actions.submit', 'Submit Bill')}
                </Button>
              )}
              {contractorSignatureUrl && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  {t('signature.contractorSigned', 'Contractor signature added')}
                </p>
              )}
            </div>
          )}

          {canDelete && onDelete && (
            <Button
              variant="outline"
              className="w-full justify-start gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => setShowDeleteDialog(true)}
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4" />
              {t('actions.delete', 'Delete Bill')}
            </Button>
          )}

          {/* Submitted Actions */}
          {canStartReview && onStartReview && (
            <Button
              variant="default"
              className="w-full justify-start gap-2 bg-amber-600 hover:bg-amber-700"
              onClick={onStartReview}
              disabled={isReviewing}
            >
              <Eye className="h-4 w-4" />
              {isReviewing
                ? t('actions.starting', 'Starting...')
                : t('actions.startReview', 'Start Review')}
            </Button>
          )}

          {/* Under Review Actions */}
          {canApprove && (
            <div className="space-y-2">
              {needsInspectorSignature && onRequestInspectorSignature ? (
                <Button
                  variant="default"
                  className="w-full justify-start gap-2 bg-blue-600 hover:bg-blue-700"
                  onClick={onRequestInspectorSignature}
                >
                  <PenTool className="h-4 w-4" />
                  {t('actions.signAndApprove', 'Sign & Approve')}
                </Button>
              ) : (
                <Button
                  variant="default"
                  className="w-full justify-start gap-2 bg-emerald-600 hover:bg-emerald-700"
                  onClick={onApprove}
                  disabled={isApproving}
                >
                  <CheckCircle className="h-4 w-4" />
                  {isApproving
                    ? t('actions.approving', 'Approving...')
                    : t('actions.approve', 'Approve Bill')}
                </Button>
              )}
              {inspectorSignatureUrl && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  {t('signature.inspectorSigned', 'Inspector signature added')}
                </p>
              )}
            </div>
          )}

          {canReject && onReject && (
            <Button
              variant="outline"
              className="w-full justify-start gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => setShowRejectDialog(true)}
              disabled={isRejecting}
            >
              <XCircle className="h-4 w-4" />
              {t('actions.reject', 'Reject Bill')}
            </Button>
          )}

          {/* Approved Actions */}
          {canExport && onExport && (
            <Button
              variant="default"
              className="w-full justify-start gap-2 bg-blue-600 hover:bg-blue-700"
              onClick={onExport}
              disabled={isExporting}
            >
              <FileSpreadsheet className="h-4 w-4" />
              {isExporting
                ? t('actions.exporting', 'Exporting...')
                : t('actions.export', 'Export to Excel')}
            </Button>
          )}

          {/* Rejected Actions */}
          {canReopen && onReopen && (
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={onReopen}
              disabled={isReopening}
            >
              <RotateCcw className="h-4 w-4" />
              {isReopening
                ? t('actions.reopening', 'Reopening...')
                : t('actions.reopen', 'Reopen Bill')}
            </Button>
          )}

          {/* Show rejection reason if rejected */}
          {status === 'rejected' && rejectionReason && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-700">
                    {t('rejection.reason', 'Rejection Reason')}
                  </p>
                  <p className="text-sm text-red-600 mt-1">{rejectionReason}</p>
                </div>
              </div>
            </div>
          )}

          {/* Status indicator for terminal states */}
          {status === 'approved' && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <p className="text-sm font-medium text-green-700">
                  {t('status.approvedMessage', 'This bill has been approved')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              {t('rejection.dialogTitle', 'Reject Bill')} #{billNumber}
            </DialogTitle>
            <DialogDescription>
              {t(
                'rejection.dialogDescription',
                'Please provide a reason for rejecting this bill. The contractor will be notified.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="reject-reason" className="text-sm font-medium">
              {t('rejection.reasonLabel', 'Reason for Rejection')}
            </Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t(
                'rejection.reasonPlaceholder',
                'Explain why this bill is being rejected...'
              )}
              className="mt-2"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectConfirm}
              disabled={!rejectReason.trim() || isRejecting}
            >
              {isRejecting
                ? t('actions.rejecting', 'Rejecting...')
                : t('actions.confirmReject', 'Confirm Rejection')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" />
              {t('delete.dialogTitle', 'Delete Bill')} #{billNumber}
            </DialogTitle>
            <DialogDescription>
              {t(
                'delete.dialogDescription',
                'Are you sure you want to delete this bill? This action cannot be undone.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={isDeleting}>
              {isDeleting
                ? t('actions.deleting', 'Deleting...')
                : t('actions.confirmDelete', 'Delete Bill')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default BillWorkflowCard;
