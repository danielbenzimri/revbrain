/**
 * Work Logs Routes
 *
 * API endpoints for daily work log management including
 * CRUD operations, status workflow, signatures, attachments, and exports.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { AppEnv } from '../../types/index.ts';
import {
  WorkLogService,
  type AuditContext,
  type WorkLogUserRole,
} from '../../services/work-log.service.ts';
import { ErrorCodes, AppError } from '@geometrix/contract';
import { type RouteContext, getRepos, getUser } from '../../lib/route-helpers.ts';

const workLogs = new OpenAPIHono<AppEnv>();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const weatherTypeSchema = z.enum([
  'sunny',
  'cloudy',
  'rainy',
  'stormy',
  'snowy',
  'foggy',
  'windy',
  'hot',
  'cold',
]);
const workLogStatusSchema = z.enum(['draft', 'submitted', 'approved']);

const workLogResourceEntrySchema = z.object({
  id: z.string().optional(),
  type: z.string().min(1).max(100),
  contractorCount: z.number().int().min(0),
  supervisorCount: z.number().int().min(0),
});

const resourceEntrySchema = z.object({
  trade: z.string().min(1).max(100),
  count: z.number().int().min(0),
  hours: z.number().min(0),
});

const equipmentEntrySchema = z.object({
  name: z.string().min(1).max(100),
  count: z.number().int().min(0),
  hours: z.number().min(0),
});

const attachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  url: z.string().url(),
  uploadedAt: z.string(),
});

const createWorkLogSchema = z.object({
  projectId: z.string().uuid(),
  logDate: z.string(),
  weatherType: weatherTypeSchema.nullable().optional(),
  weatherTempCelsius: z.number().int().min(-50).max(60).nullable().optional(),
  contractorResources: z.array(workLogResourceEntrySchema).default([]),
  externalResources: z.array(workLogResourceEntrySchema).default([]),
  resources: z.array(resourceEntrySchema).default([]),
  equipment: z.array(equipmentEntrySchema).default([]),
  contractorWorkDescription: z.string().max(5000).nullable().optional(),
  supervisorWorkDescription: z.string().max(5000).nullable().optional(),
  contractorNotes: z.string().max(2000).nullable().optional(),
  supervisorNotes: z.string().max(2000).nullable().optional(),
  activities: z.string().max(5000).nullable().optional(),
  issues: z.string().max(2000).nullable().optional(),
  safetyNotes: z.string().max(2000).nullable().optional(),
  trafficControllersInfo: z.string().max(2000).nullable().optional(),
  exactAddress: z.string().max(500).nullable().optional(),
});

const updateWorkLogSchema = z.object({
  logDate: z.string().optional(),
  status: workLogStatusSchema.optional(),
  weatherType: weatherTypeSchema.nullable().optional(),
  weatherTempCelsius: z.number().int().min(-50).max(60).nullable().optional(),
  contractorResources: z.array(workLogResourceEntrySchema).optional(),
  externalResources: z.array(workLogResourceEntrySchema).optional(),
  resources: z.array(resourceEntrySchema).optional(),
  equipment: z.array(equipmentEntrySchema).optional(),
  contractorWorkDescription: z.string().max(5000).nullable().optional(),
  supervisorWorkDescription: z.string().max(5000).nullable().optional(),
  contractorNotes: z.string().max(2000).nullable().optional(),
  supervisorNotes: z.string().max(2000).nullable().optional(),
  activities: z.string().max(5000).nullable().optional(),
  issues: z.string().max(2000).nullable().optional(),
  safetyNotes: z.string().max(2000).nullable().optional(),
  trafficControllersInfo: z.string().max(2000).nullable().optional(),
  exactAddress: z.string().max(500).nullable().optional(),
  attachments: z.array(attachmentSchema).optional(),
});

const signWorkLogSchema = z.object({
  signatureUrl: z.string().url(),
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getService(c: RouteContext): WorkLogService {
  const repos = getRepos(c);
  return new WorkLogService(repos.workLogs, repos.projects);
}

function getAuditContext(c: RouteContext): AuditContext {
  const user = getUser(c);
  const role: WorkLogUserRole =
    user.role === 'system_admin'
      ? 'admin'
      : user.role === 'supervisor' || user.role === 'inspector'
        ? 'supervisor'
        : 'contractor';

  return {
    userId: user.id,
    userName: user.fullName || user.email || 'Unknown',
    company: user.organizationId,
    role,
  };
}

// ============================================================================
// CRUD ROUTES
// ============================================================================

workLogs.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['Work Logs'],
    summary: 'Create Work Log',
    description: 'Creates a new daily work log.',
    request: {
      body: { content: { 'application/json': { schema: createWorkLogSchema } } },
    },
    responses: {
      201: {
        content: {
          'application/json': { schema: z.object({ success: z.boolean(), data: z.any() }) },
        },
        description: 'Work log created successfully',
      },
    },
  }),
  async (c) => {
    const { user } = c.var;
    const input = c.req.valid('json');

    const service = getService(c);
    const workLog = await service.createWorkLog({
      projectId: input.projectId,
      organizationId: user.organizationId,
      createdBy: user.id,
      logDate: new Date(input.logDate),
      weatherType: input.weatherType ?? null,
      weatherTempCelsius: input.weatherTempCelsius ?? null,
      contractorResources: input.contractorResources,
      externalResources: input.externalResources,
      resources: input.resources,
      equipment: input.equipment,
      contractorWorkDescription: input.contractorWorkDescription ?? null,
      supervisorWorkDescription: input.supervisorWorkDescription ?? null,
      contractorNotes: input.contractorNotes ?? null,
      supervisorNotes: input.supervisorNotes ?? null,
      activities: input.activities ?? null,
      issues: input.issues ?? null,
      safetyNotes: input.safetyNotes ?? null,
      trafficControllersInfo: input.trafficControllersInfo ?? null,
      exactAddress: input.exactAddress ?? null,
    });

    return c.json({ success: true, data: workLog }, 201);
  }
);

workLogs.openapi(
  createRoute({
    method: 'get',
    path: '/project/{projectId}',
    tags: ['Work Logs'],
    summary: 'List Work Logs by Project',
    description: 'Returns paginated work logs for a project.',
    request: {
      params: z.object({ projectId: z.string().uuid() }),
      query: z.object({
        limit: z.coerce.number().optional(),
        offset: z.coerce.number().optional(),
        status: workLogStatusSchema.optional(),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({ success: z.boolean(), data: z.array(z.any()), pagination: z.any() }),
          },
        },
        description: 'Work logs retrieved successfully',
      },
    },
  }),
  async (c) => {
    const { projectId } = c.req.valid('param');
    const { limit, offset, status } = c.req.valid('query');

    const service = getService(c);
    const parsedLimit = limit || 20;
    const parsedOffset = offset || 0;

    let result;
    if (status) {
      result = await service.getWorkLogsByProjectAndStatus(projectId, status, {
        limit: parsedLimit,
        offset: parsedOffset,
      });
    } else {
      result = await service.getWorkLogsByProject(projectId, {
        limit: parsedLimit,
        offset: parsedOffset,
      });
    }

    return c.json({ success: true, data: result.data, pagination: result.pagination });
  }
);

workLogs.openapi(
  createRoute({
    method: 'get',
    path: '/project/{projectId}/date-range',
    tags: ['Work Logs'],
    summary: 'Get Work Logs by Date Range',
    description: 'Returns work logs within a date range.',
    request: {
      params: z.object({ projectId: z.string().uuid() }),
      query: z.object({ startDate: z.string(), endDate: z.string() }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({ success: z.boolean(), data: z.array(z.any()) }),
          },
        },
        description: 'Work logs retrieved successfully',
      },
    },
  }),
  async (c) => {
    const { projectId } = c.req.valid('param');
    const { startDate, endDate } = c.req.valid('query');

    const service = getService(c);
    const workLogList = await service.getWorkLogsByDateRange(
      projectId,
      new Date(startDate),
      new Date(endDate)
    );

    return c.json({ success: true, data: workLogList });
  }
);

workLogs.openapi(
  createRoute({
    method: 'get',
    path: '/project/{projectId}/date/{date}',
    tags: ['Work Logs'],
    summary: 'Get Work Log by Date',
    description: 'Returns the work log for a specific date.',
    request: { params: z.object({ projectId: z.string().uuid(), date: z.string() }) },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({ success: z.boolean(), data: z.any().nullable() }),
          },
        },
        description: 'Work log retrieved successfully',
      },
    },
  }),
  async (c) => {
    const { projectId, date } = c.req.valid('param');

    const service = getService(c);
    const workLog = await service.getWorkLogByDate(projectId, new Date(date));

    if (!workLog) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Work log not found', 404);
    }

    return c.json({ success: true, data: workLog });
  }
);

workLogs.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['Work Logs'],
    summary: 'Get Work Log',
    description: 'Returns a single work log by ID.',
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: {
        content: {
          'application/json': { schema: z.object({ success: z.boolean(), data: z.any() }) },
        },
        description: 'Work log retrieved successfully',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');

    const service = getService(c);
    const workLog = await service.getWorkLog(id);

    if (!workLog) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Work log not found', 404);
    }

    return c.json({ success: true, data: workLog });
  }
);

workLogs.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    tags: ['Work Logs'],
    summary: 'Update Work Log',
    description: 'Updates an existing work log.',
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: updateWorkLogSchema } } },
    },
    responses: {
      200: {
        content: {
          'application/json': { schema: z.object({ success: z.boolean(), data: z.any() }) },
        },
        description: 'Work log updated successfully',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const input = c.req.valid('json');

    const service = getService(c);
    const context = getAuditContext(c);

    const workLog = await service.updateWorkLog(
      id,
      {
        logDate: input.logDate ? new Date(input.logDate) : undefined,
        status: input.status,
        weatherType: input.weatherType,
        weatherTempCelsius: input.weatherTempCelsius,
        contractorResources: input.contractorResources,
        externalResources: input.externalResources,
        resources: input.resources,
        equipment: input.equipment,
        contractorWorkDescription: input.contractorWorkDescription,
        supervisorWorkDescription: input.supervisorWorkDescription,
        contractorNotes: input.contractorNotes,
        supervisorNotes: input.supervisorNotes,
        activities: input.activities,
        issues: input.issues,
        safetyNotes: input.safetyNotes,
        trafficControllersInfo: input.trafficControllersInfo,
        exactAddress: input.exactAddress,
        attachments: input.attachments,
      },
      context
    );

    return c.json({ success: true, data: workLog });
  }
);

workLogs.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['Work Logs'],
    summary: 'Delete Work Log',
    description: 'Deletes a work log.',
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: {
        content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
        description: 'Work log deleted successfully',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const { user } = c.var;

    const service = getService(c);
    await service.deleteWorkLog(id, user.id);

    return c.json({ success: true });
  }
);

// ============================================================================
// STATUS WORKFLOW ROUTES
// ============================================================================

workLogs.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/submit',
    tags: ['Work Logs'],
    summary: 'Submit Work Log',
    description: 'Submits a work log (draft → submitted).',
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: {
        content: {
          'application/json': { schema: z.object({ success: z.boolean(), data: z.any() }) },
        },
        description: 'Work log submitted successfully',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');

    const service = getService(c);
    const context = getAuditContext(c);
    const workLog = await service.submitWorkLog(id, context);

    return c.json({ success: true, data: workLog });
  }
);

workLogs.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/approve',
    tags: ['Work Logs'],
    summary: 'Approve Work Log',
    description: 'Approves a work log (submitted → approved).',
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: {
        content: {
          'application/json': { schema: z.object({ success: z.boolean(), data: z.any() }) },
        },
        description: 'Work log approved successfully',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');

    const service = getService(c);
    const context = getAuditContext(c);
    const workLog = await service.approveWorkLog(id, context);

    return c.json({ success: true, data: workLog });
  }
);

workLogs.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/revert',
    tags: ['Work Logs'],
    summary: 'Revert Work Log to Draft',
    description: 'Reverts a work log back to draft status.',
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: {
        content: {
          'application/json': { schema: z.object({ success: z.boolean(), data: z.any() }) },
        },
        description: 'Work log reverted successfully',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');

    const service = getService(c);
    const context = getAuditContext(c);
    const workLog = await service.revertToDraft(id, context);

    return c.json({ success: true, data: workLog });
  }
);

// ============================================================================
// SIGNATURE ROUTES
// ============================================================================

workLogs.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/sign/contractor',
    tags: ['Work Logs'],
    summary: 'Sign as Contractor',
    description: 'Signs the work log as a contractor.',
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: signWorkLogSchema } } },
    },
    responses: {
      200: {
        content: {
          'application/json': { schema: z.object({ success: z.boolean(), data: z.any() }) },
        },
        description: 'Work log signed successfully',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const { signatureUrl } = c.req.valid('json');

    const service = getService(c);
    const context = getAuditContext(c);
    const workLog = await service.signAsContractor(id, context, signatureUrl);

    return c.json({ success: true, data: workLog });
  }
);

workLogs.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/sign/inspector',
    tags: ['Work Logs'],
    summary: 'Sign as Inspector',
    description: 'Signs the work log as an inspector.',
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: signWorkLogSchema } } },
    },
    responses: {
      200: {
        content: {
          'application/json': { schema: z.object({ success: z.boolean(), data: z.any() }) },
        },
        description: 'Work log signed successfully',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const { signatureUrl } = c.req.valid('json');

    const service = getService(c);
    const context = getAuditContext(c);
    const workLog = await service.signAsInspector(id, context, signatureUrl);

    return c.json({ success: true, data: workLog });
  }
);

// ============================================================================
// ATTACHMENT ROUTES
// ============================================================================

workLogs.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/attachments',
    tags: ['Work Logs'],
    summary: 'Add Attachment',
    description: 'Adds an attachment to a work log.',
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: attachmentSchema } } },
    },
    responses: {
      200: {
        content: {
          'application/json': { schema: z.object({ success: z.boolean(), data: z.any() }) },
        },
        description: 'Attachment added successfully',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const attachment = c.req.valid('json');

    const service = getService(c);
    const context = getAuditContext(c);
    const workLog = await service.addAttachment(id, attachment, context);

    return c.json({ success: true, data: workLog });
  }
);

workLogs.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}/attachments/{attachmentId}',
    tags: ['Work Logs'],
    summary: 'Remove Attachment',
    description: 'Removes an attachment from a work log.',
    request: { params: z.object({ id: z.string().uuid(), attachmentId: z.string() }) },
    responses: {
      200: {
        content: {
          'application/json': { schema: z.object({ success: z.boolean(), data: z.any() }) },
        },
        description: 'Attachment removed successfully',
      },
    },
  }),
  async (c) => {
    const { id, attachmentId } = c.req.valid('param');

    const service = getService(c);
    const context = getAuditContext(c);
    const workLog = await service.removeAttachment(id, attachmentId, context);

    return c.json({ success: true, data: workLog });
  }
);

// ============================================================================
// EXPORT ROUTES
// ============================================================================

workLogs.openapi(
  createRoute({
    method: 'get',
    path: '/{id}/export',
    tags: ['Work Logs'],
    summary: 'Export Work Log to Excel',
    description: 'Exports a single work log to Excel.',
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: {
        content: {
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: z.any() },
        },
        description: 'Excel file download',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');

    const service = getService(c);
    const buffer = await service.exportToExcel(id);

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="work-log-${id}.xlsx"`,
      },
    });
  }
);

workLogs.openapi(
  createRoute({
    method: 'get',
    path: '/project/{projectId}/export',
    tags: ['Work Logs'],
    summary: 'Export Work Logs to Excel',
    description: 'Exports work logs for a date range to Excel.',
    request: {
      params: z.object({ projectId: z.string().uuid() }),
      query: z.object({ startDate: z.string(), endDate: z.string() }),
    },
    responses: {
      200: {
        content: {
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: z.any() },
        },
        description: 'Excel file download',
      },
    },
  }),
  async (c) => {
    const { projectId } = c.req.valid('param');
    const { startDate, endDate } = c.req.valid('query');

    const service = getService(c);
    const buffer = await service.exportRangeToExcel(
      projectId,
      new Date(startDate),
      new Date(endDate)
    );

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="work-logs-${projectId}.xlsx"`,
      },
    });
  }
);

workLogs.openapi(
  createRoute({
    method: 'get',
    path: '/project/{projectId}/summary',
    tags: ['Work Logs'],
    summary: 'Get Work Log Summary',
    description: 'Returns summary statistics for project work logs.',
    request: { params: z.object({ projectId: z.string().uuid() }) },
    responses: {
      200: {
        content: {
          'application/json': { schema: z.object({ success: z.boolean(), data: z.any() }) },
        },
        description: 'Summary retrieved successfully',
      },
    },
  }),
  async (c) => {
    const { projectId } = c.req.valid('param');

    const service = getService(c);
    const summary = await service.getProjectWorkLogSummary(projectId);

    return c.json({ success: true, data: summary });
  }
);

export { workLogs };
