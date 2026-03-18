/**
 * TaskCard Component
 *
 * Individual task card for the Kanban board matching the legacy layout:
 * - Priority stripe on the right side
 * - Priority badge at top
 * - Quick "mark as done" button on hover
 * - Title and description
 * - Assignee avatar and name
 * - Due date with overdue styling
 */
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Calendar } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { Task, TaskStatus, TaskPriority } from '../hooks/use-tasks';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  onStatusChange: (task: Task, status: TaskStatus) => void;
  getUser: (
    userId: string | null
  ) => { id: string; name: string; avatar?: string } | null | undefined;
}

const PRIORITY_COLORS: Record<
  TaskPriority,
  {
    stripe: string;
    badge: string;
  }
> = {
  low: {
    stripe: 'bg-slate-300',
    badge: 'text-slate-500 bg-slate-50 border-slate-200',
  },
  medium: {
    stripe: 'bg-blue-500',
    badge: 'text-blue-600 bg-blue-50 border-blue-200',
  },
  high: {
    stripe: 'bg-orange-500',
    badge: 'text-orange-600 bg-orange-50 border-orange-200',
  },
  critical: {
    stripe: 'bg-red-500',
    badge: 'text-red-600 bg-red-50 border-red-200',
  },
};

export const TaskCard = memo(function TaskCard({
  task,
  onClick,
  onStatusChange,
  getUser,
}: TaskCardProps) {
  const { t, i18n } = useTranslation('tasks');
  const isRTL = i18n.language === 'he';

  const priorityConfig = PRIORITY_COLORS[task.priority];
  const assignee = getUser(task.assigneeId);
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'done';

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US', {
      day: '2-digit',
      month: '2-digit',
    });
  };

  return (
    <div
      onClick={onClick}
      className="bg-white p-4 rounded-lg shadow-sm hover:shadow-md transition cursor-pointer group relative overflow-hidden"
    >
      {/* Priority Stripe */}
      <div
        className={`absolute top-0 ${isRTL ? 'right-0' : 'left-0'} bottom-0 w-1 ${priorityConfig.stripe}`}
      />

      <div className={isRTL ? 'mr-3' : 'ml-3'}>
        {/* Header Row */}
        <div className="flex justify-between items-start mb-2">
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${priorityConfig.badge}`}
          >
            {t(`priority.${task.priority}`)}
          </span>

          {/* Quick Actions */}
          <div className="opacity-0 group-hover:opacity-100 transition flex gap-1">
            {task.status !== 'done' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusChange(task, 'done');
                }}
                className="p-1 hover:bg-green-50 text-slate-400 hover:text-green-600 rounded"
                title={t('actions.complete')}
              >
                <CheckCircle2 size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Title & Description */}
        <h4 className="font-bold text-slate-800 mb-1 leading-snug">{task.title}</h4>
        <p className="text-xs text-slate-500 line-clamp-2 mb-3">
          {task.description || t('task.description')}
        </p>

        {/* Footer Row */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-50">
          {/* Assignee */}
          <div className="flex items-center gap-2">
            {assignee ? (
              <>
                <div className="relative">
                  <Avatar className="w-6 h-6 border border-white shadow-sm">
                    <AvatarImage src={assignee.avatar} />
                    <AvatarFallback className="text-[10px] bg-slate-100">
                      {assignee.name?.charAt(0) || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-0.5 -end-0.5 w-2.5 h-2.5 bg-green-400 border-2 border-white rounded-full" />
                </div>
                <span className="text-xs text-slate-500 max-w-[80px] truncate">
                  {assignee.name}
                </span>
              </>
            ) : (
              <span className="text-xs text-slate-400">{t('filters.unassigned')}</span>
            )}
          </div>

          {/* Due Date */}
          {task.dueDate && (
            <div
              className={`text-xs flex items-center gap-1 font-medium px-2 py-1 rounded ${
                isOverdue ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-500'
              }`}
            >
              <Calendar size={12} />
              {formatDate(task.dueDate)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
