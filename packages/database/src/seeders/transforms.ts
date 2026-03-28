/**
 * Entity Mapping Functions
 *
 * Lightweight per-entity transforms from @revbrain/seed-data types
 * to Drizzle insert types. Drizzle handles camelCase -> snake_case
 * mapping automatically when we use schema objects, so these functions
 * mostly ensure type compatibility and handle any gaps between seed
 * data shapes and Drizzle insert types.
 */
import {
  plans,
  organizations,
  users,
  projects,
  auditLogs,
  supportTickets,
  ticketMessages,
  coupons,
  assessmentRuns,
} from '../schema';

import {
  SEED_PLANS,
  SEED_ORGANIZATIONS,
  SEED_USERS,
  SEED_PROJECTS,
  SEED_AUDIT_LOGS,
  SEED_TICKETS,
  SEED_TICKET_MESSAGES,
  SEED_COUPONS,
  SEED_ASSESSMENT_RUNS,
  MOCK_IDS,
} from '@revbrain/seed-data';

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------
export function getPlanInserts(): (typeof plans.$inferInsert)[] {
  return SEED_PLANS.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    description: p.description ?? null,
    price: p.price,
    currency: p.currency,
    interval: p.interval,
    yearlyDiscountPercent: p.yearlyDiscountPercent,
    limits: p.limits,
    features: p.features,
    isActive: p.isActive,
    isPublic: p.isPublic,
    createdAt: p.createdAt instanceof Date ? p.createdAt : new Date(p.createdAt),
    updatedAt: p.updatedAt instanceof Date ? p.updatedAt : new Date(p.updatedAt),
  }));
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------
export function getOrgInserts(): (typeof organizations.$inferInsert)[] {
  return SEED_ORGANIZATIONS.map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    type: o.type,
    seatLimit: o.seatLimit,
    seatUsed: o.seatUsed,
    storageUsedBytes: o.storageUsedBytes,
    planId: o.planId,
    isActive: o.isActive,
    createdAt: o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt),
    createdBy: o.createdBy,
  }));
}

// ---------------------------------------------------------------------------
// Users (initial insert — invitedBy set to null)
// ---------------------------------------------------------------------------
export function getUserInsertsWithoutInvitedBy(): (typeof users.$inferInsert)[] {
  return SEED_USERS.map((u) => ({
    id: u.id,
    supabaseUserId: u.supabaseUserId,
    organizationId: u.organizationId,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    phoneNumber: u.phoneNumber ?? null,
    jobTitle: u.jobTitle ?? null,
    address: u.address ?? null,
    age: u.age ?? null,
    bio: u.bio ?? null,
    avatarUrl: u.avatarUrl ?? null,
    mobileNumber: u.mobileNumber ?? null,
    preferences: u.preferences ?? {},
    metadata: u.metadata ?? {},
    isOrgAdmin: u.isOrgAdmin,
    isActive: u.isActive,
    invitedBy: null, // Set to null initially to avoid FK issues
    createdAt: u.createdAt instanceof Date ? u.createdAt : new Date(u.createdAt),
    activatedAt: u.activatedAt
      ? u.activatedAt instanceof Date
        ? u.activatedAt
        : new Date(u.activatedAt)
      : null,
    lastLoginAt: u.lastLoginAt
      ? u.lastLoginAt instanceof Date
        ? u.lastLoginAt
        : new Date(u.lastLoginAt)
      : null,
  }));
}

// ---------------------------------------------------------------------------
// Users — invitedBy updates (second pass)
// ---------------------------------------------------------------------------
export function getUserInvitedByUpdates(): { id: string; invitedBy: string }[] {
  return SEED_USERS.filter((u) => u.invitedBy !== null).map((u) => ({
    id: u.id,
    invitedBy: u.invitedBy!,
  }));
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
export function getProjectInserts(): (typeof projects.$inferInsert)[] {
  return SEED_PROJECTS.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description ?? null,
    ownerId: p.ownerId,
    organizationId: p.organizationId,
    startDate: p.startDate
      ? p.startDate instanceof Date
        ? p.startDate
        : new Date(p.startDate)
      : null,
    endDate: p.endDate ? (p.endDate instanceof Date ? p.endDate : new Date(p.endDate)) : null,
    status: p.status,
    notes: p.notes ?? null,
    metadata: p.metadata ?? {},
    createdAt: p.createdAt instanceof Date ? p.createdAt : new Date(p.createdAt),
    updatedAt: p.updatedAt instanceof Date ? p.updatedAt : new Date(p.updatedAt),
    completedAt: p.completedAt
      ? p.completedAt instanceof Date
        ? p.completedAt
        : new Date(p.completedAt)
      : null,
    cancelledAt: p.cancelledAt
      ? p.cancelledAt instanceof Date
        ? p.cancelledAt
        : new Date(p.cancelledAt)
      : null,
  }));
}

// ---------------------------------------------------------------------------
// Audit Logs
// ---------------------------------------------------------------------------
export function getAuditLogInserts(): (typeof auditLogs.$inferInsert)[] {
  return SEED_AUDIT_LOGS.map((a) => ({
    id: a.id,
    userId: a.userId ?? null,
    organizationId: a.organizationId ?? null,
    action: a.action,
    targetUserId: a.targetUserId ?? null,
    metadata: a.metadata ?? null,
    ipAddress: a.ipAddress ?? null,
    userAgent: a.userAgent ?? null,
    createdAt: a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt),
  }));
}

// ---------------------------------------------------------------------------
// Support Tickets
// ---------------------------------------------------------------------------
export function getSupportTicketInserts(): (typeof supportTickets.$inferInsert)[] {
  return SEED_TICKETS.map((t) => ({
    id: t.id,
    ticketNumber: t.ticketNumber,
    subject: t.subject,
    description: t.description ?? null,
    status: t.status,
    priority: t.priority,
    category: t.category,
    userId: t.userId,
    organizationId: t.organizationId,
    assignedTo: t.assignedTo ?? null,
    createdAt: t.createdAt instanceof Date ? t.createdAt : new Date(t.createdAt),
    updatedAt: t.updatedAt instanceof Date ? t.updatedAt : new Date(t.updatedAt),
    firstResponseAt: t.firstResponseAt
      ? t.firstResponseAt instanceof Date
        ? t.firstResponseAt
        : new Date(t.firstResponseAt)
      : null,
    resolvedAt: t.resolvedAt
      ? t.resolvedAt instanceof Date
        ? t.resolvedAt
        : new Date(t.resolvedAt)
      : null,
    closedAt: t.closedAt ? (t.closedAt instanceof Date ? t.closedAt : new Date(t.closedAt)) : null,
  }));
}

// ---------------------------------------------------------------------------
// Ticket Messages
//
// The seed data has `senderName` instead of `senderId`. We map senderName
// to the known user IDs. Messages from 'system' type get senderId = null.
// ---------------------------------------------------------------------------
const SENDER_NAME_TO_ID: Record<string, string> = {
  'System Admin': MOCK_IDS.USER_SYSTEM_ADMIN,
  'David Levy': MOCK_IDS.USER_ACME_OWNER,
  'Sarah Cohen': MOCK_IDS.USER_ACME_ADMIN,
  'Mike Johnson': MOCK_IDS.USER_ACME_OPERATOR,
  'Amy Chen': MOCK_IDS.USER_ACME_REVIEWER,
  'Lisa Park': MOCK_IDS.USER_BETA_OWNER,
  'Tom Wilson': MOCK_IDS.USER_BETA_OPERATOR,
};

export function getTicketMessageInserts(): (typeof ticketMessages.$inferInsert)[] {
  return SEED_TICKET_MESSAGES.map((m) => ({
    id: m.id,
    ticketId: m.ticketId,
    senderId: m.senderType === 'system' ? null : (SENDER_NAME_TO_ID[m.senderName] ?? null),
    senderType: m.senderType,
    content: m.content,
    attachments: m.attachments ?? [],
    isInternal: m.isInternal,
    createdAt: m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt),
  }));
}

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------
export function getCouponInserts(): (typeof coupons.$inferInsert)[] {
  return SEED_COUPONS.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    description: c.description ?? null,
    discountType: c.discountType,
    discountValue: c.discountValue,
    currency: c.currency,
    maxUses: c.maxUses ?? null,
    currentUses: c.currentUses,
    maxUsesPerUser: c.maxUsesPerUser ?? 1,
    validFrom: new Date(c.validFrom),
    validUntil: c.validUntil ? new Date(c.validUntil) : null,
    applicablePlanIds: c.applicablePlanIds,
    minimumAmountCents: c.minimumAmountCents,
    duration: c.duration,
    durationInMonths: c.durationInMonths ?? null,
    isActive: c.isActive,
    stripeCouponId: c.stripeCouponId ?? null,
    stripePromotionCodeId: c.stripePromotionCodeId ?? null,
    createdBy: c.createdBy,
    createdAt: c.createdAt instanceof Date ? c.createdAt : new Date(c.createdAt),
    updatedAt: c.updatedAt instanceof Date ? c.updatedAt : new Date(c.updatedAt),
  }));
}

// ---------------------------------------------------------------------------
// Assessment Runs
// ---------------------------------------------------------------------------
export function getAssessmentRunInserts(): (typeof assessmentRuns.$inferInsert)[] {
  return SEED_ASSESSMENT_RUNS.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    organizationId: r.organizationId,
    connectionId: r.connectionId,
    status: r.status,
    statusReason: r.statusReason ?? null,
    mode: r.mode,
    rawSnapshotMode: r.rawSnapshotMode,
    progress: r.progress,
    orgFingerprint: r.orgFingerprint,
    workerId: r.workerId,
    leaseExpiresAt: r.leaseExpiresAt,
    lastHeartbeatAt: r.lastHeartbeatAt,
    retryCount: r.retryCount,
    maxRetries: r.maxRetries,
    idempotencyKey: r.idempotencyKey,
    dispatchedAt: r.dispatchedAt,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    failedAt: r.failedAt,
    cancelRequestedAt: r.cancelRequestedAt,
    durationMs: r.durationMs,
    apiCallsUsed: r.apiCallsUsed,
    recordsExtracted: r.recordsExtracted,
    completenessPct: r.completenessPct,
    error: r.error,
    createdBy: r.createdBy,
    createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
  }));
}
