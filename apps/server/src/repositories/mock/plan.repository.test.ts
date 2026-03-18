import { describe, it, expect, beforeEach } from 'vitest';
import { MockPlanRepository } from './plan.repository.ts';
import { resetAllMockData, MOCK_IDS } from '../../mocks/index.ts';

describe('MockPlanRepository', () => {
  let repo: MockPlanRepository;

  beforeEach(() => {
    resetAllMockData();
    repo = new MockPlanRepository();
  });

  describe('findById', () => {
    it('returns plan for existing ID', async () => {
      const plan = await repo.findById(MOCK_IDS.PLAN_PRO);
      expect(plan).not.toBeNull();
      expect(plan!.name).toBe('Pro');
    });

    it('returns null for nonexistent ID', async () => {
      expect(await repo.findById('nonexistent')).toBeNull();
    });
  });

  describe('findMany', () => {
    it('returns all plans', async () => {
      const plans = await repo.findMany();
      expect(plans.length).toBe(3);
    });

    it('respects limit', async () => {
      const plans = await repo.findMany({ limit: 1 });
      expect(plans.length).toBe(1);
    });

    it('respects offset', async () => {
      const plans = await repo.findMany({ offset: 2 });
      expect(plans.length).toBe(1);
    });

    it('throws for unsupported filter', async () => {
      await expect(repo.findMany({ filter: { unknown: 'x' } })).rejects.toThrow(
        '[MOCK Plans] Unsupported filter'
      );
    });
  });

  describe('create', () => {
    it('creates a plan with generated ID', async () => {
      const plan = await repo.create({ name: 'Test Plan' });
      expect(plan.id).toBeDefined();
      expect(plan.name).toBe('Test Plan');
      expect(plan.createdAt).toBeInstanceOf(Date);
    });

    it('auto-generates code from name', async () => {
      const plan = await repo.create({ name: 'My Custom Plan' });
      expect(plan.code).toBe('my-custom-plan');
    });
  });

  describe('update', () => {
    it('updates an existing plan', async () => {
      const updated = await repo.update(MOCK_IDS.PLAN_STARTER, { name: 'Updated' });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('Updated');
    });

    it('returns null for nonexistent ID', async () => {
      expect(await repo.update('nonexistent', { name: 'x' })).toBeNull();
    });
  });

  describe('delete', () => {
    it('deletes an existing plan', async () => {
      expect(await repo.delete(MOCK_IDS.PLAN_STARTER)).toBe(true);
      expect(await repo.findById(MOCK_IDS.PLAN_STARTER)).toBeNull();
    });

    it('returns false for nonexistent ID', async () => {
      expect(await repo.delete('nonexistent')).toBe(false);
    });
  });

  describe('count', () => {
    it('returns total count', async () => {
      expect(await repo.count()).toBe(3);
    });
  });

  describe('findByCode', () => {
    it('returns plan by code', async () => {
      const plan = await repo.findByCode('pro');
      expect(plan).not.toBeNull();
      expect(plan!.name).toBe('Pro');
    });

    it('returns null for nonexistent code', async () => {
      expect(await repo.findByCode('nonexistent')).toBeNull();
    });
  });

  describe('findByName', () => {
    it('returns plan by name', async () => {
      const plan = await repo.findByName('Enterprise');
      expect(plan).not.toBeNull();
      expect(plan!.code).toBe('enterprise');
    });
  });

  describe('findActive', () => {
    it('returns only active plans', async () => {
      const plans = await repo.findActive();
      expect(plans.every((p) => p.isActive)).toBe(true);
    });
  });

  describe('findPublic', () => {
    it('returns only active + public plans', async () => {
      const plans = await repo.findPublic();
      expect(plans.every((p) => p.isActive && p.isPublic)).toBe(true);
      // Enterprise is not public
      expect(plans.find((p) => p.code === 'enterprise')).toBeUndefined();
    });

    it('respects limit', async () => {
      const plans = await repo.findPublic({ limit: 1 });
      expect(plans.length).toBe(1);
    });
  });
});
