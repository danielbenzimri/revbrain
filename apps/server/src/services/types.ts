import type { AuthService } from './auth.service.ts';
import type { UserService } from './user.service.ts';
import type { OrganizationService } from './organization.service.ts';
import type { OnboardingService } from './onboarding.service.ts';
import type { LimitsService } from './limits.service.ts';

/**
 * HTTP-derived context that services need for audit logging.
 * Extracted from Hono context by route handlers so services stay framework-agnostic.
 */
export interface RequestContext {
  actorId: string;
  actorEmail?: string;
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * All services available via c.var.services in route handlers.
 */
export interface Services {
  auth: AuthService;
  users: UserService;
  organizations: OrganizationService;
  onboarding: OnboardingService;
  limits: LimitsService;
}
