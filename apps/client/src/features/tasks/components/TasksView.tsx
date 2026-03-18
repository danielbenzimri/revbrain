/**
 * TasksView Component
 *
 * Full-page task management view that matches the legacy TasksView layout:
 * - Header with title, audit log button, and new task button
 * - Toolbar with search, filters (assignee, priority), and view toggle (board/list)
 * - Kanban board view with 4 columns (todo, in_progress, review, done)
 * - List view with table
 * - Task form sheet for create/edit
 * - Delete dialog with reason and signature
 * - Audit log sheet for deletion history
 */
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardCheck, Plus, LayoutGrid, List as ListIcon, Search, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useTasksKanban,
  useCreateTask,
  useUpdateTask,
  useChangeTaskStatus,
  useDeleteTask,
  useTaskAuditLog,
  useExportTaskAuditLog,
  type Task,
  type TaskStatus,
  type TaskPriority,
  type CreateTaskInput,
  type UpdateTaskInput,
} from '../hooks/use-tasks';
import { TaskKanbanBoard } from './TaskKanbanBoard';
import { TaskListView } from './TaskListView';
import { TaskFormSheet } from './TaskFormSheet';
import { TaskDeleteDialog } from './TaskDeleteDialog';
import { TaskAuditLogSheet } from './TaskAuditLogSheet';

interface TasksViewProps {
  projectId: string;
  projectMembers?: { id: string; name: string; avatar?: string }[];
  currentUser?: {
    id: string;
    name: string;
    role: string;
  };
}

export function TasksView({ projectId, projectMembers = [] }: Omit<TasksViewProps, 'currentUser'>) {
  const { t, i18n } = useTranslation('tasks');
  const isRTL = i18n.language === 'he';

  // View mode
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<TaskPriority | 'all'>('all');
  const [filterAssignee, setFilterAssignee] = useState<string | 'all'>('all');

  // Modal/Sheet state
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [auditLogOpen, setAuditLogOpen] = useState(false);
  const [deleteTask, setDeleteTask] = useState<Task | null>(null);

  // Data
  const { data: kanbanData, isLoading } = useTasksKanban(projectId);
  const { data: auditLog } = useTaskAuditLog(projectId);

  // Mutations
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const changeStatus = useChangeTaskStatus();
  const deleteTaskMutation = useDeleteTask();
  const exportAuditLog = useExportTaskAuditLog();

  // Flatten tasks for filtering
  const allTasks = useMemo(() => {
    if (!kanbanData) return [];
    return [
      ...kanbanData.todo,
      ...kanbanData.in_progress,
      ...kanbanData.review,
      ...kanbanData.done,
    ];
  }, [kanbanData]);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return allTasks.filter((task) => {
      const matchesSearch =
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (task.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
      const matchesPriority = filterPriority === 'all' || task.priority === filterPriority;
      const matchesAssignee = filterAssignee === 'all' || task.assigneeId === filterAssignee;
      return matchesSearch && matchesPriority && matchesAssignee;
    });
  }, [allTasks, searchQuery, filterPriority, filterAssignee]);

  // Group filtered tasks by status for board view
  const filteredKanbanData = useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      todo: [],
      in_progress: [],
      review: [],
      done: [],
    };
    filteredTasks.forEach((task) => {
      grouped[task.status].push(task);
    });
    return grouped;
  }, [filteredTasks]);

  // Handlers
  const handleOpenCreate = () => {
    setEditingTask(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (task: Task) => {
    setEditingTask(task);
    setFormOpen(true);
  };

  const handleSaveTask = async (data: CreateTaskInput | UpdateTaskInput) => {
    if (editingTask) {
      await updateTask.mutateAsync({
        id: editingTask.id,
        projectId,
        data: data as UpdateTaskInput,
      });
    } else {
      await createTask.mutateAsync({
        ...data,
        projectId,
      } as CreateTaskInput);
    }
    setFormOpen(false);
    setEditingTask(null);
  };

  const handleStatusChange = async (task: Task, newStatus: TaskStatus) => {
    await changeStatus.mutateAsync({
      id: task.id,
      projectId,
      status: newStatus,
    });
  };

  const handleInitiateDelete = (task: Task) => {
    setDeleteTask(task);
  };

  const handleConfirmDelete = async (reason: string, signatureUrl?: string) => {
    if (!deleteTask) return;
    await deleteTaskMutation.mutateAsync({
      id: deleteTask.id,
      projectId,
      reason,
      signatureUrl,
    });
    setDeleteTask(null);
    setFormOpen(false);
  };

  const handleExportAuditLog = () => {
    exportAuditLog.mutate({ projectId });
  };

  // Get user info
  const getUser = (userId: string | null) => {
    if (!userId) return null;
    return projectMembers.find((u) => u.id === userId);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
      </div>
    );
  }

  return (
    <div
      className="animate-in fade-in duration-500 h-[calc(100vh-200px)] flex flex-col"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* Header Section */}
      <div className="flex flex-col gap-6 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
              <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-200">
                <ClipboardCheck className="text-indigo-600" size={24} />
              </div>
              {t('title')}
            </h2>
            <p className="text-slate-500 mt-1 ms-12">{t('subtitle')}</p>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setAuditLogOpen(true)} className="gap-2">
              <History size={18} />
              {t('auditLog.title')}
            </Button>
            <Button
              onClick={() => handleOpenCreate()}
              className="gap-2 bg-indigo-600 hover:bg-indigo-700"
            >
              <Plus size={18} />
              {t('newTask')}
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-center justify-between">
          {/* Search & Filters */}
          <div className="flex items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search
                className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <Input
                type="text"
                placeholder={t('search.placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ps-10"
              />
            </div>

            <div className="h-8 w-px bg-slate-200 mx-2" />

            <Select value={filterAssignee} onValueChange={(v) => setFilterAssignee(v as string)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t('filters.assignee')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('filters.all')}</SelectItem>
                {projectMembers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filterPriority}
              onValueChange={(v) => setFilterPriority(v as TaskPriority | 'all')}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder={t('filters.priority')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('filters.all')}</SelectItem>
                <SelectItem value="critical">{t('priority.critical')}</SelectItem>
                <SelectItem value="high">{t('priority.high')}</SelectItem>
                <SelectItem value="medium">{t('priority.medium')}</SelectItem>
                <SelectItem value="low">{t('priority.low')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* View Toggle */}
          <div className="bg-slate-100 p-1 rounded-lg flex gap-1">
            <button
              onClick={() => setViewMode('board')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition text-sm font-medium ${
                viewMode === 'board'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <LayoutGrid size={16} />
              {t('viewMode.board')}
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition text-sm font-medium ${
                viewMode === 'list'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <ListIcon size={16} />
              {t('viewMode.list')}
            </button>
          </div>
        </div>
      </div>

      {/* Views */}
      {viewMode === 'board' ? (
        <TaskKanbanBoard
          tasksByStatus={filteredKanbanData}
          onTaskClick={handleOpenEdit}
          onStatusChange={handleStatusChange}
          onAddTask={handleOpenCreate}
          getUser={getUser}
        />
      ) : (
        <TaskListView
          tasks={filteredTasks}
          onTaskClick={handleOpenEdit}
          onDelete={handleInitiateDelete}
          getUser={getUser}
        />
      )}

      {/* Task Form Sheet */}
      <TaskFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        task={editingTask}
        projectMembers={projectMembers}
        onSave={handleSaveTask}
        onDelete={handleInitiateDelete}
        isLoading={createTask.isPending || updateTask.isPending}
      />

      {/* Delete Dialog */}
      <TaskDeleteDialog
        open={!!deleteTask}
        task={deleteTask}
        onOpenChange={(open) => !open && setDeleteTask(null)}
        onConfirm={handleConfirmDelete}
        isLoading={deleteTaskMutation.isPending}
      />

      {/* Audit Log Sheet */}
      <TaskAuditLogSheet
        open={auditLogOpen}
        onOpenChange={setAuditLogOpen}
        auditLog={auditLog || []}
        onExport={handleExportAuditLog}
        isExporting={exportAuditLog.isPending}
      />
    </div>
  );
}
