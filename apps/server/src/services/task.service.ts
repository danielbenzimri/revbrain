/**
 * Task Service
 *
 * Handles task/Kanban management including CRUD operations,
 * status workflow, and audit logging.
 *
 * Status workflow:
 *   todo → in_progress → review → done
 *   (can transition between any status)
 */

import * as XLSX from 'xlsx';
import type {
  TaskRepository,
  TaskAuditLogRepository,
  ProjectRepository,
  TaskEntity,
  CreateTaskInput,
  UpdateTaskInput,
  PaginatedResult,
  FindManyOptions,
  TaskStatus,
  TaskPriority,
} from '@revbrain/contract';
import { AppError, ErrorCodes } from '@revbrain/contract';
import { logger } from '../lib/logger.ts';

// ============================================================================
// TYPES
// ============================================================================

export interface CreateTaskRequest {
  projectId: string;
  organizationId: string;
  createdBy: string;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string | null;
  dueDate?: Date | null;
  tags?: string[];
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string | null;
  dueDate?: Date | null;
  tags?: string[];
  sortOrder?: number;
}

export interface DeleteTaskRequest {
  userId: string;
  userName: string;
  reason?: string;
  signatureUrl?: string;
}

export interface TaskContext {
  userId: string;
  userName: string;
}

// ============================================================================
// SERVICE
// ============================================================================

export class TaskService {
  constructor(
    private taskRepo: TaskRepository,
    private taskAuditLogRepo: TaskAuditLogRepository,
    private projectRepo: ProjectRepository
  ) {}

  // ==========================================================================
  // TASK CRUD
  // ==========================================================================

  async createTask(data: CreateTaskRequest): Promise<TaskEntity> {
    // Verify project exists and belongs to organization
    const project = await this.projectRepo.findById(data.projectId);
    if (!project) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Project not found', 404);
    }
    if (project.organizationId !== data.organizationId) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied', 403);
    }

    const taskInput: CreateTaskInput = {
      organizationId: data.organizationId,
      projectId: data.projectId,
      title: data.title,
      description: data.description ?? null,
      status: data.status ?? 'todo',
      priority: data.priority ?? 'medium',
      assigneeId: data.assigneeId ?? null,
      dueDate: data.dueDate ?? null,
      tags: data.tags ?? [],
      createdBy: data.createdBy,
    };

    const task = await this.taskRepo.create(taskInput);

    // Log creation in audit log
    await this.taskAuditLogRepo.create({
      organizationId: data.organizationId,
      projectId: data.projectId,
      taskId: task.id,
      taskTitle: task.title,
      action: 'created',
      userId: data.createdBy,
      userName: 'System', // Will be enriched by caller
      details: `Task created with status '${task.status}' and priority '${task.priority}'`,
    });

    logger.info('Task created', {
      taskId: task.id,
      projectId: data.projectId,
      title: task.title,
      userId: data.createdBy,
    });

    return task;
  }

  async getTask(taskId: string): Promise<TaskEntity | null> {
    return this.taskRepo.findById(taskId);
  }

  async getTasksByProject(
    projectId: string,
    options?: FindManyOptions
  ): Promise<PaginatedResult<TaskEntity>> {
    return this.taskRepo.findByProjectWithPagination(projectId, options);
  }

  async getTasksByProjectAndStatus(
    projectId: string,
    status: TaskStatus,
    options?: FindManyOptions
  ): Promise<TaskEntity[]> {
    return this.taskRepo.findByProjectAndStatus(projectId, status, options);
  }

  async getTasksByAssignee(assigneeId: string, options?: FindManyOptions): Promise<TaskEntity[]> {
    return this.taskRepo.findByAssignee(assigneeId, options);
  }

  async getTasksGroupedByStatus(projectId: string): Promise<Record<TaskStatus, TaskEntity[]>> {
    return this.taskRepo.findGroupedByStatus(projectId);
  }

  async updateTask(
    taskId: string,
    data: UpdateTaskRequest,
    context: TaskContext
  ): Promise<TaskEntity> {
    const task = await this.taskRepo.findById(taskId);
    if (!task) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Task not found', 404);
    }

    const previousStatus = task.status;
    const updateData: UpdateTaskInput = {};

    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.assigneeId !== undefined) updateData.assigneeId = data.assigneeId;
    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate;
    if (data.tags !== undefined) updateData.tags = data.tags;
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;

    const updated = await this.taskRepo.update(taskId, updateData);
    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to update task', 500);
    }

    // Log status change if applicable
    if (data.status !== undefined && data.status !== previousStatus) {
      await this.taskAuditLogRepo.create({
        organizationId: task.organizationId,
        projectId: task.projectId,
        taskId: task.id,
        taskTitle: updated.title,
        action: 'status_changed',
        userId: context.userId,
        userName: context.userName,
        details: `Status changed from '${previousStatus}' to '${data.status}'`,
        previousStatus: previousStatus,
        newStatus: data.status,
      });
    } else {
      // Log general update
      await this.taskAuditLogRepo.create({
        organizationId: task.organizationId,
        projectId: task.projectId,
        taskId: task.id,
        taskTitle: updated.title,
        action: 'updated',
        userId: context.userId,
        userName: context.userName,
        details: 'Task updated',
      });
    }

    logger.info('Task updated', {
      taskId,
      userId: context.userId,
      statusChange: data.status !== previousStatus,
    });

    return updated;
  }

  async deleteTask(taskId: string, request: DeleteTaskRequest): Promise<void> {
    const task = await this.taskRepo.findById(taskId);
    if (!task) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Task not found', 404);
    }

    // Log deletion before actually deleting (captures task info)
    await this.taskAuditLogRepo.create({
      organizationId: task.organizationId,
      projectId: task.projectId,
      taskId: null, // Task will be deleted
      taskTitle: task.title,
      action: 'deleted',
      userId: request.userId,
      userName: request.userName,
      details: `Task deleted. Original status: '${task.status}', priority: '${task.priority}'`,
      reason: request.reason ?? null,
      signatureUrl: request.signatureUrl ?? null,
    });

    await this.taskRepo.delete(taskId);

    logger.info('Task deleted', {
      taskId,
      taskTitle: task.title,
      userId: request.userId,
      reason: request.reason,
    });
  }

  // ==========================================================================
  // STATUS WORKFLOW
  // ==========================================================================

  async changeStatus(
    taskId: string,
    newStatus: TaskStatus,
    context: TaskContext
  ): Promise<TaskEntity> {
    const task = await this.taskRepo.findById(taskId);
    if (!task) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Task not found', 404);
    }

    const previousStatus = task.status;

    if (previousStatus === newStatus) {
      return task; // No change needed
    }

    const updated = await this.taskRepo.update(taskId, { status: newStatus });
    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to update task status', 500);
    }

    await this.taskAuditLogRepo.create({
      organizationId: task.organizationId,
      projectId: task.projectId,
      taskId: task.id,
      taskTitle: task.title,
      action: 'status_changed',
      userId: context.userId,
      userName: context.userName,
      details: `Status changed from '${previousStatus}' to '${newStatus}'`,
      previousStatus: previousStatus,
      newStatus: newStatus,
    });

    logger.info('Task status changed', {
      taskId,
      previousStatus,
      newStatus,
      userId: context.userId,
    });

    return updated;
  }

  // ==========================================================================
  // AUDIT LOG
  // ==========================================================================

  async getTaskAuditLog(
    projectId: string,
    options?: FindManyOptions
  ): Promise<ReturnType<TaskAuditLogRepository['findByProject']>> {
    return this.taskAuditLogRepo.findByProject(projectId, options);
  }

  async exportAuditLogToExcel(projectId: string): Promise<Buffer> {
    const auditLogs = await this.taskAuditLogRepo.findByProject(projectId);

    if (auditLogs.length === 0) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'No audit logs found', 404);
    }

    const workbook = XLSX.utils.book_new();

    const auditData = [
      ['Task Audit Log'],
      [],
      [
        'Date',
        'User',
        'Action',
        'Task Title',
        'Details',
        'Reason',
        'Previous Status',
        'New Status',
      ],
      ...auditLogs.map((log) => [
        log.createdAt.toISOString(),
        log.userName,
        log.action,
        log.taskTitle,
        log.details ?? '',
        log.reason ?? '',
        log.previousStatus ?? '',
        log.newStatus ?? '',
      ]),
    ];

    const sheet = XLSX.utils.aoa_to_sheet(auditData);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Audit Log');

    return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  }

  // ==========================================================================
  // SUMMARY & STATS
  // ==========================================================================

  async getProjectTaskSummary(projectId: string): Promise<{
    total: number;
    byStatus: Record<TaskStatus, number>;
    byPriority: Record<TaskPriority, number>;
    overdue: number;
    completedThisWeek: number;
  }> {
    const tasks = await this.taskRepo.findByProject(projectId);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const byStatus: Record<TaskStatus, number> = {
      todo: 0,
      in_progress: 0,
      review: 0,
      done: 0,
    };

    const byPriority: Record<TaskPriority, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    let overdue = 0;
    let completedThisWeek = 0;

    for (const task of tasks) {
      byStatus[task.status]++;
      byPriority[task.priority]++;

      // Check overdue (has due date, not done, and past due)
      if (task.dueDate && task.status !== 'done' && task.dueDate < now) {
        overdue++;
      }

      // Completed this week
      if (task.status === 'done' && task.completedAt && task.completedAt >= weekAgo) {
        completedThisWeek++;
      }
    }

    return {
      total: tasks.length,
      byStatus,
      byPriority,
      overdue,
      completedThisWeek,
    };
  }
}
