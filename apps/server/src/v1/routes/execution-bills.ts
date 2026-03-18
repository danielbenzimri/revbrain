/**
 * Execution Bills Routes
 *
 * API endpoints for contractor execution bill management including
 * CRUD operations, workflow transitions, measurements, and exports.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { AppEnv } from '../../types/index.ts';
import { ExecutionBillService } from '../../services/execution-bill.service.ts';
import { logger } from '../../lib/logger.ts';
import { AppError, ErrorCodes } from '@geometrix/contract';

const executionBills = new OpenAPIHono<AppEnv>();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createBillSchema = z.object({
  projectId: z.string().uuid(),
  periodStart: z.string().nullable().optional(),
  periodEnd: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
});

const updateBillSchema = z.object({
  periodStart: z.string().nullable().optional(),
  periodEnd: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
});

const addItemsSchema = z.object({
  boqItemIds: z.array(z.string().uuid()).min(1),
});

const updateItemSchema = z.object({
  currentQuantity: z.number().optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  remarks: z.string().nullable().optional(),
  isException: z.boolean().optional(),
});

const addMeasurementSchema = z.object({
  location: z.string().nullable().optional(),
  quantity: z.number(),
  remarks: z.string().nullable().optional(),
});

const submitBillSchema = z.object({
  contractorSignatureUrl: z.string().nullable().optional(),
});

const rejectBillSchema = z.object({
  reason: z.string().min(1).max(1000),
});

const approveBillSchema = z.object({
  inspectorSignatureUrl: z.string().nullable().optional(),
});

const paginationQuerySchema = z.object({
  limit: z.string().optional(),
  offset: z.string().optional(),
});

// ============================================================================
// HELPER: Create Service
// ============================================================================

function getService(c: any): ExecutionBillService {
  const { repos } = c.var;
  return new ExecutionBillService(
    repos.bills,
    repos.billItems,
    repos.measurements,
    repos.boq,
    repos.projects
  );
}

// ============================================================================
// BILL ROUTES
// ============================================================================

/**
 * POST /v1/execution/bills
 * Create a new execution bill
 */
executionBills.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['Execution Bills'],
    summary: 'Create Execution Bill',
    description: 'Creates a new execution bill for a project.',
    request: {
      body: {
        content: {
          'application/json': {
            schema: createBillSchema,
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
        description: 'Bill created successfully',
      },
    },
  }),
  async (c) => {
    const { user } = c.var;
    const input = c.req.valid('json');

    const service = getService(c);
    const bill = await service.createBill({
      projectId: input.projectId,
      organizationId: user.organizationId,
      createdBy: user.id,
      periodStart: input.periodStart ? new Date(input.periodStart) : null,
      periodEnd: input.periodEnd ? new Date(input.periodEnd) : null,
      remarks: input.remarks ?? null,
    });

    logger.info('Execution bill created', {
      billId: bill.id,
      projectId: input.projectId,
      userId: user.id,
    });

    return c.json({ success: true, data: bill }, 201);
  }
);

/**
 * GET /v1/execution/bills/project/:projectId
 * Get bills for a project with pagination
 */
executionBills.openapi(
  createRoute({
    method: 'get',
    path: '/project/{projectId}',
    tags: ['Execution Bills'],
    summary: 'List Bills by Project',
    description: 'Returns all execution bills for a project with pagination.',
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
              pagination: z.any(),
            }),
          },
        },
        description: 'Bills retrieved successfully',
      },
    },
  }),
  async (c) => {
    const { projectId } = c.req.valid('param');
    const query = c.req.valid('query');

    const limit = parseInt(query.limit ?? '20', 10);
    const offset = parseInt(query.offset ?? '0', 10);

    const service = getService(c);
    const result = await service.getBillsByProject(projectId, { limit, offset });

    return c.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  }
);

/**
 * GET /v1/execution/bills/project/:projectId/summary
 * Get bill summary for a project
 */
executionBills.openapi(
  createRoute({
    method: 'get',
    path: '/project/{projectId}/summary',
    tags: ['Execution Bills'],
    summary: 'Get Project Bill Summary',
    description: 'Returns aggregated summary of all bills for a project.',
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
    const summary = await service.getProjectBillSummary(projectId);

    return c.json({ success: true, data: summary });
  }
);

/**
 * GET /v1/execution/bills/:id
 * Get a single bill by ID
 */
executionBills.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['Execution Bills'],
    summary: 'Get Execution Bill',
    description: 'Returns a single execution bill with its items.',
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
        description: 'Bill retrieved successfully',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');

    const service = getService(c);
    const bill = await service.getBillWithItems(id);

    if (!bill) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Bill not found', 404);
    }

    return c.json({ success: true, data: bill });
  }
);

/**
 * PUT /v1/execution/bills/:id
 * Update a bill (draft only)
 */
executionBills.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    tags: ['Execution Bills'],
    summary: 'Update Execution Bill',
    description: 'Updates an execution bill. Only draft bills can be updated.',
    request: {
      params: z.object({
        id: z.string().uuid(),
      }),
      body: {
        content: {
          'application/json': {
            schema: updateBillSchema,
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
        description: 'Bill updated successfully',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const { user } = c.var;
    const input = c.req.valid('json');

    const service = getService(c);
    const bill = await service.updateBill(
      id,
      {
        periodStart: input.periodStart ? new Date(input.periodStart) : undefined,
        periodEnd: input.periodEnd ? new Date(input.periodEnd) : undefined,
        remarks: input.remarks,
      },
      user.id
    );

    logger.info('Execution bill updated', { billId: id, userId: user.id });

    return c.json({ success: true, data: bill });
  }
);

/**
 * DELETE /v1/execution/bills/:id
 * Delete a bill (draft only)
 */
executionBills.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['Execution Bills'],
    summary: 'Delete Execution Bill',
    description: 'Deletes an execution bill. Only draft bills can be deleted.',
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
            }),
          },
        },
        description: 'Bill deleted successfully',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const { user } = c.var;

    const service = getService(c);
    await service.deleteBill(id, user.id);

    logger.info('Execution bill deleted', { billId: id, userId: user.id });

    return c.json({ success: true });
  }
);

/**
 * GET /v1/execution/bills/:id/export
 * Export a bill to Excel
 */
executionBills.openapi(
  createRoute({
    method: 'get',
    path: '/{id}/export',
    tags: ['Execution Bills'],
    summary: 'Export Bill to Excel',
    description: 'Exports an execution bill to an Excel file.',
    request: {
      params: z.object({
        id: z.string().uuid(),
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
    const { id } = c.req.valid('param');
    const { user } = c.var;

    const service = getService(c);
    const buffer = await service.exportToExcel(id);

    logger.info('Execution bill exported', { billId: id, userId: user.id });

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="bill-${id}.xlsx"`,
      },
    });
  }
);

// ============================================================================
// WORKFLOW ROUTES
// ============================================================================

/**
 * POST /v1/execution/bills/:id/submit
 * Submit a bill for review
 */
executionBills.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/submit',
    tags: ['Execution Bills'],
    summary: 'Submit Bill',
    description: 'Submits a draft bill for review.',
    request: {
      params: z.object({
        id: z.string().uuid(),
      }),
      body: {
        content: {
          'application/json': {
            schema: submitBillSchema,
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
        description: 'Bill submitted successfully',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const { user } = c.var;
    const input = c.req.valid('json');

    const service = getService(c);
    const bill = await service.submitBill(id, user.id, input.contractorSignatureUrl ?? undefined);

    logger.info('Execution bill submitted', { billId: id, userId: user.id });

    return c.json({ success: true, data: bill });
  }
);

/**
 * POST /v1/execution/bills/:id/review
 * Start review of a submitted bill
 */
executionBills.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/review',
    tags: ['Execution Bills'],
    summary: 'Start Review',
    description: 'Starts the review process for a submitted bill.',
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
        description: 'Review started successfully',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const { user } = c.var;

    const service = getService(c);
    const bill = await service.startReview(id, user.id);

    logger.info('Execution bill review started', { billId: id, userId: user.id });

    return c.json({ success: true, data: bill });
  }
);

/**
 * POST /v1/execution/bills/:id/approve
 * Approve a bill
 */
executionBills.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/approve',
    tags: ['Execution Bills'],
    summary: 'Approve Bill',
    description: 'Approves a bill under review.',
    request: {
      params: z.object({
        id: z.string().uuid(),
      }),
      body: {
        content: {
          'application/json': {
            schema: approveBillSchema,
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
        description: 'Bill approved successfully',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const { user } = c.var;
    const input = c.req.valid('json');

    const service = getService(c);
    const bill = await service.approveBill(id, user.id, input.inspectorSignatureUrl ?? undefined);

    logger.info('Execution bill approved', { billId: id, userId: user.id });

    return c.json({ success: true, data: bill });
  }
);

/**
 * POST /v1/execution/bills/:id/reject
 * Reject a bill
 */
executionBills.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/reject',
    tags: ['Execution Bills'],
    summary: 'Reject Bill',
    description: 'Rejects a bill under review with a reason.',
    request: {
      params: z.object({
        id: z.string().uuid(),
      }),
      body: {
        content: {
          'application/json': {
            schema: rejectBillSchema,
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
        description: 'Bill rejected successfully',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const { user } = c.var;
    const input = c.req.valid('json');

    const service = getService(c);
    const bill = await service.rejectBill(id, user.id, input.reason);

    logger.info('Execution bill rejected', { billId: id, userId: user.id });

    return c.json({ success: true, data: bill });
  }
);

/**
 * POST /v1/execution/bills/:id/reopen
 * Reopen a rejected bill
 */
executionBills.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/reopen',
    tags: ['Execution Bills'],
    summary: 'Reopen Bill',
    description: 'Reopens a rejected bill for editing.',
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
        description: 'Bill reopened successfully',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const { user } = c.var;

    const service = getService(c);
    const bill = await service.reopenBill(id, user.id);

    logger.info('Execution bill reopened', { billId: id, userId: user.id });

    return c.json({ success: true, data: bill });
  }
);

// ============================================================================
// BILL ITEMS ROUTES
// ============================================================================

/**
 * POST /v1/execution/bills/:id/items
 * Add BOQ items to a bill
 */
executionBills.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/items',
    tags: ['Execution Bills'],
    summary: 'Add Items to Bill',
    description: 'Adds BOQ items to an execution bill.',
    request: {
      params: z.object({
        id: z.string().uuid(),
      }),
      body: {
        content: {
          'application/json': {
            schema: addItemsSchema,
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
              data: z.array(z.any()),
            }),
          },
        },
        description: 'Items added successfully',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const { user } = c.var;
    const input = c.req.valid('json');

    const service = getService(c);
    const items = await service.addItemsFromBOQ(id, input.boqItemIds);

    logger.info('Items added to execution bill', {
      billId: id,
      itemCount: items.length,
      userId: user.id,
    });

    return c.json({ success: true, data: items }, 201);
  }
);

/**
 * PUT /v1/execution/bills/items/:itemId
 * Update a bill item
 */
executionBills.openapi(
  createRoute({
    method: 'put',
    path: '/items/{itemId}',
    tags: ['Execution Bills'],
    summary: 'Update Bill Item',
    description: 'Updates an execution bill item.',
    request: {
      params: z.object({
        itemId: z.string().uuid(),
      }),
      body: {
        content: {
          'application/json': {
            schema: updateItemSchema,
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
        description: 'Item updated successfully',
      },
    },
  }),
  async (c) => {
    const { itemId } = c.req.valid('param');
    const { user } = c.var;
    const input = c.req.valid('json');

    const service = getService(c);
    const item = await service.updateBillItem(itemId, input, user.id);

    logger.info('Execution bill item updated', { itemId, userId: user.id });

    return c.json({ success: true, data: item });
  }
);

/**
 * DELETE /v1/execution/bills/items/:itemId
 * Delete a bill item
 */
executionBills.openapi(
  createRoute({
    method: 'delete',
    path: '/items/{itemId}',
    tags: ['Execution Bills'],
    summary: 'Delete Bill Item',
    description: 'Deletes an execution bill item.',
    request: {
      params: z.object({
        itemId: z.string().uuid(),
      }),
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
        description: 'Item deleted successfully',
      },
    },
  }),
  async (c) => {
    const { itemId } = c.req.valid('param');
    const { user } = c.var;

    const service = getService(c);
    await service.deleteBillItem(itemId, user.id);

    logger.info('Execution bill item deleted', { itemId, userId: user.id });

    return c.json({ success: true });
  }
);

// ============================================================================
// MEASUREMENTS ROUTES
// ============================================================================

/**
 * POST /v1/execution/bills/items/:itemId/measurements
 * Add a measurement to a bill item
 */
executionBills.openapi(
  createRoute({
    method: 'post',
    path: '/items/{itemId}/measurements',
    tags: ['Execution Bills'],
    summary: 'Add Measurement',
    description: 'Adds a measurement entry to an execution bill item.',
    request: {
      params: z.object({
        itemId: z.string().uuid(),
      }),
      body: {
        content: {
          'application/json': {
            schema: addMeasurementSchema,
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
        description: 'Measurement added successfully',
      },
    },
  }),
  async (c) => {
    const { itemId } = c.req.valid('param');
    const { user } = c.var;
    const input = c.req.valid('json');

    const service = getService(c);
    const measurement = await service.addMeasurement(
      itemId,
      {
        location: input.location ?? undefined,
        quantity: input.quantity,
        remarks: input.remarks ?? undefined,
      },
      user.id
    );

    logger.info('Measurement added', { itemId, measurementId: measurement.id, userId: user.id });

    return c.json({ success: true, data: measurement }, 201);
  }
);

/**
 * GET /v1/execution/bills/items/:itemId/measurements
 * Get measurements for a bill item
 */
executionBills.openapi(
  createRoute({
    method: 'get',
    path: '/items/{itemId}/measurements',
    tags: ['Execution Bills'],
    summary: 'List Measurements',
    description: 'Returns all measurements for an execution bill item.',
    request: {
      params: z.object({
        itemId: z.string().uuid(),
      }),
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
        description: 'Measurements retrieved successfully',
      },
    },
  }),
  async (c) => {
    const { itemId } = c.req.valid('param');

    const service = getService(c);
    const measurements = await service.getMeasurementsByBillItem(itemId);

    return c.json({ success: true, data: measurements });
  }
);

/**
 * DELETE /v1/execution/bills/measurements/:measurementId
 * Delete a measurement
 */
executionBills.openapi(
  createRoute({
    method: 'delete',
    path: '/measurements/{measurementId}',
    tags: ['Execution Bills'],
    summary: 'Delete Measurement',
    description: 'Deletes a measurement entry.',
    request: {
      params: z.object({
        measurementId: z.string().uuid(),
      }),
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
        description: 'Measurement deleted successfully',
      },
    },
  }),
  async (c) => {
    const { measurementId } = c.req.valid('param');
    const { user } = c.var;

    const service = getService(c);
    await service.deleteMeasurement(measurementId, user.id);

    logger.info('Measurement deleted', { measurementId, userId: user.id });

    return c.json({ success: true });
  }
);

export { executionBills };
