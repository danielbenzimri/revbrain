/**
 * Work Logs Page
 *
 * Daily site reports with resources and signatures
 */
import { useParams } from 'react-router-dom';
import { WorkLogsView } from '@/features/worklogs/components';
import { useProject } from '../../hooks/use-project-api';

export default function WorkLogsPage() {
  const { id } = useParams<{ id: string }>();
  const { data: project } = useProject(id);

  if (!project) return null;

  return (
    <div className="h-full overflow-hidden">
      <WorkLogsView
        projectId={id || ''}
        projectData={{
          name: project.name,
          contractorName: project.contractorName || undefined,
          clientName: project.clientName || undefined,
          contractNumber: project.contractNumber || undefined,
        }}
      />
    </div>
  );
}
