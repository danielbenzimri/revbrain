/**
 * Project Billing Page (workspace tab)
 *
 * Thin wrapper that passes projectId from route params to the ProjectBillingTab.
 *
 * Task: P4.3
 * Refs: SI-BILLING-SPEC.md §12.2.2
 */
import { useParams } from 'react-router-dom';
import ProjectBillingTab from '@/features/billing/components/ProjectBillingTab';

export default function ProjectBillingPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <ProjectBillingTab projectId={id} />;
}
