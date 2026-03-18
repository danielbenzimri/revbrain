import { describe, it, expect } from 'vitest';
import { getRoleGroup, ROLE_DISPLAY_NAMES, ROLE_DESCRIPTIONS, ROLES_IN_DEVELOPMENT } from './auth';
import type { UserRole, ContractorRole, ClientRole } from './auth';

describe('getRoleGroup', () => {
  const contractorRoles: ContractorRole[] = [
    'contractor_ceo',
    'contractor_pm',
    'execution_engineer',
    'quantity_surveyor',
    'quality_controller',
  ];

  const clientRoles: ClientRole[] = [
    'client_owner',
    'client_pm',
    'inspector',
    'quality_assurance',
    'accounts_controller',
  ];

  it.each(contractorRoles)('should return "contractor" for %s', (role) => {
    expect(getRoleGroup(role)).toBe('contractor');
  });

  it.each(clientRoles)('should return "client" for %s', (role) => {
    expect(getRoleGroup(role)).toBe('client');
  });

  it('should return null for system_admin', () => {
    expect(getRoleGroup('system_admin')).toBeNull();
  });
});

describe('ROLE_DISPLAY_NAMES', () => {
  const allRoles: UserRole[] = [
    'system_admin',
    'contractor_ceo',
    'contractor_pm',
    'execution_engineer',
    'quantity_surveyor',
    'quality_controller',
    'client_owner',
    'client_pm',
    'inspector',
    'quality_assurance',
    'accounts_controller',
  ];

  it('should have a display name for every role', () => {
    allRoles.forEach((role) => {
      expect(ROLE_DISPLAY_NAMES[role]).toBeDefined();
      expect(ROLE_DISPLAY_NAMES[role].he).toBeTruthy();
      expect(ROLE_DISPLAY_NAMES[role].en).toBeTruthy();
    });
  });

  it('should have display names in Hebrew and English', () => {
    // Spot check a few
    expect(ROLE_DISPLAY_NAMES.system_admin.en).toBe('System Admin');
    expect(ROLE_DISPLAY_NAMES.contractor_pm.en).toBe('Project Manager (Contractor)');
    expect(ROLE_DISPLAY_NAMES.inspector.en).toBe('Inspector');
  });
});

describe('ROLE_DESCRIPTIONS', () => {
  it('should have a description for every role', () => {
    const allRoles = Object.keys(ROLE_DISPLAY_NAMES) as UserRole[];
    allRoles.forEach((role) => {
      expect(ROLE_DESCRIPTIONS[role]).toBeDefined();
      expect(ROLE_DESCRIPTIONS[role].he).toBeTruthy();
      expect(ROLE_DESCRIPTIONS[role].en).toBeTruthy();
    });
  });
});

describe('ROLES_IN_DEVELOPMENT', () => {
  it('should be an array of valid roles', () => {
    const allRoles = Object.keys(ROLE_DISPLAY_NAMES) as UserRole[];
    ROLES_IN_DEVELOPMENT.forEach((role) => {
      expect(allRoles).toContain(role);
    });
  });

  it('should include quality_controller, quality_assurance, accounts_controller', () => {
    expect(ROLES_IN_DEVELOPMENT).toContain('quality_controller');
    expect(ROLES_IN_DEVELOPMENT).toContain('quality_assurance');
    expect(ROLES_IN_DEVELOPMENT).toContain('accounts_controller');
  });
});
