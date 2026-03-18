/**
 * TaskKanbanBoard Component
 *
 * Kanban board with 4 status columns and drag-and-drop:
 * - todo (gray), in_progress (blue), review (orange), done (green)
 * - Drag tasks between columns to change status
 * - Each column has a header with icon, label, and count
 * - Task cards with priority stripe, title, description, assignee, due date
 * - Quick "mark as done" action on hover
 * - Add task button at bottom of each column
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Circle, Clock, AlertCircle, CheckCircle2, Plus, type LucideIcon } from 'lucide-react';
import { TaskCard } from './TaskCard';
import type { Task, TaskStatus } from '../hooks/use-tasks';

interface TaskKanbanBoardProps {
  tasksByStatus: Record<TaskStatus, Task[]>;
  onTaskClick: (task: Task) => void;
  onStatusChange: (task: Task, status: TaskStatus) => void;
  onAddTask: (status?: TaskStatus) => void;
  getUser: (
    userId: string | null
  ) => { id: string; name: string; avatar?: string } | null | undefined;
}

const COLUMN_CONFIG: Record<
  TaskStatus,
  {
    icon: LucideIcon;
    borderColor: string;
    iconColor: string;
    dropBg: string;
  }
> = {
  todo: {
    icon: Circle,
    borderColor: 'border-slate-400',
    iconColor: 'text-slate-400',
    dropBg: 'bg-slate-50',
  },
  in_progress: {
    icon: Clock,
    borderColor: 'border-blue-500',
    iconColor: 'text-blue-500',
    dropBg: 'bg-blue-50',
  },
  review: {
    icon: AlertCircle,
    borderColor: 'border-orange-500',
    iconColor: 'text-orange-500',
    dropBg: 'bg-orange-50',
  },
  done: {
    icon: CheckCircle2,
    borderColor: 'border-green-500',
    iconColor: 'text-green-500',
    dropBg: 'bg-green-50',
  },
};

const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'review', 'done'];

export function TaskKanbanBoard({
  tasksByStatus,
  onTaskClick,
  onStatusChange,
  onAddTask,
  getUser,
}: TaskKanbanBoardProps) {
  const { t } = useTranslation('tasks');
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
    // Add a slight delay to allow the drag image to be set
    setTimeout(() => {
      (e.target as HTMLElement).style.opacity = '0.5';
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    (e.target as HTMLElement).style.opacity = '1';
    setDraggedTask(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== status) {
      setDragOverColumn(status);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if leaving the column entirely
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDragOverColumn(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    if (draggedTask && draggedTask.status !== targetStatus) {
      onStatusChange(draggedTask, targetStatus);
    }
    setDraggedTask(null);
    setDragOverColumn(null);
  };

  return (
    <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
      <div className="flex gap-6 h-full min-w-[1200px]">
        {STATUS_ORDER.map((status) => {
          const config = COLUMN_CONFIG[status];
          const Icon = config.icon;
          const tasks = tasksByStatus[status] || [];
          const isDropTarget = dragOverColumn === status && draggedTask?.status !== status;

          return (
            <div
              key={status}
              className={`flex-1 flex flex-col h-full rounded-xl transition-colors ${
                isDropTarget ? config.dropBg : ''
              }`}
              onDragOver={(e) => handleDragOver(e, status)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, status)}
            >
              {/* Column Header */}
              <div
                className={`mb-4 flex items-center justify-between p-3 rounded-lg bg-white shadow-sm border-b-2 ${config.borderColor}`}
              >
                <div className="flex items-center gap-2 font-bold text-slate-700">
                  <Icon size={18} className={config.iconColor} />
                  {t(`status.${status}`)}
                </div>
                <span className="bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full text-xs font-bold">
                  {tasks.length}
                </span>
              </div>

              {/* Tasks List */}
              <div className="flex-1 overflow-y-auto space-y-3 pe-1 pb-2">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDragOver(e, status);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDrop(e, status);
                    }}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    <TaskCard
                      task={task}
                      onClick={() => onTaskClick(task)}
                      onStatusChange={onStatusChange}
                      getUser={getUser}
                    />
                  </div>
                ))}

                {/* Drop Zone Indicator */}
                {isDropTarget && tasks.length === 0 && (
                  <div className="py-8 border-2 border-dashed border-slate-300 rounded-lg text-center text-slate-500 text-sm">
                    {t('board.dragHint')}
                  </div>
                )}

                {/* Empty State */}
                {tasks.length === 0 && !isDropTarget && (
                  <div className="text-center py-8 text-slate-400 text-sm">
                    {t('board.emptyColumn')}
                  </div>
                )}

                {/* Add Task Button */}
                <button
                  onClick={() => onAddTask(status)}
                  className="w-full py-3 border border-dashed border-slate-200 rounded-lg text-slate-400 text-sm hover:bg-slate-50 hover:border-blue-300 hover:text-blue-600 transition flex items-center justify-center gap-2 font-medium"
                >
                  <Plus size={18} />
                  {t('create')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
