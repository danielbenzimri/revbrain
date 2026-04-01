/**
 * Job Queue Service
 *
 * Database-backed job queue for async processing.
 * Supports multiple job types, retries with exponential backoff,
 * and distributed locking for concurrent workers.
 */
import type { DrizzleDB } from '@revbrain/database';
import { jobQueue } from '@revbrain/database';
import { eq, and, lte, or, isNull, sql, desc } from 'drizzle-orm';
import { logger } from '../lib/logger.ts';
import { randomUUID } from 'node:crypto';

// Lazy database accessor — prevents postgres.js from loading on Edge Functions (Deno)
let _db: DrizzleDB | null = null;
async function getDb(): Promise<DrizzleDB> {
  if (!_db) {
    const { db } = await import('@revbrain/database/client');
    _db = db;
  }
  return _db;
}

export type JobType = 'email' | 'webhook' | 'report' | 'cleanup';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'dead';

export interface JobPayload {
  // Email job
  email?: {
    to: string | string[];
    subject: string;
    html: string;
    replyTo?: string;
  };
  // Webhook job
  webhook?: {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: unknown;
    headers?: Record<string, string>;
  };
  // Generic data
  [key: string]: unknown;
}

export interface EnqueueOptions {
  priority?: number;
  scheduledAt?: Date;
  maxAttempts?: number;
  organizationId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface JobStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  dead: number;
  total: number;
  byType: Record<string, number>;
}

export interface ProcessResult {
  processed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ jobId: string; error: string }>;
}

// Job handlers registry
type JobHandler = (payload: JobPayload) => Promise<void>;
const handlers: Map<JobType, JobHandler> = new Map();

export class JobQueueService {
  private workerId: string;
  private lockDurationMs: number;

  constructor(options?: { workerId?: string; lockDurationMinutes?: number }) {
    this.workerId = options?.workerId || `worker-${randomUUID().slice(0, 8)}`;
    this.lockDurationMs = (options?.lockDurationMinutes || 5) * 60 * 1000;
  }

  /**
   * Register a handler for a job type
   */
  static registerHandler(type: JobType, handler: JobHandler): void {
    handlers.set(type, handler);
    logger.info('Job handler registered', { type });
  }

  /**
   * Enqueue a new job
   */
  async enqueue(type: JobType, payload: JobPayload, options?: EnqueueOptions): Promise<string> {
    const [job] = await (
      await getDb()
    )
      .insert(jobQueue)
      .values({
        type,
        payload,
        priority: options?.priority ?? 0,
        scheduledAt: options?.scheduledAt ?? new Date(),
        maxAttempts: options?.maxAttempts ?? 3,
        organizationId: options?.organizationId,
        userId: options?.userId,
        metadata: options?.metadata ?? {},
      })
      .returning({ id: jobQueue.id });

    logger.info('Job enqueued', {
      jobId: job.id,
      type,
      scheduledAt: options?.scheduledAt?.toISOString() ?? 'now',
    });

    return job.id;
  }

  /**
   * Process pending jobs
   */
  async process(batchSize = 10): Promise<ProcessResult> {
    const result: ProcessResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
    };

    // Claim jobs atomically using the database function
    const now = new Date();
    const lockUntil = new Date(now.getTime() + this.lockDurationMs);

    // Find and lock pending jobs
    const jobs = await (
      await getDb()
    )
      .update(jobQueue)
      .set({
        status: 'processing',
        lockedUntil: lockUntil,
        lockedBy: this.workerId,
        startedAt: sql`COALESCE(${jobQueue.startedAt}, now())`,
        attempts: sql`${jobQueue.attempts} + 1`,
      })
      .where(
        and(
          eq(jobQueue.status, 'pending'),
          lte(jobQueue.scheduledAt, now),
          or(isNull(jobQueue.lockedUntil), lte(jobQueue.lockedUntil, now))
        )
      )
      .returning();

    // Limit to batchSize (Drizzle doesn't support LIMIT in UPDATE)
    const jobsToProcess = jobs.slice(0, batchSize);

    // Release extra jobs if we claimed too many
    if (jobs.length > batchSize) {
      const extraIds = jobs.slice(batchSize).map((j) => j.id);
      await (
        await getDb()
      )
        .update(jobQueue)
        .set({
          status: 'pending',
          lockedUntil: null,
          lockedBy: null,
          attempts: sql`${jobQueue.attempts} - 1`,
        })
        .where(sql`${jobQueue.id} = ANY(${extraIds})`);
    }

    logger.info('Jobs claimed for processing', {
      workerId: this.workerId,
      count: jobsToProcess.length,
    });

    // Process each job
    for (const job of jobsToProcess) {
      result.processed++;

      try {
        const handler = handlers.get(job.type as JobType);

        if (!handler) {
          throw new Error(`No handler registered for job type: ${job.type}`);
        }

        await handler(job.payload as JobPayload);

        // Mark as completed
        await (
          await getDb()
        )
          .update(jobQueue)
          .set({
            status: 'completed',
            completedAt: new Date(),
            lockedUntil: null,
            lockedBy: null,
          })
          .where(eq(jobQueue.id, job.id));

        result.succeeded++;
        logger.info('Job completed', { jobId: job.id, type: job.type });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.failed++;
        result.errors.push({ jobId: job.id, error: errorMessage });

        // Check if we should retry or mark as dead
        const shouldRetry = job.attempts < job.maxAttempts;

        if (shouldRetry) {
          // Calculate exponential backoff delay
          const delayMs = Math.min(
            60000 * Math.pow(2, job.attempts - 1), // 1min, 2min, 4min...
            3600000 // Max 1 hour
          );
          const retryAt = new Date(Date.now() + delayMs);

          await (
            await getDb()
          )
            .update(jobQueue)
            .set({
              status: 'pending',
              lastError: errorMessage,
              lockedUntil: null,
              lockedBy: null,
              scheduledAt: retryAt,
            })
            .where(eq(jobQueue.id, job.id));

          logger.warn('Job failed, scheduled for retry', {
            jobId: job.id,
            type: job.type,
            attempt: job.attempts,
            maxAttempts: job.maxAttempts,
            retryAt: retryAt.toISOString(),
            error: errorMessage,
          });
        } else {
          // Max retries exceeded, mark as dead
          await (
            await getDb()
          )
            .update(jobQueue)
            .set({
              status: 'dead',
              lastError: errorMessage,
              failedAt: new Date(),
              lockedUntil: null,
              lockedBy: null,
            })
            .where(eq(jobQueue.id, job.id));

          logger.error('Job dead after max retries', {
            jobId: job.id,
            type: job.type,
            attempts: job.attempts,
            error: errorMessage,
          });
        }
      }
    }

    return result;
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<JobStats> {
    const statusCounts = await (
      await getDb()
    )
      .select({
        status: jobQueue.status,
        count: sql<number>`count(*)::int`,
      })
      .from(jobQueue)
      .groupBy(jobQueue.status);

    const typeCounts = await (
      await getDb()
    )
      .select({
        type: jobQueue.type,
        count: sql<number>`count(*)::int`,
      })
      .from(jobQueue)
      .where(or(eq(jobQueue.status, 'pending'), eq(jobQueue.status, 'processing')))
      .groupBy(jobQueue.type);

    const stats: JobStats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      dead: 0,
      total: 0,
      byType: {},
    };

    for (const row of statusCounts) {
      const status = row.status as JobStatus;
      stats[status] = row.count;
      stats.total += row.count;
    }

    for (const row of typeCounts) {
      stats.byType[row.type] = row.count;
    }

    return stats;
  }

  /**
   * Get recent failed/dead jobs for debugging
   */
  async getFailedJobs(limit = 20): Promise<Array<typeof jobQueue.$inferSelect>> {
    return (await getDb())
      .select()
      .from(jobQueue)
      .where(or(eq(jobQueue.status, 'failed'), eq(jobQueue.status, 'dead')))
      .orderBy(desc(jobQueue.failedAt))
      .limit(limit);
  }

  /**
   * Retry a specific dead job
   */
  async retryJob(jobId: string): Promise<boolean> {
    const result = await (
      await getDb()
    )
      .update(jobQueue)
      .set({
        status: 'pending',
        attempts: 0,
        scheduledAt: new Date(),
        lastError: null,
        failedAt: null,
        lockedUntil: null,
        lockedBy: null,
      })
      .where(
        and(eq(jobQueue.id, jobId), or(eq(jobQueue.status, 'dead'), eq(jobQueue.status, 'failed')))
      )
      .returning({ id: jobQueue.id });

    return result.length > 0;
  }

  /**
   * Cleanup old completed/dead jobs
   */
  async cleanup(retentionDays = 7): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const result = await (
      await getDb()
    )
      .delete(jobQueue)
      .where(
        and(
          or(eq(jobQueue.status, 'completed'), eq(jobQueue.status, 'dead')),
          lte(jobQueue.createdAt, cutoff)
        )
      )
      .returning({ id: jobQueue.id });

    logger.info('Job queue cleanup', {
      deleted: result.length,
      retentionDays,
    });

    return result.length;
  }
}
