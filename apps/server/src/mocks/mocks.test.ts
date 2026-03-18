import { describe, it, expect, beforeEach } from 'vitest';
import {
  MOCK_IDS,
  SEED_PLANS,
  SEED_ORGANIZATIONS,
  SEED_USERS,
  SEED_PROJECTS,
  SEED_AUDIT_LOGS,
  mockPlans,
  mockUsers,
  mockOrganizations,
  mockProjects,
  mockAuditLogs,
  resetAllMockData,
} from './index.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('MOCK_IDS', () => {
  it('all values are valid UUIDs', () => {
    for (const [key, value] of Object.entries(MOCK_IDS)) {
      expect(value, `MOCK_IDS.${key}`).toMatch(UUID_REGEX);
    }
  });

  it('all values are unique', () => {
    const values = Object.values(MOCK_IDS);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('Seed data arrays', () => {
  it('plans are non-empty', () => {
    expect(SEED_PLANS.length).toBe(3);
  });

  it('organizations are non-empty', () => {
    expect(SEED_ORGANIZATIONS.length).toBe(2);
  });

  it('users are non-empty', () => {
    expect(SEED_USERS.length).toBe(8);
  });

  it('projects are non-empty', () => {
    expect(SEED_PROJECTS.length).toBe(4);
  });

  it('audit logs are non-empty', () => {
    expect(SEED_AUDIT_LOGS.length).toBe(10);
  });
});

describe('Cross-reference integrity', () => {
  const orgIds = new Set(SEED_ORGANIZATIONS.map((o) => o.id));
  const userIds = new Set(SEED_USERS.map((u) => u.id));
  const planIds = new Set(SEED_PLANS.map((p) => p.id));

  it('all users reference valid organizations', () => {
    for (const user of SEED_USERS) {
      expect(
        orgIds.has(user.organizationId),
        `user ${user.email} → org ${user.organizationId}`
      ).toBe(true);
    }
  });

  it('all projects reference valid organizations', () => {
    for (const project of SEED_PROJECTS) {
      expect(orgIds.has(project.organizationId), `project ${project.name} → org`).toBe(true);
    }
  });

  it('all projects reference valid owners', () => {
    for (const project of SEED_PROJECTS) {
      expect(
        userIds.has(project.ownerId),
        `project ${project.name} → owner ${project.ownerId}`
      ).toBe(true);
    }
  });

  it('all organizations reference valid plans', () => {
    for (const org of SEED_ORGANIZATIONS) {
      if (org.planId) {
        expect(planIds.has(org.planId), `org ${org.name} → plan ${org.planId}`).toBe(true);
      }
    }
  });

  it('at least one project is owned by the operator user', () => {
    const operatorProjects = SEED_PROJECTS.filter((p) => p.ownerId === MOCK_IDS.USER_ACME_OPERATOR);
    expect(operatorProjects.length).toBeGreaterThanOrEqual(1);
  });

  it('Beta org has zero projects', () => {
    const betaProjects = SEED_PROJECTS.filter((p) => p.organizationId === MOCK_IDS.ORG_BETA);
    expect(betaProjects.length).toBe(0);
  });

  it('at least one user is inactive (pending)', () => {
    const pending = SEED_USERS.filter((u) => !u.isActive);
    expect(pending.length).toBeGreaterThanOrEqual(1);
    expect(pending[0].activatedAt).toBeNull();
  });
});

describe('resetAllMockData', () => {
  beforeEach(() => {
    resetAllMockData();
  });

  it('restores state after mutation', async () => {
    // Mutate
    mockPlans.push({
      ...SEED_PLANS[0],
      id: 'mutated-plan',
      name: 'Mutated',
    });
    expect(mockPlans.length).toBe(SEED_PLANS.length + 1);

    // Reset
    resetAllMockData();

    // Re-import to get fresh module-level reference
    const mod = await import('./index.ts');
    expect(mod.mockPlans.length).toBe(SEED_PLANS.length);
  });

  it('deep clone prevents seed mutation', () => {
    // Mutate a mutable store entity
    if (mockUsers[0]) {
      mockUsers[0].fullName = 'MUTATED';
    }

    // Seed should be unaffected
    expect(SEED_USERS[0].fullName).not.toBe('MUTATED');
  });

  it('mutable stores match seed counts after reset', () => {
    resetAllMockData();
    expect(mockPlans.length).toBe(SEED_PLANS.length);
    expect(mockOrganizations.length).toBe(SEED_ORGANIZATIONS.length);
    expect(mockUsers.length).toBe(SEED_USERS.length);
    expect(mockProjects.length).toBe(SEED_PROJECTS.length);
    expect(mockAuditLogs.length).toBe(SEED_AUDIT_LOGS.length);
  });
});
