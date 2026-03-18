import { z } from 'zod';

// Re-export repository interfaces
// Note: Explicit .ts extension required for Deno/Edge Functions compatibility
export * from './repositories/index.ts';

// Re-export port interfaces (Hexagonal Architecture)
export * from './ports/email.port.ts';
export * from './ports/alerting.port.ts';

/**
 * Standardized Application Error
 * Used across the entire application for consistent error handling
 */
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Common Error Codes
 */
export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  // Auth-specific errors
  USER_EXISTS: 'USER_EXISTS',
  ALREADY_INVITED: 'ALREADY_INVITED',
  EMAIL_REGISTERED: 'EMAIL_REGISTERED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  CANNOT_MANAGE_ROLE: 'CANNOT_MANAGE_ROLE',
  SEAT_LIMIT_EXCEEDED: 'SEAT_LIMIT_EXCEEDED',
  INVALID_ORG_TYPE: 'INVALID_ORG_TYPE',
  // Plan limits enforcement errors
  USER_LIMIT_EXCEEDED: 'USER_LIMIT_EXCEEDED',
  PROJECT_LIMIT_EXCEEDED: 'PROJECT_LIMIT_EXCEEDED',
  STORAGE_LIMIT_EXCEEDED: 'STORAGE_LIMIT_EXCEEDED',
  FEATURE_NOT_AVAILABLE: 'FEATURE_NOT_AVAILABLE',
  SUBSCRIPTION_REQUIRED: 'SUBSCRIPTION_REQUIRED',
  SUBSCRIPTION_PAST_DUE: 'SUBSCRIPTION_PAST_DUE',
} as const;

// ============================================================================
// AUTH SCHEMAS & ROLE DEFINITIONS
// ============================================================================

/**
 * Organization Types
 */
export type OrganizationType = 'contractor' | 'client';

/**
 * Role Groups
 */
export const CONTRACTOR_ROLES = [
  'contractor_ceo',
  'contractor_pm',
  'execution_engineer',
  'quantity_surveyor',
  'quality_controller',
] as const;

export const CLIENT_ROLES = [
  'client_owner',
  'client_pm',
  'inspector',
  'quality_assurance',
  'accounts_controller',
] as const;

export const SYSTEM_ROLES = ['system_admin'] as const;

export type ContractorRole = (typeof CONTRACTOR_ROLES)[number];
export type ClientRole = (typeof CLIENT_ROLES)[number];
export type SystemRole = (typeof SYSTEM_ROLES)[number];
export type UserRole = ContractorRole | ClientRole | SystemRole;

/**
 * Org admin roles (can invite users)
 */
export const ORG_ADMIN_ROLES: UserRole[] = ['contractor_ceo', 'client_owner'];

/**
 * Get roles available for an organization type
 */
export function getRolesForOrgType(type: OrganizationType): UserRole[] {
  return type === 'contractor' ? [...CONTRACTOR_ROLES] : [...CLIENT_ROLES];
}

/**
 * Get organization type for a role
 */
export function getOrgTypeForRole(role: UserRole): OrganizationType | null {
  if (CONTRACTOR_ROLES.includes(role as ContractorRole)) return 'contractor';
  if (CLIENT_ROLES.includes(role as ClientRole)) return 'client';
  return null;
}

/**
 * Check if role is an org admin role
 */
export function isOrgAdminRole(role: UserRole): boolean {
  return ORG_ADMIN_ROLES.includes(role);
}

/**
 * Validation Schemas
 */
export const emailSchema = z
  .string()
  .email('Invalid email format')
  .max(255, 'Email too long')
  .transform((email) => email.toLowerCase().trim());

export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password too long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const userRoleSchema = z.enum([
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
]);

export const fullNameSchema = z
  .string()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name too long')
  .trim();

export const uuidSchema = z.string().uuid('Invalid ID format');

export const orgTypeSchema = z.enum(['contractor', 'client']);

/**
 * Request Schemas
 */
export const onboardOrganizationSchema = z.object({
  organization: z.object({
    name: z.string().min(2).max(255),
    type: orgTypeSchema,
    seatLimit: z.number().int().min(1).max(1000).default(5),
    planId: uuidSchema.optional(),
  }),
  admin: z.object({
    email: emailSchema,
    fullName: fullNameSchema,
    role: z.enum(['contractor_ceo', 'client_owner']),
  }),
});

export const inviteUserSchema = z.object({
  email: emailSchema,
  fullName: fullNameSchema,
  role: userRoleSchema,
  organizationId: uuidSchema.optional(),
  phoneNumber: z.string().max(20).optional(),
  jobTitle: z.string().max(100).optional(),
  address: z.string().max(500).optional(),
});

export const resendInviteSchema = z.object({
  userId: uuidSchema,
});

export const planSchema = z.object({
  id: uuidSchema.optional(),
  name: z.string().min(2).max(100),
  code: z.string().min(2).max(50).optional(), // Auto-generated from name if not provided
  description: z.string().optional(),
  price: z.number().int().min(0), // Monthly price in cents
  currency: z.string().length(3).default('USD'),
  interval: z.enum(['month', 'year']).default('month'), // Kept for backward compat
  yearlyDiscountPercent: z.number().int().min(0).max(100).default(0), // 0-100
  limits: z.object({
    maxUsers: z.number().int().min(0), // 0 = unlimited
    maxProjects: z.number().int().min(0),
    storageGB: z.number().int().min(0),
  }),
  features: z.object({
    aiLevel: z.enum(['none', 'basic', 'advanced', 'full']),
    modules: z.array(z.string()),
    customBranding: z.boolean(),
    sso: z.boolean(),
  }),
  isActive: z.boolean().default(true),
  isPublic: z.boolean().default(false),
});

export type OnboardOrganizationInput = z.infer<typeof onboardOrganizationSchema>;
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type ResendInviteInput = z.infer<typeof resendInviteSchema>;
export type Plan = z.infer<typeof planSchema>;

// End of file

/**
 * Standard API Response Types
 */
export const ApiSuccessResponseSchema = z.object({
  success: z.literal(true),
  data: z.any(),
});

export const ApiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export type ApiSuccessResponse<T = any> = {
  success: true;
  data: T;
};

export type ApiErrorResponse = {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Health Check Schema
 */
export const HealthCheckResponseSchema = z.object({
  status: z.literal('ok'),
  env: z.string(),
  timestamp: z.string(),
  region: z.string().optional(),
});

export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;

/**
 * Profile Schemas (Example)
 */
export const ProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  full_name: z.string().nullable(),
  avatar_url: z.string().url().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type Profile = z.infer<typeof ProfileSchema>;

export const CreateProfileSchema = ProfileSchema.pick({
  email: true,
  full_name: true,
  avatar_url: true,
});

export type CreateProfile = z.infer<typeof CreateProfileSchema>;

/**
 * RPC Contract Example
 * This pattern allows type-safe client-server communication
 */
export const GetProfileRequestSchema = z.object({
  id: z.string().uuid(),
});

export const GetProfileResponseSchema = ApiSuccessResponseSchema.extend({
  data: ProfileSchema,
});

export type GetProfileRequest = z.infer<typeof GetProfileRequestSchema>;
export type GetProfileResponse = z.infer<typeof GetProfileResponseSchema>;
