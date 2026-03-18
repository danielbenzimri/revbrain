import { describe, it, expect, beforeEach } from 'vitest';
import type { Repositories } from '@revbrain/contract';

export function planContractTests(getRepos: () => Repositories, resetData: () => void) {
  describe('PlanRepository contract', () => {
    beforeEach(() => resetData());

    it('create → findById round-trip', async () => {
      const repos = getRepos();
      const created = await repos.plans.create({ name: 'Contract Test Plan' });
      const found = await repos.plans.findById(created.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Contract Test Plan');
    });

    it('findMany with limit/offset', async () => {
      const repos = getRepos();
      const all = await repos.plans.findMany();
      if (all.length >= 2) {
        const limited = await repos.plans.findMany({ limit: 1 });
        expect(limited).toHaveLength(1);
      }
    });

    it('update returns updated entity', async () => {
      const repos = getRepos();
      const created = await repos.plans.create({ name: 'Before' });
      const updated = await repos.plans.update(created.id, { name: 'After' });
      expect(updated!.name).toBe('After');
    });

    it('delete → findById returns null', async () => {
      const repos = getRepos();
      const created = await repos.plans.create({ name: 'To Delete' });
      await repos.plans.delete(created.id);
      expect(await repos.plans.findById(created.id)).toBeNull();
    });

    it('findPublic returns only active + public plans', async () => {
      const repos = getRepos();
      const publicPlans = await repos.plans.findPublic();
      expect(publicPlans.every((p) => p.isActive && p.isPublic)).toBe(true);
    });
  });
}
