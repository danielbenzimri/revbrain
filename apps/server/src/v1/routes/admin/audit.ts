/**
 * Admin Audit Log Routes
 *
 * Read-only endpoints for viewing the audit trail.
 * Supports filtering by action, actor, organization, date range, and text search.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../../middleware/auth.ts';
import { requireRole } from '../../../middleware/rbac.ts';
import { adminLimiter } from '../../../middleware/rate-limit.ts';
import { routeMiddleware } from '../../../lib/middleware-types.ts';
import type { AppEnv } from '../../../types/index.ts';
import type { AuditLogEntity, Repositories } from '@revbrain/contract';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const EXPORT_MAX_LIMIT = 10_000;

const adminAuditRouter = new OpenAPIHono<AppEnv>();

/**
 * Shared helper: apply filters to audit log query
 */
async function fetchAuditEntries(
  repos: Repositories,
  params: {
    limit: number;
    offset: number;
    action?: string;
    actorId?: string;
    organizationId?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  }
) {
  const { limit, offset, action, actorId, organizationId, dateFrom, dateTo, search } = params;

  // Build filter object for the repository
  const filter: Record<string, unknown> = {};
  if (action) filter.action = action;
  if (actorId) filter.userId = actorId;
  if (organizationId) filter.organizationId = organizationId;

  // Fetch entries using the repository
  let entries: AuditLogEntity[];

  if (actorId && !action && !organizationId) {
    entries = await repos.auditLogs.findByUser(actorId, { limit: limit + offset + 1, offset: 0 });
  } else if (action && !actorId && !organizationId) {
    entries = await repos.auditLogs.findByAction(action, { limit: limit + offset + 1, offset: 0 });
  } else if (organizationId && !actorId && !action) {
    entries = await repos.auditLogs.findByOrganization(organizationId, {
      limit: limit + offset + 1,
      offset: 0,
    });
  } else {
    // Use findMany with filter for combined filters
    entries = await repos.auditLogs.findMany({
      limit: limit + offset + 1,
      offset: 0,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
    });
  }

  // Apply date range filtering in-memory
  if (dateFrom) {
    const from = new Date(dateFrom);
    entries = entries.filter((e) => new Date(e.createdAt) >= from);
  }
  if (dateTo) {
    const to = new Date(dateTo);
    entries = entries.filter((e) => new Date(e.createdAt) <= to);
  }

  // Apply text search in-memory (matches action or metadata text)
  if (search) {
    const searchLower = search.toLowerCase();
    entries = entries.filter((e) => {
      if (e.action.toLowerCase().includes(searchLower)) return true;
      if (e.metadata) {
        const metaStr = JSON.stringify(e.metadata).toLowerCase();
        if (metaStr.includes(searchLower)) return true;
      }
      return false;
    });
  }

  const total = entries.length;
  const paginatedEntries = entries.slice(offset, offset + limit);
  const hasMore = offset + limit < total;

  return { entries: paginatedEntries, total, hasMore };
}

function formatEntry(entry: AuditLogEntity) {
  return {
    id: entry.id,
    userId: entry.userId,
    organizationId: entry.organizationId,
    action: entry.action,
    targetUserId: entry.targetUserId,
    metadata: entry.metadata,
    ipAddress: entry.ipAddress,
    userAgent: entry.userAgent,
    createdAt: entry.createdAt,
  };
}

/**
 * GET /v1/admin/audit — List audit log entries with filters
 */
adminAuditRouter.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Admin Audit'],
    summary: 'List Audit Log Entries',
    description: 'List audit log entries with optional filters and pagination.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    request: {
      query: z.object({
        limit: z.coerce.number().min(1).max(MAX_LIMIT).optional(),
        offset: z.coerce.number().min(0).optional(),
        action: z.string().optional(),
        actorId: z.string().optional(),
        organizationId: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        search: z.string().optional(),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.array(z.any()),
              pagination: z.object({
                total: z.number(),
                limit: z.number(),
                offset: z.number(),
                hasMore: z.boolean(),
              }),
            }),
          },
        },
        description: 'List of audit log entries',
      },
    },
  }),
  async (c) => {
    const {
      limit = DEFAULT_LIMIT,
      offset = 0,
      action,
      actorId,
      organizationId,
      dateFrom,
      dateTo,
      search,
    } = c.req.query();

    const parsedLimit = Math.min(Number(limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const parsedOffset = Number(offset) || 0;

    const result = await fetchAuditEntries(c.var.repos, {
      limit: parsedLimit,
      offset: parsedOffset,
      action: action || undefined,
      actorId: actorId || undefined,
      organizationId: organizationId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      search: search || undefined,
    });

    return c.json({
      success: true,
      data: result.entries.map(formatEntry),
      pagination: {
        total: result.total,
        limit: parsedLimit,
        offset: parsedOffset,
        hasMore: result.hasMore,
      },
    });
  }
);

/**
 * GET /v1/admin/audit/export — Export audit log as CSV
 */
adminAuditRouter.openapi(
  createRoute({
    method: 'get',
    path: '/export',
    tags: ['Admin Audit'],
    summary: 'Export Audit Log as CSV',
    description: 'Export audit log entries as CSV. Limited to 10,000 rows.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    request: {
      query: z.object({
        action: z.string().optional(),
        actorId: z.string().optional(),
        organizationId: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        search: z.string().optional(),
      }),
    },
    responses: {
      200: {
        content: {
          'text/csv': {
            schema: z.string(),
          },
        },
        description: 'CSV export of audit log entries',
      },
    },
  }),
  async (c) => {
    const { action, actorId, organizationId, dateFrom, dateTo, search } = c.req.query();

    const result = await fetchAuditEntries(c.var.repos, {
      limit: EXPORT_MAX_LIMIT,
      offset: 0,
      action: action || undefined,
      actorId: actorId || undefined,
      organizationId: organizationId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      search: search || undefined,
    });

    // Build CSV
    const headers = [
      'ID',
      'Timestamp',
      'Action',
      'Actor ID',
      'Organization ID',
      'Target User ID',
      'IP Address',
      'User Agent',
      'Metadata',
    ];

    const escapeCSV = (val: string | null | undefined): string => {
      if (val == null) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = result.entries.map((entry) =>
      [
        escapeCSV(entry.id),
        escapeCSV(
          entry.createdAt instanceof Date ? entry.createdAt.toISOString() : String(entry.createdAt)
        ),
        escapeCSV(entry.action),
        escapeCSV(entry.userId),
        escapeCSV(entry.organizationId),
        escapeCSV(entry.targetUserId),
        escapeCSV(entry.ipAddress),
        escapeCSV(entry.userAgent),
        escapeCSV(entry.metadata ? JSON.stringify(entry.metadata) : null),
      ].join(',')
    );

    const csv = [headers.join(','), ...rows].join('\n');

    c.header('Content-Type', 'text/csv');
    c.header(
      'Content-Disposition',
      `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`
    );

    return c.body(csv);
  }
);

export { adminAuditRouter };
