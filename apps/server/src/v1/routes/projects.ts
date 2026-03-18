/**
 * Projects Routes
 *
 * API endpoints for project management including
 * CRUD operations and organization-scoped queries.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { AppEnv } from '../../types/index.ts';
import { logger } from '../../lib/logger.ts';
import { AppError, ErrorCodes } from '@revbrain/contract';
import { projectFilesRouter } from './project-files.ts';

const projectsRouter = new OpenAPIHono<AppEnv>();

// Mount sub-routers
projectsRouter.route('/:projectId/files', projectFilesRouter);

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

// Helper to transform date string to Date object
const dateStringToDate = z.preprocess(
  (val) => (typeof val === 'string' ? new Date(val) : val),
  z.date().nullable().optional()
);

const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  startDate: dateStringToDate,
  endDate: dateStringToDate,
  notes: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  startDate: dateStringToDate,
  endDate: dateStringToDate,
  status: z.enum(['active', 'on_hold', 'completed', 'cancelled']).optional(),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Shared project response schema for OpenAPI docs
const projectResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  organizationId: z.string().uuid(),
  ownerId: z.string().uuid(),
  status: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  notes: z.string().nullable(),
  metadata: z.any().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /v1/projects
 * Get all projects for the current user's organization
 */
projectsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Projects'],
    summary: 'List Projects',
    description: "Returns all projects for the current user's organization.",
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.array(projectResponseSchema),
              meta: z.object({ count: z.number() }),
            }),
          },
        },
        description: 'Projects list retrieved successfully',
      },
    },
  }),
  async (c) => {
    const { user, repos } = c.var;

    const projects = await repos.projects.findByOrganization(user.organizationId);

    return c.json({
      success: true,
      data: projects,
      meta: { count: projects.length },
    });
  }
);

/**
 * GET /v1/projects/:id
 * Get a single project by ID
 */
projectsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['Projects'],
    summary: 'Get Project',
    description: 'Returns a single project by ID.',
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
              data: projectResponseSchema,
            }),
          },
        },
        description: 'Project retrieved successfully',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const { user, repos } = c.var;

    const project = await repos.projects.findById(id);

    if (!project) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Project not found', 404);
    }

    // Verify user has access to this project (same organization)
    if (project.organizationId !== user.organizationId) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied', 403);
    }

    return c.json({
      success: true,
      data: project,
    });
  }
);

/**
 * POST /v1/projects
 * Create a new project
 */
projectsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['Projects'],
    summary: 'Create Project',
    description: "Creates a new project in the user's organization.",
    request: {
      body: {
        content: {
          'application/json': {
            schema: createProjectSchema,
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
              data: projectResponseSchema,
            }),
          },
        },
        description: 'Project created successfully',
      },
    },
  }),
  async (c) => {
    const { user, repos } = c.var;
    const input = c.req.valid('json');

    const project = await repos.projects.create({
      ...input,
      organizationId: user.organizationId,
      ownerId: user.id,
    });

    logger.info('Project created', {
      projectId: project.id,
      userId: user.id,
      organizationId: user.organizationId,
    });

    return c.json(
      {
        success: true,
        data: project,
      },
      201
    );
  }
);

/**
 * PUT /v1/projects/:id
 * Update a project
 */
projectsRouter.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    tags: ['Projects'],
    summary: 'Update Project',
    description: 'Updates an existing project.',
    request: {
      params: z.object({
        id: z.string().uuid(),
      }),
      body: {
        content: {
          'application/json': {
            schema: updateProjectSchema,
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
        description: 'Project updated successfully',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const { user, repos } = c.var;
    const input = c.req.valid('json');

    // Check project exists and user has access
    const existing = await repos.projects.findById(id);
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Project not found', 404);
    }
    if (existing.organizationId !== user.organizationId) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied', 403);
    }

    const project = await repos.projects.update(id, input);

    if (!project) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Project not found after update', 404);
    }

    logger.info('Project updated', { projectId: id, userId: user.id });

    return c.json({
      success: true,
      data: project,
    });
  }
);

/**
 * DELETE /v1/projects/:id
 * Delete a project
 */
projectsRouter.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['Projects'],
    summary: 'Delete Project',
    description: 'Deletes a project.',
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
              message: z.string(),
            }),
          },
        },
        description: 'Project deleted successfully',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const { user, repos } = c.var;

    // Check project exists and user has access
    const existing = await repos.projects.findById(id);
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Project not found', 404);
    }
    if (existing.organizationId !== user.organizationId) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied', 403);
    }

    await repos.projects.delete(id);

    logger.info('Project deleted', { projectId: id, userId: user.id });

    return c.json({
      success: true,
      message: 'Project deleted',
    });
  }
);

export { projectsRouter };
