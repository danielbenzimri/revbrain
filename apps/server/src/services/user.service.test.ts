/**
 * Unit tests for UserService
 *
 * Tests user management: invite, delete, profile updates, password changes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserService } from './user.service.ts';
import type { Repositories, UserEntity, EmailPort } from '@geometrix/contract';
import type { AuthService } from './auth.service.ts';
import type { RequestContext } from './types.ts';

// Mock dependencies
vi.mock('../lib/logger.ts', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../lib/env.ts', () => ({
  getEnv: vi.fn((key: string) => {
    const envs: Record<string, string> = {
      FRONTEND_URL: 'http://localhost:5173',
      APP_URL: 'https://geometrix.io',
    };
    return envs[key];
  }),
}));

vi.mock('../emails/index.ts', () => ({
  renderWelcomeEmail: vi.fn(() => '<html>Welcome!</html>'),
}));

// Mock transaction wrapper
vi.mock('../repositories/drizzle/index.ts', () => ({
  withTransaction: vi.fn(async (callback: (repos: Repositories) => Promise<unknown>) => {
    // Create mock repos for transaction
    const txRepos = {
      users: {
        create: vi.fn().mockResolvedValue({
          id: 'new-user-id',
          email: 'test@example.com',
          fullName: 'Test User',
          role: 'contractor_pm',
          organizationId: 'org-123',
          isActive: false,
        }),
      },
      organizations: {
        tryIncrementSeatUsed: vi.fn().mockResolvedValue({ id: 'org-123', seatUsed: 2 }),
      },
      auditLogs: {
        create: vi.fn().mockResolvedValue({}),
      },
    };
    return callback(txRepos as unknown as Repositories);
  }),
}));

describe('UserService', () => {
  let userService: UserService;
  let mockRepos: Repositories;
  let mockAuthService: AuthService;
  let mockEmailService: EmailPort;

  const mockUser: UserEntity = {
    id: 'user-123',
    supabaseUserId: 'supabase-123',
    organizationId: 'org-123',
    email: 'test@example.com',
    fullName: 'Test User',
    role: 'contractor_pm',
    isOrgAdmin: false,
    isActive: true,
    invitedBy: null,
    phoneNumber: null,
    jobTitle: null,
    address: null,
    age: null,
    bio: null,
    avatarUrl: null,
    mobileNumber: null,
    preferences: null,
    metadata: null,
    createdAt: new Date(),
    activatedAt: null,
    lastLoginAt: null,
  };

  const mockOrg = {
    id: 'org-123',
    name: 'Test Org',
    type: 'contractor',
    seatLimit: 10,
    seatUsed: 5,
  };

  const mockContext: RequestContext = {
    actorId: 'actor-123',
    actorEmail: 'actor@example.com',
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepos = {
      users: {
        findById: vi.fn(),
        findByEmail: vi.fn(),
        findByOrganization: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        activate: vi.fn(),
        deactivate: vi.fn(),
        updateLastLogin: vi.fn(),
      },
      organizations: {
        findById: vi.fn(),
        decrementSeatUsed: vi.fn(),
      },
      projects: {
        findByOwner: vi.fn(),
      },
      auditLogs: {
        create: vi.fn(),
      },
    } as unknown as Repositories;

    mockAuthService = {
      inviteUser: vi.fn(),
      deleteUser: vi.fn(),
      updatePassword: vi.fn(),
      emailExists: vi.fn(),
    } as unknown as AuthService;

    mockEmailService = {
      send: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as EmailPort;

    userService = new UserService(mockRepos, mockAuthService, mockEmailService);
  });

  describe('inviteUser', () => {
    const inviteInput = {
      email: 'newuser@example.com',
      fullName: 'New User',
      role: 'contractor_pm',
      organizationId: 'org-123',
    };

    it('should invite user successfully', async () => {
      (mockRepos.users.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (mockAuthService.emailExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      (mockAuthService.inviteUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        providerUserId: 'provider-123',
      });

      const result = await userService.inviteUser(
        inviteInput,
        'contractor_ceo',
        mockOrg,
        mockContext
      );

      expect(result.user).toBeDefined();
      expect(result.seatsRemaining).toBe(4);
      expect(mockAuthService.inviteUser).toHaveBeenCalled();
    });

    it('should throw CANNOT_MANAGE_ROLE when actor cannot invite role', async () => {
      await expect(
        userService.inviteUser(inviteInput, 'contractor_pm', mockOrg, mockContext)
      ).rejects.toThrow('You cannot invite users with role contractor_pm');
    });

    it('should throw INVALID_ORG_TYPE when role does not match org type', async () => {
      const clientOrg = { ...mockOrg, type: 'client' };

      await expect(
        userService.inviteUser(inviteInput, 'contractor_ceo', clientOrg, mockContext)
      ).rejects.toThrow('Role contractor_pm is not valid for client organizations');
    });

    it('should throw SEAT_LIMIT_EXCEEDED when no seats available', async () => {
      // seatUsed must exceed seatLimit + GRACE_SEATS (1) to trigger hard block
      const fullOrg = { ...mockOrg, seatUsed: 12 };

      await expect(
        userService.inviteUser(inviteInput, 'contractor_ceo', fullOrg, mockContext)
      ).rejects.toThrow('Seat limit reached');
    });

    it('should throw EMAIL_REGISTERED when email exists in local DB', async () => {
      (mockRepos.users.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      await expect(
        userService.inviteUser(inviteInput, 'contractor_ceo', mockOrg, mockContext)
      ).rejects.toThrow('A user with this email already exists');
    });

    it('should throw EMAIL_REGISTERED when email exists in auth provider', async () => {
      (mockRepos.users.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (mockAuthService.emailExists as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      await expect(
        userService.inviteUser(inviteInput, 'contractor_ceo', mockOrg, mockContext)
      ).rejects.toThrow('A user with this email already exists');
    });
  });

  describe('resendInvite', () => {
    it('should resend invite for inactive user', async () => {
      const inactiveUser = { ...mockUser, isActive: false };
      (mockRepos.users.findById as ReturnType<typeof vi.fn>).mockResolvedValue(inactiveUser);
      (mockAuthService.inviteUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        providerUserId: 'provider-123',
      });
      (mockRepos.auditLogs.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await expect(
        userService.resendInvite('user-123', 'org-123', mockContext)
      ).resolves.toBeUndefined();

      expect(mockAuthService.inviteUser).toHaveBeenCalled();
      expect(mockRepos.auditLogs.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'invite.resent' })
      );
    });

    it('should throw USER_NOT_FOUND when user does not exist', async () => {
      (mockRepos.users.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        userService.resendInvite('non-existent', 'org-123', mockContext)
      ).rejects.toThrow('User not found in your organization');
    });

    it('should throw USER_NOT_FOUND when user belongs to different org', async () => {
      const differentOrgUser = { ...mockUser, organizationId: 'different-org' };
      (mockRepos.users.findById as ReturnType<typeof vi.fn>).mockResolvedValue(differentOrgUser);

      await expect(userService.resendInvite('user-123', 'org-123', mockContext)).rejects.toThrow(
        'User not found in your organization'
      );
    });

    it('should throw VALIDATION_ERROR when user is already active', async () => {
      (mockRepos.users.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      await expect(userService.resendInvite('user-123', 'org-123', mockContext)).rejects.toThrow(
        'User is already active'
      );
    });
  });

  describe('deleteUser', () => {
    it('should delete user successfully', async () => {
      (mockRepos.users.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (mockRepos.auditLogs.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (mockRepos.organizations.decrementSeatUsed as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (mockAuthService.deleteUser as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (mockRepos.users.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await expect(userService.deleteUser('user-123', mockContext)).resolves.toBeUndefined();

      expect(mockRepos.users.delete).toHaveBeenCalledWith('user-123');
      expect(mockRepos.organizations.decrementSeatUsed).toHaveBeenCalledWith('org-123');
    });

    it('should throw NOT_FOUND when user does not exist', async () => {
      (mockRepos.users.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(userService.deleteUser('non-existent', mockContext)).rejects.toThrow(
        'User not found'
      );
    });

    it('should throw FORBIDDEN when deleting yourself via admin panel', async () => {
      const selfContext = { ...mockContext, actorId: 'user-123' };
      (mockRepos.users.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      await expect(
        userService.deleteUser('user-123', selfContext, { isSelfDeletion: false })
      ).rejects.toThrow('Cannot delete your own account from admin panel');
    });

    it('should throw FORBIDDEN when system admin tries self-deletion', async () => {
      const adminUser = { ...mockUser, role: 'system_admin' };
      (mockRepos.users.findById as ReturnType<typeof vi.fn>).mockResolvedValue(adminUser);

      await expect(
        userService.deleteUser('user-123', mockContext, { isSelfDeletion: true })
      ).rejects.toThrow('System administrators cannot self-delete');
    });

    it('should throw FORBIDDEN when user owns projects', async () => {
      (mockRepos.users.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (mockRepos.projects.findByOwner as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'project-1' },
      ]);

      await expect(
        userService.deleteUser('user-123', mockContext, { checkOwnedProjects: true })
      ).rejects.toThrow('Cannot delete user who owns projects');
    });

    it('should soft delete for self-deletion', async () => {
      (mockRepos.users.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (mockRepos.auditLogs.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (mockRepos.organizations.decrementSeatUsed as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (mockAuthService.deleteUser as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (mockRepos.users.deactivate as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await userService.deleteUser('user-123', mockContext, { isSelfDeletion: true });

      expect(mockRepos.users.deactivate).toHaveBeenCalledWith('user-123');
      expect(mockRepos.users.delete).not.toHaveBeenCalled();
    });
  });

  describe('updateProfile', () => {
    it('should update profile successfully', async () => {
      const updatedUser = { ...mockUser, fullName: 'Updated Name' };
      (mockRepos.users.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedUser);
      (mockRepos.users.findById as ReturnType<typeof vi.fn>).mockResolvedValue(updatedUser);
      (mockRepos.auditLogs.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const result = await userService.updateProfile(
        'user-123',
        { fullName: 'Updated Name' },
        mockContext
      );

      expect(result.fullName).toBe('Updated Name');
      expect(mockRepos.auditLogs.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.profile_updated' })
      );
    });

    it('should throw NOT_FOUND when user does not exist', async () => {
      (mockRepos.users.update as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        userService.updateProfile('non-existent', { fullName: 'Test' }, mockContext)
      ).rejects.toThrow('User not found');
    });
  });

  describe('changePassword', () => {
    it('should change password with valid password', async () => {
      (mockAuthService.updatePassword as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (mockRepos.users.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (mockRepos.auditLogs.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await expect(
        userService.changePassword('user-123', 'supabase-123', 'ValidP@ssword123!', mockContext)
      ).resolves.toBeUndefined();

      expect(mockAuthService.updatePassword).toHaveBeenCalledWith(
        'supabase-123',
        'ValidP@ssword123!'
      );
    });

    it('should throw VALIDATION_ERROR for short password', async () => {
      await expect(
        userService.changePassword('user-123', 'supabase-123', 'Short1!', mockContext)
      ).rejects.toThrow('at least 12 characters');
    });

    it('should throw VALIDATION_ERROR for password without uppercase', async () => {
      await expect(
        userService.changePassword('user-123', 'supabase-123', 'validpassword123!', mockContext)
      ).rejects.toThrow('one uppercase letter');
    });

    it('should throw VALIDATION_ERROR for password without number', async () => {
      await expect(
        userService.changePassword('user-123', 'supabase-123', 'ValidPassword!!', mockContext)
      ).rejects.toThrow('one number');
    });

    it('should throw VALIDATION_ERROR for password without special character', async () => {
      await expect(
        userService.changePassword('user-123', 'supabase-123', 'ValidPassword123', mockContext)
      ).rejects.toThrow('one special character');
    });
  });

  describe('activateUser', () => {
    it('should activate user and send welcome email', async () => {
      (mockRepos.users.activate as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (mockRepos.auditLogs.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (mockRepos.organizations.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockOrg);

      await userService.activateUser('user-123', mockContext);

      expect(mockRepos.users.activate).toHaveBeenCalledWith('user-123');
      expect(mockEmailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Welcome to Geometrix!',
        })
      );
    });

    it('should not send email if activation returns null', async () => {
      (mockRepos.users.activate as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await userService.activateUser('user-123', mockContext);

      expect(mockEmailService.send).not.toHaveBeenCalled();
    });
  });

  describe('recordLogin', () => {
    it('should update last login and create audit log', async () => {
      (mockRepos.users.updateLastLogin as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (mockRepos.users.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (mockRepos.auditLogs.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await userService.recordLogin('user-123', mockContext);

      expect(mockRepos.users.updateLastLogin).toHaveBeenCalledWith('user-123');
      expect(mockRepos.auditLogs.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.login' })
      );
    });
  });

  describe('listUsers', () => {
    it('should return paginated users', async () => {
      const users = [mockUser, { ...mockUser, id: 'user-456' }];
      (mockRepos.users.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(users);

      const result = await userService.listUsers({ limit: 10, offset: 0 });

      expect(result.users).toHaveLength(2);
      expect(result.hasMore).toBe(false);
    });

    it('should indicate hasMore when more results exist', async () => {
      const users = Array(11)
        .fill(null)
        .map((_, i) => ({ ...mockUser, id: `user-${i}` }));
      (mockRepos.users.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(users);

      const result = await userService.listUsers({ limit: 10, offset: 0 });

      expect(result.users).toHaveLength(10);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('listOrgUsers', () => {
    it('should return paginated org users', async () => {
      const users = [mockUser];
      (mockRepos.users.findByOrganization as ReturnType<typeof vi.fn>).mockResolvedValue(users);

      const result = await userService.listOrgUsers('org-123', { limit: 10 });

      expect(result.users).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });
  });
});
