/**
 * Execution Page
 *
 * Billing and execution tracking
 * - Contractors see BillingView (create/submit bills)
 * - Clients/Inspectors see ClientBillingView (review/approve bills)
 *
 * Data is loaded from the backend via the calculations API (moduleType: 'billing')
 * and passed as props to the original billing components.
 */
import { useMemo } from 'react';
import { useParams } from 'react-router';
import { BillingView, ClientBillingView } from '@/features/execution/components';
import { useBillingData } from '@/features/execution/hooks/use-billing-data';
import { useProject } from '../../hooks/use-project-api';
import { useAuthStore } from '@/stores/auth-store';
import { Loader2 } from 'lucide-react';
import type { User } from '@/features/execution/types';

// Reviewer roles that see the approval view
const REVIEWER_ROLES = ['reviewer'];

export default function ExecutionPage() {
  const { id } = useParams<{ id: string }>();
  const { data: project } = useProject(id);
  const authUser = useAuthStore((state) => state.user);

  const {
    bills,
    boqItems,
    approvedBills,
    quantityPages,
    isLoading,
    updateBills,
    updateApprovedBills,
    updateQuantityPages,
  } = useBillingData(id);

  // Determine if user should see client view
  const isClientView = useMemo(
    () => authUser?.role && REVIEWER_ROLES.includes(authUser.role),
    [authUser]
  );

  // Map auth user to billing User type
  const currentUser: User | undefined = useMemo(() => {
    if (!authUser) return undefined;
    return {
      id: authUser.id,
      email: authUser.email || '',
      name: authUser.name || authUser.email || '',
      role: (authUser.role || 'reviewer') as User['role'],
    };
  }, [authUser]);

  if (!project) return null;

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  const projectData = {
    name: project.name,
    contractorName: project.contractorName || undefined,
    clientName: project.clientName || undefined,
    contractNumber: project.contractNumber || undefined,
    logoContractorUrl: (project.metadata?.logoContractorUrl as string) || undefined,
    logoClientUrl: (project.metadata?.logoClientUrl as string) || undefined,
  };

  return (
    <div className="h-full overflow-auto">
      {isClientView ? (
        <ClientBillingView
          bills={bills}
          boqItems={boqItems}
          projectData={projectData}
          approvedBills={approvedBills}
          onUpdateApprovedBills={updateApprovedBills}
          onUpdateBills={updateBills}
          quantityPages={quantityPages}
          currentUser={currentUser!}
        />
      ) : (
        <BillingView
          bills={bills}
          onUpdateBills={updateBills}
          boqItems={boqItems}
          onUpdateBoq={() => {}}
          projectData={projectData}
          approvedBills={approvedBills}
          onUpdateApprovedBills={updateApprovedBills}
          quantityPages={quantityPages}
          onUpdateQuantityPages={updateQuantityPages}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}
