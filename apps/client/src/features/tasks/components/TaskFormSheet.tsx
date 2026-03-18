/**
 * TaskFormSheet Component
 *
 * Sheet for creating and editing tasks matching the legacy modal layout:
 * - Header with title and optional creator info (for edit mode)
 * - Form fields: title, assignee, due date, status, priority, description
 * - Footer with delete button (edit mode), cancel, and save buttons
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, User, Save, Trash2, Loader2, X, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetFooter, SheetTitle } from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  Task,
  TaskStatus,
  TaskPriority,
  CreateTaskInput,
  UpdateTaskInput,
} from '../hooks/use-tasks';

interface TaskFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  projectId: string;
  projectMembers: { id: string; name: string; avatar?: string }[];
  onSave: (data: CreateTaskInput | UpdateTaskInput) => Promise<void>;
  onDelete: (task: Task) => void;
  isLoading: boolean;
}

export function TaskFormSheet({
  open,
  onOpenChange,
  task,
  projectMembers,
  onSave,
  onDelete,
  isLoading,
}: Omit<TaskFormSheetProps, 'projectId'>) {
  const { t, i18n } = useTranslation('tasks');
  const isRTL = i18n.language === 'he';
  const isEdit = !!task;

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState('');

  // Derive initial form values from task (avoiding setState in useEffect)
  const initialTitle = task?.title ?? '';
  const initialDescription = task?.description ?? '';
  const initialStatus = task?.status ?? 'todo';
  const initialPriority = task?.priority ?? 'medium';
  const initialAssigneeId = task?.assigneeId ?? null;
  const initialDueDate = task?.dueDate?.split('T')[0] ?? new Date().toISOString().split('T')[0];

  // Reset form when sheet opens with different task
  const taskId = task?.id;
  if (open && title === '' && initialTitle !== '' && taskId) {
    setTitle(initialTitle);
    setDescription(initialDescription);
    setStatus(initialStatus);
    setPriority(initialPriority);
    setAssigneeId(initialAssigneeId);
    setDueDate(initialDueDate);
  }

  // Reset form when opening for new task
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      // Reset on close
      setTitle('');
      setDescription('');
      setStatus('todo');
      setPriority('medium');
      setAssigneeId(null);
      setDueDate(new Date().toISOString().split('T')[0]);
    }
    onOpenChange(isOpen);
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;

    const data = {
      title: title.trim(),
      description: description.trim() || null,
      status,
      priority,
      assigneeId: assigneeId || null,
      dueDate: dueDate || null,
    };

    await onSave(data);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side={isRTL ? 'left' : 'right'}
        className="w-full sm:max-w-xl p-0 flex flex-col"
        hideCloseButton
      >
        {/* Hidden title for accessibility */}
        <SheetTitle className="sr-only">{isEdit ? t('editTask') : t('newTask')}</SheetTitle>

        {/* Stylish Header */}
        <div>
          <div className="h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
          <div className="relative bg-gradient-to-b from-slate-50 to-white px-6 pt-5 pb-4">
            <button
              onClick={() => handleOpenChange(false)}
              className={`absolute top-3 ${isRTL ? 'left-4' : 'right-4'} p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600 z-10`}
            >
              <X className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                <ClipboardCheck className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {isEdit ? t('editTask') : t('newTask')}
                </h2>
                {isEdit && task && (
                  <p className="text-sm text-slate-400">
                    {t('task.createdAt')}:{' '}
                    {new Date(task.createdAt).toLocaleDateString(
                      i18n.language === 'he' ? 'he-IL' : 'en-US'
                    )}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title" className="font-bold">
              {t('task.title')} *
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('task.title')}
              className="text-lg font-medium"
              autoFocus
            />
          </div>

          {/* Assignee & Due Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="assignee">{t('task.assignee')}</Label>
              <div className="relative">
                <Select
                  value={assigneeId || 'unassigned'}
                  onValueChange={(v) => setAssigneeId(v === 'unassigned' ? null : v)}
                >
                  <SelectTrigger>
                    <User className="h-4 w-4 text-slate-400 me-2" />
                    <SelectValue placeholder={t('filters.unassigned')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">{t('filters.unassigned')}</SelectItem>
                    {projectMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dueDate">{t('task.dueDate')}</Label>
              <div className="relative">
                <Calendar className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="ps-10"
                />
              </div>
            </div>
          </div>

          {/* Status & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">{t('task.status')}</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">{t('status.todo')}</SelectItem>
                  <SelectItem value="in_progress">{t('status.in_progress')}</SelectItem>
                  <SelectItem value="review">{t('status.review')}</SelectItem>
                  <SelectItem value="done">{t('status.done')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">{t('task.priority')}</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t('priority.low')}</SelectItem>
                  <SelectItem value="medium">{t('priority.medium')}</SelectItem>
                  <SelectItem value="high">{t('priority.high')}</SelectItem>
                  <SelectItem value="critical">{t('priority.critical')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">{t('task.description')}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('task.description')}
              rows={5}
              className="resize-none"
            />
          </div>
        </div>

        <SheetFooter className="px-6 py-4 bg-slate-50 flex justify-between">
          {isEdit && task ? (
            <Button
              variant="ghost"
              onClick={() => onDelete(task)}
              className="text-red-500 hover:text-red-600 hover:bg-red-50"
            >
              <Trash2 size={18} className="me-2" />
              {t('actions.delete')}
            </Button>
          ) : (
            <div />
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('delete.cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!title.trim() || isLoading}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {isLoading ? (
                <Loader2 size={18} className="me-2 animate-spin" />
              ) : (
                <Save size={18} className="me-2" />
              )}
              {isEdit ? t('notifications.updated') : t('create')}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
