/**
 * Admin Notification Service
 *
 * Creates in-app notifications for admin users.
 * Supports deduplication, broadcast to all system_admins,
 * and email alerts for critical notifications via the job queue.
 */
import { adminNotifications, users } from '@revbrain/database';
import type { DrizzleDB } from '@revbrain/database';
import { eq, and, sql, gte, inArray } from 'drizzle-orm';
import { logger } from '../lib/logger.ts';
import { JobQueueService } from './job-queue.service.ts';

export interface CreateAdminNotificationInput {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  targetAdminId?: string; // specific admin, or null = all system_admins
}

/**
 * Create an admin notification.
 *
 * - If targetAdminId is null, creates a notification for ALL system_admin users.
 * - Dedup: if a notification with the same (type, metadata.entityId) was created
 *   within the last hour, updates existing instead of creating new.
 * - If severity === 'critical', queues an email alert via the job queue.
 */
export async function createAdminNotification(
  database: DrizzleDB,
  data: CreateAdminNotificationInput
): Promise<void> {
  try {
    // Resolve target admin user IDs
    let targetIds: string[];
    if (data.targetAdminId) {
      targetIds = [data.targetAdminId];
    } else {
      // Broadcast to all system_admin users
      const admins = await database
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.role, 'system_admin'));
      targetIds = admins.map((a) => a.id);
    }

    if (targetIds.length === 0) {
      logger.warn('No admin users found for notification', { type: data.type });
      return;
    }

    const entityId = (data.metadata as Record<string, unknown> | undefined)?.entityId;
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    for (const adminId of targetIds) {
      // Dedup check: same type + entityId within last hour
      if (entityId) {
        const existing = await database
          .select({ id: adminNotifications.id })
          .from(adminNotifications)
          .where(
            and(
              eq(adminNotifications.adminUserId, adminId),
              eq(adminNotifications.type, data.type),
              gte(adminNotifications.createdAt, oneHourAgo),
              sql`${adminNotifications.metadata}->>'entityId' = ${String(entityId)}`
            )
          )
          .limit(1);

        if (existing.length > 0) {
          // Update existing notification
          await database
            .update(adminNotifications)
            .set({
              title: data.title,
              message: data.message,
              severity: data.severity,
              metadata: data.metadata,
              isRead: false,
              createdAt: new Date(),
            })
            .where(eq(adminNotifications.id, existing[0].id));

          logger.debug('Admin notification deduped (updated)', {
            notificationId: existing[0].id,
            type: data.type,
            adminId,
          });
          continue;
        }
      }

      // Create new notification
      await database.insert(adminNotifications).values({
        adminUserId: adminId,
        type: data.type,
        severity: data.severity,
        title: data.title,
        message: data.message,
        metadata: data.metadata ?? {},
      });
    }

    logger.info('Admin notification(s) created', {
      type: data.type,
      severity: data.severity,
      targetCount: targetIds.length,
    });

    // Email alert for critical severity
    if (data.severity === 'critical') {
      try {
        const jobQueue = new JobQueueService();
        // Resolve emails for all target admins
        const adminRows = await database
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(inArray(users.id, targetIds));

        for (const admin of adminRows) {
          if (admin.email) {
            await jobQueue.enqueue('email', {
              email: {
                to: admin.email,
                subject: `[CRITICAL] ${data.title}`,
                html: `<h2>${data.title}</h2><p>${data.message}</p><p>Severity: <strong>${data.severity}</strong></p><p>Type: ${data.type}</p>`,
              },
            });
          }
        }

        logger.info('Critical notification email(s) queued', {
          type: data.type,
          emailCount: adminRows.filter((a) => a.email).length,
        });
      } catch (emailErr) {
        // Don't fail the notification creation if email queueing fails
        logger.error('Failed to queue critical notification email', {}, emailErr as Error);
      }
    }
  } catch (err) {
    logger.error('Failed to create admin notification', { type: data.type }, err as Error);
    throw err;
  }
}
