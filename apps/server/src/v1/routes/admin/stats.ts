import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../../middleware/auth.ts';
import { requireRole } from '../../../middleware/rbac.ts';
import { adminLimiter } from '../../../middleware/rate-limit.ts';
import { routeMiddleware } from '../../../lib/middleware-types.ts';
import { logger } from '../../../lib/logger.ts';
import type { AppEnv } from '../../../types/index.ts';

const adminStatsRouter = new OpenAPIHono<AppEnv>();

/**
 * GET /v1/admin/stats — Dashboard statistics
 *
 * Returns aggregated platform stats for the admin dashboard.
 * Individual fields return null if their query fails (partial data, not 500).
 */
adminStatsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Admin'],
    summary: 'Dashboard Stats',
    description: 'Returns aggregated platform statistics for the admin dashboard.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin', 'org_owner'), adminLimiter),
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.object({
                tenantCount: z.number().nullable(),
                activeUserCount: z.number().nullable(),
                activeProjectCount: z.number().nullable(),
                mrr: z.number().nullable(),
                recentActivity: z
                  .array(
                    z.object({
                      id: z.string(),
                      action: z.string(),
                      userId: z.string().nullable(),
                      organizationId: z.string().nullable(),
                      metadata: z.any().nullable(),
                      createdAt: z.string(),
                    })
                  )
                  .nullable(),
              }),
            }),
          },
        },
        description: 'Dashboard statistics',
      },
    },
  }),
  async (c) => {
    const repos = c.var.repos;

    // Helper: run a query and return null on failure
    async function safeQuery<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
      try {
        return await fn();
      } catch (err) {
        logger.error(
          `Stats query failed: ${label}`,
          {},
          err instanceof Error ? err : new Error(String(err))
        );
        return null;
      }
    }

    // Run all queries in parallel for speed
    const [tenantCount, activeUserCount, activeProjectCount, mrr, recentActivity] =
      await Promise.all([
        safeQuery('tenantCount', () => repos.organizations.count()),
        safeQuery('activeUserCount', () => repos.users.count({ isActive: true })),
        safeQuery('activeProjectCount', () => repos.projects.count({ status: 'active' })),
        safeQuery('mrr', async () => {
          // Get active orgs that have a plan
          const orgsWithPlan = await repos.organizations.findMany({
            filter: { isActive: true },
          });
          const planIds = [...new Set(orgsWithPlan.filter((o) => o.planId).map((o) => o.planId!))];
          if (planIds.length === 0) return 0;

          // Fetch all plans and build a price lookup
          const plans = await repos.plans.findMany();
          const priceMap = new Map(plans.map((p) => [p.id, p.price]));

          // Sum monthly price (in cents) for each org with a plan
          let totalCents = 0;
          for (const org of orgsWithPlan) {
            if (org.planId && priceMap.has(org.planId)) {
              totalCents += priceMap.get(org.planId)!;
            }
          }
          // Return MRR in dollars
          return totalCents / 100;
        }),
        safeQuery('recentActivity', async () => {
          const logs = await repos.auditLogs.findMany({
            limit: 10,
            orderBy: { field: 'createdAt', direction: 'desc' },
          });
          return logs.map((log) => ({
            id: log.id,
            action: log.action,
            userId: log.userId,
            organizationId: log.organizationId,
            metadata: log.metadata,
            createdAt: log.createdAt.toISOString(),
          }));
        }),
      ]);

    return c.json({
      success: true,
      data: {
        tenantCount,
        activeUserCount,
        activeProjectCount,
        mrr,
        recentActivity,
      },
    });
  }
);

export { adminStatsRouter };
