import { OpenAPIHono } from '@hono/zod-openapi';
import { healthRouter } from './health.ts';
import { authRouter } from './auth.ts';
import { adminRouter } from './admin/index.ts';
import { orgRouter } from './org.ts';
import { plansRouter } from './plans.ts';
import { usersRouter } from './users.ts';
import { billingRouter } from './billing.ts';
import { leadsRouter } from './leads.ts';
import { supportRouter } from './support.ts';
import { webhooksRouter } from './webhooks.ts';
import { devRouter } from './dev.ts';
import { projectsRouter } from './projects.ts';
import { salesforceRouter } from './salesforce.ts';
import { internalRouter } from './internal.ts';
import { assessmentRouter } from './assessment.ts';
import { type AppEnv } from '../../types/index.ts';

/**
 * V1 API Router
 *
 * Aggregates all v1 route modules.
 * Uses OpenAPIHono for consistent error propagation with sub-routers.
 * Add new route modules here as the API grows.
 */
export const v1Router = new OpenAPIHono<AppEnv>();

// Public routes
v1Router.route('/health', healthRouter);

// Auth routes (protected)
v1Router.route('/auth', authRouter);

// User self-service routes (profile, password, account)
v1Router.route('/users', usersRouter);

// Admin routes (system_admin only)
v1Router.route('/admin', adminRouter);

// Organization routes (org admins)
v1Router.route('/org', orgRouter);

// Plans routes (Public/Admin)
v1Router.route('/plans', plansRouter);

// Billing routes (subscription management)
v1Router.route('/billing', billingRouter);

// Leads routes (public contact form)
v1Router.route('/leads', leadsRouter);

// Support routes (user tickets)
v1Router.route('/support', supportRouter);

// Projects routes (project management)
v1Router.route('/projects', projectsRouter);

// Salesforce routes (OAuth connect/disconnect, project-scoped)
v1Router.route('/projects', salesforceRouter);

// Salesforce OAuth callback (public-facing, called by Salesforce redirect)
v1Router.route('/salesforce', salesforceRouter);

// Webhook routes (external services - no auth, uses signature verification)
v1Router.route('/webhooks', webhooksRouter);

// Dev routes (development only, no-op in production)
v1Router.route('/dev', devRouter);

// Internal routes (called by extraction worker, protected by shared secret)
v1Router.route('/internal', internalRouter);

// Assessment extraction routes (project-scoped)
v1Router.route('/projects', assessmentRouter);
