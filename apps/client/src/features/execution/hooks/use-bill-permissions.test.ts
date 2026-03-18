/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBillPermissions } from './use-bill-permissions';
import * as authStore from '@/stores/auth-store';

// Mock the auth store
vi.mock('@/stores/auth-store', () => ({
  useUser: vi.fn(),
}));

describe('useBillPermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when user is not logged in', () => {
    it('should return no permissions', () => {
      vi.mocked(authStore.useUser).mockReturnValue(null);

      const { result } = renderHook(() => useBillPermissions('draft'));

      expect(result.current.isContractor).toBe(false);
      expect(result.current.isInspector).toBe(false);
      expect(result.current.canCreate).toBe(false);
      expect(result.current.canEdit).toBe(false);
      expect(result.current.canSubmit).toBe(false);
      expect(result.current.canApprove).toBe(false);
    });
  });

  describe('when user is an operator role (org_owner/admin/operator)', () => {
    beforeEach(() => {
      vi.mocked(authStore.useUser).mockReturnValue({
        id: 'user-1',
        role: 'admin',
        email: 'admin@test.com',
      } as ReturnType<typeof authStore.useUser>);
    });

    it('should identify as contractor', () => {
      const { result } = renderHook(() => useBillPermissions('draft'));
      expect(result.current.isContractor).toBe(true);
      expect(result.current.isInspector).toBe(false);
    });

    describe('with draft bill', () => {
      it('should allow create, edit, delete, and submit', () => {
        const { result } = renderHook(() => useBillPermissions('draft'));

        expect(result.current.canCreate).toBe(true);
        expect(result.current.canEdit).toBe(true);
        expect(result.current.canDelete).toBe(true);
        expect(result.current.canSubmit).toBe(true);
        expect(result.current.canAddItems).toBe(true);
        expect(result.current.canEditItems).toBe(true);
        expect(result.current.canDeleteItems).toBe(true);
        expect(result.current.canExport).toBe(true);
      });

      it('should not allow inspector actions', () => {
        const { result } = renderHook(() => useBillPermissions('draft'));

        expect(result.current.canStartReview).toBe(false);
        expect(result.current.canApprove).toBe(false);
        expect(result.current.canReject).toBe(false);
      });
    });

    describe('with submitted bill', () => {
      it('should not allow edit actions', () => {
        const { result } = renderHook(() => useBillPermissions('submitted'));

        expect(result.current.canEdit).toBe(false);
        expect(result.current.canDelete).toBe(false);
        expect(result.current.canSubmit).toBe(false);
        expect(result.current.canAddItems).toBe(false);
        expect(result.current.canReopen).toBe(false);
      });

      it('should still allow export', () => {
        const { result } = renderHook(() => useBillPermissions('submitted'));
        expect(result.current.canExport).toBe(true);
      });
    });

    describe('with rejected bill', () => {
      it('should allow reopen', () => {
        const { result } = renderHook(() => useBillPermissions('rejected'));
        expect(result.current.canReopen).toBe(true);
      });

      it('should not allow edit until reopened', () => {
        const { result } = renderHook(() => useBillPermissions('rejected'));
        expect(result.current.canEdit).toBe(false);
        expect(result.current.canSubmit).toBe(false);
      });
    });
  });

  describe('when user is a reviewer', () => {
    beforeEach(() => {
      vi.mocked(authStore.useUser).mockReturnValue({
        id: 'user-2',
        role: 'reviewer',
        email: 'reviewer@test.com',
      } as ReturnType<typeof authStore.useUser>);
    });

    it('should identify as inspector', () => {
      const { result } = renderHook(() => useBillPermissions('submitted'));
      expect(result.current.isInspector).toBe(true);
      expect(result.current.isContractor).toBe(false);
    });

    describe('with submitted bill', () => {
      it('should allow start review', () => {
        const { result } = renderHook(() => useBillPermissions('submitted'));
        expect(result.current.canStartReview).toBe(true);
      });

      it('should not allow approve/reject yet', () => {
        const { result } = renderHook(() => useBillPermissions('submitted'));
        expect(result.current.canApprove).toBe(false);
        expect(result.current.canReject).toBe(false);
      });
    });

    describe('with under_review bill', () => {
      it('should allow approve and reject', () => {
        const { result } = renderHook(() => useBillPermissions('under_review'));
        expect(result.current.canApprove).toBe(true);
        expect(result.current.canReject).toBe(true);
      });

      it('should not allow start review anymore', () => {
        const { result } = renderHook(() => useBillPermissions('under_review'));
        expect(result.current.canStartReview).toBe(false);
      });
    });

    it('should never allow operator actions', () => {
      const { result } = renderHook(() => useBillPermissions('draft'));

      expect(result.current.canCreate).toBe(false);
      expect(result.current.canEdit).toBe(false);
      expect(result.current.canDelete).toBe(false);
      expect(result.current.canSubmit).toBe(false);
      expect(result.current.canAddItems).toBe(false);
      expect(result.current.canReopen).toBe(false);
    });

    it('should always allow export', () => {
      const { result } = renderHook(() => useBillPermissions('approved'));
      expect(result.current.canExport).toBe(true);
    });
  });

  describe('with unknown role', () => {
    it('should return no permissions', () => {
      vi.mocked(authStore.useUser).mockReturnValue({
        id: 'user-3',
        name: 'Unknown User',
        role: 'unknown_role',
        email: 'unknown@test.com',
      } as unknown as ReturnType<typeof authStore.useUser>);

      const { result } = renderHook(() => useBillPermissions('draft'));

      expect(result.current.isContractor).toBe(false);
      expect(result.current.isInspector).toBe(false);
      expect(result.current.canCreate).toBe(false);
      expect(result.current.canApprove).toBe(false);
    });
  });

  describe('with no status provided', () => {
    it('should still return role identification', () => {
      vi.mocked(authStore.useUser).mockReturnValue({
        id: 'user-1',
        role: 'admin',
        email: 'admin@test.com',
      } as ReturnType<typeof authStore.useUser>);

      const { result } = renderHook(() => useBillPermissions(undefined));

      expect(result.current.isContractor).toBe(true);
      expect(result.current.canCreate).toBe(true);
      // Status-dependent permissions should be false when no status
      expect(result.current.canEdit).toBe(false);
      expect(result.current.canSubmit).toBe(false);
    });
  });
});
