import type {
  Repositories,
  UserEntity,
  EmailPort,
  UserRole,
  UpdateUserInput,
} from '@revbrain/contract';
import { AppError, ErrorCodes } from '@revbrain/contract';
import type { AuthService } from './auth.service.ts';
import type { RequestContext } from './types.ts';
import { checkSeatAvailability } from '../lib/seats.ts';
import { canInviteRole } from '../middleware/rbac.ts';
import { getEnv } from '../lib/env.ts';
import { renderWelcomeEmail } from '../emails/index.ts';
import { logger } from '../lib/logger.ts';
import { withTransaction } from '../repositories/with-transaction.ts';
import { clearUserCache } from '../middleware/auth.ts';

export interface InviteUserInput {
  email: string;
  fullName: string;
  role: string;
  organizationId: string;
  phoneNumber?: string | null;
  jobTitle?: string | null;
  address?: string | null;
  isOrgAdmin?: boolean;
}

export interface AdminUpdateUserInput {
  name?: string;
  role?: string;
  jobTitle?: string | null;
  phoneNumber?: string | null;
  mobileNumber?: string | null;
  address?: string | null;
  age?: number | null;
  bio?: string | null;
  updatedAt?: string;
}

export class UserService {
  constructor(
    private repos: Repositories,
    private authService: AuthService,
    private emailService: EmailPort
  ) {}

  /**
   * Invite a user to an organization.
   * Shared logic used by both admin and org invite routes.
   */
  async inviteUser(
    input: InviteUserInput,
    actorRole: string,
    org: { id: string; name: string; type: string; seatLimit: number; seatUsed: number },
    ctx: RequestContext
  ): Promise<{ user: UserEntity; seatsRemaining: number; warning?: string }> {
    // Permission check
    if (!canInviteRole(actorRole as UserRole, input.role as UserRole)) {
      throw new AppError(
        ErrorCodes.CANNOT_MANAGE_ROLE,
        `You cannot invite users with role ${input.role}`,
        403
      );
    }

    // Seat availability
    const seatCheck = checkSeatAvailability(org);
    if (!seatCheck.canInvite) {
      throw new AppError(
        ErrorCodes.SEAT_LIMIT_EXCEEDED,
        seatCheck.warning || 'Seat limit reached',
        403
      );
    }

    // Email uniqueness - local DB
    const existingUser = await this.repos.users.findByEmail(input.email);
    if (existingUser) {
      throw new AppError(ErrorCodes.EMAIL_REGISTERED, 'A user with this email already exists', 409);
    }

    // Email uniqueness - auth provider
    const existsInAuth = await this.authService.emailExists(input.email);
    if (existsInAuth) {
      throw new AppError(ErrorCodes.EMAIL_REGISTERED, 'A user with this email already exists', 409);
    }

    // Step 1: Invite via auth provider (external call first)
    const frontendUrl = getEnv('FRONTEND_URL') || 'http://localhost:5173';
    const { providerUserId } = await this.authService.inviteUser({
      email: input.email,
      redirectTo: `${frontendUrl}/set-password`,
      metadata: {
        fullName: input.fullName,
        role: input.role,
        organizationId: org.id,
        organizationName: org.name,
        invitedBy: ctx.actorId,
        invitedAt: new Date().toISOString(),
      },
    });

    // Step 2: DB operations in transaction
    try {
      const user = await withTransaction(async (txRepos) => {
        // ATOMIC seat increment with constraint check
        // This prevents TOCTOU race condition - if two requests pass the early check,
        // only one will successfully increment (the other gets null and throws)
        const updatedOrg = await txRepos.organizations.tryIncrementSeatUsed(org.id, 0.1);
        if (!updatedOrg) {
          throw new AppError(
            ErrorCodes.SEAT_LIMIT_EXCEEDED,
            'Seat limit exceeded (concurrent request). Please try again or upgrade your plan.',
            403
          );
        }

        const localUser = await txRepos.users.create({
          supabaseUserId: providerUserId,
          organizationId: org.id,
          email: input.email,
          fullName: input.fullName,
          role: input.role,
          isOrgAdmin: input.isOrgAdmin ?? false,
          isActive: false,
          invitedBy: ctx.actorId,
          phoneNumber: input.phoneNumber ?? null,
          jobTitle: input.jobTitle ?? null,
          address: input.address ?? null,
        });

        await txRepos.auditLogs.create({
          userId: ctx.actorId,
          organizationId: org.id,
          targetUserId: localUser.id,
          action: 'user.invited',
          metadata: { invitedEmail: input.email, invitedRole: input.role },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        });

        return localUser;
      });

      return {
        user,
        seatsRemaining: org.seatLimit - (org.seatUsed + 1),
        warning: seatCheck.warning || undefined,
      };
    } catch (_error) {
      // Compensate: delete the auth provider user
      await this.authService.deleteUser(providerUserId).catch((e) => {
        logger.error('Failed to rollback auth user', { providerUserId }, e as Error);
      });
      throw new AppError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        'Failed to invite user. Please try again.',
        500
      );
    }
  }

  /**
   * Resend invitation email to inactive user.
   */
  async resendInvite(userId: string, organizationId: string, ctx: RequestContext): Promise<void> {
    const targetUser = await this.repos.users.findById(userId);
    if (!targetUser || targetUser.organizationId !== organizationId) {
      throw new AppError(ErrorCodes.USER_NOT_FOUND, 'User not found in your organization', 404);
    }

    if (targetUser.isActive) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'User is already active', 400);
    }

    const frontendUrl = getEnv('FRONTEND_URL') || 'http://localhost:5173';
    await this.authService.inviteUser({
      email: targetUser.email,
      redirectTo: `${frontendUrl}/set-password`,
      metadata: {
        fullName: targetUser.fullName,
        role: targetUser.role,
        organizationId: targetUser.organizationId,
        organizationName: '',
        invitedBy: ctx.actorId,
        invitedAt: new Date().toISOString(),
      },
    });

    await this.repos.auditLogs.create({
      userId: ctx.actorId,
      organizationId,
      targetUserId: targetUser.id,
      action: 'invite.resent',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  }

  /**
   * Delete a user (admin or self-service).
   */
  async deleteUser(
    targetUserId: string,
    ctx: RequestContext,
    options?: { checkOwnedProjects?: boolean; isSelfDeletion?: boolean }
  ): Promise<void> {
    const targetUser = await this.repos.users.findById(targetUserId);
    if (!targetUser) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'User not found', 404);
    }

    // Self-deletion guard for system admins
    if (options?.isSelfDeletion && targetUser.role === 'system_admin') {
      throw new AppError(
        ErrorCodes.FORBIDDEN,
        'System administrators cannot self-delete. Contact another admin.',
        403
      );
    }

    // Admin deletion - can't delete yourself
    if (!options?.isSelfDeletion && targetUser.id === ctx.actorId) {
      throw new AppError(
        ErrorCodes.FORBIDDEN,
        'Cannot delete your own account from admin panel',
        403
      );
    }

    // Check owned projects
    if (options?.checkOwnedProjects) {
      const ownedProjects = await this.repos.projects.findByOwner(targetUserId, { limit: 1 });
      if (ownedProjects.length > 0) {
        throw new AppError(
          ErrorCodes.FORBIDDEN,
          'Cannot delete user who owns projects. Reassign their projects first.',
          409
        );
      }
    }

    // Audit log before delete (so targetUserId is still valid)
    await this.repos.auditLogs.create({
      userId: ctx.actorId,
      organizationId: targetUser.organizationId,
      targetUserId,
      action: options?.isSelfDeletion ? 'user.deactivated' : 'user.deleted',
      metadata: {
        deletedEmail: targetUser.email,
        ...(options?.isSelfDeletion ? { reason: 'self_deletion' } : { deletedBy: ctx.actorEmail }),
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    // Decrement org seat count (using atomic decrement)
    if (targetUser.organizationId) {
      await this.repos.organizations.decrementSeatUsed(targetUser.organizationId);
    }

    // Delete from auth provider (frees email for re-invitation)
    if (targetUser.supabaseUserId) {
      await this.authService.deleteUser(targetUser.supabaseUserId).catch((err) => {
        logger.error(
          'Failed to delete user from auth provider',
          { userId: targetUserId, supabaseUserId: targetUser.supabaseUserId },
          err as Error
        );
      });
    }

    // Self-deletion = soft delete, admin deletion = hard delete
    if (options?.isSelfDeletion) {
      await this.repos.users.deactivate(targetUserId);
    } else {
      await this.repos.users.delete(targetUserId);
    }

    // Clear auth cache so deactivation takes effect immediately
    if (targetUser.supabaseUserId) {
      clearUserCache(targetUser.supabaseUserId);
    }
  }

  /**
   * Update user profile (self-service).
   */
  async updateProfile(
    userId: string,
    updates: Record<string, unknown>,
    ctx: RequestContext
  ): Promise<UserEntity> {
    const updated = await this.repos.users.update(userId, updates as UpdateUserInput);
    if (!updated) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'User not found', 404);
    }

    const user = await this.repos.users.findById(userId);
    await this.repos.auditLogs.create({
      userId: ctx.actorId,
      organizationId: user?.organizationId,
      action: 'user.profile_updated',
      metadata: { updatedFields: Object.keys(updates) },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    // Clear auth cache so changes take effect immediately
    if (user?.supabaseUserId) {
      clearUserCache(user.supabaseUserId);
    }

    return updated;
  }

  /**
   * Admin-level user update (can change role, name, etc.)
   */
  async adminUpdateUser(
    targetUserId: string,
    input: AdminUpdateUserInput,
    ctx: RequestContext
  ): Promise<UserEntity> {
    const targetUser = await this.repos.users.findById(targetUserId);
    if (!targetUser) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'User not found', 404);
    }

    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) updateData.fullName = input.name;
    if (input.role !== undefined) updateData.role = input.role;
    if (input.jobTitle !== undefined) updateData.jobTitle = input.jobTitle;
    if (input.phoneNumber !== undefined) updateData.phoneNumber = input.phoneNumber;
    if (input.mobileNumber !== undefined) updateData.mobileNumber = input.mobileNumber;
    if (input.address !== undefined) updateData.address = input.address;
    if (input.age !== undefined) updateData.age = input.age;
    if (input.bio !== undefined) updateData.bio = input.bio;

    if (Object.keys(updateData).length === 0) {
      return targetUser;
    }

    const updated = await this.repos.users.update(targetUserId, updateData as UpdateUserInput);
    if (!updated) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'User not found', 404);
    }

    await this.repos.auditLogs.create({
      userId: ctx.actorId,
      organizationId: targetUser.organizationId,
      targetUserId,
      action: 'user.profile_updated',
      metadata: { updatedFields: Object.keys(updateData) },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    // Clear auth cache so role/permission changes take effect immediately
    if (targetUser.supabaseUserId) {
      clearUserCache(targetUser.supabaseUserId);
    }

    return updated;
  }

  /**
   * Change password (validates complexity, calls auth provider).
   */
  async changePassword(
    userId: string,
    supabaseUserId: string,
    newPassword: string,
    ctx: RequestContext
  ): Promise<void> {
    // Validate password strength
    const errors: string[] = [];
    if (newPassword.length < 12) errors.push('at least 12 characters');
    if (!/[A-Z]/.test(newPassword)) errors.push('one uppercase letter');
    if (!/[a-z]/.test(newPassword)) errors.push('one lowercase letter');
    if (!/[0-9]/.test(newPassword)) errors.push('one number');
    if (!/[^A-Za-z0-9]/.test(newPassword)) errors.push('one special character');

    if (errors.length > 0) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        `Password must contain: ${errors.join(', ')}`,
        400
      );
    }

    await this.authService.updatePassword(supabaseUserId, newPassword);

    await this.repos.auditLogs.create({
      userId,
      organizationId: (await this.repos.users.findById(userId))?.organizationId,
      action: 'user.password_changed',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  }

  /**
   * Activate user account and send welcome email.
   */
  async activateUser(userId: string, ctx: RequestContext): Promise<void> {
    const activated = await this.repos.users.activate(userId);
    if (!activated) return;

    // Clear auth cache so activation takes effect immediately
    if (activated.supabaseUserId) {
      clearUserCache(activated.supabaseUserId);
    }

    await this.repos.auditLogs.create({
      userId,
      organizationId: activated.organizationId,
      action: 'user.activated',
      metadata: { source: 'auto_activate_on_me' },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    // Send welcome email (fire-and-forget)
    const org = await this.repos.organizations.findById(activated.organizationId);
    const loginUrl = `${getEnv('APP_URL') || 'https://app.revbrain.com'}/login`;
    const html = renderWelcomeEmail({
      userName: activated.fullName || activated.email,
      orgName: org?.name || 'RevBrain',
      loginUrl,
    });

    this.emailService
      .send({ to: activated.email, subject: 'Welcome to RevBrain!', html })
      .catch((err) => logger.error('Welcome email failed', { userId }, err as Error));
  }

  /**
   * Record a user login event.
   */
  async recordLogin(userId: string, ctx: RequestContext): Promise<void> {
    await this.repos.users.updateLastLogin(userId);

    const user = await this.repos.users.findById(userId);
    await this.repos.auditLogs.create({
      userId,
      organizationId: user?.organizationId,
      action: 'user.login',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  }

  /**
   * List all users with pagination (admin).
   */
  async listUsers(options: { limit: number; offset: number }): Promise<{
    users: UserEntity[];
    hasMore: boolean;
  }> {
    const allUsers = await this.repos.users.findMany({
      limit: options.limit + 1,
      offset: options.offset,
    });

    const hasMore = allUsers.length > options.limit;
    const page = hasMore ? allUsers.slice(0, options.limit) : allUsers;

    return { users: page, hasMore };
  }

  /**
   * List users in an organization with pagination.
   */
  async listOrgUsers(
    organizationId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ users: UserEntity[]; hasMore: boolean }> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    // Fetch limit+1 to detect if there are more results
    const users = await this.repos.users.findByOrganization(organizationId, {
      limit: limit + 1,
      offset,
    });

    const hasMore = users.length > limit;
    const page = hasMore ? users.slice(0, limit) : users;

    return { users: page, hasMore };
  }
}
