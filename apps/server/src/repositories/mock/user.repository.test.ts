import { describe, it, expect, beforeEach } from 'vitest';
import { MockUserRepository } from './user.repository.ts';
import { resetAllMockData, MOCK_IDS } from '../../mocks/index.ts';

describe('MockUserRepository', () => {
  let repo: MockUserRepository;

  beforeEach(() => {
    resetAllMockData();
    repo = new MockUserRepository();
  });

  describe('findById', () => {
    it('returns user for existing ID', async () => {
      const user = await repo.findById(MOCK_IDS.USER_ACME_OWNER);
      expect(user).not.toBeNull();
      expect(user!.email).toBe('david@acme.com');
    });

    it('returns null for nonexistent ID', async () => {
      expect(await repo.findById('nonexistent')).toBeNull();
    });
  });

  describe('findMany', () => {
    it('returns all users', async () => {
      const users = await repo.findMany();
      expect(users.length).toBe(8);
    });

    it('respects limit/offset', async () => {
      const users = await repo.findMany({ limit: 2, offset: 1 });
      expect(users.length).toBe(2);
    });

    it('throws for unsupported filter', async () => {
      await expect(repo.findMany({ filter: { badKey: 'x' } })).rejects.toThrow(
        '[MOCK Users] Unsupported filter'
      );
    });
  });

  describe('create', () => {
    it('creates a user with generated ID', async () => {
      const user = await repo.create({
        email: 'new@test.com',
        fullName: 'New User',
        role: 'operator',
        organizationId: MOCK_IDS.ORG_ACME,
        supabaseUserId: 'sup-123',
      });
      expect(user.id).toBeDefined();
      expect(user.email).toBe('new@test.com');
      expect(user.isActive).toBe(false); // Not activated by default
    });
  });

  describe('update', () => {
    it('updates existing user', async () => {
      const updated = await repo.update(MOCK_IDS.USER_ACME_ADMIN, {
        fullName: 'Updated Name',
      });
      expect(updated!.fullName).toBe('Updated Name');
    });

    it('returns null for nonexistent ID', async () => {
      expect(await repo.update('nonexistent', { fullName: 'x' })).toBeNull();
    });
  });

  describe('delete', () => {
    it('deletes existing user', async () => {
      expect(await repo.delete(MOCK_IDS.USER_ACME_PENDING)).toBe(true);
      expect(await repo.findById(MOCK_IDS.USER_ACME_PENDING)).toBeNull();
    });

    it('returns false for nonexistent ID', async () => {
      expect(await repo.delete('nonexistent')).toBe(false);
    });
  });

  describe('count', () => {
    it('returns total count', async () => {
      expect(await repo.count()).toBe(8);
    });
  });

  describe('findByEmail', () => {
    it('returns user by email', async () => {
      const user = await repo.findByEmail('sarah@acme.com');
      expect(user).not.toBeNull();
      expect(user!.role).toBe('admin');
    });

    it('returns null for nonexistent email', async () => {
      expect(await repo.findByEmail('nobody@example.com')).toBeNull();
    });
  });

  describe('findBySupabaseId', () => {
    it('returns user by supabase ID', async () => {
      const user = await repo.findBySupabaseId(MOCK_IDS.USER_ACME_OPERATOR);
      expect(user).not.toBeNull();
      expect(user!.role).toBe('operator');
    });
  });

  describe('findByOrganization', () => {
    it('returns only users from Acme org', async () => {
      const users = await repo.findByOrganization(MOCK_IDS.ORG_ACME);
      expect(users.length).toBe(6); // owner + admin + operator + reviewer + pending + system_admin
      expect(users.every((u) => u.organizationId === MOCK_IDS.ORG_ACME)).toBe(true);
    });

    it('returns only users from Beta org', async () => {
      const users = await repo.findByOrganization(MOCK_IDS.ORG_BETA);
      expect(users.length).toBe(2);
    });

    it('returns empty for nonexistent org', async () => {
      expect(await repo.findByOrganization('nonexistent')).toHaveLength(0);
    });
  });

  describe('activate', () => {
    it('activates a user', async () => {
      const activated = await repo.activate(MOCK_IDS.USER_ACME_PENDING);
      expect(activated!.isActive).toBe(true);
      expect(activated!.activatedAt).toBeInstanceOf(Date);
    });

    it('returns null for nonexistent ID', async () => {
      expect(await repo.activate('nonexistent')).toBeNull();
    });
  });

  describe('deactivate', () => {
    it('deactivates a user', async () => {
      const deactivated = await repo.deactivate(MOCK_IDS.USER_ACME_ADMIN);
      expect(deactivated!.isActive).toBe(false);
    });
  });

  describe('updateLastLogin', () => {
    it('updates last login timestamp', async () => {
      await repo.updateLastLogin(MOCK_IDS.USER_ACME_OWNER);
      const user = await repo.findById(MOCK_IDS.USER_ACME_OWNER);
      expect(user!.lastLoginAt).toBeInstanceOf(Date);
    });

    it('does nothing for nonexistent user', async () => {
      await expect(repo.updateLastLogin('nonexistent')).resolves.toBeUndefined();
    });
  });
});
