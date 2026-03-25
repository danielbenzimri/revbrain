/**
 * Salesforce Bulk API 2.0 lifecycle client.
 *
 * - createQuery, pollJob, getResults (streaming CSV), abortJob
 * - Adaptive polling with jitter
 * - Size-aware max wait
 * - failedResults check
 * - AbortSignal propagation
 *
 * See: Implementation Plan Task 2.4, Architecture Spec Section 10.4
 */

import type { SalesforceClient } from './client.ts';
import { logger } from '../lib/logger.ts';

interface BulkJobStatus {
  id: string;
  state: 'UploadComplete' | 'InProgress' | 'JobComplete' | 'Aborted' | 'Failed';
  numberRecordsProcessed: number;
  errorMessage?: string;
}

export type BulkJobSize = 'small' | 'medium' | 'large';

/** Max wait times by org size estimate */
const MAX_WAIT_MS: Record<BulkJobSize, number> = {
  small: 10 * 60 * 1000, // 10 min
  medium: 20 * 60 * 1000, // 20 min
  large: 45 * 60 * 1000, // 45 min
};

export class SalesforceBulkApi {
  constructor(
    private client: SalesforceClient,
    private apiVersion: string = 'v62.0'
  ) {}

  /** Create a Bulk API 2.0 query job */
  async createQuery(soql: string, signal?: AbortSignal): Promise<string> {
    const result = await this.client.request<{ id: string }>({
      apiType: 'bulk',
      method: 'POST',
      path: `/services/data/${this.apiVersion}/jobs/query`,
      body: { operation: 'query', query: soql },
      signal,
    });
    logger.info({ jobId: result.id, soql: soql.slice(0, 100) }, 'bulk_job_created');
    return result.id;
  }

  /** Poll until job completes or fails. Adaptive cadence with jitter. */
  async pollJob(
    jobId: string,
    size: BulkJobSize = 'medium',
    signal?: AbortSignal
  ): Promise<BulkJobStatus> {
    const maxWait = MAX_WAIT_MS[size];
    const startTime = Date.now();
    let pollInterval = 5000; // Start at 5s

    while (Date.now() - startTime < maxWait) {
      if (signal?.aborted) throw new Error('Bulk job polling aborted');

      const status = await this.client.request<BulkJobStatus>({
        apiType: 'bulk',
        path: `/services/data/${this.apiVersion}/jobs/query/${jobId}`,
        signal,
      });

      if (
        status.state === 'JobComplete' ||
        status.state === 'Failed' ||
        status.state === 'Aborted'
      ) {
        return status;
      }

      // Adaptive polling: increase interval over time
      const elapsed = Date.now() - startTime;
      if (elapsed > 30_000) pollInterval = 15_000;
      if (elapsed > 60_000) pollInterval = 30_000;

      // Add ±20% jitter
      const jitter = pollInterval * 0.2 * (Math.random() * 2 - 1);
      await new Promise((r) => setTimeout(r, pollInterval + jitter));
    }

    throw new Error(`Bulk job ${jobId} timed out after ${maxWait / 1000}s`);
  }

  /**
   * Get job results as an async generator yielding CSV text chunks.
   * Follows Sforce-Locator header for pagination.
   */
  async *getResults(jobId: string, signal?: AbortSignal): AsyncGenerator<string> {
    let locator: string | null = null;

    do {
      if (signal?.aborted) throw new Error('Bulk results fetch aborted');

      const path = locator
        ? `/services/data/${this.apiVersion}/jobs/query/${jobId}/results?locator=${locator}`
        : `/services/data/${this.apiVersion}/jobs/query/${jobId}/results`;

      const { accessToken, instanceUrl } = await (this.client as any).auth.getAccessToken();
      const response = await fetch(`${instanceUrl}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to get bulk results: ${response.status}`);
      }

      locator = response.headers.get('sforce-locator');
      if (locator === 'null') locator = null;

      const text = await response.text();
      if (text.trim()) {
        yield text;
      }
    } while (locator);
  }

  /** Check for failed records after job completion */
  async getFailedResults(jobId: string, signal?: AbortSignal): Promise<string> {
    const { accessToken, instanceUrl } = await (this.client as any).auth.getAccessToken();
    const response = await fetch(
      `${instanceUrl}/services/data/${this.apiVersion}/jobs/query/${jobId}/failedResults`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal,
      }
    );
    return response.text();
  }

  /** Abort an in-flight bulk job */
  async abortJob(jobId: string): Promise<void> {
    try {
      await this.client.request({
        apiType: 'bulk',
        method: 'PATCH',
        path: `/services/data/${this.apiVersion}/jobs/query/${jobId}`,
        body: { state: 'Aborted' },
      });
      logger.info({ jobId }, 'bulk_job_aborted');
    } catch (err) {
      logger.warn(
        { jobId, error: err instanceof Error ? err.message : String(err) },
        'bulk_job_abort_failed'
      );
    }
  }
}
