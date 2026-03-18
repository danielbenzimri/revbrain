/**
 * Cron Jobs Service
 *
 * Handles scheduled tasks that run periodically:
 * - Trial expiration warnings (3 days before)
 * - Trial ended notifications
 * - Subscription renewal reminders
 *
 * This service is called by external schedulers (pg_cron, Vercel Cron, etc.)
 * and processes pending tasks in a batch.
 */
import {
  db,
  subscriptions,
  users,
  organizations,
  eq,
  and,
  lte,
  gte,
  isNull,
  inArray,
  sql,
} from '@revbrain/database';
import { getEmailService } from '../emails/index.ts';
import { renderTrialEndingEmail, renderTrialEndedEmail } from '../emails/templates/index.ts';
import { getEnv } from '../lib/env.ts';
import { logger } from '../lib/logger.ts';

/** Result of a cron job run */
export interface CronJobResult {
  job: string;
  processed: number;
  errors: number;
  details?: string[];
}

/** Result of running all cron jobs */
export interface CronRunResult {
  timestamp: Date;
  jobs: CronJobResult[];
  totalProcessed: number;
  totalErrors: number;
}

/** Billing contact for email sending */
interface BillingContact {
  email: string;
  fullName: string;
  orgName: string;
  orgId: string;
}

export class CronService {
  /**
   * Run all scheduled cron jobs.
   * Call this endpoint from an external scheduler (every hour recommended).
   */
  async runAllJobs(): Promise<CronRunResult> {
    const timestamp = new Date();
    const jobs: CronJobResult[] = [];

    logger.info('Starting cron jobs run', { timestamp });

    // Job 1: Trial ending warnings (3 days before)
    const trialEndingResult = await this.processTrialEndingWarnings();
    jobs.push(trialEndingResult);

    // Job 2: Trial ended notifications
    const trialEndedResult = await this.processTrialEndedNotifications();
    jobs.push(trialEndedResult);

    const totalProcessed = jobs.reduce((sum, j) => sum + j.processed, 0);
    const totalErrors = jobs.reduce((sum, j) => sum + j.errors, 0);

    logger.info('Cron jobs run complete', { totalProcessed, totalErrors });

    return {
      timestamp,
      jobs,
      totalProcessed,
      totalErrors,
    };
  }

  /**
   * Process trial ending warnings.
   * Sends emails to subscriptions that are trialing and end within 3 days.
   */
  async processTrialEndingWarnings(): Promise<CronJobResult> {
    const job = 'trial-ending-warnings';
    let processed = 0;
    let errors = 0;
    const details: string[] = [];

    try {
      const now = new Date();
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      const oneDayFromNow = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

      // Find trialing subscriptions ending in 1-3 days that haven't been notified
      const trialingSubs = await db.query.subscriptions.findMany({
        where: and(
          eq(subscriptions.status, 'trialing'),
          gte(subscriptions.trialEnd, oneDayFromNow),
          lte(subscriptions.trialEnd, threeDaysFromNow),
          isNull(subscriptions.trialEndingNotifiedAt)
        ),
        with: {
          plan: true,
          organization: true,
        },
      });

      logger.info(`Found ${trialingSubs.length} trial ending subscriptions to notify`);

      for (const sub of trialingSubs) {
        try {
          const contact = await this.getBillingContact(sub.organizationId);
          if (!contact) {
            details.push(`No contact for org ${sub.organizationId}`);
            continue;
          }

          // Calculate days remaining
          const trialEndDate = new Date(sub.trialEnd!);
          const daysRemaining = Math.ceil(
            (trialEndDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
          );

          const planName = sub.plan?.name || 'Trial';
          const price = sub.plan ? `$${sub.plan.price}/${sub.plan.interval}` : '';

          await this.sendTrialEndingEmail(contact, {
            planName,
            trialEndDate: trialEndDate.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }),
            daysRemaining,
            price,
          });

          // Mark as notified
          await db
            .update(subscriptions)
            .set({ trialEndingNotifiedAt: now })
            .where(eq(subscriptions.id, sub.id));

          processed++;
          details.push(`Notified ${contact.email} (${daysRemaining} days left)`);
        } catch (err) {
          errors++;
          details.push(`Error for org ${sub.organizationId}: ${(err as Error).message}`);
          logger.error(
            'Failed to process trial ending',
            { orgId: sub.organizationId },
            err as Error
          );
        }
      }
    } catch (err) {
      errors++;
      details.push(`Job failed: ${(err as Error).message}`);
      logger.error('Trial ending job failed', {}, err as Error);
    }

    return { job, processed, errors, details };
  }

  /**
   * Process trial ended notifications.
   * Sends emails to subscriptions where trial has ended and they haven't subscribed.
   */
  async processTrialEndedNotifications(): Promise<CronJobResult> {
    const job = 'trial-ended-notifications';
    let processed = 0;
    let errors = 0;
    const details: string[] = [];

    try {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Find trialing subscriptions that ended in the last 24 hours and haven't been notified
      // These are trials that expired without converting to paid
      const expiredTrials = await db.query.subscriptions.findMany({
        where: and(
          // Trial ended in the last 24 hours
          gte(subscriptions.trialEnd, yesterday),
          lte(subscriptions.trialEnd, now),
          // Still trialing (didn't convert) or just became past_due/canceled
          sql`${subscriptions.status} IN ('trialing', 'past_due', 'canceled', 'incomplete_expired')`,
          // Haven't been notified
          isNull(subscriptions.trialEndedNotifiedAt)
        ),
        with: {
          plan: true,
          organization: true,
        },
      });

      logger.info(`Found ${expiredTrials.length} expired trials to notify`);

      for (const sub of expiredTrials) {
        try {
          const contact = await this.getBillingContact(sub.organizationId);
          if (!contact) {
            details.push(`No contact for org ${sub.organizationId}`);
            continue;
          }

          await this.sendTrialEndedEmail(contact, sub.plan?.name || 'Professional');

          // Mark as notified
          await db
            .update(subscriptions)
            .set({ trialEndedNotifiedAt: now })
            .where(eq(subscriptions.id, sub.id));

          processed++;
          details.push(`Notified ${contact.email}`);
        } catch (err) {
          errors++;
          details.push(`Error for org ${sub.organizationId}: ${(err as Error).message}`);
          logger.error(
            'Failed to process trial ended',
            { orgId: sub.organizationId },
            err as Error
          );
        }
      }
    } catch (err) {
      errors++;
      details.push(`Job failed: ${(err as Error).message}`);
      logger.error('Trial ended job failed', {}, err as Error);
    }

    return { job, processed, errors, details };
  }

  /**
   * Get billing contact for an organization.
   */
  private async getBillingContact(orgId: string): Promise<BillingContact | null> {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
    });

    if (!org) return null;

    // Find the primary billing contact (CEO or first admin)
    const adminRoles = ['org_owner', 'org_owner', 'system_admin'];
    const adminUser = await db.query.users.findFirst({
      where: and(eq(users.organizationId, orgId), inArray(users.role, adminRoles)),
    });

    // Fallback to any user in the org
    const user =
      adminUser ||
      (await db.query.users.findFirst({
        where: eq(users.organizationId, orgId),
      }));

    if (!user) return null;

    return {
      email: user.email,
      fullName: user.fullName,
      orgName: org.name,
      orgId: org.id,
    };
  }

  /**
   * Send trial ending email.
   */
  private async sendTrialEndingEmail(
    contact: BillingContact,
    data: {
      planName: string;
      trialEndDate: string;
      daysRemaining: number;
      price: string;
    }
  ): Promise<void> {
    const appUrl = getEnv('APP_URL') || 'http://localhost:5173';

    const html = renderTrialEndingEmail({
      userName: contact.fullName,
      planName: data.planName,
      trialEndDate: data.trialEndDate,
      daysRemaining: data.daysRemaining,
      price: data.price,
      addPaymentUrl: `${appUrl}/settings/billing`,
    });

    const emailService = getEmailService();
    await emailService.send({
      to: contact.email,
      subject: `Your trial ends in ${data.daysRemaining} day${data.daysRemaining > 1 ? 's' : ''}`,
      html,
    });

    logger.info('Sent trial ending email', {
      email: contact.email,
      orgId: contact.orgId,
      daysRemaining: data.daysRemaining,
    });
  }

  /**
   * Send trial ended email.
   */
  private async sendTrialEndedEmail(contact: BillingContact, planName: string): Promise<void> {
    const appUrl = getEnv('APP_URL') || 'http://localhost:5173';

    const html = renderTrialEndedEmail({
      userName: contact.fullName,
      previousPlanName: planName,
      subscribeUrl: `${appUrl}/settings/billing`,
      // Optional: Include a special offer to convert
      // specialOffer: { discount: '20%', expiresAt: '...' },
    });

    const emailService = getEmailService();
    await emailService.send({
      to: contact.email,
      subject: 'Your trial has ended - subscribe to continue',
      html,
    });

    logger.info('Sent trial ended email', {
      email: contact.email,
      orgId: contact.orgId,
    });
  }
}
