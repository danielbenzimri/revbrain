import type { Repositories, OrganizationEntity, UserEntity, EmailPort } from '@revbrain/contract';
import { AppError, ErrorCodes } from '@revbrain/contract';
import type { AuthService } from './auth.service.ts';
import type { OrganizationService } from './organization.service.ts';
import type { RequestContext } from './types.ts';
import { getEnv } from '../lib/env.ts';
import { logger } from '../lib/logger.ts';
import { withTransaction } from '../repositories/with-transaction.ts';
import { renderInviteEmail } from '../emails/templates/invite.ts';

export interface OnboardOrganizationInput {
  organization: {
    name: string;
    seatLimit: number;
    planId?: string | null;
  };
  admin: {
    email: string;
    fullName: string;
  };
}

export class OnboardingService {
  constructor(
    private repos: Repositories,
    private authService: AuthService,
    private orgService: OrganizationService,
    private emailService?: EmailPort
  ) {}

  /**
   * Full onboarding flow: create org + invite first admin + local user + seat + audit.
   *
   * Strategy:
   * 1. Validations (pure, no side effects)
   * 2. External call (Supabase invite) — if this fails, nothing to clean up
   * 3. DB transaction (org + user + audit) — all-or-nothing
   * 4. If DB fails → compensate by deleting the Supabase user
   */
  async onboardOrganization(
    input: OnboardOrganizationInput,
    ctx: RequestContext
  ): Promise<{
    organization: OrganizationEntity;
    admin: UserEntity;
    invitationSent: boolean;
  }> {
    const { organization: orgData, admin: adminData } = input;

    // Check email uniqueness
    const existingUser = await this.repos.users.findByEmail(adminData.email);
    if (existingUser) {
      throw new AppError(ErrorCodes.EMAIL_REGISTERED, 'A user with this email already exists', 409);
    }

    // Generate unique slug
    const slug = await this.orgService.generateUniqueSlug(orgData.name);

    // Step 1: Create auth user (no Supabase email — we send our own)
    const frontendUrl = getEnv('FRONTEND_URL') || 'http://localhost:5173';
    const { providerUserId, inviteLink } = await this.authService.inviteUser({
      email: adminData.email,
      redirectTo: `${frontendUrl}/set-password`,
      metadata: {
        fullName: adminData.fullName,
        role: 'org_owner',
        organizationId: '', // Will be set once org is created
        organizationName: orgData.name,
        invitedBy: ctx.actorId,
        invitedAt: new Date().toISOString(),
      },
    });

    // Step 2: DB operations in a transaction
    try {
      const result = await withTransaction(async (txRepos) => {
        // Create organization
        const org = await txRepos.organizations.create({
          name: orgData.name,
          slug,
          seatLimit: orgData.seatLimit,
          createdBy: ctx.actorId,
          planId: orgData.planId ?? null,
        });

        // Create local user
        const user = await txRepos.users.create({
          supabaseUserId: providerUserId,
          organizationId: org.id,
          email: adminData.email,
          fullName: adminData.fullName,
          role: 'org_owner',
          isOrgAdmin: true,
          isActive: false,
          invitedBy: ctx.actorId,
        });

        // Set initial seat count
        await txRepos.organizations.incrementSeatUsed(org.id);

        // Audit log
        await txRepos.auditLogs.create({
          userId: ctx.actorId,
          organizationId: org.id,
          targetUserId: user.id,
          action: 'org.created',
          metadata: {
            orgName: org.name,
            adminEmail: adminData.email,
          },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        });

        return { organization: org, admin: user };
      });

      // Step 3: Send branded invite email via Resend (non-blocking)
      let invitationSent = false;
      if (this.emailService) {
        try {
          const setPasswordUrl = inviteLink || `${frontendUrl}/set-password`;
          const html = renderInviteEmail({
            userName: adminData.fullName,
            orgName: orgData.name,
            inviterName: ctx.actorEmail || 'RevBrain Admin',
            setPasswordUrl,
          });
          await this.emailService.send({
            to: adminData.email,
            subject: `You've been invited to ${orgData.name} on RevBrain`,
            html,
          });
          invitationSent = true;
        } catch (emailErr) {
          logger.warn('Failed to send invite email (non-blocking)', {
            email: adminData.email,
            error: (emailErr as Error).message,
          });
        }
      }

      return { ...result, invitationSent };
    } catch (txError) {
      const errMsg = txError instanceof Error ? txError.message : String(txError);
      logger.error('Onboarding DB transaction failed', { error: errMsg }, txError as Error);

      // Compensate: delete the auth provider user
      await this.authService.deleteUser(providerUserId).catch((e) => {
        logger.error(
          'Failed to rollback auth user during onboarding',
          { providerUserId },
          e as Error
        );
      });

      throw new AppError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        `Failed to onboard organization: ${errMsg}`,
        500
      );
    }
  }
}
