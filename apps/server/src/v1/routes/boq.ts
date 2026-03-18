/**
 * BOQ Routes
 *
 * API endpoints for Bill of Quantities management including
 * CRUD operations and Excel import.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { AppEnv } from '../../types/index.ts';
import { BOQService } from '../../services/boq.service.ts';
import { logger } from '../../lib/logger.ts';
import { AppError, ErrorCodes } from '@geometrix/contract';
import { type RouteContext, getRepos } from '../../lib/route-helpers.ts';

const boq = new OpenAPIHono<AppEnv>();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createBOQItemSchema = z.object({
  projectId: z.string().uuid(),
  parentId: z.string().uuid().nullable().optional(),
  code: z.string().min(1).max(50),
  description: z.string().min(1),
  unit: z.string().max(20).nullable().optional(),
  contractQuantity: z.number().nullable().optional(),
  unitPriceCents: z.number().int().nullable().optional(),
  level: z.number().int().min(0).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const updateBOQItemSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  description: z.string().min(1).optional(),
  unit: z.string().max(20).nullable().optional(),
  contractQuantity: z.number().nullable().optional(),
  unitPriceCents: z.number().int().nullable().optional(),
  level: z.number().int().min(0).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  parentId: z.string().uuid().nullable().optional(),
});

const importOptionsSchema = z.object({
  replace: z.boolean().optional(),
  sheet: z.union([z.string(), z.number()]).optional(),
  startRow: z.number().int().min(1).optional(),
  codeColumns: z.array(z.string()).optional(),
  columns: z
    .object({
      code: z.string().optional(),
      description: z.string().optional(),
      unit: z.string().optional(),
      quantity: z.string().optional(),
      unitPrice: z.string().optional(),
    })
    .optional(),
});

// ============================================================================
// HELPER: Create BOQ Service
// ============================================================================

function getService(c: RouteContext): BOQService {
  const repos = getRepos(c);
  return new BOQService(repos.boq, repos.projects);
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /v1/boq/project/:projectId
 * Get all BOQ items for a project (flat list)
 */
boq.openapi(
  createRoute({
    method: 'get',
    path: '/project/{projectId}',
    tags: ['BOQ'],
    summary: 'List BOQ Items',
    description: 'Returns all BOQ items for a project as a flat list.',
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
              data: z.array(z.any()),
              meta: z.object({ count: z.number() }),
            }),
          },
        },
        description: 'BOQ items retrieved successfully',
      },
    },
  }),
  async (c) => {
    const { projectId } = c.req.valid('param');

    const service = getService(c);
    const items = await service.getByProject(projectId);

    return c.json({
      success: true,
      data: items,
      meta: { count: items.length },
    });
  }
);

/**
 * GET /v1/boq/project/:projectId/tree
 * Get BOQ items as hierarchical tree
 */
boq.openapi(
  createRoute({
    method: 'get',
    path: '/project/{projectId}/tree',
    tags: ['BOQ'],
    summary: 'Get BOQ Tree',
    description: 'Returns BOQ items as a hierarchical tree structure.',
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
        description: 'BOQ tree retrieved successfully',
      },
    },
  }),
  async (c) => {
    const { projectId } = c.req.valid('param');

    const service = getService(c);
    const tree = await service.getTreeByProject(projectId);

    return c.json({
      success: true,
      data: tree,
    });
  }
);

/**
 * GET /v1/boq/project/:projectId/summary
 * Get BOQ summary statistics for a project
 */
boq.openapi(
  createRoute({
    method: 'get',
    path: '/project/{projectId}/summary',
    tags: ['BOQ'],
    summary: 'Get BOQ Summary',
    description: 'Returns summary statistics for a project BOQ.',
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
        description: 'BOQ summary retrieved successfully',
      },
    },
  }),
  async (c) => {
    const { projectId } = c.req.valid('param');

    const service = getService(c);
    const summary = await service.getSummary(projectId);

    return c.json({
      success: true,
      data: summary,
    });
  }
);

/**
 * GET /v1/boq/project/:projectId/export
 * Export BOQ to Excel file
 */
boq.openapi(
  createRoute({
    method: 'get',
    path: '/project/{projectId}/export',
    tags: ['BOQ'],
    summary: 'Export BOQ to Excel',
    description: 'Exports BOQ items to an Excel file.',
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
    const buffer = await service.exportToExcel(projectId);

    logger.info('BOQ exported', { projectId, userId: user.id });

    // Return as downloadable file
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="boq-${projectId}.xlsx"`,
      },
    });
  }
);

/**
 * GET /v1/boq/:id
 * Get a single BOQ item by ID
 */
boq.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['BOQ'],
    summary: 'Get BOQ Item',
    description: 'Returns a single BOQ item by ID.',
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
        description: 'BOQ item retrieved successfully',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');

    const service = getService(c);
    const item = await service.getById(id);

    if (!item) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'BOQ item not found', 404);
    }

    return c.json({
      success: true,
      data: item,
    });
  }
);

/**
 * POST /v1/boq
 * Create a new BOQ item
 */
boq.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['BOQ'],
    summary: 'Create BOQ Item',
    description: 'Creates a new BOQ item.',
    request: {
      body: {
        content: {
          'application/json': {
            schema: createBOQItemSchema,
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
        description: 'BOQ item created successfully',
      },
    },
  }),
  async (c) => {
    const { user } = c.var;
    const input = c.req.valid('json');

    const service = getService(c);
    const item = await service.create({
      ...input,
      organizationId: user.organizationId,
    });

    logger.info('BOQ item created', {
      itemId: item.id,
      projectId: input.projectId,
      userId: user.id,
    });

    return c.json(
      {
        success: true,
        data: item,
      },
      201
    );
  }
);

/**
 * PUT /v1/boq/:id
 * Update a BOQ item
 */
boq.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    tags: ['BOQ'],
    summary: 'Update BOQ Item',
    description: 'Updates an existing BOQ item.',
    request: {
      params: z.object({
        id: z.string().uuid(),
      }),
      body: {
        content: {
          'application/json': {
            schema: updateBOQItemSchema,
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
        description: 'BOQ item updated successfully',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const { user } = c.var;
    const input = c.req.valid('json');

    const service = getService(c);
    const item = await service.update(id, input);

    if (!item) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'BOQ item not found', 404);
    }

    logger.info('BOQ item updated', { itemId: id, userId: user.id });

    return c.json({
      success: true,
      data: item,
    });
  }
);

/**
 * DELETE /v1/boq/:id
 * Delete a BOQ item
 */
boq.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['BOQ'],
    summary: 'Delete BOQ Item',
    description: 'Deletes a BOQ item.',
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
        description: 'BOQ item deleted successfully',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const { user } = c.var;

    const service = getService(c);
    const deleted = await service.delete(id);

    if (!deleted) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'BOQ item not found', 404);
    }

    logger.info('BOQ item deleted', { itemId: id, userId: user.id });

    return c.json({
      success: true,
      message: 'BOQ item deleted',
    });
  }
);

/**
 * POST /v1/boq/import/:projectId
 * Import BOQ items from Excel file
 */
boq.openapi(
  createRoute({
    method: 'post',
    path: '/import/{projectId}',
    tags: ['BOQ'],
    summary: 'Import BOQ from Excel',
    description: 'Imports BOQ items from an Excel file (.xlsx or .xls).',
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
              data: z.object({
                imported: z.number(),
                items: z.array(z.any()),
              }),
              message: z.string(),
            }),
          },
        },
        description: 'BOQ import completed successfully',
      },
    },
  }),
  async (c) => {
    const { projectId } = c.req.valid('param');
    const { user } = c.var;

    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    const optionsStr = formData.get('options') as string | null;

    if (!file) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'No file provided', 400);
    }

    // Validate file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (!validTypes.includes(file.type) && !file.name.match(/\.xlsx?$/i)) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid file type. Please upload an Excel file (.xlsx or .xls)',
        400
      );
    }

    // Parse options if provided
    let options = {};
    if (optionsStr) {
      try {
        const parsed = importOptionsSchema.safeParse(JSON.parse(optionsStr));
        if (parsed.success) {
          options = parsed.data;
        }
      } catch {
        // Ignore invalid options, use defaults
      }
    }

    // Read file as Uint8Array (works in both Node.js and Deno)
    const buffer = new Uint8Array(await file.arrayBuffer());

    const service = getService(c);
    const result = await service.importFromExcel(
      buffer as any,
      projectId,
      user.organizationId,
      options
    );

    if (!result.success) {
      // Return error details to the client (cast needed for Hono OpenAPI typed routes)
      return c.json(
        {
          success: false,
          data: { imported: 0, items: [], errors: result.errors },
          error: { details: result.errors },
          message: 'Import failed',
        },
        400
      ) as any;
    }

    logger.info('BOQ import completed', {
      projectId,
      userId: user.id,
      imported: result.imported,
    });

    return c.json({
      success: true,
      data: {
        imported: result.imported,
        items: result.items,
      },
      message: `Successfully imported ${result.imported} BOQ items`,
    });
  }
);

export default boq;
