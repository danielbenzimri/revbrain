import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  jsonb,
  decimal,
} from 'drizzle-orm/pg-core';

// ============================================================================
// PLANS TABLE
// ============================================================================
export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  description: text('description'),
  price: integer('price').notNull().default(0), // Monthly price in cents
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  interval: varchar('interval', { length: 20 }).notNull().default('month'), // Keep for backward compat
  yearlyDiscountPercent: integer('yearly_discount_percent').notNull().default(0), // 0-100
  limits: jsonb('limits').$type<{
    maxUsers: number;
    maxProjects: number;
    storageGB: number;
  }>(),
  features: jsonb('features').$type<{
    aiLevel: 'none' | 'basic' | 'advanced' | 'full';
    modules: string[];
    customBranding: boolean;
    sso: boolean;
  }>(),
  isActive: boolean('is_active').notNull().default(true),
  isPublic: boolean('is_public').notNull().default(false),
  // Stripe integration
  stripeProductId: text('stripe_product_id').unique(),
  stripePriceId: text('stripe_price_id').unique(),
  trialDays: integer('trial_days').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;

// ============================================================================
// ORGANIZATIONS TABLE
// ============================================================================
/**
 * Organizations (Multi-tenant)
 *
 * Each organization represents a customer account.
 * Organizations have seat limits and can invite users up to that limit.
 */
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Identity
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),

  // Type determines which roles are available
  type: varchar('type', { length: 50 }).notNull(), // 'business' | 'individual'

  // Seat management
  seatLimit: integer('seat_limit').notNull().default(5),
  seatUsed: integer('seat_used').notNull().default(0),

  // Storage tracking (in bytes)
  storageUsedBytes: bigint('storage_used_bytes', { mode: 'number' }).notNull().default(0),

  // Subscription
  planId: uuid('plan_id').references(() => plans.id),

  // Stripe integration
  stripeCustomerId: text('stripe_customer_id').unique(),

  // Status
  isActive: boolean('is_active').notNull().default(true),

  // Audit
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by'), // system_admin who onboarded
});

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

// ============================================================================
// USERS TABLE
// ============================================================================
/**
 * Users
 *
 * Users belong to one organization and have a role within that org.
 * Authentication is handled by Supabase, this table stores business data.
 */
export const users = pgTable('users', {
  // Primary key
  id: uuid('id').primaryKey().defaultRandom(),

  // Link to Supabase Auth (CRITICAL: must be unique)
  supabaseUserId: uuid('supabase_user_id').notNull().unique(),

  // Organization membership
  organizationId: uuid('organization_id')
    .references(() => organizations.id)
    .notNull(),

  // Basic info
  email: varchar('email', { length: 255 }).notNull().unique(),
  fullName: varchar('full_name', { length: 255 }).notNull(),

  // Role within organization
  role: varchar('role', { length: 50 }).notNull(),

  // Extended Profile
  phoneNumber: varchar('phone_number', { length: 20 }),
  jobTitle: varchar('job_title', { length: 100 }),
  address: text('address'),
  age: integer('age'),
  bio: text('bio'),
  avatarUrl: text('avatar_url'),
  mobileNumber: varchar('mobile_number', { length: 20 }),
  preferences: jsonb('preferences').default({}),
  metadata: jsonb('metadata').default({}),

  // Org admin flag (CEO/Owner can invite)
  isOrgAdmin: boolean('is_org_admin').notNull().default(false),

  // Account status
  isActive: boolean('is_active').notNull().default(false),

  // Relationships (using any to avoid circular reference)
  invitedBy: uuid('invited_by').references((): any => users.id, { onDelete: 'set null' }),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// ============================================================================
// AUDIT LOGS TABLE
// ============================================================================
/**
 * Audit Logs
 *
 * Tracks all security-relevant events for compliance and debugging.
 */
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Actor (null if system or unauthenticated)
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  organizationId: uuid('organization_id').references(() => organizations.id, {
    onDelete: 'set null',
  }),

  // Action
  action: varchar('action', { length: 100 }).notNull(),
  // Values: 'org.created', 'user.invited', 'user.activated', 'user.login',
  //         'user.logout', 'user.password_changed', 'invite.resent', 'user.deactivated'

  // Context
  targetUserId: uuid('target_user_id').references(() => users.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata'),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),

  // Timestamp
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

// ============================================================================
// PROJECTS TABLE (Enhanced for Legacy Migration)
// ============================================================================
/**
 * Projects
 *
 * Projects for migration work. Each project belongs to an organization
 * and has an owner.
 */
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  ownerId: uuid('owner_id')
    .references(() => users.id)
    .notNull(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),

  // Dates
  startDate: timestamp('start_date', { mode: 'date' }),
  endDate: timestamp('end_date', { mode: 'date' }),

  // Status workflow
  status: varchar('status', { length: 20 }).default('active'),
  // Statuses: draft, active, on_hold, completed, cancelled

  // Additional metadata
  notes: text('notes'),
  metadata: jsonb('metadata').default({}),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

// ============================================================================
// PROJECT MEMBERS TABLE (Project-scoped role assignments)
// ============================================================================
/**
 * Project Members
 *
 * Maps users to projects with a project-scoped role.
 * Used for operator and reviewer roles that are assigned per-project.
 * org_owner and admin roles have org-wide access and don't need entries here.
 */
export const projectMembers = pgTable('project_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  role: varchar('role', { length: 20 }).notNull(), // 'operator' | 'reviewer'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;

// ============================================================================
// SUBSCRIPTIONS TABLE
// ============================================================================
/**
 * Subscriptions
 *
 * Source of truth for billing state. Synced with Stripe via webhooks.
 * Each organization has at most one active subscription.
 */
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  planId: uuid('plan_id')
    .references(() => plans.id)
    .notNull(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),

  // Subscription state: active, trialing, past_due, canceled, unpaid, incomplete
  status: varchar('status', { length: 50 }).notNull().default('active'),

  // Billing period
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),

  // Trial info
  trialStart: timestamp('trial_start', { withTimezone: true }),
  trialEnd: timestamp('trial_end', { withTimezone: true }),

  // Cancellation
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),

  // Cron job tracking
  trialEndingNotifiedAt: timestamp('trial_ending_notified_at', { withTimezone: true }),
  trialEndedNotifiedAt: timestamp('trial_ended_notified_at', { withTimezone: true }),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

// ============================================================================
// PAYMENT HISTORY TABLE
// ============================================================================
/**
 * Payment History
 *
 * Records all payments for audit and display purposes.
 * Populated by Stripe webhooks (invoice.payment_succeeded, etc.)
 */
export const paymentHistory = pgTable('payment_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  stripeInvoiceId: text('stripe_invoice_id').unique(),
  stripePaymentIntentId: text('stripe_payment_intent_id'),

  amountCents: integer('amount_cents').notNull(),
  currency: varchar('currency', { length: 10 }).notNull().default('usd'),

  // Status: succeeded, failed, pending, refunded, partially_refunded
  status: varchar('status', { length: 50 }).notNull(),

  description: text('description'),
  invoicePdfUrl: text('invoice_pdf_url'),
  receiptUrl: text('receipt_url'),

  // Refund tracking
  stripeRefundId: text('stripe_refund_id'),
  refundedAmountCents: integer('refunded_amount_cents'),
  refundedAt: timestamp('refunded_at', { withTimezone: true }),
  refundReason: text('refund_reason'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type PaymentHistory = typeof paymentHistory.$inferSelect;
export type NewPaymentHistory = typeof paymentHistory.$inferInsert;

// ============================================================================
// BILLING EVENTS TABLE
// ============================================================================
/**
 * Billing Events
 *
 * Logs all Stripe webhook events for debugging and idempotency.
 */
export const billingEvents = pgTable('billing_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  stripeEventId: text('stripe_event_id').notNull().unique(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  payload: jsonb('payload').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  error: text('error'),
  // Retry tracking for exponential backoff
  retryCount: integer('retry_count').notNull().default(0),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  maxRetries: integer('max_retries').notNull().default(5),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type BillingEvent = typeof billingEvents.$inferSelect;
export type NewBillingEvent = typeof billingEvents.$inferInsert;

// ============================================================================
// COUPONS TABLE
// ============================================================================
/**
 * Coupons
 *
 * Discount codes that can be applied during checkout.
 * Synced with Stripe Coupons & Promotion Codes.
 */
export const coupons = pgTable('coupons', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Identity
  code: varchar('code', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),

  // Discount type: 'percent' (0-100) or 'fixed' (cents)
  discountType: varchar('discount_type', { length: 20 }).notNull(), // 'percent' | 'fixed'
  discountValue: integer('discount_value').notNull(),
  currency: varchar('currency', { length: 3 }).default('USD'),

  // Usage limits
  maxUses: integer('max_uses'), // null = unlimited
  currentUses: integer('current_uses').notNull().default(0),
  maxUsesPerUser: integer('max_uses_per_user').default(1),

  // Validity period
  validFrom: timestamp('valid_from', { withTimezone: true }).defaultNow().notNull(),
  validUntil: timestamp('valid_until', { withTimezone: true }), // null = no expiry

  // Plan restrictions (empty array = all plans)
  applicablePlanIds: jsonb('applicable_plan_ids').$type<string[]>().default([]),

  // Minimum purchase requirement (cents)
  minimumAmountCents: integer('minimum_amount_cents').default(0),

  // Duration for subscription discounts: 'once', 'forever', 'repeating'
  duration: varchar('duration', { length: 20 }).default('once'),
  durationInMonths: integer('duration_in_months'),

  // Status
  isActive: boolean('is_active').notNull().default(true),

  // Stripe integration
  stripeCouponId: text('stripe_coupon_id').unique(),
  stripePromotionCodeId: text('stripe_promotion_code_id').unique(),

  // Audit
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Coupon = typeof coupons.$inferSelect;
export type NewCoupon = typeof coupons.$inferInsert;

// ============================================================================
// COUPON USAGES TABLE
// ============================================================================
/**
 * Coupon Usages
 *
 * Tracks who used which coupons and when.
 */
export const couponUsages = pgTable('coupon_usages', {
  id: uuid('id').primaryKey().defaultRandom(),
  couponId: uuid('coupon_id')
    .references(() => coupons.id, { onDelete: 'cascade' })
    .notNull(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),

  // Discount amount actually applied (cents)
  discountAmountCents: integer('discount_amount_cents').notNull(),

  // Stripe reference
  stripeInvoiceId: text('stripe_invoice_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),

  // Timestamp
  usedAt: timestamp('used_at', { withTimezone: true }).defaultNow().notNull(),
});

export type CouponUsage = typeof couponUsages.$inferSelect;
export type NewCouponUsage = typeof couponUsages.$inferInsert;

import { relations } from 'drizzle-orm';

// ============================================================================
// RELATIONS
// ============================================================================

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  invitedByUser: one(users, {
    fields: [users.invitedBy],
    references: [users.id],
    relationName: 'inviter',
  }),
  invitees: many(users, {
    relationName: 'inviter',
  }),
}));

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  users: many(users),
  plan: one(plans, {
    fields: [organizations.planId],
    references: [plans.id],
  }),
  subscription: one(subscriptions),
  payments: many(paymentHistory),
}));

export const plansRelations = relations(plans, ({ many }) => ({
  organizations: many(organizations),
  subscriptions: many(subscriptions),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  organization: one(organizations, {
    fields: [subscriptions.organizationId],
    references: [organizations.id],
  }),
  plan: one(plans, {
    fields: [subscriptions.planId],
    references: [plans.id],
  }),
}));

export const paymentHistoryRelations = relations(paymentHistory, ({ one }) => ({
  organization: one(organizations, {
    fields: [paymentHistory.organizationId],
    references: [organizations.id],
  }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, {
    fields: [projects.ownerId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [projects.organizationId],
    references: [organizations.id],
  }),
  // Domain table relations
  chatGroups: many(chatGroups),
  projectFiles: many(projectFiles),
}));

export const couponsRelations = relations(coupons, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [coupons.createdBy],
    references: [users.id],
  }),
  usages: many(couponUsages),
}));

export const couponUsagesRelations = relations(couponUsages, ({ one }) => ({
  coupon: one(coupons, {
    fields: [couponUsages.couponId],
    references: [coupons.id],
  }),
  organization: one(organizations, {
    fields: [couponUsages.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [couponUsages.userId],
    references: [users.id],
  }),
}));

// ============================================================================
// LEADS TABLE
// ============================================================================
/**
 * Leads
 *
 * Enterprise lead capture for sales pipeline management.
 */
export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Contact Information
  contactName: varchar('contact_name', { length: 255 }).notNull(),
  contactEmail: varchar('contact_email', { length: 255 }).notNull(),
  contactPhone: varchar('contact_phone', { length: 50 }),
  companyName: varchar('company_name', { length: 255 }),
  companySize: varchar('company_size', { length: 50 }),
  message: text('message'),

  // Lead Status Pipeline
  status: varchar('status', { length: 50 }).notNull().default('new'),

  // Source Tracking
  source: varchar('source', { length: 50 }).default('website'),
  utmSource: varchar('utm_source', { length: 255 }),
  utmMedium: varchar('utm_medium', { length: 255 }),
  utmCampaign: varchar('utm_campaign', { length: 255 }),

  // CRM Fields
  notes: text('notes'),
  interestLevel: varchar('interest_level', { length: 20 }),
  estimatedValue: integer('estimated_value'),
  nextFollowUpAt: timestamp('next_follow_up_at', { withTimezone: true }),

  // Calendly Integration
  calendlyEventUri: text('calendly_event_uri'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),

  // Assignment & Conversion
  assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  convertedAt: timestamp('converted_at', { withTimezone: true }),
  convertedOrgId: uuid('converted_org_id').references(() => organizations.id, {
    onDelete: 'set null',
  }),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;

// ============================================================================
// LEAD ACTIVITIES TABLE
// ============================================================================
/**
 * Lead Activities
 *
 * Activity log for lead interactions and status changes.
 */
export const leadActivities = pgTable('lead_activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadId: uuid('lead_id')
    .references(() => leads.id, { onDelete: 'cascade' })
    .notNull(),

  // Activity Details
  activityType: varchar('activity_type', { length: 50 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  metadata: jsonb('metadata'),

  // Actor
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type LeadActivity = typeof leadActivities.$inferSelect;
export type NewLeadActivity = typeof leadActivities.$inferInsert;

export const leadsRelations = relations(leads, ({ one, many }) => ({
  assignedToUser: one(users, {
    fields: [leads.assignedTo],
    references: [users.id],
  }),
  convertedOrg: one(organizations, {
    fields: [leads.convertedOrgId],
    references: [organizations.id],
  }),
  activities: many(leadActivities),
}));

export const leadActivitiesRelations = relations(leadActivities, ({ one }) => ({
  lead: one(leads, {
    fields: [leadActivities.leadId],
    references: [leads.id],
  }),
  createdByUser: one(users, {
    fields: [leadActivities.createdBy],
    references: [users.id],
  }),
}));

// ============================================================================
// SUPPORT TICKETS TABLE
// ============================================================================
/**
 * Support Tickets
 *
 * User-created support tickets for issue tracking and resolution.
 */
export const supportTickets = pgTable('support_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Ticket reference (auto-generated, e.g., TIC-1001)
  ticketNumber: varchar('ticket_number', { length: 20 }).notNull().unique(),

  // Content
  subject: varchar('subject', { length: 255 }).notNull(),
  description: text('description'),

  // Status: open, in_progress, waiting_customer, resolved, closed
  status: varchar('status', { length: 50 }).notNull().default('open'),

  // Priority: low, medium, high, urgent
  priority: varchar('priority', { length: 20 }).notNull().default('medium'),

  // Category: billing, technical, feature_request, account, other
  category: varchar('category', { length: 50 }).default('other'),

  // Ownership
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),

  // Assignment (admin handling the ticket)
  assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  firstResponseAt: timestamp('first_response_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),

  // Metadata
  metadata: jsonb('metadata'),
});

export type SupportTicket = typeof supportTickets.$inferSelect;
export type NewSupportTicket = typeof supportTickets.$inferInsert;

// ============================================================================
// TICKET MESSAGES TABLE
// ============================================================================
/**
 * Ticket Messages
 *
 * Conversation thread for support tickets.
 */
export const ticketMessages = pgTable('ticket_messages', {
  id: uuid('id').primaryKey().defaultRandom(),

  ticketId: uuid('ticket_id')
    .references(() => supportTickets.id, { onDelete: 'cascade' })
    .notNull(),

  // Who sent the message
  senderId: uuid('sender_id').references(() => users.id, { onDelete: 'set null' }),
  senderType: varchar('sender_type', { length: 20 }).notNull(), // 'user', 'admin', 'system'

  // Content
  content: text('content').notNull(),

  // Attachments (URLs or file references)
  attachments: jsonb('attachments').$type<string[]>().default([]),

  // Internal notes (visible only to admins)
  isInternal: boolean('is_internal').notNull().default(false),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),

  // Metadata
  metadata: jsonb('metadata'),
});

export type TicketMessage = typeof ticketMessages.$inferSelect;
export type NewTicketMessage = typeof ticketMessages.$inferInsert;

// Relations
export const supportTicketsRelations = relations(supportTickets, ({ one, many }) => ({
  user: one(users, {
    fields: [supportTickets.userId],
    references: [users.id],
    relationName: 'ticketOwner',
  }),
  organization: one(organizations, {
    fields: [supportTickets.organizationId],
    references: [organizations.id],
  }),
  assignedToUser: one(users, {
    fields: [supportTickets.assignedTo],
    references: [users.id],
    relationName: 'ticketAssignee',
  }),
  messages: many(ticketMessages),
}));

export const ticketMessagesRelations = relations(ticketMessages, ({ one }) => ({
  ticket: one(supportTickets, {
    fields: [ticketMessages.ticketId],
    references: [supportTickets.id],
  }),
  sender: one(users, {
    fields: [ticketMessages.senderId],
    references: [users.id],
  }),
}));

// ============================================================================
// JOB QUEUE TABLE
// ============================================================================
export const jobQueue = pgTable('job_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: varchar('type', { length: 100 }).notNull(),
  payload: jsonb('payload').notNull().default({}),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  priority: integer('priority').notNull().default(0),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  lastError: text('last_error'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).defaultNow().notNull(),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  lockedBy: varchar('locked_by', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
  organizationId: uuid('organization_id').references(() => organizations.id, {
    onDelete: 'set null',
  }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').default({}),
});

export type Job = typeof jobQueue.$inferSelect;
export type NewJob = typeof jobQueue.$inferInsert;

export const jobQueueRelations = relations(jobQueue, ({ one }) => ({
  organization: one(organizations, {
    fields: [jobQueue.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [jobQueue.userId],
    references: [users.id],
  }),
}));

// ============================================================================
// CHAT GROUPS TABLE
// ============================================================================
export const chatGroups = pgTable('chat_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),

  // Access control
  isPrivate: boolean('is_private').notNull().default(false),
  members: jsonb('members').$type<string[]>().notNull().default([]),
  admins: jsonb('admins').$type<string[]>().notNull().default([]),

  // Activity
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  messageCount: integer('message_count').notNull().default(0),

  // Metadata
  createdBy: uuid('created_by')
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type ChatGroup = typeof chatGroups.$inferSelect;
export type NewChatGroup = typeof chatGroups.$inferInsert;

// ============================================================================
// CHAT MESSAGES TABLE
// ============================================================================
export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id')
    .references(() => chatGroups.id, { onDelete: 'cascade' })
    .notNull(),
  senderId: uuid('sender_id')
    .references(() => users.id)
    .notNull(),

  // Content
  content: text('content'),
  messageType: varchar('message_type', { length: 20 }).notNull().default('text'),

  // Attachments
  fileUrl: text('file_url'),
  fileName: varchar('file_name', { length: 255 }),
  fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }),
  thumbnailUrl: text('thumbnail_url'),

  // Location
  locationLat: decimal('location_lat', { precision: 10, scale: 8 }),
  locationLng: decimal('location_lng', { precision: 11, scale: 8 }),
  locationName: text('location_name'),

  // Reply/Thread
  replyToId: uuid('reply_to_id').references((): any => chatMessages.id, { onDelete: 'set null' }),

  // Reactions
  reactions: jsonb('reactions').$type<Record<string, string[]>>().notNull().default({}),

  // Status
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  editedAt: timestamp('edited_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;

// ============================================================================
// PROJECT FILES TABLE
// ============================================================================
export const projectFiles = pgTable('project_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),

  // File info
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileType: varchar('file_type', { length: 50 }),
  storagePath: text('storage_path').notNull(),
  fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }).notNull().default(0),
  mimeType: varchar('mime_type', { length: 100 }),

  // Thumbnails
  thumbnailPath: text('thumbnail_path'),
  previewPath: text('preview_path'),

  // Organization
  folderPath: varchar('folder_path', { length: 500 }).notNull().default('/'),

  // Metadata
  metadata: jsonb('metadata').notNull().default({}),

  // Audit
  uploadedBy: uuid('uploaded_by')
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type ProjectFile = typeof projectFiles.$inferSelect;
export type NewProjectFile = typeof projectFiles.$inferInsert;

// ============================================================================
// DOMAIN TABLE RELATIONS
// ============================================================================

export const chatGroupsRelations = relations(chatGroups, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [chatGroups.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, {
    fields: [chatGroups.projectId],
    references: [projects.id],
  }),
  createdByUser: one(users, {
    fields: [chatGroups.createdBy],
    references: [users.id],
  }),
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  group: one(chatGroups, {
    fields: [chatMessages.groupId],
    references: [chatGroups.id],
  }),
  sender: one(users, {
    fields: [chatMessages.senderId],
    references: [users.id],
  }),
  replyTo: one(chatMessages, {
    fields: [chatMessages.replyToId],
    references: [chatMessages.id],
    relationName: 'messageReply',
  }),
}));

export const projectFilesRelations = relations(projectFiles, ({ one }) => ({
  organization: one(organizations, {
    fields: [projectFiles.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, {
    fields: [projectFiles.projectId],
    references: [projects.id],
  }),
  uploadedByUser: one(users, {
    fields: [projectFiles.uploadedBy],
    references: [users.id],
  }),
}));

// ============================================================================
// ADMIN ROLE DEFINITIONS TABLE
// ============================================================================
/**
 * Named admin role definitions with permission sets.
 * Separate from tenant roles (org_owner, admin, operator, reviewer).
 *
 * Pre-defined roles: super_admin, support_admin, billing_admin,
 * security_admin, readonly_admin, compliance_auditor
 */
export const adminRoleDefinitions = pgTable('admin_role_definitions', {
  roleName: varchar('role_name', { length: 50 }).primaryKey(),
  permissions: jsonb('permissions').$type<string[]>().notNull(), // e.g., ['users:read', 'users:write', ...]
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type AdminRoleDefinition = typeof adminRoleDefinitions.$inferSelect;
export type NewAdminRoleDefinition = typeof adminRoleDefinitions.$inferInsert;

// ============================================================================
// ADMIN ROLE ASSIGNMENTS TABLE
// ============================================================================
/**
 * Junction table: which admin users have which admin roles.
 * A user can have multiple admin roles.
 */
export const adminRoleAssignments = pgTable('admin_role_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  roleName: varchar('role_name', { length: 50 })
    .notNull()
    .references(() => adminRoleDefinitions.roleName),
  grantedBy: uuid('granted_by').references(() => users.id),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
});

export type AdminRoleAssignment = typeof adminRoleAssignments.$inferSelect;
export type NewAdminRoleAssignment = typeof adminRoleAssignments.$inferInsert;

// ============================================================================
// ADMIN NOTIFICATIONS TABLE
// ============================================================================
/**
 * In-app notifications for admin users.
 * Supports severity levels (critical, warning, info) and dedup via type+metadata.entityId.
 */
export const adminNotifications = pgTable('admin_notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminUserId: uuid('admin_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(), // e.g., 'high_priority_ticket', 'failed_payment', 'dead_job'
  severity: varchar('severity', { length: 20 }).notNull(), // 'critical', 'warning', 'info'
  title: varchar('title', { length: 200 }).notNull(),
  message: text('message').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type AdminNotification = typeof adminNotifications.$inferSelect;
export type NewAdminNotification = typeof adminNotifications.$inferInsert;
