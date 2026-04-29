import { OpenAPIHono } from '@hono/zod-openapi';
import { AppError } from '@revbrain/contract';
import { logger } from '../../../lib/logger.ts';
import { onboardingRouter } from './onboarding.ts';
import { adminUsersRouter } from './users.ts';
import { adminTenantsRouter } from './tenants.ts';
import { adminCouponsRouter } from './coupons.ts';
import { adminSupportRouter } from './support.ts';
import { adminBillingRouter } from './billing.ts';
import { adminStatsRouter } from './stats.ts';
import { adminAuditRouter } from './audit.ts';
import { adminJobsRouter } from './jobs.ts';
import { adminOverridesRouter } from './overrides.ts';
import { adminImpersonateRouter } from './impersonate.ts';
import { adminNotificationsRouter } from './notifications.ts';
import { adminPartnersRouter } from './partners.ts';
import { requireMFA } from '../../../middleware/mfa-check.ts';
import type { AppEnv } from '../../../types/index.ts';

const adminRouter = new OpenAPIHono<AppEnv>({
  defaultHook: (result, c) => {
    if (!result.success) {
      const errors = result.error.flatten();
      return c.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request parameters',
            details: errors,
          },
        },
        400
      );
    }
  },
});

// Type guard for AppError-like objects
interface AppErrorLike {
  code: string;
  message: string;
  statusCode: number;
}

function isAppErrorLike(err: unknown): err is AppErrorLike {
  return (
    err instanceof AppError ||
    (err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      'statusCode' in err &&
      typeof (err as AppErrorLike).code === 'string' &&
      typeof (err as AppErrorLike).statusCode === 'number')
  );
}

adminRouter.onError((err, c) => {
  if (isAppErrorLike(err)) {
    const statusCode = err.statusCode || 500;
    return c.json(
      {
        success: false,
        error: {
          code: err.code || 'UNKNOWN_ERROR',
          message: err.message,
        },
      },
      statusCode as 400 | 401 | 403 | 404 | 409 | 500 | 503
    );
  }

  logger.error('Unhandled admin error', { path: c.req.path }, err);
  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    },
    500
  );
});

// MFA enforcement — runs on all admin routes
// Controlled by MFA_ENFORCEMENT env var: 'log' (default) or 'enforce'
// Skipped in mock auth mode
adminRouter.use('*', requireMFA);

// Mount sub-routers
adminRouter.route('/', onboardingRouter);
adminRouter.route('/users', adminUsersRouter);
adminRouter.route('/tenants', adminTenantsRouter);
adminRouter.route('/coupons', adminCouponsRouter);
adminRouter.route('/support', adminSupportRouter);
adminRouter.route('/billing', adminBillingRouter);
adminRouter.route('/stats', adminStatsRouter);
adminRouter.route('/audit', adminAuditRouter);
adminRouter.route('/jobs', adminJobsRouter);
adminRouter.route('/', adminOverridesRouter);
adminRouter.route('/', adminImpersonateRouter);
adminRouter.route('/notifications', adminNotificationsRouter);
adminRouter.route('/partners', adminPartnersRouter);

export { adminRouter };
