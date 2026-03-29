import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types/index.ts';
import type { Services } from './types.ts';
import { AuthService } from './auth.service.ts';
import { UserService } from './user.service.ts';
import { OrganizationService } from './organization.service.ts';
import { OnboardingService } from './onboarding.service.ts';
import { LimitsService } from './limits.service.ts';
import { getSupabaseAdmin } from '../lib/supabase.ts';
import { getEmailService } from '../emails/index.ts';

/**
 * Extend Hono context to include services.
 */
declare module 'hono' {
  interface ContextVariableMap {
    services: Services;
  }
}

/**
 * Service Middleware
 *
 * Injects services into the Hono context. Must be mounted AFTER repositoryMiddleware
 * so that c.var.repos is available.
 *
 * Services receive their dependencies via constructor injection:
 * - Repositories from c.var.repos
 * - AuthService wrapping the Supabase Admin client
 * - EmailService from the existing adapter factory
 */
export const serviceMiddleware = () => {
  return createMiddleware<AppEnv>(async (c, next) => {
    const repos = c.var.repos;

    const authService = new AuthService(getSupabaseAdmin());
    const emailService = getEmailService();
    const orgService = new OrganizationService(repos);
    const userService = new UserService(repos, authService, emailService);
    const onboardingService = new OnboardingService(repos, authService, orgService, emailService);
    const limitsService = new LimitsService(repos);

    c.set('services', {
      auth: authService,
      users: userService,
      organizations: orgService,
      onboarding: onboardingService,
      limits: limitsService,
    });

    await next();
  });
};
