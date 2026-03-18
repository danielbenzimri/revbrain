import { describe, it, expect, beforeEach } from 'vitest';
import type { Repositories } from '@revbrain/contract';

export function organizationContractTests(getRepos: () => Repositories, resetData: () => void) {
  describe('OrganizationRepository contract', () => {
    beforeEach(() => resetData());

    it('create → findById round-trip', async () => {
      const repos = getRepos();
      const created = await repos.organizations.create({
        name: 'Contract Org',
        slug: 'contract-org',
      });
      const found = await repos.organizations.findById(created.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Contract Org');
    });

    it('findMany with limit/offset', async () => {
      const repos = getRepos();
      const all = await repos.organizations.findMany();
      if (all.length >= 2) {
        const limited = await repos.organizations.findMany({ limit: 1 });
        expect(limited).toHaveLength(1);
      }
    });

    it('update returns updated entity', async () => {
      const repos = getRepos();
      const created = await repos.organizations.create({ name: 'Before', slug: 'before' });
      const updated = await repos.organizations.update(created.id, { name: 'After' });
      expect(updated!.name).toBe('After');
    });

    it('delete → findById returns null', async () => {
      const repos = getRepos();
      const created = await repos.organizations.create({ name: 'To Delete', slug: 'to-delete' });
      await repos.organizations.delete(created.id);
      expect(await repos.organizations.findById(created.id)).toBeNull();
    });

    it('findWithPlan returns org with plan data joined', async () => {
      const repos = getRepos();
      const orgs = await repos.organizations.findMany();
      if (orgs.length > 0 && orgs[0].planId) {
        const withPlan = await repos.organizations.findWithPlan(orgs[0].id);
        expect(withPlan).not.toBeNull();
        expect(withPlan!.plan).not.toBeNull();
      }
    });
  });
}
