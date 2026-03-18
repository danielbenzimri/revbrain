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
  type: 'contractor' | 'client';
  seatLimit?: number;
  planId?: string | null;
  createdBy?: string | null;
}

export interface UpdateOrganizationInput {
  name?: string;
  slug?: string;
  type?: 'contractor' | 'client';
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
  // Contract metadata
  contractNumber?: string | null;
  contractDate?: Date | null;
  startDate?: Date | null;
  endDate?: Date | null;
  // Contract parties
  contractorName?: string | null;
  contractorId?: string | null;
  clientName?: string | null;
  clientId?: string | null;
  // Contract value and discounts
  contractValueCents?: number;
  globalDiscountPercent?: number;
  chapterDiscounts?: Record<string, number>;
  // Other
  location?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  // Contract metadata
  contractNumber?: string | null;
  contractDate?: Date | null;
  startDate?: Date | null;
  endDate?: Date | null;
  // Contract parties
  contractorName?: string | null;
  contractorId?: string | null;
  clientName?: string | null;
  clientId?: string | null;
  // Contract value and discounts
  contractValueCents?: number;
  globalDiscountPercent?: number;
  chapterDiscounts?: Record<string, number>;
  // Status workflow
  status?: ProjectStatus;
  // Other
  location?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ProjectEntity {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  organizationId: string;
  // Contract metadata
  contractNumber: string | null;
  contractDate: Date | null;
  startDate: Date | null;
  endDate: Date | null;
  // Contract parties
  contractorName: string | null;
  contractorId: string | null;
  clientName: string | null;
  clientId: string | null;
  // Contract value and discounts
  contractValueCents: number;
  globalDiscountPercent: number;
  chapterDiscounts: Record<string, number>;
  // Status workflow
  status: ProjectStatus;
  // Other
  location: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
}

// ============================================================
// BOQ REPOSITORY
// ============================================================

export interface BOQRepository {
  // Base CRUD
  findById(id: string): Promise<BOQItemEntity | null>;
  findMany(options?: FindManyOptions): Promise<BOQItemEntity[]>;
  create(data: CreateBOQItemInput): Promise<BOQItemEntity>;
  createMany(data: CreateBOQItemInput[]): Promise<BOQItemEntity[]>;
  update(id: string, data: UpdateBOQItemInput): Promise<BOQItemEntity | null>;
  delete(id: string): Promise<boolean>;
  count(filter?: Record<string, unknown>): Promise<number>;

  // BOQ-specific queries
  findByProject(projectId: string, options?: FindManyOptions): Promise<BOQItemEntity[]>;
  findByProjectWithTree(projectId: string): Promise<BOQItemEntity[]>;
  findByCode(projectId: string, code: string): Promise<BOQItemEntity | null>;
  findChildren(parentId: string): Promise<BOQItemEntity[]>;
  findRootItems(projectId: string): Promise<BOQItemEntity[]>;
  countByProject(projectId: string): Promise<number>;

  // Bulk operations
  deleteByProject(projectId: string): Promise<number>;
  deactivateByProject(projectId: string): Promise<number>;
}

export interface CreateBOQItemInput {
  organizationId: string;
  projectId: string;
  parentId?: string | null;
  code: string;
  description: string;
  unit?: string | null;
  contractQuantity?: number | null;
  unitPriceCents?: number | null;
  level?: number;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateBOQItemInput {
  code?: string;
  description?: string;
  unit?: string | null;
  contractQuantity?: number | null;
  unitPriceCents?: number | null;
  level?: number;
  sortOrder?: number;
  isActive?: boolean;
  parentId?: string | null;
}

export interface BOQItemEntity {
  id: string;
  organizationId: string;
  projectId: string;
  parentId: string | null;
  code: string;
  description: string;
  unit: string | null;
  contractQuantity: number | null;
  unitPriceCents: number | null;
  level: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Populated in tree queries
  children?: BOQItemEntity[];
}

// ============================================================
// EXECUTION BILL REPOSITORY
// ============================================================

export type BillStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected';

export interface BillRepository {
  // Base CRUD
  findById(id: string): Promise<BillEntity | null>;
  findByIdWithItems(id: string): Promise<BillWithItemsEntity | null>;
  findMany(options?: FindManyOptions): Promise<BillEntity[]>;
  create(data: CreateBillInput): Promise<BillEntity>;
  update(id: string, data: UpdateBillInput): Promise<BillEntity | null>;
  delete(id: string): Promise<boolean>;
  count(filter?: Record<string, unknown>): Promise<number>;

  // Bill-specific queries
  findByProject(projectId: string, options?: FindManyOptions): Promise<BillEntity[]>;
  findByProjectWithPagination(
    projectId: string,
    options?: FindManyOptions
  ): Promise<PaginatedResult<BillEntity>>;
  findByStatus(organizationId: string, status: BillStatus): Promise<BillEntity[]>;
  getNextBillNumber(projectId: string): Promise<number>;
  countByProject(projectId: string): Promise<number>;
}

export interface CreateBillInput {
  organizationId: string;
  projectId: string;
  billNumber: number;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  remarks?: string | null;
  createdBy: string;
}

export interface UpdateBillInput {
  periodStart?: Date | null;
  periodEnd?: Date | null;
  status?: BillStatus;
  remarks?: string | null;
  // Amounts
  subtotalCents?: number;
  discountCents?: number;
  totalCents?: number;
  // Contractor signature
  contractorSignatureUrl?: string | null;
  contractorSignedBy?: string | null;
  contractorSignedAt?: Date | null;
  // Inspector signature
  inspectorSignatureUrl?: string | null;
  inspectorSignedBy?: string | null;
  inspectorSignedAt?: Date | null;
  // Workflow timestamps
  submittedAt?: Date | null;
  approvedAt?: Date | null;
  rejectedAt?: Date | null;
  rejectionReason?: string | null;
}

export interface BillEntity {
  id: string;
  organizationId: string;
  projectId: string;
  billNumber: number;
  periodStart: Date | null;
  periodEnd: Date | null;
  status: BillStatus;
  remarks: string | null;
  // Amounts
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  // Contractor signature
  contractorSignatureUrl: string | null;
  contractorSignedBy: string | null;
  contractorSignedAt: Date | null;
  // Inspector signature
  inspectorSignatureUrl: string | null;
  inspectorSignedBy: string | null;
  inspectorSignedAt: Date | null;
  // Workflow timestamps
  submittedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillWithItemsEntity extends BillEntity {
  items: BillItemEntity[];
}

// ============================================================
// BILL ITEM REPOSITORY
// ============================================================

export interface BillItemRepository {
  // Base CRUD
  findById(id: string): Promise<BillItemEntity | null>;
  findMany(options?: FindManyOptions): Promise<BillItemEntity[]>;
  create(data: CreateBillItemInput): Promise<BillItemEntity>;
  createMany(data: CreateBillItemInput[]): Promise<BillItemEntity[]>;
  update(id: string, data: UpdateBillItemInput): Promise<BillItemEntity | null>;
  updateMany(
    billId: string,
    items: Array<{ id: string; data: UpdateBillItemInput }>
  ): Promise<number>;
  delete(id: string): Promise<boolean>;
  count(filter?: Record<string, unknown>): Promise<number>;

  // Bill item-specific queries
  findByBill(billId: string): Promise<BillItemEntity[]>;
  findByBillWithMeasurements(billId: string): Promise<BillItemWithMeasurementsEntity[]>;
  findByBOQItem(boqItemId: string): Promise<BillItemEntity[]>;
  deleteByBill(billId: string): Promise<number>;
}

export interface CreateBillItemInput {
  billId: string;
  boqItemId?: string | null;
  boqCode: string;
  description: string;
  unit: string | null;
  previousQuantity?: number;
  currentQuantity?: number;
  cumulativeQuantity?: number;
  unitPriceCents: number;
  discountPercent?: number;
  remarks?: string | null;
  isException?: boolean;
}

export interface UpdateBillItemInput {
  previousQuantity?: number;
  currentQuantity?: number;
  cumulativeQuantity?: number;
  unitPriceCents?: number;
  discountPercent?: number;
  remarks?: string | null;
  isException?: boolean;
}

export interface BillItemEntity {
  id: string;
  billId: string;
  boqItemId: string | null;
  boqCode: string;
  description: string;
  unit: string | null;
  previousQuantity: number;
  currentQuantity: number;
  cumulativeQuantity: number;
  unitPriceCents: number;
  discountPercent: number;
  remarks: string | null;
  isException: boolean;
  createdAt: Date;
}

export interface BillItemWithMeasurementsEntity extends BillItemEntity {
  measurements: MeasurementEntity[];
}

// ============================================================
// MEASUREMENT REPOSITORY
// ============================================================

export interface MeasurementRepository {
  // Base CRUD
  findById(id: string): Promise<MeasurementEntity | null>;
  findMany(options?: FindManyOptions): Promise<MeasurementEntity[]>;
  create(data: CreateMeasurementInput): Promise<MeasurementEntity>;
  update(id: string, data: UpdateMeasurementInput): Promise<MeasurementEntity | null>;
  delete(id: string): Promise<boolean>;
  count(filter?: Record<string, unknown>): Promise<number>;

  // Measurement-specific queries
  findByBillItem(billItemId: string): Promise<MeasurementEntity[]>;
  findByBill(billId: string): Promise<MeasurementEntity[]>;
  deleteByBillItem(billItemId: string): Promise<number>;
}

export interface CreateMeasurementInput {
  billItemId: string;
  location?: string | null;
  quantity: number;
  measuredBy: string;
  remarks?: string | null;
}

export interface UpdateMeasurementInput {
  location?: string | null;
  quantity?: number;
  remarks?: string | null;
  approvalSignatureUrl?: string | null;
  approvedBy?: string | null;
  approvedAt?: Date | null;
}

export interface MeasurementEntity {
  id: string;
  billItemId: string;
  location: string | null;
  quantity: number;
  measuredAt: Date;
  measuredBy: string;
  approvalSignatureUrl: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  remarks: string | null;
  createdAt: Date;
}

// ============================================================
// WORK LOG REPOSITORY
// ============================================================

export type WeatherType =
  | 'sunny'
  | 'cloudy'
  | 'rainy'
  | 'stormy'
  | 'snowy'
  | 'foggy'
  | 'windy'
  | 'hot'
  | 'cold';
export type WorkLogStatus = 'draft' | 'submitted' | 'approved';

// Legacy simple resource entry (for backwards compatibility during migration)
export interface ResourceEntry {
  trade: string;
  count: number;
  hours: number;
}

// Enhanced resource entry with dual counts for contractor/supervisor
export interface WorkLogResourceEntry {
  id?: string;
  type: string;
  contractorCount: number;
  supervisorCount: number;
}

export interface EquipmentEntry {
  name: string;
  count: number;
  hours: number;
}

export interface WorkLogAttachment {
  id: string;
  name: string;
  type: string;
  url: string;
  uploadedAt: string;
}

export interface WorkLogAuditEntry {
  id: string;
  userName: string;
  company: string;
  role: string;
  action: string;
  timestamp: string;
}

export interface WorkLogRepository {
  // Base CRUD
  findById(id: string): Promise<WorkLogEntity | null>;
  findMany(options?: FindManyOptions): Promise<WorkLogEntity[]>;
  create(data: CreateWorkLogInput): Promise<WorkLogEntity>;
  update(id: string, data: UpdateWorkLogInput): Promise<WorkLogEntity | null>;
  delete(id: string): Promise<boolean>;
  count(filter?: Record<string, unknown>): Promise<number>;

  // Work log-specific queries
  findByProject(projectId: string, options?: FindManyOptions): Promise<WorkLogEntity[]>;
  findByProjectWithPagination(
    projectId: string,
    options?: FindManyOptions
  ): Promise<PaginatedResult<WorkLogEntity>>;
  findByProjectAndStatus(
    projectId: string,
    status: WorkLogStatus,
    options?: FindManyOptions
  ): Promise<PaginatedResult<WorkLogEntity>>;
  findByDate(projectId: string, date: Date): Promise<WorkLogEntity | null>;
  findByDateRange(projectId: string, startDate: Date, endDate: Date): Promise<WorkLogEntity[]>;
  countByProject(projectId: string): Promise<number>;
  countByProjectAndStatus(projectId: string, status: WorkLogStatus): Promise<number>;
  getNextLogNumber(projectId: string): Promise<number>;
}

export interface CreateWorkLogInput {
  organizationId: string;
  projectId: string;
  logDate: Date;
  weatherType?: WeatherType | null;
  weatherTempCelsius?: number | null;
  // Enhanced resource structure with dual counts
  contractorResources?: WorkLogResourceEntry[];
  externalResources?: WorkLogResourceEntry[];
  // Legacy field (for backwards compatibility)
  resources?: ResourceEntry[];
  equipment?: EquipmentEntry[];
  // Dual description fields
  contractorWorkDescription?: string | null;
  supervisorWorkDescription?: string | null;
  // Dual notes fields
  contractorNotes?: string | null;
  supervisorNotes?: string | null;
  // Legacy fields (for backwards compatibility)
  activities?: string | null;
  issues?: string | null;
  safetyNotes?: string | null;
  // Additional fields
  trafficControllersInfo?: string | null;
  exactAddress?: string | null;
  createdBy: string;
}

export interface UpdateWorkLogInput {
  logDate?: Date;
  status?: WorkLogStatus;
  weatherType?: WeatherType | null;
  weatherTempCelsius?: number | null;
  // Enhanced resource structure
  contractorResources?: WorkLogResourceEntry[];
  externalResources?: WorkLogResourceEntry[];
  // Legacy field (for backwards compatibility)
  resources?: ResourceEntry[];
  equipment?: EquipmentEntry[];
  // Dual description fields
  contractorWorkDescription?: string | null;
  supervisorWorkDescription?: string | null;
  // Dual notes fields
  contractorNotes?: string | null;
  supervisorNotes?: string | null;
  // Legacy fields
  activities?: string | null;
  issues?: string | null;
  safetyNotes?: string | null;
  // Additional fields
  trafficControllersInfo?: string | null;
  exactAddress?: string | null;
  attachments?: WorkLogAttachment[];
  auditLog?: WorkLogAuditEntry[];
  // Contractor signature
  contractorSignatureUrl?: string | null;
  contractorSignedBy?: string | null;
  contractorSignedAt?: Date | null;
  // Inspector signature
  inspectorSignatureUrl?: string | null;
  inspectorSignedBy?: string | null;
  inspectorSignedAt?: Date | null;
}

export interface WorkLogEntity {
  id: string;
  organizationId: string;
  projectId: string;
  logDate: Date;
  logNumber: number | null;
  status: WorkLogStatus;
  weatherType: WeatherType | null;
  weatherTempCelsius: number | null;
  // Enhanced resources with dual counts
  contractorResources: WorkLogResourceEntry[];
  externalResources: WorkLogResourceEntry[];
  // Legacy field (kept for backwards compatibility)
  resources: ResourceEntry[];
  equipment: EquipmentEntry[];
  // Dual description fields
  contractorWorkDescription: string | null;
  supervisorWorkDescription: string | null;
  // Dual notes fields
  contractorNotes: string | null;
  supervisorNotes: string | null;
  // Legacy fields
  activities: string | null;
  issues: string | null;
  safetyNotes: string | null;
  // Additional fields
  trafficControllersInfo: string | null;
  exactAddress: string | null;
  attachments: WorkLogAttachment[];
  auditLog: WorkLogAuditEntry[];
  // Contractor signature
  contractorSignatureUrl: string | null;
  contractorSignedBy: string | null;
  contractorSignedAt: Date | null;
  // Inspector signature
  inspectorSignatureUrl: string | null;
  inspectorSignedBy: string | null;
  inspectorSignedAt: Date | null;
  // Metadata
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkLogSummary {
  totalLogs: number;
  signedByContractor: number;
  signedByInspector: number;
  totalWorkerHours: number;
  totalEquipmentHours: number;
}

// ============================================================
// TASK REPOSITORY
// ============================================================

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface TaskRepository {
  // Base CRUD
  findById(id: string): Promise<TaskEntity | null>;
  findMany(options?: FindManyOptions): Promise<TaskEntity[]>;
  create(data: CreateTaskInput): Promise<TaskEntity>;
  update(id: string, data: UpdateTaskInput): Promise<TaskEntity | null>;
  delete(id: string): Promise<boolean>;
  count(filter?: Record<string, unknown>): Promise<number>;

  // Task-specific queries
  findByProject(projectId: string, options?: FindManyOptions): Promise<TaskEntity[]>;
  findByProjectWithPagination(
    projectId: string,
    options?: FindManyOptions
  ): Promise<PaginatedResult<TaskEntity>>;
  findByProjectAndStatus(
    projectId: string,
    status: TaskStatus,
    options?: FindManyOptions
  ): Promise<TaskEntity[]>;
  findByAssignee(assigneeId: string, options?: FindManyOptions): Promise<TaskEntity[]>;
  countByProject(projectId: string): Promise<number>;
  countByProjectAndStatus(projectId: string, status: TaskStatus): Promise<number>;
  getNextTaskNumber(projectId: string): Promise<number>;

  // Kanban operations
  findGroupedByStatus(projectId: string): Promise<Record<TaskStatus, TaskEntity[]>>;
}

export interface CreateTaskInput {
  organizationId: string;
  projectId: string;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string | null;
  dueDate?: Date | null;
  tags?: string[];
  createdBy: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string | null;
  dueDate?: Date | null;
  tags?: string[];
  sortOrder?: number;
  completedAt?: Date | null;
}

export interface TaskEntity {
  id: string;
  organizationId: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  dueDate: Date | null;
  tags: string[];
  sortOrder: number;
  taskNumber: number | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

// ============================================================
// TASK AUDIT LOG REPOSITORY
// ============================================================

export type TaskAuditAction = 'created' | 'updated' | 'deleted' | 'status_changed';

export interface TaskAuditLogRepository {
  // Audit logs are append-only (no update/delete)
  create(data: CreateTaskAuditLogInput): Promise<TaskAuditLogEntity>;
  findMany(options?: FindManyOptions): Promise<TaskAuditLogEntity[]>;
  count(filter?: Record<string, unknown>): Promise<number>;

  // Query methods
  findByProject(projectId: string, options?: FindManyOptions): Promise<TaskAuditLogEntity[]>;
  findByTask(taskId: string, options?: FindManyOptions): Promise<TaskAuditLogEntity[]>;
}

export interface CreateTaskAuditLogInput {
  organizationId: string;
  projectId: string;
  taskId?: string | null;
  taskTitle: string;
  action: TaskAuditAction;
  userId: string;
  userName: string;
  details?: string | null;
  reason?: string | null;
  signatureUrl?: string | null;
  previousStatus?: TaskStatus | null;
  newStatus?: TaskStatus | null;
}

export interface TaskAuditLogEntity {
  id: string;
  organizationId: string;
  projectId: string;
  taskId: string | null;
  taskTitle: string;
  action: TaskAuditAction;
  userId: string;
  userName: string;
  details: string | null;
  reason: string | null;
  signatureUrl: string | null;
  previousStatus: TaskStatus | null;
  newStatus: TaskStatus | null;
  createdAt: Date;
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
  boq: BOQRepository;
  bills: BillRepository;
  billItems: BillItemRepository;
  measurements: MeasurementRepository;
  workLogs: WorkLogRepository;
  tasks: TaskRepository;
  taskAuditLogs: TaskAuditLogRepository;
}

// ============================================================
// ENGINE TYPE
// ============================================================

export type RepositoryEngine = 'drizzle' | 'supabase';
