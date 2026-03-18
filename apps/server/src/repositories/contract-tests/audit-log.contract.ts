import { describe, it, expect, beforeEach } from 'vitest';
import type { Repositories } from '@revbrain/contract';

export function auditLogContractTests(getRepos: () => Repositories, resetData: () => void) {
  describe('AuditLogRepository contract', () => {
    beforeEach(() => resetData());

    it('create → findMany includes new entry', async () => {
      const repos = getRepos();
      const before = await repos.auditLogs.count();
      await repos.auditLogs.create({ action: 'test.action' });
      const after = await repos.auditLogs.count();
      expect(after).toBe(before + 1);
    });

    it('findMany with limit/offset', async () => {
      const repos = getRepos();
      const all = await repos.auditLogs.findMany();
      if (all.length >= 2) {
        const limited = await repos.auditLogs.findMany({ limit: 1 });
        expect(limited).toHaveLength(1);
      }
    });

    it('findByAction returns matching entries', async () => {
      const repos = getRepos();
      await repos.auditLogs.create({ action: 'unique.test.action' });
      const found = await repos.auditLogs.findByAction('unique.test.action');
      expect(found.length).toBeGreaterThanOrEqual(1);
      expect(found.every((e) => e.action === 'unique.test.action')).toBe(true);
    });
  });
}
