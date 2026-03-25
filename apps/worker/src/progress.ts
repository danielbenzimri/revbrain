/**
 * Progress reporter — tracks per-collector status.
 *
 * Writes JSONB to assessment_runs.progress on each heartbeat.
 * Format matches architecture spec Section 4 progress schema.
 */

import { logger } from './lib/logger.ts';

export type CollectorStatus = 'pending' | 'running' | 'success' | 'partial' | 'failed' | 'skipped';

interface CollectorProgress {
  status: CollectorStatus;
  substep?: string;
  records?: number;
  duration_ms?: number;
  error?: string;
}

export class ProgressReporter {
  private collectors: Map<string, CollectorProgress> = new Map();
  private apiCallsUsed = 0;
  private startedAt: string;

  constructor(private phase: string = 'extraction') {
    this.startedAt = new Date().toISOString();
  }

  /** Mark a collector as running */
  markRunning(collector: string, substep?: string): void {
    this.collectors.set(collector, { status: 'running', substep });
  }

  /** Mark a collector as successful */
  markSuccess(collector: string, records: number, durationMs: number): void {
    this.collectors.set(collector, {
      status: 'success',
      records,
      duration_ms: durationMs,
    });
  }

  /** Mark a collector as partially successful */
  markPartial(collector: string, records: number, durationMs: number): void {
    this.collectors.set(collector, {
      status: 'partial',
      records,
      duration_ms: durationMs,
    });
  }

  /** Mark a collector as failed */
  markFailed(collector: string, error: string, durationMs?: number): void {
    this.collectors.set(collector, {
      status: 'failed',
      error,
      duration_ms: durationMs,
    });
  }

  /** Mark a collector as skipped (disabled or dependency failed) */
  markSkipped(collector: string): void {
    this.collectors.set(collector, { status: 'skipped' });
  }

  /** Update substep within a running collector */
  updateSubstep(collector: string, substep: string, records?: number): void {
    const existing = this.collectors.get(collector);
    if (existing) {
      existing.substep = substep;
      if (records !== undefined) existing.records = records;
    }
  }

  /** Increment API call counter */
  addApiCalls(count: number): void {
    this.apiCallsUsed += count;
  }

  /** Set phase (extraction, normalization, summaries) */
  setPhase(phase: string): void {
    this.phase = phase;
  }

  /** Check if any non-tier-0 collector has warnings (partial/failed) */
  hasWarnings(): boolean {
    for (const [, progress] of this.collectors) {
      if (progress.status === 'partial' || progress.status === 'failed') {
        return true;
      }
    }
    return false;
  }

  /** Get the progress JSON suitable for DB storage */
  toJSON(): Record<string, unknown> {
    const collectors: Record<string, CollectorProgress> = {};
    for (const [name, progress] of this.collectors) {
      collectors[name] = progress;
    }

    return {
      phase: this.phase,
      collectors,
      api_calls_used: this.apiCallsUsed,
      started_at: this.startedAt,
    };
  }

  /** Get collector status by name */
  getCollectorStatus(collector: string): CollectorStatus | undefined {
    return this.collectors.get(collector)?.status;
  }

  /** Get total API calls used */
  getApiCallsUsed(): number {
    return this.apiCallsUsed;
  }

  /** Log current progress summary */
  logSummary(): void {
    const summary = {
      phase: this.phase,
      apiCallsUsed: this.apiCallsUsed,
      collectors: Object.fromEntries([...this.collectors].map(([name, p]) => [name, p.status])),
    };
    logger.info(summary, 'progress_summary');
  }
}
