import { z } from 'zod';

// Re-export repository interfaces
// Note: Explicit .ts extension required for Deno/Edge Functions compatibility
export * from './repositories/index.ts';

// Re-export port interfaces (Hexagonal Architecture)
export * from './ports/email.port.ts';
export * from './ports/alerting.port.ts';

// Re-export assessment extraction types
export * from './assessment.ts';

// Re-export encryption utilities (shared by server + worker)
export * from './encryption.ts';

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
  // SI Billing entitlement errors
  AGREEMENT_REQUIRED: 'AGREEMENT_REQUIRED',
  PAYMENT_REQUIRED: 'PAYMENT_REQUIRED',
  MIGRATION_REQUIRED: 'MIGRATION_REQUIRED',
} as const;

// ============================================================================
// ORGANIZATION TYPE
// ============================================================================

/**
 * Organization types for SI billing model.
 * - si_partner: System Integrator partner (billed per-project)
 * - end_client: Future end-client (billed via subscription — not yet implemented)
 * - internal: RevBrain staff
 */
export const ORG_TYPES = ['si_partner', 'end_client', 'internal'] as const;
export type OrgType = (typeof ORG_TYPES)[number];

export const orgTypeSchema = z.enum(ORG_TYPES);

// ============================================================================
// PARTNER TIERS (SI Billing)
// ============================================================================

export const PARTNER_TIERS = ['standard', 'silver', 'gold', 'platinum'] as const;
export type PartnerTier = (typeof PARTNER_TIERS)[number];

export const partnerTierSchema = z.enum(PARTNER_TIERS);

export const partnerProfileSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  tier: partnerTierSchema,
  cumulativeFeesPaid: z.number().int().nonnegative(),
  completedProjectCount: z.number().int().nonnegative(),
  tierOverride: partnerTierSchema.nullable().optional(),
  tierOverrideReason: z.string().nullable().optional(),
  tierOverrideSetBy: z.string().uuid().nullable().optional(),
  tierOverrideSetAt: z.date().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createPartnerProfileSchema = z.object({
  organizationId: z.string().uuid(),
  tier: partnerTierSchema.optional().default('standard'),
  cumulativeFeesPaid: z.number().int().nonnegative().optional().default(0),
  completedProjectCount: z.number().int().nonnegative().optional().default(0),
});

export const updatePartnerProfileSchema = z.object({
  tier: partnerTierSchema.optional(),
  cumulativeFeesPaid: z.number().int().nonnegative().optional(),
  completedProjectCount: z.number().int().nonnegative().optional(),
  tierOverride: partnerTierSchema.nullable().optional(),
  tierOverrideReason: z.string().nullable().optional(),
  tierOverrideSetBy: z.string().uuid().nullable().optional(),
  tierOverrideSetAt: z.date().nullable().optional(),
});

// PartnerProfileEntity, CreatePartnerProfileInput, UpdatePartnerProfileInput
// are defined in ./repositories/types.ts (following existing pattern)

// ============================================================================
// FEE AGREEMENT ENUMS & SCHEMAS (SI Billing)
// ============================================================================

export const FEE_AGREEMENT_STATUSES = [
  'draft',
  'active_assessment',
  'migration_pending_review',
  'active_migration',
  'complete',
  'assessment_complete',
  'cancelled',
  'archived',
] as const;
export type FeeAgreementStatus = (typeof FEE_AGREEMENT_STATUSES)[number];
export const feeAgreementStatusSchema = z.enum(FEE_AGREEMENT_STATUSES);

export const PAYMENT_TERMS = ['due_on_receipt', 'net_15', 'net_30', 'net_60'] as const;
export type PaymentTerms = (typeof PAYMENT_TERMS)[number];
export const paymentTermsSchema = z.enum(PAYMENT_TERMS);

export const ASSESSMENT_CLOSE_REASONS = [
  'client_did_not_proceed',
  'budget',
  'timeline',
  'competitor',
  'other',
] as const;
export type AssessmentCloseReason = (typeof ASSESSMENT_CLOSE_REASONS)[number];
export const assessmentCloseReasonSchema = z.enum(ASSESSMENT_CLOSE_REASONS);

export const feeAgreementSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  supersedesAgreementId: z.string().uuid().nullable().optional(),
  version: z.number().int().positive(),
  status: feeAgreementStatusSchema,
  assessmentFee: z.number().int().positive(),
  declaredProjectValue: z.number().int().positive().nullable().optional(),
  capAmount: z.number().int().positive().nullable().optional(),
  calculatedTotalFee: z.number().int().nonnegative().nullable().optional(),
  calculatedRemainingFee: z.number().int().nonnegative().nullable().optional(),
  carriedCreditAmount: z.number().int().nonnegative(),
  carriedCreditSourceAgreementId: z.string().uuid().nullable().optional(),
  paymentTerms: paymentTermsSchema,
  currency: z.string().length(3),
  createdBy: z.string().uuid().nullable().optional(),
  assessmentTermsSnapshot: z.unknown().nullable().optional(),
  assessmentTermsSnapshotHash: z.string().nullable().optional(),
  acceptedBy: z.string().uuid().nullable().optional(),
  acceptedAt: z.date().nullable().optional(),
  acceptedFromIp: z.string().nullable().optional(),
  sowFileId: z.string().nullable().optional(),
  migrationTermsSnapshot: z.unknown().nullable().optional(),
  migrationTermsSnapshotHash: z.string().nullable().optional(),
  migrationAcceptedBy: z.string().uuid().nullable().optional(),
  migrationAcceptedAt: z.date().nullable().optional(),
  migrationAcceptedFromIp: z.string().nullable().optional(),
  assessmentCloseReason: assessmentCloseReasonSchema.nullable().optional(),
  assessmentCloseNotes: z.string().nullable().optional(),
  cancelledBy: z.string().uuid().nullable().optional(),
  cancellationReason: z.string().nullable().optional(),
  cancelledAt: z.date().nullable().optional(),
  completedAt: z.date().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/** Validates cap >= assessment_fee at the schema level */
export const createFeeAgreementSchema = z
  .object({
    projectId: z.string().uuid(),
    assessmentFee: z.number().int().positive().default(1500000), // $15,000 in cents
    paymentTerms: paymentTermsSchema.default('net_30'),
    capAmount: z.number().int().positive().nullable().optional(),
    createdBy: z.string().uuid().optional(),
  })
  .refine((data) => !data.capAmount || data.capAmount >= data.assessmentFee, {
    message: 'Cap amount must be >= assessment fee',
    path: ['capAmount'],
  });

// FeeAgreementEntity, CreateFeeAgreementInput, UpdateFeeAgreementInput
// are defined in ./repositories/types.ts (following existing pattern)

// ============================================================================
// FEE MILESTONE ENUMS & SCHEMAS (SI Billing)
// ============================================================================

export const MILESTONE_PHASES = ['assessment', 'migration'] as const;
export type MilestonePhase = (typeof MILESTONE_PHASES)[number];
export const milestonePhaseSchema = z.enum(MILESTONE_PHASES);

export const MILESTONE_TRIGGER_TYPES = ['automatic', 'admin_approved'] as const;
export type MilestoneTriggerType = (typeof MILESTONE_TRIGGER_TYPES)[number];
export const milestoneTriggerTypeSchema = z.enum(MILESTONE_TRIGGER_TYPES);

export const MILESTONE_STATUSES = [
  'pending',
  'requested',
  'completed',
  'invoiced',
  'paid',
  'overdue',
  'voided',
] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];
export const milestoneStatusSchema = z.enum(MILESTONE_STATUSES);

export const PAID_VIA_OPTIONS = ['stripe_invoice', 'carried_credit'] as const;
export type PaidVia = (typeof PAID_VIA_OPTIONS)[number];
export const paidViaSchema = z.enum(PAID_VIA_OPTIONS);

// FeeMilestoneEntity, FeeAgreementTierEntity, and repository interfaces
// are defined in ./repositories/types.ts (following existing pattern)

// ============================================================================
// AUTH SCHEMAS & ROLE DEFINITIONS
// ============================================================================

/**
 * User Roles
 *
 * - system_admin: Platform super admin (god mode)
 * - org_owner: Tenant owner, billing, full access
 * - admin: Full operational access, all projects
 * - operator: Does migration work on assigned projects
 * - reviewer: View-only + remarks on assigned projects
 */
export const ALL_ROLES = ['system_admin', 'org_owner', 'admin', 'operator', 'reviewer'] as const;

export type UserRole = (typeof ALL_ROLES)[number];

/** Roles that can manage the organization (invite users, manage settings) */
export const ORG_ADMIN_ROLES: UserRole[] = ['org_owner', 'admin'];

/** Roles scoped to specific projects (need project_members assignment) */
export const PROJECT_SCOPED_ROLES: UserRole[] = ['operator', 'reviewer'];

/** Roles with org-wide access (see all projects) */
export const ORG_WIDE_ROLES: UserRole[] = ['org_owner', 'admin'];

// ============================================================================
// INTERNAL ADMIN PERMISSIONS (separate from tenant roles)
// ============================================================================

/**
 * Named admin role definitions with their permission sets.
 * These are internal platform roles, NOT tenant application roles.
 */
export const ADMIN_ROLE_DEFINITIONS = {
  super_admin: {
    permissions: ['*'],
    description: 'Full platform access (break-glass)',
  },
  support_admin: {
    permissions: [
      'support:read',
      'support:reply',
      'impersonate:read_only',
      'users:read',
      'tenants:read',
      'audit:read',
    ],
    description: 'Support tickets + read-only impersonation',
  },
  billing_admin: {
    permissions: [
      'billing:read',
      'billing:refund',
      'plans:read',
      'plans:write',
      'coupons:read',
      'coupons:write',
    ],
    description: 'Billing, plans, and coupons',
  },
  security_admin: {
    permissions: ['users:read', 'users:write', 'tenants:read', 'audit:read', 'audit:export'],
    description: 'User management and security',
  },
  readonly_admin: {
    permissions: [
      'users:read',
      'tenants:read',
      'plans:read',
      'coupons:read',
      'support:read',
      'billing:read',
      'audit:read',
      'stats:read',
      'jobs:read',
    ],
    description: 'View all admin pages, no mutations',
  },
  compliance_auditor: {
    permissions: ['audit:read', 'audit:export'],
    description: 'Audit log access only',
  },
} as const;

export type AdminRoleName = keyof typeof ADMIN_ROLE_DEFINITIONS;

/**
 * Check if role is an org admin role (can invite users, manage org)
 */
export function isOrgAdminRole(role: UserRole): boolean {
  return ORG_ADMIN_ROLES.includes(role);
}

/**
 * Check if role is project-scoped (needs explicit project assignment)
 */
export function isProjectScopedRole(role: UserRole): boolean {
  return PROJECT_SCOPED_ROLES.includes(role);
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
  'org_owner',
  'admin',
  'operator',
  'reviewer',
]);

export const fullNameSchema = z
  .string()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name too long')
  .trim();

export const uuidSchema = z.string().uuid('Invalid ID format');

/**
 * Request Schemas
 */
export const onboardOrganizationSchema = z.object({
  organization: z.object({
    name: z.string().min(2).max(255),
    seatLimit: z.number().int().min(1).max(1000).default(5),
    planId: uuidSchema.optional(),
  }),
  admin: z.object({
    email: emailSchema,
    fullName: fullNameSchema,
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

// ============================================================================
// Salesforce Integration Schemas
// ============================================================================

/**
 * Stakeholder schema for project migration context.
 */
export const StakeholderSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  role: z.string().min(1, 'Role is required'),
  email: z.string().email('Invalid email format'),
});

export const StakeholdersSchema = z.array(StakeholderSchema).nullable();

export type Stakeholder = z.infer<typeof StakeholderSchema>;

/**
 * Salesforce connection role — source org (CPQ) or target org (RCA).
 */
export const SalesforceConnectionRoleSchema = z.enum(['source', 'target']);
export type SalesforceConnectionRole = z.infer<typeof SalesforceConnectionRoleSchema>;

/**
 * Salesforce instance type.
 */
export const SalesforceInstanceTypeSchema = z.enum(['production', 'sandbox']);
export type SalesforceInstanceType = z.infer<typeof SalesforceInstanceTypeSchema>;

/**
 * Salesforce connection status values.
 */
export const SalesforceConnectionStatusSchema = z.enum([
  'active',
  'disconnected',
  'refresh_failed',
  'instance_unreachable',
  'insufficient_permissions',
]);
export type SalesforceConnectionStatus = z.infer<typeof SalesforceConnectionStatusSchema>;

/**
 * Request schema for initiating a Salesforce OAuth connection.
 */
export const ConnectSalesforceRequestSchema = z.object({
  instanceType: SalesforceInstanceTypeSchema,
  connectionRole: SalesforceConnectionRoleSchema,
  loginUrl: z.string().url().optional(),
});

export type ConnectSalesforceRequest = z.infer<typeof ConnectSalesforceRequestSchema>;

/**
 * Request schema for disconnect/test/reconnect operations.
 */
export const SalesforceConnectionRoleRequestSchema = z.object({
  connectionRole: SalesforceConnectionRoleSchema,
});
