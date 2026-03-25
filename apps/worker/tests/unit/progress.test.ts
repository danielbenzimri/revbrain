import { describe, it, expect } from 'vitest';
import { ProgressReporter } from '../../src/progress.ts';

describe('ProgressReporter', () => {
  it('should produce correct JSON structure', () => {
    const progress = new ProgressReporter('extraction');
    progress.markRunning('discovery');
    progress.markSuccess('discovery', 42, 3200);
    progress.markRunning('catalog', 'products');
    progress.addApiCalls(47);

    const json = progress.toJSON();
    expect(json.phase).toBe('extraction');
    expect(json.api_calls_used).toBe(47);
    expect(json.started_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const collectors = json.collectors as Record<string, unknown>;
    expect(collectors.discovery).toEqual({
      status: 'success',
      records: 42,
      duration_ms: 3200,
    });
    expect(collectors.catalog).toEqual({
      status: 'running',
      substep: 'products',
    });
  });

  it('should track collector status transitions', () => {
    const progress = new ProgressReporter();
    progress.markRunning('pricing');
    expect(progress.getCollectorStatus('pricing')).toBe('running');

    progress.markSuccess('pricing', 100, 5000);
    expect(progress.getCollectorStatus('pricing')).toBe('success');
  });

  it('should detect warnings from partial/failed collectors', () => {
    const progress = new ProgressReporter();
    progress.markSuccess('discovery', 10, 1000);
    expect(progress.hasWarnings()).toBe(false);

    progress.markPartial('templates', 5, 2000);
    expect(progress.hasWarnings()).toBe(true);
  });

  it('should detect warnings from failed collectors', () => {
    const progress = new ProgressReporter();
    progress.markFailed('approvals', 'timeout');
    expect(progress.hasWarnings()).toBe(true);
  });

  it('should track API call count', () => {
    const progress = new ProgressReporter();
    progress.addApiCalls(10);
    progress.addApiCalls(5);
    expect(progress.getApiCallsUsed()).toBe(15);
  });

  it('should update substep within running collector', () => {
    const progress = new ProgressReporter();
    progress.markRunning('catalog', 'products');
    progress.updateSubstep('catalog', 'features', 142);

    const json = progress.toJSON();
    const catalog = (json.collectors as Record<string, { substep: string; records: number }>)
      .catalog;
    expect(catalog.substep).toBe('features');
    expect(catalog.records).toBe(142);
  });

  it('should handle skipped collectors', () => {
    const progress = new ProgressReporter();
    progress.markSkipped('integrations');
    expect(progress.getCollectorStatus('integrations')).toBe('skipped');
  });
});
