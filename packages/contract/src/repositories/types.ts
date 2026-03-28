/**
 * Repository Pattern Interfaces
 *
 * These interfaces define the contract for data access.
 * Implementations can use any backend (Drizzle, Supabase, etc.)
 */

// ============================================================
// BASE REPOSITORY INTERFACE
// ============================================================

export interface FindManyOptions {
  limit?: number;
  offset?: number;
  orderBy?: { field: string; direction: 'asc' | 'desc' };
  filter?: Record<string, unknown>;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface BaseRepository<T, CreateInput, UpdateInput> {
  findById(id: string): Promise<T | null>;
  findMany(options?: FindManyOptions): Promise<T[]>;
  create(data: CreateInput): Promise<T>;
  update(id: string, data: UpdateInput): Promise<T | null>;
  delete(id: string): Promise<boolean>;
  count(filter?: Record<string, unknown>): Promise<number>;
}

// ============================================================
// USER REPOSITORY
// ============================================================

export interface UserRepository {
  // Base CRUD
  findById(id: string): Promise<UserEntity | null>;
  findMany(options?: FindManyOptions): Promise<UserEntity[]>;
  create(data: CreateUserInput): Promise<UserEntity>;
  update(id: string, data: UpdateUserInput): Promise<UserEntity | null>;
  delete(id: string): Promise<boolean>;
  count(filter?: Record<string, unknown>): Promise<number>;

  // User-specific queries
  findByEmail(email: string): Promise<UserEntity | null>;
  findBySupabaseId(supabaseUserId: string): Promise<UserEntity | null>;
  findByOrganization(organizationId: string, options?: FindManyOptions): Promise<UserEntity[]>;

  // User actions
  activate(id: string): Promise<UserEntity | null>;
  deactivate(id: string): Promise<UserEntity | null>;
  updateLastLogin(id: string): Promise<void>;
}

export interface CreateUserInput {
  supabaseUserId: string;
  organizationId: string;
  email: string;
  fullName: string;
  role: string;
  isOrgAdmin?: boolean;
  isActive?: boolean;
  invitedBy?: string | null;
  phoneNumber?: string | null;
  jobTitle?: string | null;
  address?: string | null;
}

export interface UpdateUserInput {
  email?: string;
  fullName?: string;
  role?: string;
  isOrgAdmin?: boolean;
  isActive?: boolean;
  phoneNumber?: string | null;
  jobTitle?: string | null;
  address?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  mobileNumber?: string | null;
  preferences?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UserEntity {
  id: string;
  supabaseUserId: string;
  organizationId: string;
  email: string;
  fullName: string;
  role: string;
  isOrgAdmin: boolean;
  isActive: boolean;
  invitedBy: string | null;
  phoneNumber: string | null;
  jobTitle: string | null;
  address: string | null;
  age: number | null;
  bio: string | null;
  avatarUrl: string | null;
  mobileNumber: string | null;
  preferences: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt?: Date;
  activatedAt: Date | null;
  lastLoginAt: Date | null;
}

// ============================================================
// ORGANIZATION REPOSITORY
// ============================================================

export interface OrganizationRepository {
  // Base CRUD
  findById(id: string): Promise<OrganizationEntity | null>;
  findMany(options?: FindManyOptions): Promise<OrganizationEntity[]>;
  create(data: CreateOrganizationInput): Promise<OrganizationEntity>;
  update(id: string, data: UpdateOrganizationInput): Promise<OrganizationEntity | null>;
  delete(id: string): Promise<boolean>;
  count(filter?: Record<string, unknown>): Promise<number>;

  // Organization-specific queries
  findBySlug(slug: string): Promise<OrganizationEntity | null>;
  findWithPlan(id: string): Promise<OrganizationWithPlan | null>;

  // Seat management
  incrementSeatUsed(id: string): Promise<OrganizationEntity | null>;
  decrementSeatUsed(id: string): Promise<OrganizationEntity | null>;

  /**
   * Atomically increment seat count only if within limit (with grace period).
   * Prevents TOCTOU race condition by checking and incrementing in single SQL operation.
   *
   * @param id - Organization ID
   * @param gracePercentage - Grace period as decimal (0.1 = 10%)
   * @returns Updated organization if successful, null if limit exceeded
   */
  tryIncrementSeatUsed(id: string, gracePercentage?: number): Promise<OrganizationEntity | null>;

  // Storage management
  /**
   * Atomically update storage usage by delta (positive or negative).
   * Uses GREATEST(0, ...) to prevent negative storage values.
   *
   * @param id - Organization ID
   * @param byteDelta - Bytes to add (positive) or remove (negative)
   * @returns New total storage in bytes
   */
  updateStorageUsed(id: string, byteDelta: number): Promise<number>;
}

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  seatLimit?: number;
  planId?: string | null;
  createdBy?: string | null;
}

export interface UpdateOrganizationInput {
  name?: string;
  slug?: string;
  type?: string;
  seatLimit?: number;
  planId?: string | null;
  isActive?: boolean;
}

export interface OrganizationEntity {
  id: string;
  name: string;
  slug: string;
  type: string;
  seatLimit: number;
  seatUsed: number;
  storageUsedBytes: number;
  planId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt?: Date;
  createdBy: string | null;
}

export interface OrganizationWithPlan extends OrganizationEntity {
  plan: PlanEntity | null;
}

// ============================================================
// PLAN REPOSITORY
// ============================================================

export interface PlanRepository {
  // Base CRUD
  findById(id: string): Promise<PlanEntity | null>;
  findMany(options?: FindManyOptions): Promise<PlanEntity[]>;
  create(data: CreatePlanInput): Promise<PlanEntity>;
  update(id: string, data: UpdatePlanInput): Promise<PlanEntity | null>;
  delete(id: string): Promise<boolean>;
  count(filter?: Record<string, unknown>): Promise<number>;

  // Plan-specific queries
  findByCode(code: string): Promise<PlanEntity | null>;
  findByName(name: string): Promise<PlanEntity | null>;
  findActive(): Promise<PlanEntity[]>;
  findPublic(options?: { limit?: number; offset?: number }): Promise<PlanEntity[]>;
}

export interface CreatePlanInput {
  name: string;
  code?: string; // Auto-generated from name if not provided
  description?: string | null;
  price?: number; // Monthly price in cents
  currency?: string;
  interval?: 'month' | 'year'; // Kept for backward compat
  yearlyDiscountPercent?: number; // 0-100
  limits?: PlanLimits;
  features?: PlanFeatures;
  isActive?: boolean;
  isPublic?: boolean;
}

export interface UpdatePlanInput {
  name?: string;
  code?: string;
  description?: string | null;
  price?: number;
  currency?: string;
  interval?: 'month' | 'year';
  yearlyDiscountPercent?: number;
  limits?: PlanLimits;
  features?: PlanFeatures;
  isActive?: boolean;
  isPublic?: boolean;
}

export interface PlanLimits {
  maxUsers: number;
  maxProjects: number;
  storageGB: number;
}

export interface PlanFeatures {
  aiLevel: 'none' | 'basic' | 'advanced' | 'full';
  modules: string[];
  customBranding: boolean;
  sso: boolean;
}

export interface PlanEntity {
  id: string;
  name: string;
  code: string;
  description: string | null;
  price: number; // Monthly price in cents
  currency: string;
  interval: string; // Kept for backward compat
  yearlyDiscountPercent: number; // 0-100
  limits: PlanLimits | null;
  features: PlanFeatures | null;
  isActive: boolean;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// AUDIT LOG REPOSITORY
// ============================================================

export interface AuditLogRepository {
  // Audit logs are append-only (no update/delete)
  create(data: CreateAuditLogInput): Promise<AuditLogEntity>;
  findMany(options?: FindManyOptions): Promise<AuditLogEntity[]>;
  count(filter?: Record<string, unknown>): Promise<number>;

  // Query methods
  findByOrganization(organizationId: string, options?: FindManyOptions): Promise<AuditLogEntity[]>;
  findByUser(userId: string, options?: FindManyOptions): Promise<AuditLogEntity[]>;
  findByAction(action: string, options?: FindManyOptions): Promise<AuditLogEntity[]>;
  findByTargetUser(targetUserId: string, options?: FindManyOptions): Promise<AuditLogEntity[]>;
}

export interface CreateAuditLogInput {
  userId?: string | null;
  organizationId?: string | null;
  action: string;
  targetUserId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditLogEntity {
  id: string;
  userId: string | null;
  organizationId: string | null;
  action: string;
  targetUserId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

// ============================================================
// PROJECT REPOSITORY
// ============================================================

export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'cancelled';

export interface ProjectRepository {
  // Base CRUD
  findById(id: string): Promise<ProjectEntity | null>;
  findMany(options?: FindManyOptions): Promise<ProjectEntity[]>;
  create(data: CreateProjectInput): Promise<ProjectEntity>;
  update(id: string, data: UpdateProjectInput): Promise<ProjectEntity | null>;
  delete(id: string): Promise<boolean>;
  count(filter?: Record<string, unknown>): Promise<number>;

  // Project-specific queries
  findByOwner(ownerId: string, options?: FindManyOptions): Promise<ProjectEntity[]>;
  findByOrganization(organizationId: string, options?: FindManyOptions): Promise<ProjectEntity[]>;
  countByOrganization(organizationId: string): Promise<number>;
}

export interface CreateProjectInput {
  name: string;
  organizationId: string;
  ownerId: string;
  description?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  status?: ProjectStatus;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ProjectEntity {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  organizationId: string;
  startDate: Date | null;
  endDate: Date | null;
  status: ProjectStatus;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
}

// ============================================================
// SALESFORCE CONNECTION ENTITIES
// ============================================================

/**
 * Salesforce connection metadata — does NOT include decrypted tokens.
 * Used for display, status checks, and connection management.
 */
export interface SalesforceConnectionEntity {
  id: string;
  projectId: string;
  organizationId: string;
  connectionRole: 'source' | 'target';
  salesforceOrgId: string;
  salesforceInstanceUrl: string;
  customLoginUrl: string | null;
  oauthBaseUrl: string;
  salesforceUserId: string | null;
  salesforceUsername: string | null;
  instanceType: 'production' | 'sandbox';
  apiVersion: string | null;
  connectionMetadata: Record<string, unknown> | null;
  status: string;
  lastUsedAt: Date | null;
  lastSuccessfulApiCallAt: Date | null;
  lastError: string | null;
  lastErrorAt: Date | null;
  connectedBy: string | null;
  disconnectedBy: string | null;
  disconnectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSalesforceConnectionInput {
  projectId: string;
  organizationId: string;
  connectionRole: 'source' | 'target';
  salesforceOrgId: string;
  salesforceInstanceUrl: string;
  customLoginUrl?: string | null;
  oauthBaseUrl: string;
  salesforceUserId?: string | null;
  salesforceUsername?: string | null;
  instanceType: 'production' | 'sandbox';
  apiVersion?: string | null;
  connectedBy: string;
}

export interface SalesforceConnectionRepository {
  findById(id: string): Promise<SalesforceConnectionEntity | null>;
  findByProjectAndRole(
    projectId: string,
    role: 'source' | 'target'
  ): Promise<SalesforceConnectionEntity | null>;
  findByProject(projectId: string): Promise<SalesforceConnectionEntity[]>;
  findByOrganization(organizationId: string): Promise<SalesforceConnectionEntity[]>;
  findAllActive(): Promise<SalesforceConnectionEntity[]>;
  create(data: CreateSalesforceConnectionInput): Promise<SalesforceConnectionEntity>;
  updateStatus(
    id: string,
    status: string,
    error?: string | null
  ): Promise<SalesforceConnectionEntity | null>;
  updateMetadata(
    id: string,
    metadata: Record<string, unknown>
  ): Promise<SalesforceConnectionEntity | null>;
  disconnect(id: string, disconnectedBy: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}

// ============================================================
// SALESFORCE CONNECTION SECRETS ENTITIES
// ============================================================

/**
 * Decrypted Salesforce OAuth tokens.
 * Only returned from methods that explicitly need tokens (API calls, refresh).
 */
export interface SalesforceConnectionSecretsEntity {
  id: string;
  connectionId: string;
  accessToken: string; // Decrypted
  refreshToken: string; // Decrypted
  encryptionKeyVersion: number;
  tokenVersion: number;
  tokenIssuedAt: Date | null;
  tokenScopes: string | null;
  lastRefreshAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SalesforceConnectionSecretsRepository {
  findByConnectionId(connectionId: string): Promise<SalesforceConnectionSecretsEntity | null>;
  create(
    connectionId: string,
    accessToken: string,
    refreshToken: string,
    scopes?: string
  ): Promise<SalesforceConnectionSecretsEntity>;
  /** Returns null if tokenVersion doesn't match (optimistic lock failed — another process refreshed). */
  updateTokens(
    connectionId: string,
    accessToken: string,
    expectedTokenVersion: number
  ): Promise<SalesforceConnectionSecretsEntity | null>;
  deleteByConnectionId(connectionId: string): Promise<boolean>;
}

// ============================================================
// OAUTH PENDING FLOWS ENTITIES
// ============================================================

export interface OauthPendingFlowEntity {
  nonce: string;
  projectId: string;
  organizationId: string;
  userId: string;
  connectionRole: string;
  codeVerifier: string;
  oauthBaseUrl: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface CreateOauthPendingFlowInput {
  nonce: string;
  projectId: string;
  organizationId: string;
  userId: string;
  connectionRole: string;
  codeVerifier: string;
  oauthBaseUrl: string;
  expiresAt: Date;
}

export interface OauthPendingFlowRepository {
  create(data: CreateOauthPendingFlowInput): Promise<OauthPendingFlowEntity>;
  findByNonce(nonce: string): Promise<OauthPendingFlowEntity | null>;
  deleteByNonce(nonce: string): Promise<boolean>;
  /** Inserts new flow. If a flow exists for the same project+role: replaces if expired, throws if still live. */
  upsertForProject(data: CreateOauthPendingFlowInput): Promise<OauthPendingFlowEntity>;
  /** Checks if a non-expired flow exists for project+role. Used to derive "connecting" status. */
  findLiveByProjectAndRole(projectId: string, role: string): Promise<OauthPendingFlowEntity | null>;
  /** Deletes all expired flows. Returns count of deleted rows. */
  cleanupExpired(): Promise<number>;
}

// ============================================================
// SALESFORCE CONNECTION LOGS ENTITIES
// ============================================================

export interface SalesforceConnectionLogEntity {
  id: string;
  connectionId: string;
  event: string;
  details: Record<string, unknown> | null;
  performedBy: string | null;
  createdAt: Date;
}

export interface CreateSalesforceConnectionLogInput {
  connectionId: string;
  event: string;
  details?: Record<string, unknown> | null;
  performedBy?: string | null;
}

export interface SalesforceConnectionLogRepository {
  create(data: CreateSalesforceConnectionLogInput): Promise<SalesforceConnectionLogEntity>;
  findByConnection(
    connectionId: string,
    options?: FindManyOptions
  ): Promise<SalesforceConnectionLogEntity[]>;
}

// ============================================================
// ASSESSMENT REPOSITORY
// ============================================================

export type AssessmentRunStatus =
  | 'queued'
  | 'dispatched'
  | 'running'
  | 'cancel_requested'
  | 'completed'
  | 'completed_warnings'
  | 'failed'
  | 'cancelled'
  | 'stalled';

export interface AssessmentRunEntity {
  id: string;
  projectId: string;
  organizationId: string;
  connectionId: string;
  status: AssessmentRunStatus;
  statusReason: string | null;
  mode: string;
  rawSnapshotMode: string;
  progress: Record<string, unknown>;
  orgFingerprint: Record<string, unknown> | null;
  workerId: string | null;
  leaseExpiresAt: Date | null;
  lastHeartbeatAt: Date | null;
  retryCount: number;
  maxRetries: number;
  idempotencyKey: string | null;
  dispatchedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  cancelRequestedAt: Date | null;
  durationMs: number | null;
  apiCallsUsed: number | null;
  recordsExtracted: number | null;
  completenessPct: number | null;
  error: string | null;
  createdBy: string | null;
  createdAt: Date;
}

export interface CreateAssessmentRunInput {
  projectId: string;
  organizationId: string;
  connectionId: string;
  mode?: string;
  rawSnapshotMode?: string;
  idempotencyKey?: string;
  createdBy?: string;
}

export interface AssessmentFindingEntity {
  id: string;
  runId: string;
  domain: string;
  collectorName: string;
  artifactType: string;
  artifactName: string;
  artifactId: string | null;
  findingKey: string;
  sourceType: string;
  riskLevel: string | null;
  complexityLevel: string | null;
  migrationRelevance: string | null;
  rcaTargetConcept: string | null;
  rcaMappingComplexity: string | null;
  evidenceRefs: unknown[];
  notes: string | null;
  countValue: number | null;
  textValue: string | null;
  createdAt: Date;
}

export interface AssessmentRepository {
  // Runs
  createRun(data: CreateAssessmentRunInput): Promise<AssessmentRunEntity>;
  findRunById(id: string): Promise<AssessmentRunEntity | null>;
  findRunsByProject(projectId: string, options?: FindManyOptions): Promise<AssessmentRunEntity[]>;
  findActiveRunByOrg(organizationId: string): Promise<AssessmentRunEntity | null>;
  findLatestRunByProject(projectId: string): Promise<AssessmentRunEntity | null>;
  updateRunStatus(
    id: string,
    status: AssessmentRunStatus,
    extra?: Partial<
      Pick<
        AssessmentRunEntity,
        'statusReason' | 'cancelRequestedAt' | 'completedAt' | 'failedAt' | 'error'
      >
    >
  ): Promise<AssessmentRunEntity | null>;
  casDispatch(id: string): Promise<AssessmentRunEntity | null>;

  // Findings
  findFindingsByRun(
    runId: string,
    options?: FindManyOptions & { domain?: string }
  ): Promise<AssessmentFindingEntity[]>;
  countFindingsByRun(runId: string, domain?: string): Promise<number>;

  // Concurrency guard
  countActiveRuns(): Promise<number>;
  countActiveRunsByOrg(organizationId: string): Promise<number>;
}

// ============================================================
// REPOSITORY CONTAINER
// ============================================================

export interface Repositories {
  users: UserRepository;
  organizations: OrganizationRepository;
  plans: PlanRepository;
  auditLogs: AuditLogRepository;
  projects: ProjectRepository;
  salesforceConnections: SalesforceConnectionRepository;
  salesforceConnectionSecrets: SalesforceConnectionSecretsRepository;
  oauthPendingFlows: OauthPendingFlowRepository;
  salesforceConnectionLogs: SalesforceConnectionLogRepository;
  assessmentRuns: AssessmentRepository;
}

// ============================================================
// ENGINE TYPE
// ============================================================

export type RepositoryEngine = 'drizzle' | 'supabase' | 'mock';
