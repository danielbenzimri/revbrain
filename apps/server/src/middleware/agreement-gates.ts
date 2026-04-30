/**
 * Agreement Gates Middleware (SI Billing)
 *
 * Phase-based entitlement middleware for SI partners.
 * Gates access to extraction, normalization, segmentation, disposition
 * based on agreement status and milestone payment state.
 *
 * Task: P4.5
 * Refs: SI-BILLING-SPEC.md §4 (entitlement gates)
 */
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types/index.ts';
import { AppError, ErrorCodes } from '@revbrain/contract';

/**
 * Requires an active agreement with M1 paid for the project.
 * Used on assessment-phase routes: extraction, normalization, analysis.
 *
 * Expects `projectId` in route params or query.
 */
export const requireAssessmentAccess = () => {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get('user');
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    // System admins bypass all gates
    if (user.role === 'system_admin') {
      await next();
      return;
    }

    // Non-SI orgs use subscription billing — no agreement gates
    const org = await c.var.repos.organizations.findById(user.organizationId);
    if (org?.type !== 'si_partner') {
      await next();
      return;
    }

    const projectId = c.req.param('projectId') || c.req.param('id') || c.req.query('projectId');
    if (!projectId) {
      throw new AppError(ErrorCodes.BAD_REQUEST, 'Project ID required', 400);
    }

    // Find the active agreement for this project
    const agreement = await c.var.repos.feeAgreements.findActiveByProjectId(projectId);
    if (!agreement) {
      throw new AppError(
        ErrorCodes.AGREEMENT_REQUIRED,
        'A fee agreement is required to access this project. Please accept the assessment terms first.',
        403
      );
    }

    // Draft agreements don't grant access
    if (agreement.status === 'draft') {
      throw new AppError(
        ErrorCodes.AGREEMENT_REQUIRED,
        'Please accept the assessment agreement to unlock project tools.',
        403
      );
    }

    // Check M1 payment
    const milestones = await c.var.repos.feeMilestones.findByAgreementId(agreement.id);
    const m1 = milestones.find((m) => m.phase === 'assessment' && m.sortOrder === 1);

    if (!m1 || m1.status !== 'paid') {
      throw new AppError(
        ErrorCodes.PAYMENT_REQUIRED,
        'Assessment fee payment is required to access extraction tools. Please complete your payment.',
        402
      );
    }

    await next();
  });
};

/**
 * Requires active_migration status for the project.
 * Used on migration-phase routes: segmentation, disposition.
 */
export const requireMigrationAccess = () => {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get('user');
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    // System admins bypass
    if (user.role === 'system_admin') {
      await next();
      return;
    }

    // Non-SI orgs use subscription billing
    const org = await c.var.repos.organizations.findById(user.organizationId);
    if (org?.type !== 'si_partner') {
      await next();
      return;
    }

    const projectId = c.req.param('projectId') || c.req.param('id') || c.req.query('projectId');
    if (!projectId) {
      throw new AppError(ErrorCodes.BAD_REQUEST, 'Project ID required', 400);
    }

    const agreement = await c.var.repos.feeAgreements.findActiveByProjectId(projectId);
    if (!agreement) {
      throw new AppError(
        ErrorCodes.AGREEMENT_REQUIRED,
        'A fee agreement is required to access migration tools.',
        403
      );
    }

    if (agreement.status !== 'active_migration') {
      throw new AppError(
        ErrorCodes.MIGRATION_REQUIRED,
        'Migration access requires an active migration agreement. Please proceed to migration first.',
        403
      );
    }

    await next();
  });
};
