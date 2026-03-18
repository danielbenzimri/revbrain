/**
 * Tasks Routes
 *
 * API endpoints for task/Kanban management including
 * CRUD operations, status changes, and audit log.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { AppEnv } from '../../types/index.ts';
import { TaskService } from '../../services/task.service.ts';
import { logger } from '../../lib/logger.ts';
import { AppError, ErrorCodes } from '@geometrix/contract';
import { type RouteContext, getRepos, getUser } from '../../lib/route-helpers.ts';

const tasks = new OpenAPIHono<AppEnv>();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const taskStatusSchema = z.enum(['todo', 'in_progress', 'review', 'done']);
const taskPrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);

const createTaskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().max(5000).nullable().optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  dueDate: z.string().nullable().optional(), // ISO date string
  tags: z.array(z.string().max(50)).max(10).optional(),
});

const updateTaskSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const changeStatusSchema = z.object({
  status: taskStatusSchema,
});

const deleteTaskSchema = z.object({
  reason: z.string().max(500).optional(),
  signatureUrl: z.string().url().optional(),
});

const paginationQuerySchema = z.object({
  limit: z.string().optional(),
  offset: z.string().optional(),
});

const taskListQuerySchema = z.object({
  limit: z.string().optional(),
  offset: z.string().optional(),
  status: z.string().optional(),
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getService(c: RouteContext): TaskService {
  const repos = getRepos(c);
  return new TaskService(repos.tasks, repos.taskAuditLogs, repos.projects);
}

function getContext(c: RouteContext) {
  const user = getUser(c);
  return {
    userId: user.id,
    userName: user.fullName || user.email || 'Unknown',
  };
}

// ============================================================================
// TASK ROUTES
// ============================================================================

/**
 * POST /v1/tasks
 * Create a new task
 */
tasks.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['Tasks'],
    summary: 'Create Task',
    description: 'Creates a new task for a project.',
    request: {
      body: {
        content: {
          'application/json': {
            schema: createTaskSchema,
          },
        },
      },
    },
    responses: {
      201: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.any(),
            }),
          },
        },
        description: 'Task created successfully',
      },
    },
  }),
  async (c) => {
    const { user } = c.var;
    const input = c.req.valid('json');

    const service = getService(c);
    const task = await service.createTask({
      projectId: input.projectId,
      organizationId: user.organizationId,
      createdBy: user.id,
      title: input.title,
      description: input.description ?? null,
      status: input.status,
      priority: input.priority,
      assigneeId: input.assigneeId ?? null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      tags: input.tags ?? [],
    });

    logger.info('Task created', {
      taskId: task.id,
      projectId: input.projectId,
      userId: user.id,
    });

    return c.json({ success: true, data: task }, 201);
  }
);

/**
 * GET /v1/tasks/project/:projectId
 * Get tasks for a project with pagination
 */
tasks.openapi(
  createRoute({
    method: 'get',
    path: '/project/{projectId}',
    tags: ['Tasks'],
    summary: 'List Tasks by Project',
    description: 'Returns all tasks for a project with optional status filter and pagination.',
    request: {
      params: z.object({
        projectId: z.string().uuid(),
      }),
      query: taskListQuerySchema,
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.array(z.any()),
              pagination: z.any(),
            }),
          },
        },
        description: 'Tasks retrieved successfully',
      },
    },
  }),
  async (c) => {
    const { projectId } = c.req.valid('param');
    const query = c.req.valid('query');

    const limit = parseInt(query.limit ?? '100', 10);
    const offset = parseInt(query.offset ?? '0', 10);
    const status = query.status;

    const service = getService(c);

    let result;
    if (status && taskStatusSchema.safeParse(status).success) {
      // Filter by specific status
      const tasks = await service.getTasksByProjectAndStatus(
        projectId,
        status as 'todo' | 'in_progress' | 'review' | 'done',
        { limit, offset }
      );
      result = { data: tasks, pagination: { total: tasks.length, limit, offset, hasMore: false } };
    } else {
      result = await service.getTasksByProject(projectId, { limit, offset });
    }

    return c.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  }
);

/**
 * GET /v1/tasks/project/:projectId/kanban
 * Get tasks grouped by status for Kanban board
 */
tasks.openapi(
  createRoute({
    method: 'get',
    path: '/project/{projectId}/kanban',
    tags: ['Tasks'],
    summary: 'Get Kanban Board',
    description: 'Returns tasks grouped by status for Kanban board display.',
    request: {
      params: z.object({
        projectId: z.string().uuid(),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.any(),
            }),
          },
        },
        description: 'Kanban data retrieved successfully',
      },
    },
  }),
  async (c) => {
    const { projectId } = c.req.valid('param');

    const service = getService(c);
    const grouped = await service.getTasksGroupedByStatus(projectId);

    return c.json({ success: true, data: grouped });
  }
);

/**
 * GET /v1/tasks/project/:projectId/summary
 * Get task summary for a project
 */
tasks.openapi(
  createRoute({
    method: 'get',
    path: '/project/{projectId}/summary',
    tags: ['Tasks'],
    summary: 'Get Task Summary',
    description: 'Returns aggregated task summary for a project.',
    request: {
      params: z.object({
        projectId: z.string().uuid(),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.any(),
            }),
          },
        },
        description: 'Summary retrieved successfully',
      },
    },
  }),
  async (c) => {
    const { projectId } = c.req.valid('param');

    const service = getService(c);
    const summary = await service.getProjectTaskSummary(projectId);

    return c.json({ success: true, data: summary });
  }
);

/**
 * GET /v1/tasks/project/:projectId/audit
 * Get audit log for a project
 */
tasks.openapi(
  createRoute({
    method: 'get',
    path: '/project/{projectId}/audit',
    tags: ['Tasks'],
    summary: 'Get Task Audit Log',
    description: 'Returns the audit log for all tasks in a project.',
    request: {
      params: z.object({
        projectId: z.string().uuid(),
      }),
      query: paginationQuerySchema,
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.array(z.any()),
            }),
          },
        },
        description: 'Audit log retrieved successfully',
      },
    },
  }),
  async (c) => {
    const { projectId } = c.req.valid('param');
    const query = c.req.valid('query');

    const limit = parseInt(query.limit ?? '100', 10);
    const offset = parseInt(query.offset ?? '0', 10);

    const service = getService(c);
    const auditLogs = await service.getTaskAuditLog(projectId, { limit, offset });

    return c.json({ success: true, data: auditLogs });
  }
);

/**
 * GET /v1/tasks/project/:projectId/audit/export
 * Export audit log to Excel
 */
tasks.openapi(
  createRoute({
    method: 'get',
    path: '/project/{projectId}/audit/export',
    tags: ['Tasks'],
    summary: 'Export Audit Log to Excel',
    description: 'Exports the task audit log for a project to an Excel file.',
    request: {
      params: z.object({
        projectId: z.string().uuid(),
      }),
    },
    responses: {
      200: {
        content: {
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
            schema: z.any(),
          },
        },
        description: 'Excel file download',
      },
    },
  }),
  async (c) => {
    const { projectId } = c.req.valid('param');
    const { user } = c.var;

    const service = getService(c);
    const buffer = await service.exportAuditLogToExcel(projectId);

    logger.info('Task audit log exported', { projectId, userId: user.id });

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="task-audit-${projectId}.xlsx"`,
      },
    });
  }
);

/**
 * GET /v1/tasks/assigned
 * Get tasks assigned to the current user
 */
tasks.openapi(
  createRoute({
    method: 'get',
    path: '/assigned',
    tags: ['Tasks'],
    summary: 'Get Assigned Tasks',
    description: 'Returns tasks assigned to the current user across all projects.',
    request: {
      query: paginationQuerySchema,
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.array(z.any()),
            }),
          },
        },
        description: 'Assigned tasks retrieved successfully',
      },
    },
  }),
  async (c) => {
    const { user } = c.var;
    const query = c.req.valid('query');

    const limit = parseInt(query.limit ?? '50', 10);
    const offset = parseInt(query.offset ?? '0', 10);

    const service = getService(c);
    const assignedTasks = await service.getTasksByAssignee(user.id, { limit, offset });

    return c.json({ success: true, data: assignedTasks });
  }
);

/**
 * GET /v1/tasks/:id
 * Get a single task by ID
 */
tasks.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['Tasks'],
    summary: 'Get Task',
    description: 'Returns a single task by ID.',
    request: {
      params: z.object({
        id: z.string().uuid(),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.any(),
            }),
          },
        },
        description: 'Task retrieved successfully',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');

    const service = getService(c);
    const task = await service.getTask(id);

    if (!task) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Task not found', 404);
    }

    return c.json({ success: true, data: task });
  }
);

/**
 * PUT /v1/tasks/:id
 * Update a task
 */
tasks.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    tags: ['Tasks'],
    summary: 'Update Task',
    description: 'Updates an existing task.',
    request: {
      params: z.object({
        id: z.string().uuid(),
      }),
      body: {
        content: {
          'application/json': {
            schema: updateTaskSchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.any(),
            }),
          },
        },
        description: 'Task updated successfully',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const { user } = c.var;
    const input = c.req.valid('json');

    const service = getService(c);
    const context = getContext(c);

    const task = await service.updateTask(
      id,
      {
        title: input.title,
        description: input.description,
        status: input.status,
        priority: input.priority,
        assigneeId: input.assigneeId,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        tags: input.tags,
        sortOrder: input.sortOrder,
      },
      context
    );

    logger.info('Task updated', { taskId: id, userId: user.id });

    return c.json({ success: true, data: task });
  }
);

/**
 * PATCH /v1/tasks/:id/status
 * Quick status change for Kanban
 */
tasks.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}/status',
    tags: ['Tasks'],
    summary: 'Change Task Status',
    description: 'Quick status change for Kanban drag-and-drop.',
    request: {
      params: z.object({
        id: z.string().uuid(),
      }),
      body: {
        content: {
          'application/json': {
            schema: changeStatusSchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.any(),
            }),
          },
        },
        description: 'Task status changed successfully',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const { user } = c.var;
    const input = c.req.valid('json');

    const service = getService(c);
    const context = getContext(c);
    const task = await service.changeStatus(id, input.status, context);

    logger.info('Task status changed', { taskId: id, status: input.status, userId: user.id });

    return c.json({ success: true, data: task });
  }
);

/**
 * DELETE /v1/tasks/:id
 * Delete a task (with optional reason and signature for audit)
 */
tasks.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['Tasks'],
    summary: 'Delete Task',
    description: 'Deletes a task with optional reason and signature for audit trail.',
    request: {
      params: z.object({
        id: z.string().uuid(),
      }),
      body: {
        content: {
          'application/json': {
            schema: deleteTaskSchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
            }),
          },
        },
        description: 'Task deleted successfully',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const { user } = c.var;
    const input = c.req.valid('json');

    const service = getService(c);
    await service.deleteTask(id, {
      userId: user.id,
      userName: user.fullName || user.email || 'Unknown',
      reason: input.reason,
      signatureUrl: input.signatureUrl,
    });

    logger.info('Task deleted', { taskId: id, userId: user.id });

    return c.json({ success: true });
  }
);

export { tasks };
