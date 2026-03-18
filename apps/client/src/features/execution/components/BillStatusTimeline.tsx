/**
 * Bill Status Timeline
 *
 * Visual timeline showing the bill's workflow journey:
 * - Draft → Submitted → Under Review → Approved/Rejected
 * - Shows dates and user actions
 * - Highlights current status
 */
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Send, Clock, CheckCircle, XCircle, PenTool } from 'lucide-react';
import type { BillStatus } from '../hooks/use-execution-bills';

interface BillTimelineProps {
  status: BillStatus;
  createdAt: string;
  submittedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  contractorSignatureUrl?: string | null;
  inspectorSignatureUrl?: string | null;
  rejectionReason?: string | null;
}

interface TimelineStep {
  id: string;
  label: string;
  status: 'completed' | 'current' | 'pending' | 'rejected';
  date?: string | null;
  icon: React.ReactNode;
  description?: string;
  signature?: string | null;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('he-IL', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const BillStatusTimeline = memo(function BillStatusTimeline({
  status,
  createdAt,
  submittedAt,
  approvedAt,
  rejectedAt,
  contractorSignatureUrl,
  inspectorSignatureUrl,
  rejectionReason,
}: BillTimelineProps) {
  const { t } = useTranslation('execution');

  // Build timeline steps based on current status
  const steps: TimelineStep[] = [];

  // Step 1: Created (always completed)
  steps.push({
    id: 'created',
    label: t('status.draft'),
    status: 'completed',
    date: createdAt,
    icon: <FileText className="h-4 w-4" />,
    description: t('bill.createdAt'),
  });

  // Step 2: Submitted
  const isSubmitted = ['submitted', 'under_review', 'approved', 'rejected'].includes(status);
  steps.push({
    id: 'submitted',
    label: t('actions.submit'),
    status: status === 'draft' ? 'pending' : status === 'submitted' ? 'current' : 'completed',
    date: submittedAt,
    icon: <Send className="h-4 w-4" />,
    signature: contractorSignatureUrl,
  });

  // Step 3: Under Review (only if past submitted)
  if (isSubmitted) {
    steps.push({
      id: 'review',
      label: t('status.under_review'),
      status:
        status === 'submitted'
          ? 'pending'
          : status === 'under_review'
            ? 'current'
            : ['approved', 'rejected'].includes(status)
              ? 'completed'
              : 'pending',
      icon: <Clock className="h-4 w-4" />,
    });
  }

  // Step 4: Final state (Approved or Rejected)
  if (status === 'approved') {
    steps.push({
      id: 'approved',
      label: t('status.approved'),
      status: 'current',
      date: approvedAt,
      icon: <CheckCircle className="h-4 w-4" />,
      signature: inspectorSignatureUrl,
    });
  } else if (status === 'rejected') {
    steps.push({
      id: 'rejected',
      label: t('status.rejected'),
      status: 'rejected',
      date: rejectedAt,
      icon: <XCircle className="h-4 w-4" />,
      description: rejectionReason || undefined,
    });
  } else if (['under_review', 'submitted'].includes(status)) {
    // Show pending approval step
    steps.push({
      id: 'pending_final',
      label: t('actions.approve'),
      status: 'pending',
      icon: <CheckCircle className="h-4 w-4" />,
    });
  }

  return (
    <div className="bg-white rounded shadow-sm p-4">
      <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
        <Clock className="h-4 w-4 text-slate-500" />
        {t('summary.title').replace('Billing', 'Status')}
      </h4>

      <div className="relative">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;

          return (
            <div key={step.id} className="flex gap-3">
              {/* Timeline line and dot */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    step.status === 'completed'
                      ? 'bg-green-100 text-green-600'
                      : step.status === 'current'
                        ? 'bg-emerald-500 text-white'
                        : step.status === 'rejected'
                          ? 'bg-red-500 text-white'
                          : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {step.icon}
                </div>
                {!isLast && (
                  <div
                    className={`w-0.5 flex-1 min-h-[24px] ${
                      step.status === 'completed' || step.status === 'current'
                        ? 'bg-green-200'
                        : step.status === 'rejected'
                          ? 'bg-red-200'
                          : 'bg-slate-200'
                    }`}
                  />
                )}
              </div>

              {/* Step content */}
              <div className={`pb-4 ${isLast ? 'pb-0' : ''}`}>
                <p
                  className={`text-sm font-medium ${
                    step.status === 'pending'
                      ? 'text-slate-400'
                      : step.status === 'rejected'
                        ? 'text-red-600'
                        : 'text-slate-800'
                  }`}
                >
                  {step.label}
                </p>

                {step.date && (
                  <p className="text-xs text-slate-500 mt-0.5">{formatDate(step.date)}</p>
                )}

                {step.description && step.status === 'rejected' && (
                  <p className="text-xs text-red-500 mt-1 bg-red-50 px-2 py-1 rounded">
                    {step.description}
                  </p>
                )}

                {step.signature && (
                  <div className="mt-2 flex items-center gap-2">
                    <PenTool className="h-3 w-3 text-slate-400" />
                    <img
                      src={step.signature}
                      alt="Signature"
                      className="h-6 object-contain bg-slate-50 rounded px-1"
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default BillStatusTimeline;
