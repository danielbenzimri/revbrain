/**
 * Admin Notification Routes
 *
 * In-app notification endpoints for admin users.
 * Supports listing, marking as read, and unread count.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../../middleware/auth.ts';
import { requireRole } from '../../../middleware/rbac.ts';
import { adminLimiter, listLimiter } from '../../../middleware/rate-limit.ts';
import { routeMiddleware } from '../../../lib/middleware-types.ts';
import { AppError, ErrorCodes } from '@revbrain/contract';
import { adminNotifications } from '@revbrain/database';
import { eq, and, desc, sql } from 'drizzle-orm';

// Lazy database accessor — initializes postgres.js on first call (safe on Edge via polyfills)
async function getDb() {
  const mod = await import('@revbrain/database/client');
  await mod.initDB();
  return mod.db;
}
import type { AppEnv } from '../../../types/index.ts';

const adminNotificationsRouter = new OpenAPIHono<AppEnv>();

/**
 * GET /v1/admin/notifications - List notifications for current admin
 */
adminNotificationsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Admin Notifications'],
    summary: 'List Notifications',
    description: 'List notifications for the current admin user.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), listLimiter),
    request: {
      query: z.object({
        unread: z.string().optional(),
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
        description: 'List of notifications',
      },
    },
  }),
  async (c) => {
    const user = c.get('user');
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    const { unread } = c.req.valid('query');
    const conditions = [eq(adminNotifications.adminUserId, user.id)];

    if (unread === 'true') {
      conditions.push(eq(adminNotifications.isRead, false));
    }

    const db = await getDb();
    const notifications = await db
      .select()
      .from(adminNotifications)
      .where(and(...conditions))
      .orderBy(desc(adminNotifications.createdAt))
      .limit(50);

    return c.json({ success: true, data: notifications });
  }
);

/**
 * GET /v1/admin/notifications/count - Get unread notification count
 */
adminNotificationsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/count',
    tags: ['Admin Notifications'],
    summary: 'Unread Count',
    description: 'Get unread notification count for the current admin user.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), listLimiter),
    request: {},
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              unreadCount: z.number(),
            }),
          },
        },
        description: 'Unread notification count',
      },
    },
  }),
  async (c) => {
    const user = c.get('user');
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    const db = await getDb();
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(adminNotifications)
      .where(
        and(eq(adminNotifications.adminUserId, user.id), eq(adminNotifications.isRead, false))
      );

    return c.json({ success: true, unreadCount: result[0]?.count ?? 0 });
  }
);

/**
 * PUT /v1/admin/notifications/:id/read - Mark single notification as read
 */
adminNotificationsRouter.openapi(
  createRoute({
    method: 'put',
    path: '/{id}/read',
    tags: ['Admin Notifications'],
    summary: 'Mark as Read',
    description: 'Mark a single notification as read.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
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
        description: 'Notification marked as read',
      },
    },
  }),
  async (c) => {
    const user = c.get('user');
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    const { id } = c.req.valid('param');

    const db = await getDb();
    const updated = await db
      .update(adminNotifications)
      .set({ isRead: true })
      .where(and(eq(adminNotifications.id, id), eq(adminNotifications.adminUserId, user.id)))
      .returning({ id: adminNotifications.id });

    if (updated.length === 0) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Notification not found', 404);
    }

    return c.json({ success: true });
  }
);

/**
 * POST /v1/admin/notifications/read-all - Mark all notifications as read
 */
adminNotificationsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/read-all',
    tags: ['Admin Notifications'],
    summary: 'Mark All as Read',
    description: 'Mark all notifications as read for the current admin user.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    request: {},
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              updatedCount: z.number(),
            }),
          },
        },
        description: 'All notifications marked as read',
      },
    },
  }),
  async (c) => {
    const user = c.get('user');
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    const db = await getDb();
    const updated = await db
      .update(adminNotifications)
      .set({ isRead: true })
      .where(and(eq(adminNotifications.adminUserId, user.id), eq(adminNotifications.isRead, false)))
      .returning({ id: adminNotifications.id });

    return c.json({ success: true, updatedCount: updated.length });
  }
);

export { adminNotificationsRouter };
