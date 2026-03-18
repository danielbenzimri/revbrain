import { describe, it, expect, beforeEach } from 'vitest';
import { MockAuditLogRepository } from './audit-log.repository.ts';
import { resetAllMockData, MOCK_IDS } from '../../mocks/index.ts';

describe('MockAuditLogRepository', () => {
  let repo: MockAuditLogRepository;

  beforeEach(() => {
    resetAllMockData();
    repo = new MockAuditLogRepository();
  });

  describe('create', () => {
    it('creates an audit log entry', async () => {
      const entry = await repo.create({
        userId: MOCK_IDS.USER_ACME_OWNER,
        organizationId: MOCK_IDS.ORG_ACME,
        action: 'test.action',
      });
      expect(entry.id).toBeDefined();
      expect(entry.action).toBe('test.action');
      expect(entry.createdAt).toBeInstanceOf(Date);
    });

    it('handles optional fields', async () => {
      const entry = await repo.create({ action: 'minimal' });
      expect(entry.userId).toBeNull();
      expect(entry.organizationId).toBeNull();
      expect(entry.targetUserId).toBeNull();
    });
  });

  describe('findMany', () => {
    it('returns all entries', async () => {
      const entries = await repo.findMany();
      expect(entries.length).toBe(10);
    });

    it('respects limit/offset', async () => {
      const entries = await repo.findMany({ limit: 3, offset: 2 });
      expect(entries.length).toBe(3);
    });

    it('sorts by createdAt descending by default', async () => {
      const entries = await repo.findMany();
      for (let i = 1; i < entries.length; i++) {
        expect(entries[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(
          entries[i].createdAt.getTime()
        );
      }
    });

    it('throws for unsupported filter', async () => {
      await expect(repo.findMany({ filter: { badKey: 'x' } })).rejects.toThrow(
        '[MOCK AuditLogs] Unsupported filter'
      );
    });
  });

  describe('count', () => {
    it('returns total count', async () => {
      expect(await repo.count()).toBe(10);
    });
  });

  describe('findByOrganization', () => {
    it('returns entries for Acme org', async () => {
      const entries = await repo.findByOrganization(MOCK_IDS.ORG_ACME);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.every((e) => e.organizationId === MOCK_IDS.ORG_ACME)).toBe(true);
    });

    it('returns entries for Beta org', async () => {
      const entries = await repo.findByOrganization(MOCK_IDS.ORG_BETA);
      expect(entries.length).toBeGreaterThan(0);
    });

    it('returns empty for nonexistent org', async () => {
      expect(await repo.findByOrganization('nonexistent')).toHaveLength(0);
    });
  });

  describe('findByUser', () => {
    it('returns entries by user ID', async () => {
      const entries = await repo.findByUser(MOCK_IDS.USER_ACME_OWNER);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.every((e) => e.userId === MOCK_IDS.USER_ACME_OWNER)).toBe(true);
    });
  });

  describe('findByAction', () => {
    it('returns entries matching action', async () => {
      const entries = await repo.findByAction('user.invited');
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.every((e) => e.action === 'user.invited')).toBe(true);
    });

    it('returns empty for nonexistent action', async () => {
      expect(await repo.findByAction('nonexistent')).toHaveLength(0);
    });
  });

  describe('findByTargetUser', () => {
    it('returns entries targeting a specific user', async () => {
      const entries = await repo.findByTargetUser(MOCK_IDS.USER_ACME_ADMIN);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.every((e) => e.targetUserId === MOCK_IDS.USER_ACME_ADMIN)).toBe(true);
    });
  });
});
