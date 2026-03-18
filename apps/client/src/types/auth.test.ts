import { describe, it, expect } from 'vitest';
import { ROLE_DISPLAY_NAMES, ROLE_DESCRIPTIONS } from './auth';
import type { UserRole } from './auth';

describe('ROLE_DISPLAY_NAMES', () => {
  const allRoles: UserRole[] = ['system_admin', 'org_owner', 'admin', 'operator', 'reviewer'];

  it('should have a display name for every role', () => {
    allRoles.forEach((role) => {
      expect(ROLE_DISPLAY_NAMES[role]).toBeDefined();
      expect(ROLE_DISPLAY_NAMES[role].he).toBeTruthy();
      expect(ROLE_DISPLAY_NAMES[role].en).toBeTruthy();
    });
  });

  it('should have display names in Hebrew and English', () => {
    expect(ROLE_DISPLAY_NAMES.system_admin.en).toBe('System Admin');
    expect(ROLE_DISPLAY_NAMES.org_owner.en).toBe('Organization Owner');
    expect(ROLE_DISPLAY_NAMES.admin.en).toBe('Admin');
    expect(ROLE_DISPLAY_NAMES.operator.en).toBe('Operator');
    expect(ROLE_DISPLAY_NAMES.reviewer.en).toBe('Reviewer');
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
