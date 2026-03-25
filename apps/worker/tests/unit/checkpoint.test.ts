import { describe, it, expect } from 'vitest';
import { CheckpointManager, type CheckpointData } from '../../src/checkpoint.ts';

// Mock SQL for unit tests (integration tests need real DB)
function createMockSql(returnRows: Record<string, unknown>[] = []) {
  const calls: Array<{ strings: string[]; values: unknown[] }> = [];
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ strings: [...strings], values });
    return Promise.resolve(returnRows);
  };
  return { sql: sql as unknown, calls };
}

describe('CheckpointManager', () => {
  describe('getCollectorsToRerun', () => {
    it('should skip success collectors', () => {
      const { sql } = createMockSql();
      const mgr = new CheckpointManager(sql as never, 'run-1');
      const checkpoints: CheckpointData[] = [
        { collectorName: 'discovery', status: 'success', criticality: 'tier0' },
        { collectorName: 'catalog', status: 'failed', criticality: 'tier0' },
        { collectorName: 'pricing', status: 'running', criticality: 'tier0' },
      ];

      const toRerun = mgr.getCollectorsToRerun(checkpoints);
      expect(toRerun.has('discovery')).toBe(false);
      expect(toRerun.has('catalog')).toBe(true);
      expect(toRerun.has('pricing')).toBe(true);
    });

    it('should skip skipped collectors', () => {
      const { sql } = createMockSql();
      const mgr = new CheckpointManager(sql as never, 'run-1');
      const checkpoints: CheckpointData[] = [
        { collectorName: 'integrations', status: 'skipped', criticality: 'tier2' },
      ];

      const toRerun = mgr.getCollectorsToRerun(checkpoints);
      expect(toRerun.has('integrations')).toBe(false);
    });

    it('should re-run partial collectors', () => {
      const { sql } = createMockSql();
      const mgr = new CheckpointManager(sql as never, 'run-1');
      const checkpoints: CheckpointData[] = [
        { collectorName: 'templates', status: 'partial', criticality: 'tier2' },
      ];

      const toRerun = mgr.getCollectorsToRerun(checkpoints);
      expect(toRerun.has('templates')).toBe(true);
    });
  });

  describe('getOrphanedBulkJobs', () => {
    it('should return bulk job IDs from running checkpoints', () => {
      const { sql } = createMockSql();
      const mgr = new CheckpointManager(sql as never, 'run-1');
      const checkpoints: CheckpointData[] = [
        {
          collectorName: 'usage',
          status: 'running',
          criticality: 'tier0',
          bulkJobIds: ['job-1', 'job-2'],
        },
        {
          collectorName: 'catalog',
          status: 'success',
          criticality: 'tier0',
          bulkJobIds: ['job-3'], // success — not orphaned
        },
      ];

      const orphans = mgr.getOrphanedBulkJobs(checkpoints);
      expect(orphans).toEqual(['job-1', 'job-2']);
    });

    it('should return empty array when no orphans', () => {
      const { sql } = createMockSql();
      const mgr = new CheckpointManager(sql as never, 'run-1');
      const checkpoints: CheckpointData[] = [
        { collectorName: 'discovery', status: 'success', criticality: 'tier0' },
      ];

      const orphans = mgr.getOrphanedBulkJobs(checkpoints);
      expect(orphans).toEqual([]);
    });
  });

  describe('write', () => {
    it('should call SQL with correct parameters', async () => {
      const { sql, calls } = createMockSql();
      const mgr = new CheckpointManager(sql as never, 'run-1');

      await mgr.write({
        collectorName: 'catalog',
        status: 'success',
        criticality: 'tier0',
        recordsExtracted: 150,
      });

      expect(calls).toHaveLength(1);
      const queryStr = calls[0].strings.join('');
      expect(queryStr).toContain('collector_checkpoints');
      expect(queryStr).toContain('ON CONFLICT');
    });
  });
});
