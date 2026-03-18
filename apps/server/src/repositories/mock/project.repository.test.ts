import { describe, it, expect, beforeEach } from 'vitest';
import { MockProjectRepository } from './project.repository.ts';
import { resetAllMockData, MOCK_IDS } from '../../mocks/index.ts';

describe('MockProjectRepository', () => {
  let repo: MockProjectRepository;

  beforeEach(() => {
    resetAllMockData();
    repo = new MockProjectRepository();
  });

  describe('findById', () => {
    it('returns project for existing ID', async () => {
      const project = await repo.findById(MOCK_IDS.PROJECT_Q1_MIGRATION);
      expect(project).not.toBeNull();
      expect(project!.status).toBe('active');
    });

    it('returns null for nonexistent ID', async () => {
      expect(await repo.findById('nonexistent')).toBeNull();
    });
  });

  describe('findMany', () => {
    it('returns all projects', async () => {
      const projects = await repo.findMany();
      expect(projects.length).toBe(4);
    });

    it('respects limit/offset', async () => {
      const projects = await repo.findMany({ limit: 2, offset: 1 });
      expect(projects.length).toBe(2);
    });

    it('sorts by createdAt descending by default', async () => {
      const projects = await repo.findMany();
      for (let i = 1; i < projects.length; i++) {
        expect(projects[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(
          projects[i].createdAt.getTime()
        );
      }
    });

    it('throws for unsupported filter', async () => {
      await expect(repo.findMany({ filter: { badKey: 'x' } })).rejects.toThrow(
        '[MOCK Projects] Unsupported filter'
      );
    });
  });

  describe('create', () => {
    it('creates a project with generated ID', async () => {
      const project = await repo.create({
        name: 'New Project',
        organizationId: MOCK_IDS.ORG_ACME,
        ownerId: MOCK_IDS.USER_ACME_OWNER,
      });
      expect(project.id).toBeDefined();
      expect(project.name).toBe('New Project');
      expect(project.status).toBe('active');
      expect(project.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('update', () => {
    it('updates existing project', async () => {
      const updated = await repo.update(MOCK_IDS.PROJECT_PHASE2, {
        name: 'Updated Phase 2',
      });
      expect(updated!.name).toBe('Updated Phase 2');
      expect(updated!.updatedAt).toBeInstanceOf(Date);
    });

    it('sets completedAt when status changes to completed', async () => {
      const updated = await repo.update(MOCK_IDS.PROJECT_Q1_MIGRATION, {
        status: 'completed',
      });
      expect(updated!.completedAt).toBeInstanceOf(Date);
    });

    it('sets cancelledAt when status changes to cancelled', async () => {
      const updated = await repo.update(MOCK_IDS.PROJECT_Q1_MIGRATION, {
        status: 'cancelled',
      });
      expect(updated!.cancelledAt).toBeInstanceOf(Date);
    });

    it('returns null for nonexistent ID', async () => {
      expect(await repo.update('nonexistent', { name: 'x' })).toBeNull();
    });
  });

  describe('delete', () => {
    it('deletes existing project', async () => {
      expect(await repo.delete(MOCK_IDS.PROJECT_PHASE2)).toBe(true);
      expect(await repo.findById(MOCK_IDS.PROJECT_PHASE2)).toBeNull();
    });

    it('returns false for nonexistent ID', async () => {
      expect(await repo.delete('nonexistent')).toBe(false);
    });
  });

  describe('count', () => {
    it('returns total count', async () => {
      expect(await repo.count()).toBe(4);
    });
  });

  describe('findByOwner', () => {
    it('returns projects owned by Acme owner', async () => {
      const projects = await repo.findByOwner(MOCK_IDS.USER_ACME_OWNER);
      expect(projects.length).toBeGreaterThan(0);
      expect(projects.every((p) => p.ownerId === MOCK_IDS.USER_ACME_OWNER)).toBe(true);
    });

    it('returns projects owned by operator', async () => {
      const projects = await repo.findByOwner(MOCK_IDS.USER_ACME_OPERATOR);
      expect(projects.length).toBeGreaterThanOrEqual(1);
    });

    it('returns empty for user with no projects', async () => {
      expect(await repo.findByOwner(MOCK_IDS.USER_ACME_REVIEWER)).toHaveLength(0);
    });
  });

  describe('findByOrganization', () => {
    it('returns only Acme projects', async () => {
      const projects = await repo.findByOrganization(MOCK_IDS.ORG_ACME);
      expect(projects.length).toBe(4);
      expect(projects.every((p) => p.organizationId === MOCK_IDS.ORG_ACME)).toBe(true);
    });

    it('returns zero for Beta (tenant isolation)', async () => {
      expect(await repo.findByOrganization(MOCK_IDS.ORG_BETA)).toHaveLength(0);
    });

    it('returns empty for nonexistent org', async () => {
      expect(await repo.findByOrganization('nonexistent')).toHaveLength(0);
    });
  });

  describe('countByOrganization', () => {
    it('returns 4 for Acme', async () => {
      expect(await repo.countByOrganization(MOCK_IDS.ORG_ACME)).toBe(4);
    });

    it('returns 0 for Beta', async () => {
      expect(await repo.countByOrganization(MOCK_IDS.ORG_BETA)).toBe(0);
    });
  });
});
