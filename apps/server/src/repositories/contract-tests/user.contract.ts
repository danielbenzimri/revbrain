import { describe, it, expect, beforeEach } from 'vitest';
import type { Repositories } from '@revbrain/contract';

export function userContractTests(
  getRepos: () => Repositories,
  resetData: () => void,
  seedOrgId: string
) {
  describe('UserRepository contract', () => {
    beforeEach(() => resetData());

    it('create → findById round-trip', async () => {
      const repos = getRepos();
      const created = await repos.users.create({
        email: 'contract@test.com',
        fullName: 'Contract User',
        role: 'operator',
        organizationId: seedOrgId,
        supabaseUserId: 'sup-contract-test',
      });
      const found = await repos.users.findById(created.id);
      expect(found).not.toBeNull();
      expect(found!.email).toBe('contract@test.com');
    });

    it('findByEmail returns correct user or null', async () => {
      const repos = getRepos();
      const found = await repos.users.findByEmail('nonexistent@test.com');
      expect(found).toBeNull();

      await repos.users.create({
        email: 'findme@test.com',
        fullName: 'Find Me',
        role: 'reviewer',
        organizationId: seedOrgId,
        supabaseUserId: 'sup-findme',
      });
      const foundNow = await repos.users.findByEmail('findme@test.com');
      expect(foundNow).not.toBeNull();
      expect(foundNow!.fullName).toBe('Find Me');
    });

    it('findByOrganization scopes to org', async () => {
      const repos = getRepos();
      const users = await repos.users.findByOrganization(seedOrgId);
      expect(users.every((u) => u.organizationId === seedOrgId)).toBe(true);
    });

    it('update returns updated entity', async () => {
      const repos = getRepos();
      const created = await repos.users.create({
        email: 'update@test.com',
        fullName: 'Before',
        role: 'operator',
        organizationId: seedOrgId,
        supabaseUserId: 'sup-update',
      });
      const updated = await repos.users.update(created.id, { fullName: 'After' });
      expect(updated!.fullName).toBe('After');
    });

    it('delete → findById returns null', async () => {
      const repos = getRepos();
      const created = await repos.users.create({
        email: 'delete@test.com',
        fullName: 'To Delete',
        role: 'operator',
        organizationId: seedOrgId,
        supabaseUserId: 'sup-delete',
      });
      await repos.users.delete(created.id);
      expect(await repos.users.findById(created.id)).toBeNull();
    });
  });
}
