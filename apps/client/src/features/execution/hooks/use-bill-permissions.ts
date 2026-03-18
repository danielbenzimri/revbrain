/**
 * Bill Permissions Hook
 *
 * Determines what actions a user can perform on bills based on their role:
 *
 * Contractor Roles (contractor group):
 * - Can create, edit, delete draft bills
 * - Can sign and submit bills
 * - Cannot approve/reject
 *
 * Client Roles (client group - inspector, client_pm, etc.):
 * - Cannot create/edit bills
 * - Can start review, approve (with signature), reject
 * - Read-only view of items and measurements
 */
import { useUser } from '@/stores/auth-store';
import { getRoleGroup } from '@/types/auth';
import type { BillStatus } from './use-execution-bills';

export interface BillPermissions {
  // View mode
  isInspector: boolean;
  isContractor: boolean;

  // Bill-level actions
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canSubmit: boolean;
  canStartReview: boolean;
  canApprove: boolean;
  canReject: boolean;
  canReopen: boolean;
  canExport: boolean;

  // Item-level actions
  canAddItems: boolean;
  canEditItems: boolean;
  canDeleteItems: boolean;

  // Measurement actions
  canAddMeasurements: boolean;
  canDeleteMeasurements: boolean;
}

/**
 * Get permissions for a specific bill based on user role and bill status
 */
export function useBillPermissions(status?: BillStatus): BillPermissions {
  const user = useUser();
  const group = user?.role ? getRoleGroup(user.role) : null;

  const isContractor = group === 'contractor';
  const isInspector = group === 'client';

  // Default no-permission state
  const noPermissions: BillPermissions = {
    isInspector: false,
    isContractor: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canSubmit: false,
    canStartReview: false,
    canApprove: false,
    canReject: false,
    canReopen: false,
    canExport: false,
    canAddItems: false,
    canEditItems: false,
    canDeleteItems: false,
    canAddMeasurements: false,
    canDeleteMeasurements: false,
  };

  if (!user || !group) {
    return noPermissions;
  }

  // Contractor permissions
  if (isContractor) {
    const isDraft = status === 'draft';
    const isRejected = status === 'rejected';

    return {
      isInspector: false,
      isContractor: true,

      // Bill actions
      canCreate: true,
      canEdit: isDraft,
      canDelete: isDraft,
      canSubmit: isDraft,
      canStartReview: false,
      canApprove: false,
      canReject: false,
      canReopen: isRejected,
      canExport: true,

      // Item actions
      canAddItems: isDraft,
      canEditItems: isDraft,
      canDeleteItems: isDraft,

      // Measurement actions
      canAddMeasurements: isDraft,
      canDeleteMeasurements: isDraft,
    };
  }

  // Inspector/Client permissions
  if (isInspector) {
    const isSubmitted = status === 'submitted';
    const isUnderReview = status === 'under_review';

    return {
      isInspector: true,
      isContractor: false,

      // Bill actions
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canSubmit: false,
      canStartReview: isSubmitted,
      canApprove: isUnderReview,
      canReject: isUnderReview,
      canReopen: false,
      canExport: true,

      // Item actions - read only
      canAddItems: false,
      canEditItems: false,
      canDeleteItems: false,

      // Measurement actions - read only
      canAddMeasurements: false,
      canDeleteMeasurements: false,
    };
  }

  return noPermissions;
}

export default useBillPermissions;
