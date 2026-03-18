import { describe, it, expect, beforeEach } from 'vitest';
import type { Repositories } from '@revbrain/contract';

export function projectContractTests(
  getRepos: () => Repositories,
  resetData: () => void,
  seedOrgId: string,
  seedOwnerId: string
) {
  describe('ProjectRepository contract', () => {
    beforeEach(() => resetData());

    it('create → findById round-trip', async () => {
      const repos = getRepos();
      const created = await repos.projects.create({
        name: 'Contract Test Project',
        organizationId: seedOrgId,
        ownerId: seedOwnerId,
      });
      expect(created.id).toBeDefined();
      const found = await repos.projects.findById(created.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Contract Test Project');
    });

    it('findByOrganization respects org scoping', async () => {
      const repos = getRepos();
      const projects = await repos.projects.findByOrganization(seedOrgId);
      expect(projects.every((p) => p.organizationId === seedOrgId)).toBe(true);
    });

    it('findMany with limit/offset', async () => {
      const repos = getRepos();
      const all = await repos.projects.findMany();
      if (all.length >= 2) {
        const limited = await repos.projects.findMany({ limit: 1 });
        expect(limited).toHaveLength(1);
        const offset = await repos.projects.findMany({ offset: 1 });
        expect(offset.length).toBe(all.length - 1);
      }
    });

    it('update returns updated entity', async () => {
      const repos = getRepos();
      const created = await repos.projects.create({
        name: 'Before Update',
        organizationId: seedOrgId,
        ownerId: seedOwnerId,
      });
      const updated = await repos.projects.update(created.id, { name: 'After Update' });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('After Update');
    });

    it('delete → findById returns null', async () => {
      const repos = getRepos();
      const created = await repos.projects.create({
        name: 'To Delete',
        organizationId: seedOrgId,
        ownerId: seedOwnerId,
      });
      await repos.projects.delete(created.id);
      const found = await repos.projects.findById(created.id);
      expect(found).toBeNull();
    });

    it('countByOrganization returns correct count', async () => {
      const repos = getRepos();
      const count = await repos.projects.countByOrganization(seedOrgId);
      const projects = await repos.projects.findByOrganization(seedOrgId);
      expect(count).toBe(projects.length);
    });
  });
}
