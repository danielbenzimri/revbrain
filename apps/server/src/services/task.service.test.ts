/**
 * Unit tests for TaskService
 *
 * Tests task CRUD, status workflow, and audit logging.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskService } from './task.service.ts';
import type {
  TaskRepository,
  TaskAuditLogRepository,
  ProjectRepository,
  TaskEntity,
} from '@revbrain/contract';

// Mock logger
vi.mock('../lib/logger.ts', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock xlsx
vi.mock('xlsx', () => ({
  utils: {
    book_new: vi.fn(() => ({})),
    aoa_to_sheet: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
  },
  write: vi.fn(() => new Uint8Array([1, 2, 3])),
}));

describe('TaskService', () => {
  let taskService: TaskService;
  let mockTaskRepo: TaskRepository;
  let mockTaskAuditLogRepo: TaskAuditLogRepository;
  let mockProjectRepo: ProjectRepository;

  const mockProject = {
    id: 'project-123',
    organizationId: 'org-123',
    name: 'Test Project',
  };

  const mockTask: TaskEntity = {
    id: 'task-123',
    organizationId: 'org-123',
    projectId: 'project-123',
    title: 'Test Task',
    description: 'Test description',
    status: 'todo',
    priority: 'medium',
    assigneeId: null,
    dueDate: null,
    tags: [],
    taskNumber: 1,
    sortOrder: 0,
    createdBy: 'user-123',
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockTaskRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByProject: vi.fn(),
      findByProjectWithPagination: vi.fn(),
      findByProjectAndStatus: vi.fn(),
      findByAssignee: vi.fn(),
      findGroupedByStatus: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as TaskRepository;

    mockTaskAuditLogRepo = {
      create: vi.fn(),
      findByProject: vi.fn(),
    } as unknown as TaskAuditLogRepository;

    mockProjectRepo = {
      findById: vi.fn(),
    } as unknown as ProjectRepository;

    taskService = new TaskService(mockTaskRepo, mockTaskAuditLogRepo, mockProjectRepo);
  });

  describe('createTask', () => {
    it('should create a task successfully', async () => {
      (mockProjectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockProject);
      (mockTaskRepo.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockTask);
      (mockTaskAuditLogRepo.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const result = await taskService.createTask({
        projectId: 'project-123',
        organizationId: 'org-123',
        createdBy: 'user-123',
        title: 'Test Task',
        description: 'Test description',
      });

      expect(result).toEqual(mockTask);
      expect(mockTaskRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-123',
          projectId: 'project-123',
          title: 'Test Task',
          description: 'Test description',
          status: 'todo',
          priority: 'medium',
        })
      );
      expect(mockTaskAuditLogRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'created',
          taskId: 'task-123',
        })
      );
    });

    it('should throw NOT_FOUND when project does not exist', async () => {
      (mockProjectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        taskService.createTask({
          projectId: 'non-existent',
          organizationId: 'org-123',
          createdBy: 'user-123',
          title: 'Test Task',
        })
      ).rejects.toThrow('Project not found');
    });

    it('should throw FORBIDDEN when project belongs to different org', async () => {
      (mockProjectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockProject,
        organizationId: 'different-org',
      });

      await expect(
        taskService.createTask({
          projectId: 'project-123',
          organizationId: 'org-123',
          createdBy: 'user-123',
          title: 'Test Task',
        })
      ).rejects.toThrow('Access denied');
    });

    it('should use provided status and priority', async () => {
      (mockProjectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockProject);
      (mockTaskRepo.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockTask,
        status: 'in_progress',
        priority: 'high',
      });
      (mockTaskAuditLogRepo.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await taskService.createTask({
        projectId: 'project-123',
        organizationId: 'org-123',
        createdBy: 'user-123',
        title: 'Test Task',
        status: 'in_progress',
        priority: 'high',
      });

      expect(mockTaskRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'in_progress',
          priority: 'high',
        })
      );
    });
  });

  describe('getTask', () => {
    it('should return task when found', async () => {
      (mockTaskRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockTask);

      const result = await taskService.getTask('task-123');

      expect(result).toEqual(mockTask);
    });

    it('should return null when task not found', async () => {
      (mockTaskRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await taskService.getTask('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('updateTask', () => {
    const context = { userId: 'user-123', userName: 'Test User' };

    it('should update task successfully', async () => {
      (mockTaskRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockTask);
      (mockTaskRepo.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockTask,
        title: 'Updated Title',
      });
      (mockTaskAuditLogRepo.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const result = await taskService.updateTask('task-123', { title: 'Updated Title' }, context);

      expect(result.title).toBe('Updated Title');
      expect(mockTaskAuditLogRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'updated',
        })
      );
    });

    it('should throw NOT_FOUND when task does not exist', async () => {
      (mockTaskRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        taskService.updateTask('non-existent', { title: 'Updated' }, context)
      ).rejects.toThrow('Task not found');
    });

    it('should log status_changed when status changes', async () => {
      (mockTaskRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockTask);
      (mockTaskRepo.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockTask,
        status: 'in_progress',
      });
      (mockTaskAuditLogRepo.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await taskService.updateTask('task-123', { status: 'in_progress' }, context);

      expect(mockTaskAuditLogRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'status_changed',
          previousStatus: 'todo',
          newStatus: 'in_progress',
        })
      );
    });

    it('should throw error when update fails', async () => {
      (mockTaskRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockTask);
      (mockTaskRepo.update as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        taskService.updateTask('task-123', { title: 'Updated' }, context)
      ).rejects.toThrow('Failed to update task');
    });
  });

  describe('deleteTask', () => {
    const deleteRequest = {
      userId: 'user-123',
      userName: 'Test User',
      reason: 'No longer needed',
    };

    it('should delete task successfully', async () => {
      (mockTaskRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockTask);
      (mockTaskAuditLogRepo.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (mockTaskRepo.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await expect(taskService.deleteTask('task-123', deleteRequest)).resolves.toBeUndefined();

      expect(mockTaskAuditLogRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'deleted',
          taskId: null,
          reason: 'No longer needed',
        })
      );
      expect(mockTaskRepo.delete).toHaveBeenCalledWith('task-123');
    });

    it('should throw NOT_FOUND when task does not exist', async () => {
      (mockTaskRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(taskService.deleteTask('non-existent', deleteRequest)).rejects.toThrow(
        'Task not found'
      );
    });
  });

  describe('changeStatus', () => {
    const context = { userId: 'user-123', userName: 'Test User' };

    it('should change status successfully', async () => {
      (mockTaskRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockTask);
      (mockTaskRepo.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockTask,
        status: 'done',
      });
      (mockTaskAuditLogRepo.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const result = await taskService.changeStatus('task-123', 'done', context);

      expect(result.status).toBe('done');
      expect(mockTaskAuditLogRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'status_changed',
          previousStatus: 'todo',
          newStatus: 'done',
        })
      );
    });

    it('should return unchanged task when status is same', async () => {
      (mockTaskRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockTask);

      const result = await taskService.changeStatus('task-123', 'todo', context);

      expect(result).toEqual(mockTask);
      expect(mockTaskRepo.update).not.toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when task does not exist', async () => {
      (mockTaskRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(taskService.changeStatus('non-existent', 'done', context)).rejects.toThrow(
        'Task not found'
      );
    });
  });

  describe('getProjectTaskSummary', () => {
    it('should calculate summary correctly', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const overdueDueDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      const tasks: TaskEntity[] = [
        { ...mockTask, id: '1', status: 'todo', priority: 'low' },
        { ...mockTask, id: '2', status: 'todo', priority: 'medium' },
        { ...mockTask, id: '3', status: 'in_progress', priority: 'high' },
        {
          ...mockTask,
          id: '4',
          status: 'done',
          priority: 'critical',
          completedAt: yesterday,
        },
        {
          ...mockTask,
          id: '5',
          status: 'review',
          priority: 'medium',
          dueDate: overdueDueDate,
        },
      ];

      (mockTaskRepo.findByProject as ReturnType<typeof vi.fn>).mockResolvedValue(tasks);

      const result = await taskService.getProjectTaskSummary('project-123');

      expect(result.total).toBe(5);
      expect(result.byStatus.todo).toBe(2);
      expect(result.byStatus.in_progress).toBe(1);
      expect(result.byStatus.done).toBe(1);
      expect(result.byStatus.review).toBe(1);
      expect(result.byPriority.low).toBe(1);
      expect(result.byPriority.medium).toBe(2);
      expect(result.byPriority.high).toBe(1);
      expect(result.byPriority.critical).toBe(1);
      expect(result.overdue).toBe(1);
      expect(result.completedThisWeek).toBe(1);
    });

    it('should return zero counts for empty project', async () => {
      (mockTaskRepo.findByProject as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await taskService.getProjectTaskSummary('project-123');

      expect(result.total).toBe(0);
      expect(result.byStatus.todo).toBe(0);
      expect(result.overdue).toBe(0);
      expect(result.completedThisWeek).toBe(0);
    });
  });

  describe('getTasksByProject', () => {
    it('should return paginated tasks', async () => {
      const paginatedResult = {
        items: [mockTask],
        total: 1,
        hasMore: false,
      };
      (mockTaskRepo.findByProjectWithPagination as ReturnType<typeof vi.fn>).mockResolvedValue(
        paginatedResult
      );

      const result = await taskService.getTasksByProject('project-123', { limit: 10, offset: 0 });

      expect(result).toEqual(paginatedResult);
    });
  });

  describe('getTasksGroupedByStatus', () => {
    it('should return tasks grouped by status', async () => {
      const grouped = {
        todo: [mockTask],
        in_progress: [],
        review: [],
        done: [],
      };
      (mockTaskRepo.findGroupedByStatus as ReturnType<typeof vi.fn>).mockResolvedValue(grouped);

      const result = await taskService.getTasksGroupedByStatus('project-123');

      expect(result).toEqual(grouped);
    });
  });

  describe('exportAuditLogToExcel', () => {
    it('should throw NOT_FOUND when no audit logs exist', async () => {
      (mockTaskAuditLogRepo.findByProject as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await expect(taskService.exportAuditLogToExcel('project-123')).rejects.toThrow(
        'No audit logs found'
      );
    });

    it('should return buffer when audit logs exist', async () => {
      (mockTaskAuditLogRepo.findByProject as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'log-1',
          createdAt: new Date(),
          userName: 'Test User',
          action: 'created',
          taskTitle: 'Test Task',
          details: 'Task created',
        },
      ]);

      const result = await taskService.exportAuditLogToExcel('project-123');

      expect(result).toBeInstanceOf(Buffer);
    });
  });
});
