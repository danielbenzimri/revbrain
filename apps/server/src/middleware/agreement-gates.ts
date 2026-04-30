/**
 * Agreement Gates Middleware (SI Billing)
 *
 * Phase-based entitlement middleware for SI partners.
 *
 * NEW FLOW (conversion-optimized):
 * - Extraction, normalization, analysis: FREE — no gate
 * - Report generation / PDF export: requires M1 paid
 * - Migration tools (segmentation, disposition): requires active_migration
 *
 * Task: P4.5 (modified for conversion flow)
 * Refs: SI-BILLING-SPEC.md §4 (entitlement gates)
 */
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types/index.ts';
import { AppError, ErrorCodes } from '@revbrain/contract';

/**
 * Requires M1 paid to access premium assessment deliverables.
 * Used on: report generation endpoint only.
 * NOT used on extraction/normalization/analysis — those are free.
 */
export const requireAssessmentPaid = () => {
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

    const agreement = await c.var.repos.feeAgreements.findActiveByProjectId(projectId);
    if (!agreement) {
      throw new AppError(
        ErrorCodes.PAYMENT_REQUIRED,
        'Unlock the full assessment report by accepting your fee agreement.',
        402
      );
    }

    if (agreement.status === 'draft') {
      throw new AppError(
        ErrorCodes.PAYMENT_REQUIRED,
        'Accept and pay the assessment fee to unlock the full report.',
        402
      );
    }

    // Check M1 payment — active_migration and complete statuses imply M1 was paid
    if (agreement.status === 'active_migration' || agreement.status === 'complete') {
      await next();
      return;
    }

    const milestones = await c.var.repos.feeMilestones.findByAgreementId(agreement.id);
    const m1 = milestones.find((m) => m.phase === 'assessment' && m.sortOrder === 1);

    if (!m1 || m1.status !== 'paid') {
      throw new AppError(
        ErrorCodes.PAYMENT_REQUIRED,
        'Complete your assessment fee payment to download the full report.',
        402
      );
    }

    await next();
  });
};

// Keep old name as alias for backward compatibility with any existing references
export const requireAssessmentAccess = requireAssessmentPaid;

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
