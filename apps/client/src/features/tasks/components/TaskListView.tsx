/**
 * TaskListView Component
 *
 * Table view of tasks matching the legacy layout:
 * - Columns: Status, Task (title + description), Priority, Assignee, Due Date, Created By, Actions
 * - Status badges with icons
 * - Priority badges with colors
 * - Overdue date highlighting
 * - Delete button on hover
 * - Empty state when no tasks match filters
 */
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock, Flag, Calendar, Trash2, Search } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { Task, TaskStatus, TaskPriority } from '../hooks/use-tasks';

interface TaskListViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onDelete: (task: Task) => void;
  getUser: (
    userId: string | null
  ) => { id: string; name: string; avatar?: string } | null | undefined;
}

const STATUS_STYLES: Record<TaskStatus, string> = {
  todo: 'bg-slate-100 text-slate-600 border-slate-200',
  in_progress: 'bg-blue-50 text-blue-600 border-blue-200',
  review: 'bg-orange-50 text-orange-600 border-orange-200',
  done: 'bg-green-50 text-green-600 border-green-200',
};

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  low: 'text-slate-500 bg-slate-50 border-slate-200',
  medium: 'text-blue-600 bg-blue-50 border-blue-200',
  high: 'text-orange-600 bg-orange-50 border-orange-200',
  critical: 'text-red-600 bg-red-50 border-red-200',
};

export const TaskListView = memo(function TaskListView({
  tasks,
  onTaskClick,
  onDelete,
  getUser,
}: TaskListViewProps) {
  const { t, i18n } = useTranslation('tasks');
  const isRTL = i18n.language === 'he';

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US');
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col">
      <div className="overflow-auto flex-1">
        <table className={`w-full text-sm ${isRTL ? 'text-right' : 'text-left'}`}>
          <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200 sticky top-0 z-10">
            <tr>
              <th className="p-4 w-40">{t('task.status')}</th>
              <th className="p-4 w-1/3">{t('task.title')}</th>
              <th className="p-4">{t('task.priority')}</th>
              <th className="p-4">{t('task.assignee')}</th>
              <th className="p-4">{t('task.dueDate')}</th>
              <th className="p-4">{t('task.createdBy')}</th>
              <th className="p-4 text-center">{t('actions.delete')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tasks.map((task) => {
              const assignee = getUser(task.assigneeId);
              const creator = getUser(task.createdBy);
              const isOverdue =
                task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'done';

              return (
                <tr
                  key={task.id}
                  onClick={() => onTaskClick(task)}
                  className="hover:bg-slate-50 transition cursor-pointer group"
                >
                  <td className="p-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1 w-fit ${STATUS_STYLES[task.status]}`}
                    >
                      {task.status === 'done' && <CheckCircle2 size={12} />}
                      {task.status === 'in_progress' && <Clock size={12} />}
                      {t(`status.${task.status}`)}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="font-bold text-slate-800 text-base mb-0.5">{task.title}</div>
                    <div className="text-xs text-slate-500 truncate max-w-md">
                      {task.description}
                    </div>
                  </td>
                  <td className="p-4">
                    <div
                      className={`flex items-center gap-1.5 font-medium px-2 py-1 rounded-md w-fit text-xs border ${PRIORITY_STYLES[task.priority]}`}
                    >
                      <Flag size={12} />
                      {t(`priority.${task.priority}`)}
                    </div>
                  </td>
                  <td className="p-4">
                    {assignee ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="w-8 h-8 border border-slate-200">
                          <AvatarImage src={assignee.avatar} />
                          <AvatarFallback className="text-xs bg-slate-100">
                            {assignee.name?.charAt(0) || '?'}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-slate-700">{assignee.name}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400">{t('filters.unassigned')}</span>
                    )}
                  </td>
                  <td className="p-4">
                    <div
                      className={`flex items-center gap-1.5 ${
                        isOverdue ? 'text-red-600 font-bold' : 'text-slate-600'
                      }`}
                    >
                      <Calendar size={14} />
                      {formatDate(task.dueDate)}
                    </div>
                  </td>
                  <td className="p-4 text-slate-500">{creator?.name || '-'}</td>
                  <td className="p-4 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(task);
                      }}
                      className="p-2 hover:bg-red-50 rounded-full text-slate-400 hover:text-red-500 transition opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              );
            })}

            {/* Empty State */}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={7} className="p-12 text-center text-slate-400">
                  <div className="flex flex-col items-center gap-3">
                    <div className="bg-slate-50 p-4 rounded-full">
                      <Search size={32} className="text-slate-300" />
                    </div>
                    <p>{t('search.noResults')}</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});
