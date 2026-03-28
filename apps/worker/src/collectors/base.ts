/**
 * Base collector — timeout, cancellation, checkpoint, metrics.
 *
 * All collectors extend this base. Provides:
 * - Timeout enforcement via AbortController
 * - Cancellation checking (shutdown flag + cancel_requested)
 * - Checkpoint read/write
 * - Error classification (tier-based)
 * - Duration tracking
 *
 * See: Implementation Plan Phase 4-6 collector tasks
 */

import type { SalesforceRestApi } from '../salesforce/rest.ts';
import type { SalesforceBulkApi } from '../salesforce/bulk.ts';
import type { SalesforceMetadataApi } from '../salesforce/soap.ts';
import type { CheckpointManager } from '../checkpoint.ts';
import type { ProgressReporter } from '../progress.ts';
import type { SnapshotUploader } from '../storage/snapshots.ts';
import type postgres from 'postgres';
import type { CollectorDefinition } from './registry.ts';
import type {
  AssessmentFindingInput,
  AssessmentRelationshipInput,
  CollectorMetricsInput,
} from '@revbrain/contract';
import { logger } from '../lib/logger.ts';
import { isShuttingDown, isCancelRequested } from '../lifecycle.ts';

/** Context passed to every collector */
export interface CollectorContext {
  sql: postgres.Sql;
  restApi: SalesforceRestApi;
  bulkApi: SalesforceBulkApi;
  metadataApi: SalesforceMetadataApi;
  checkpoint: CheckpointManager;
  progress: ProgressReporter;
  snapshots: SnapshotUploader;
  runId: string;
  organizationId: string;
  connectionId: string;
  describeCache: Map<string, unknown>;
  config: {
    codeExtractionEnabled: boolean;
    rawSnapshotMode: string;
    llmEnrichmentEnabled?: boolean;
    anthropicApiKey?: string | null;
    anthropicModel?: string | null;
  };
}

/** Result from a collector run */
export interface CollectorResult {
  findings: AssessmentFindingInput[];
  relationships: AssessmentRelationshipInput[];
  metrics: CollectorMetricsInput;
  status: 'success' | 'partial' | 'failed';
  error?: string;
}

/**
 * Abstract base collector. Override `execute()` to implement extraction logic.
 */
export abstract class BaseCollector {
  protected log;
  protected abortController: AbortController;

  constructor(
    protected definition: CollectorDefinition,
    protected ctx: CollectorContext
  ) {
    this.log = logger.child({ collector: definition.name });
    this.abortController = new AbortController();
  }

  get name(): string {
    return this.definition.name;
  }

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  /**
   * Run the collector with timeout and cancellation.
   */
  async run(): Promise<CollectorResult> {
    const startTime = Date.now();
    this.ctx.progress.markRunning(this.name);

    // Timeout enforcement
    const timeout = setTimeout(() => {
      this.log.warn({ timeoutMs: this.definition.timeoutMs }, 'collector_timeout');
      this.abortController.abort();
    }, this.definition.timeoutMs);

    try {
      // Check cancellation before starting
      if (isShuttingDown() || (await isCancelRequested(this.ctx.sql, this.ctx.runId))) {
        this.ctx.progress.markSkipped(this.name);
        return this.emptyResult('skipped');
      }

      const result = await this.execute();
      const durationMs = Date.now() - startTime;

      const recordCount = result.findings.length;
      if (result.status === 'success') {
        this.ctx.progress.markSuccess(this.name, recordCount, durationMs);
      } else if (result.status === 'partial') {
        this.ctx.progress.markPartial(this.name, recordCount, durationMs);
      }

      result.metrics.durationMs = durationMs;
      this.log.info(
        { status: result.status, findings: recordCount, durationMs },
        'collector_complete'
      );

      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.ctx.progress.markFailed(this.name, errorMsg, durationMs);
      this.log.error({ error: errorMsg, durationMs }, 'collector_failed');

      return {
        findings: [],
        relationships: [],
        metrics: this.createEmptyMetrics(durationMs),
        status: 'failed',
        error: errorMsg,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Override in subclass: the actual extraction logic */
  protected abstract execute(): Promise<CollectorResult>;

  /** Check cancellation — call between major operations */
  protected async checkCancellation(): Promise<boolean> {
    if (isShuttingDown()) return true;
    if (this.signal.aborted) return true;
    return isCancelRequested(this.ctx.sql, this.ctx.runId);
  }

  protected emptyResult(status: 'success' | 'partial' | 'failed' | 'skipped'): CollectorResult {
    return {
      findings: [],
      relationships: [],
      metrics: this.createEmptyMetrics(0),
      status: status === 'skipped' ? 'success' : status,
    };
  }

  protected createEmptyMetrics(durationMs: number): CollectorMetricsInput {
    return {
      collectorName: this.name,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      domain: this.definition.domain as any,
      metrics: {},
      warnings: [],
      coverage: 0,
      durationMs,
      schemaVersion: '1.0',
    };
  }
}
