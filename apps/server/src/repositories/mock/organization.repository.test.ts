import { describe, it, expect, beforeEach } from 'vitest';
import { MockOrganizationRepository } from './organization.repository.ts';
import { resetAllMockData, MOCK_IDS } from '../../mocks/index.ts';

describe('MockOrganizationRepository', () => {
  let repo: MockOrganizationRepository;

  beforeEach(() => {
    resetAllMockData();
    repo = new MockOrganizationRepository();
  });

  describe('findById', () => {
    it('returns org for existing ID', async () => {
      const org = await repo.findById(MOCK_IDS.ORG_ACME);
      expect(org).not.toBeNull();
      expect(org!.name).toBe('Acme Corp');
    });

    it('returns null for nonexistent ID', async () => {
      expect(await repo.findById('nonexistent')).toBeNull();
    });
  });

  describe('findMany', () => {
    it('returns all orgs', async () => {
      const orgs = await repo.findMany();
      expect(orgs.length).toBe(2);
    });

    it('respects limit', async () => {
      const orgs = await repo.findMany({ limit: 1 });
      expect(orgs.length).toBe(1);
    });
  });

  describe('create', () => {
    it('creates an org with generated ID', async () => {
      const org = await repo.create({ name: 'New Org', slug: 'new-org' });
      expect(org.id).toBeDefined();
      expect(org.seatUsed).toBe(0);
      expect(org.isActive).toBe(true);
    });
  });

  describe('update', () => {
    it('updates existing org', async () => {
      const updated = await repo.update(MOCK_IDS.ORG_ACME, { name: 'Acme Updated' });
      expect(updated!.name).toBe('Acme Updated');
    });

    it('returns null for nonexistent ID', async () => {
      expect(await repo.update('nonexistent', { name: 'x' })).toBeNull();
    });
  });

  describe('delete', () => {
    it('deletes existing org', async () => {
      expect(await repo.delete(MOCK_IDS.ORG_BETA)).toBe(true);
      expect(await repo.findById(MOCK_IDS.ORG_BETA)).toBeNull();
    });

    it('returns false for nonexistent ID', async () => {
      expect(await repo.delete('nonexistent')).toBe(false);
    });
  });

  describe('count', () => {
    it('returns total count', async () => {
      expect(await repo.count()).toBe(2);
    });
  });

  describe('findBySlug', () => {
    it('returns org by slug', async () => {
      const org = await repo.findBySlug('acme-corp');
      expect(org).not.toBeNull();
      expect(org!.id).toBe(MOCK_IDS.ORG_ACME);
    });

    it('returns null for nonexistent slug', async () => {
      expect(await repo.findBySlug('nonexistent')).toBeNull();
    });
  });

  describe('findWithPlan', () => {
    it('returns org with plan joined', async () => {
      const result = await repo.findWithPlan(MOCK_IDS.ORG_ACME);
      expect(result).not.toBeNull();
      expect(result!.plan).not.toBeNull();
      expect(result!.plan!.name).toBe('Pro');
    });

    it('returns org with null plan if no planId', async () => {
      // Update Acme to have no plan
      await repo.update(MOCK_IDS.ORG_ACME, { planId: null });
      const result = await repo.findWithPlan(MOCK_IDS.ORG_ACME);
      expect(result!.plan).toBeNull();
    });

    it('returns null for nonexistent org', async () => {
      expect(await repo.findWithPlan('nonexistent')).toBeNull();
    });
  });

  describe('incrementSeatUsed', () => {
    it('increments seat count', async () => {
      const org = await repo.findById(MOCK_IDS.ORG_ACME);
      const before = org!.seatUsed;
      const updated = await repo.incrementSeatUsed(MOCK_IDS.ORG_ACME);
      expect(updated!.seatUsed).toBe(before + 1);
    });

    it('returns null for nonexistent org', async () => {
      expect(await repo.incrementSeatUsed('nonexistent')).toBeNull();
    });
  });

  describe('decrementSeatUsed', () => {
    it('decrements seat count', async () => {
      const org = await repo.findById(MOCK_IDS.ORG_ACME);
      const before = org!.seatUsed;
      const updated = await repo.decrementSeatUsed(MOCK_IDS.ORG_ACME);
      expect(updated!.seatUsed).toBe(before - 1);
    });

    it('does not go below 0', async () => {
      // Set to 0 first
      await repo.update(MOCK_IDS.ORG_BETA, { seatLimit: 5 });
      // Decrement many times
      for (let i = 0; i < 10; i++) {
        await repo.decrementSeatUsed(MOCK_IDS.ORG_BETA);
      }
      const org = await repo.findById(MOCK_IDS.ORG_BETA);
      expect(org!.seatUsed).toBe(0);
    });
  });

  describe('tryIncrementSeatUsed', () => {
    it('increments if within limit', async () => {
      const result = await repo.tryIncrementSeatUsed(MOCK_IDS.ORG_ACME);
      expect(result).not.toBeNull();
    });

    it('returns null if at limit', async () => {
      // Set Beta to exactly at limit
      await repo.update(MOCK_IDS.ORG_BETA, { seatLimit: 2 });
      const result = await repo.tryIncrementSeatUsed(MOCK_IDS.ORG_BETA);
      expect(result).toBeNull();
    });

    it('respects grace percentage', async () => {
      await repo.update(MOCK_IDS.ORG_BETA, { seatLimit: 2 });
      // With 50% grace, effective limit = 3, current = 2 → should succeed
      const result = await repo.tryIncrementSeatUsed(MOCK_IDS.ORG_BETA, 0.5);
      expect(result).not.toBeNull();
    });
  });

  describe('updateStorageUsed', () => {
    it('adds bytes to storage', async () => {
      const before = (await repo.findById(MOCK_IDS.ORG_ACME))!.storageUsedBytes;
      const newTotal = await repo.updateStorageUsed(MOCK_IDS.ORG_ACME, 1024);
      expect(newTotal).toBe(before + 1024);
    });

    it('subtracts bytes from storage', async () => {
      const before = (await repo.findById(MOCK_IDS.ORG_ACME))!.storageUsedBytes;
      const newTotal = await repo.updateStorageUsed(MOCK_IDS.ORG_ACME, -1024);
      expect(newTotal).toBe(before - 1024);
    });

    it('does not go below 0', async () => {
      const newTotal = await repo.updateStorageUsed(MOCK_IDS.ORG_ACME, -999999999999);
      expect(newTotal).toBe(0);
    });

    it('returns 0 for nonexistent org', async () => {
      expect(await repo.updateStorageUsed('nonexistent', 100)).toBe(0);
    });
  });
});
