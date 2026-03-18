/**
 * Tasks Page
 *
 * Kanban board for project tasks
 */
import { useParams } from 'react-router-dom';
import { TasksView } from '@/features/tasks/components';
import { useTeamMembers } from '@/features/org/hooks';

export default function TasksPage() {
  const { id } = useParams<{ id: string }>();
  const { data: teamMembers = [] } = useTeamMembers();

  return (
    <div className="h-full overflow-hidden">
      <TasksView projectId={id || ''} projectMembers={teamMembers} />
    </div>
  );
}
