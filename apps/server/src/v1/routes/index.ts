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
import boqRouter from './boq.ts';
import { projectsRouter } from './projects.ts';
import { executionBills } from './execution-bills.ts';
import { workLogs } from './work-logs.ts';
import { tasks } from './tasks.ts';
import { storageRouter } from './storage.ts';
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

// BOQ routes (Bill of Quantities)
v1Router.route('/boq', boqRouter);

// Execution Bills routes (contractor billing/work bills)
v1Router.route('/execution/bills', executionBills);

// Work Logs routes (daily site reports)
v1Router.route('/work-logs', workLogs);

// Tasks routes (Kanban task management)
v1Router.route('/tasks', tasks);

// Storage routes (file uploads)
v1Router.route('/storage', storageRouter);

// Webhook routes (external services - no auth, uses signature verification)
v1Router.route('/webhooks', webhooksRouter);

// Dev routes (development only, no-op in production)
v1Router.route('/dev', devRouter);
