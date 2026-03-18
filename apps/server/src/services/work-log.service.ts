/**
 * Work Log Service
 *
 * Handles daily work log management including CRUD operations,
 * signature capture, resources/equipment tracking, status workflow, and exports.
 *
 * Status workflow:
 *   draft → submitted → approved
 *
 * Role-based editing:
 *   - Contractors edit: contractorResources, contractorWorkDescription, contractorNotes
 *   - Supervisors edit: externalResources, supervisorWorkDescription, supervisorNotes
 */

import * as XLSX from 'xlsx';
import type {
  WorkLogRepository,
  ProjectRepository,
  WorkLogEntity,
  CreateWorkLogInput,
  UpdateWorkLogInput,
  PaginatedResult,
  FindManyOptions,
  WeatherType,
  WorkLogStatus,
  ResourceEntry,
  EquipmentEntry,
  WorkLogResourceEntry,
  WorkLogAttachment,
  WorkLogAuditEntry,
  WorkLogSummary,
} from '@revbrain/contract';
import { AppError, ErrorCodes } from '@revbrain/contract';
import { logger } from '../lib/logger.ts';

// ============================================================================
// TYPES
// ============================================================================

export type WorkLogUserRole = 'contractor' | 'supervisor' | 'admin';

export interface CreateWorkLogRequest {
  projectId: string;
  organizationId: string;
  createdBy: string;
  logDate: Date;
  weatherType?: WeatherType | null;
  weatherTempCelsius?: number | null;
  // Enhanced resources (new)
  contractorResources?: WorkLogResourceEntry[];
  externalResources?: WorkLogResourceEntry[];
  // Legacy resources (backwards compatibility)
  resources?: ResourceEntry[];
  equipment?: EquipmentEntry[];
  // Dual descriptions
  contractorWorkDescription?: string | null;
  supervisorWorkDescription?: string | null;
  // Dual notes
  contractorNotes?: string | null;
  supervisorNotes?: string | null;
  // Legacy fields
  activities?: string | null;
  issues?: string | null;
  safetyNotes?: string | null;
  // Additional fields
  trafficControllersInfo?: string | null;
  exactAddress?: string | null;
}

export interface UpdateWorkLogRequest extends Partial<
  Omit<CreateWorkLogRequest, 'projectId' | 'organizationId' | 'createdBy'>
> {
  status?: WorkLogStatus;
  attachments?: WorkLogAttachment[];
}

export interface AuditContext {
  userId: string;
  userName: string;
  company: string;
  role: WorkLogUserRole;
}

// ============================================================================
// SERVICE
// ============================================================================

export class WorkLogService {
  constructor(
    private workLogRepo: WorkLogRepository,
    private projectRepo: ProjectRepository
  ) {}

  // ==========================================================================
  // WORK LOG CRUD
  // ==========================================================================

  async createWorkLog(data: CreateWorkLogRequest): Promise<WorkLogEntity> {
    // Verify project exists and belongs to organization
    const project = await this.projectRepo.findById(data.projectId);
    if (!project) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Project not found', 404);
    }
    if (project.organizationId !== data.organizationId) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied', 403);
    }

    // Check if work log already exists for this date
    const existingLog = await this.workLogRepo.findByDate(data.projectId, data.logDate);
    if (existingLog) {
      throw new AppError(
        ErrorCodes.BAD_REQUEST,
        'A work log already exists for this date. Use update instead.',
        400
      );
    }

    // Get next log number for this project
    const logNumber = await this.workLogRepo.getNextLogNumber(data.projectId);

    const workLogInput: CreateWorkLogInput = {
      organizationId: data.organizationId,
      projectId: data.projectId,
      logDate: data.logDate,
      weatherType: data.weatherType ?? null,
      weatherTempCelsius: data.weatherTempCelsius ?? null,
      // Enhanced resources
      contractorResources: data.contractorResources ?? [],
      externalResources: data.externalResources ?? [],
      // Legacy resources (backwards compatibility)
      resources: data.resources ?? [],
      equipment: data.equipment ?? [],
      // Dual descriptions
      contractorWorkDescription: data.contractorWorkDescription ?? null,
      supervisorWorkDescription: data.supervisorWorkDescription ?? null,
      // Dual notes
      contractorNotes: data.contractorNotes ?? null,
      supervisorNotes: data.supervisorNotes ?? null,
      // Legacy fields
      activities: data.activities ?? null,
      issues: data.issues ?? null,
      safetyNotes: data.safetyNotes ?? null,
      // Additional fields
      trafficControllersInfo: data.trafficControllersInfo ?? null,
      exactAddress: data.exactAddress ?? null,
      createdBy: data.createdBy,
    };

    // Note: logNumber is set by trigger in database, but we track it for logging
    const workLog = await this.workLogRepo.create(workLogInput);

    logger.info('Work log created', {
      workLogId: workLog.id,
      projectId: data.projectId,
      logNumber,
      logDate: data.logDate.toISOString(),
      userId: data.createdBy,
    });

    return workLog;
  }

  async getWorkLog(workLogId: string): Promise<WorkLogEntity | null> {
    return this.workLogRepo.findById(workLogId);
  }

  async getWorkLogByDate(projectId: string, date: Date): Promise<WorkLogEntity | null> {
    return this.workLogRepo.findByDate(projectId, date);
  }

  async getWorkLogsByProject(
    projectId: string,
    options?: FindManyOptions
  ): Promise<PaginatedResult<WorkLogEntity>> {
    return this.workLogRepo.findByProjectWithPagination(projectId, options);
  }

  async getWorkLogsByProjectAndStatus(
    projectId: string,
    status: WorkLogStatus,
    options?: FindManyOptions
  ): Promise<PaginatedResult<WorkLogEntity>> {
    return this.workLogRepo.findByProjectAndStatus(projectId, status, options);
  }

  async getWorkLogsByDateRange(
    projectId: string,
    startDate: Date,
    endDate: Date
  ): Promise<WorkLogEntity[]> {
    return this.workLogRepo.findByDateRange(projectId, startDate, endDate);
  }

  async updateWorkLog(
    workLogId: string,
    data: UpdateWorkLogRequest,
    context: AuditContext
  ): Promise<WorkLogEntity> {
    const workLog = await this.workLogRepo.findById(workLogId);
    if (!workLog) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Work log not found', 404);
    }

    // Don't allow editing approved logs (except by admin)
    if (workLog.status === 'approved' && context.role !== 'admin') {
      throw new AppError(ErrorCodes.BAD_REQUEST, 'Cannot edit an approved work log', 400);
    }

    // Don't allow editing if both signatures are present
    if (workLog.contractorSignedAt && workLog.inspectorSignedAt) {
      throw new AppError(
        ErrorCodes.BAD_REQUEST,
        'Cannot edit a work log that has been signed by both parties',
        400
      );
    }

    // Build update data based on role
    const updateData: UpdateWorkLogInput = {
      ...this.filterUpdateByRole(data, context.role),
    };

    // Add audit entry
    const auditEntry = this.createAuditEntry(context, 'updated');
    updateData.auditLog = [...(workLog.auditLog || []), auditEntry];

    const updated = await this.workLogRepo.update(workLogId, updateData);
    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to update work log', 500);
    }

    logger.info('Work log updated', { workLogId, userId: context.userId, role: context.role });

    return updated;
  }

  async deleteWorkLog(workLogId: string, userId: string): Promise<void> {
    const workLog = await this.workLogRepo.findById(workLogId);
    if (!workLog) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Work log not found', 404);
    }

    // Don't allow deleting if any signature is present
    if (workLog.contractorSignedAt || workLog.inspectorSignedAt) {
      throw new AppError(
        ErrorCodes.BAD_REQUEST,
        'Cannot delete a work log that has been signed',
        400
      );
    }

    // Don't allow deleting approved logs
    if (workLog.status === 'approved') {
      throw new AppError(ErrorCodes.BAD_REQUEST, 'Cannot delete an approved work log', 400);
    }

    await this.workLogRepo.delete(workLogId);

    logger.info('Work log deleted', { workLogId, userId });
  }

  // ==========================================================================
  // STATUS WORKFLOW
  // ==========================================================================

  async submitWorkLog(workLogId: string, context: AuditContext): Promise<WorkLogEntity> {
    const workLog = await this.workLogRepo.findById(workLogId);
    if (!workLog) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Work log not found', 404);
    }

    if (workLog.status !== 'draft') {
      throw new AppError(
        ErrorCodes.BAD_REQUEST,
        `Cannot submit a work log with status '${workLog.status}'`,
        400
      );
    }

    const auditEntry = this.createAuditEntry(context, 'submitted');

    const updated = await this.workLogRepo.update(workLogId, {
      status: 'submitted',
      auditLog: [...(workLog.auditLog || []), auditEntry],
    });

    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to submit work log', 500);
    }

    logger.info('Work log submitted', { workLogId, userId: context.userId });

    return updated;
  }

  async approveWorkLog(workLogId: string, context: AuditContext): Promise<WorkLogEntity> {
    const workLog = await this.workLogRepo.findById(workLogId);
    if (!workLog) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Work log not found', 404);
    }

    if (workLog.status !== 'submitted') {
      throw new AppError(
        ErrorCodes.BAD_REQUEST,
        `Cannot approve a work log with status '${workLog.status}'`,
        400
      );
    }

    // Supervisors can approve, contractors cannot
    if (context.role === 'contractor') {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Contractors cannot approve work logs', 403);
    }

    const auditEntry = this.createAuditEntry(context, 'approved');

    const updated = await this.workLogRepo.update(workLogId, {
      status: 'approved',
      auditLog: [...(workLog.auditLog || []), auditEntry],
    });

    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to approve work log', 500);
    }

    logger.info('Work log approved', { workLogId, userId: context.userId });

    return updated;
  }

  async revertToDraft(workLogId: string, context: AuditContext): Promise<WorkLogEntity> {
    const workLog = await this.workLogRepo.findById(workLogId);
    if (!workLog) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Work log not found', 404);
    }

    // Only admins or supervisors can revert
    if (context.role === 'contractor') {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Contractors cannot revert work logs', 403);
    }

    const auditEntry = this.createAuditEntry(context, 'reverted to draft');

    const updated = await this.workLogRepo.update(workLogId, {
      status: 'draft',
      auditLog: [...(workLog.auditLog || []), auditEntry],
    });

    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to revert work log', 500);
    }

    logger.info('Work log reverted to draft', { workLogId, userId: context.userId });

    return updated;
  }

  // ==========================================================================
  // SIGNATURES
  // ==========================================================================

  async signAsContractor(
    workLogId: string,
    context: AuditContext,
    signatureUrl: string
  ): Promise<WorkLogEntity> {
    const workLog = await this.workLogRepo.findById(workLogId);
    if (!workLog) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Work log not found', 404);
    }

    if (workLog.contractorSignedAt) {
      throw new AppError(ErrorCodes.BAD_REQUEST, 'Work log already signed by contractor', 400);
    }

    const auditEntry = this.createAuditEntry(context, 'signed as contractor');

    const updated = await this.workLogRepo.update(workLogId, {
      contractorSignatureUrl: signatureUrl,
      contractorSignedBy: context.userId,
      contractorSignedAt: new Date(),
      auditLog: [...(workLog.auditLog || []), auditEntry],
    });

    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to sign work log', 500);
    }

    logger.info('Work log signed by contractor', { workLogId, userId: context.userId });

    return updated;
  }

  async signAsInspector(
    workLogId: string,
    context: AuditContext,
    signatureUrl: string
  ): Promise<WorkLogEntity> {
    const workLog = await this.workLogRepo.findById(workLogId);
    if (!workLog) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Work log not found', 404);
    }

    // Require contractor signature first
    if (!workLog.contractorSignedAt) {
      throw new AppError(
        ErrorCodes.BAD_REQUEST,
        'Work log must be signed by contractor first',
        400
      );
    }

    if (workLog.inspectorSignedAt) {
      throw new AppError(ErrorCodes.BAD_REQUEST, 'Work log already signed by inspector', 400);
    }

    const auditEntry = this.createAuditEntry(context, 'signed as inspector');

    const updated = await this.workLogRepo.update(workLogId, {
      inspectorSignatureUrl: signatureUrl,
      inspectorSignedBy: context.userId,
      inspectorSignedAt: new Date(),
      auditLog: [...(workLog.auditLog || []), auditEntry],
    });

    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to sign work log', 500);
    }

    logger.info('Work log signed by inspector', { workLogId, userId: context.userId });

    return updated;
  }

  // ==========================================================================
  // ATTACHMENTS
  // ==========================================================================

  async addAttachment(
    workLogId: string,
    attachment: WorkLogAttachment,
    context: AuditContext
  ): Promise<WorkLogEntity> {
    const workLog = await this.workLogRepo.findById(workLogId);
    if (!workLog) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Work log not found', 404);
    }

    const auditEntry = this.createAuditEntry(context, `added attachment: ${attachment.name}`);

    const updated = await this.workLogRepo.update(workLogId, {
      attachments: [...(workLog.attachments || []), attachment],
      auditLog: [...(workLog.auditLog || []), auditEntry],
    });

    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to add attachment', 500);
    }

    logger.info('Attachment added to work log', { workLogId, attachmentId: attachment.id });

    return updated;
  }

  async removeAttachment(
    workLogId: string,
    attachmentId: string,
    context: AuditContext
  ): Promise<WorkLogEntity> {
    const workLog = await this.workLogRepo.findById(workLogId);
    if (!workLog) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Work log not found', 404);
    }

    const attachment = workLog.attachments?.find((a) => a.id === attachmentId);
    if (!attachment) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Attachment not found', 404);
    }

    const auditEntry = this.createAuditEntry(context, `removed attachment: ${attachment.name}`);

    const updated = await this.workLogRepo.update(workLogId, {
      attachments: workLog.attachments?.filter((a) => a.id !== attachmentId) || [],
      auditLog: [...(workLog.auditLog || []), auditEntry],
    });

    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to remove attachment', 500);
    }

    logger.info('Attachment removed from work log', { workLogId, attachmentId });

    return updated;
  }

  // ==========================================================================
  // EXPORT
  // ==========================================================================

  async exportToExcel(workLogId: string): Promise<Buffer> {
    const workLog = await this.workLogRepo.findById(workLogId);
    if (!workLog) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Work log not found', 404);
    }

    const workbook = XLSX.utils.book_new();

    // Summary sheet
    const summaryData = [
      ['Daily Work Log'],
      [],
      ['Log Number', workLog.logNumber ?? 'N/A'],
      ['Date', workLog.logDate.toISOString().split('T')[0]],
      ['Status', workLog.status],
      ['Weather', workLog.weatherType ?? 'N/A'],
      ['Temperature (°C)', workLog.weatherTempCelsius ?? 'N/A'],
      ['Address', workLog.exactAddress ?? 'N/A'],
      [],
      ['Contractor Work Description'],
      [workLog.contractorWorkDescription ?? 'N/A'],
      [],
      ['Supervisor Work Description'],
      [workLog.supervisorWorkDescription ?? 'N/A'],
      [],
      ['Contractor Notes'],
      [workLog.contractorNotes ?? 'N/A'],
      [],
      ['Supervisor Notes'],
      [workLog.supervisorNotes ?? 'N/A'],
      [],
      ['Traffic Controllers Info'],
      [workLog.trafficControllersInfo ?? 'N/A'],
      [],
      ['Activities (Legacy)'],
      [workLog.activities ?? 'N/A'],
      [],
      ['Issues (Legacy)'],
      [workLog.issues ?? 'N/A'],
      [],
      ['Safety Notes (Legacy)'],
      [workLog.safetyNotes ?? 'N/A'],
      [],
      ['Contractor Signed', workLog.contractorSignedAt ? 'Yes' : 'No'],
      ['Inspector Signed', workLog.inspectorSignedAt ? 'Yes' : 'No'],
    ];

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    // Contractor Resources sheet
    if (workLog.contractorResources && workLog.contractorResources.length > 0) {
      const resourcesData = [
        ['Type', 'Contractor Count', 'Supervisor Count'],
        ...workLog.contractorResources.map((r) => [r.type, r.contractorCount, r.supervisorCount]),
      ];
      const resourcesSheet = XLSX.utils.aoa_to_sheet(resourcesData);
      XLSX.utils.book_append_sheet(workbook, resourcesSheet, 'Contractor Resources');
    }

    // External Resources sheet
    if (workLog.externalResources && workLog.externalResources.length > 0) {
      const resourcesData = [
        ['Type', 'Contractor Count', 'Supervisor Count'],
        ...workLog.externalResources.map((r) => [r.type, r.contractorCount, r.supervisorCount]),
      ];
      const resourcesSheet = XLSX.utils.aoa_to_sheet(resourcesData);
      XLSX.utils.book_append_sheet(workbook, resourcesSheet, 'External Resources');
    }

    // Legacy Resources sheet (backwards compatibility)
    if (workLog.resources.length > 0) {
      const resourcesData = [
        ['Trade', 'Count', 'Hours', 'Total Hours'],
        ...workLog.resources.map((r) => [r.trade, r.count, r.hours, r.count * r.hours]),
      ];
      const resourcesSheet = XLSX.utils.aoa_to_sheet(resourcesData);
      XLSX.utils.book_append_sheet(workbook, resourcesSheet, 'Resources (Legacy)');
    }

    // Equipment sheet
    if (workLog.equipment.length > 0) {
      const equipmentData = [
        ['Equipment', 'Count', 'Hours', 'Total Hours'],
        ...workLog.equipment.map((e) => [e.name, e.count, e.hours, e.count * e.hours]),
      ];
      const equipmentSheet = XLSX.utils.aoa_to_sheet(equipmentData);
      XLSX.utils.book_append_sheet(workbook, equipmentSheet, 'Equipment');
    }

    // Audit Log sheet
    if (workLog.auditLog && workLog.auditLog.length > 0) {
      const auditData = [
        ['Timestamp', 'User', 'Company', 'Role', 'Action'],
        ...workLog.auditLog.map((a) => [a.timestamp, a.userName, a.company, a.role, a.action]),
      ];
      const auditSheet = XLSX.utils.aoa_to_sheet(auditData);
      XLSX.utils.book_append_sheet(workbook, auditSheet, 'Audit Log');
    }

    return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  }

  async exportRangeToExcel(projectId: string, startDate: Date, endDate: Date): Promise<Buffer> {
    const workLogs = await this.workLogRepo.findByDateRange(projectId, startDate, endDate);

    if (workLogs.length === 0) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'No work logs found in date range', 404);
    }

    const workbook = XLSX.utils.book_new();

    // Summary sheet with all work logs
    const summaryData = [
      ['Daily Work Logs Summary'],
      [
        `Period: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
      ],
      [],
      [
        'Log #',
        'Date',
        'Status',
        'Weather',
        'Temp (°C)',
        'Contractor Resources',
        'External Resources',
        'Workers (Legacy)',
        'Equipment',
        'Contractor Signed',
        'Inspector Signed',
      ],
      ...workLogs.map((log) => {
        const totalContractorResources =
          log.contractorResources?.reduce(
            (sum, r) => sum + r.contractorCount + r.supervisorCount,
            0
          ) ?? 0;
        const totalExternalResources =
          log.externalResources?.reduce(
            (sum, r) => sum + r.contractorCount + r.supervisorCount,
            0
          ) ?? 0;
        const totalWorkers = log.resources.reduce((sum, r) => sum + r.count, 0);
        const totalEquipment = log.equipment.reduce((sum, e) => sum + e.count, 0);
        return [
          log.logNumber ?? 'N/A',
          log.logDate.toISOString().split('T')[0],
          log.status,
          log.weatherType ?? 'N/A',
          log.weatherTempCelsius ?? 'N/A',
          totalContractorResources,
          totalExternalResources,
          totalWorkers,
          totalEquipment,
          log.contractorSignedAt ? 'Yes' : 'No',
          log.inspectorSignedAt ? 'Yes' : 'No',
        ];
      }),
    ];

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    // Aggregate contractor resources
    const contractorResourceTotals: Record<string, { contractor: number; supervisor: number }> = {};
    for (const log of workLogs) {
      for (const resource of log.contractorResources || []) {
        if (!contractorResourceTotals[resource.type]) {
          contractorResourceTotals[resource.type] = { contractor: 0, supervisor: 0 };
        }
        contractorResourceTotals[resource.type].contractor += resource.contractorCount;
        contractorResourceTotals[resource.type].supervisor += resource.supervisorCount;
      }
    }

    if (Object.keys(contractorResourceTotals).length > 0) {
      const resourcesData = [
        ['Type', 'Total Contractor Count', 'Total Supervisor Count'],
        ...Object.entries(contractorResourceTotals).map(([type, data]) => [
          type,
          data.contractor,
          data.supervisor,
        ]),
      ];
      const resourcesSheet = XLSX.utils.aoa_to_sheet(resourcesData);
      XLSX.utils.book_append_sheet(workbook, resourcesSheet, 'Contractor Resources');
    }

    // Aggregate external resources
    const externalResourceTotals: Record<string, { contractor: number; supervisor: number }> = {};
    for (const log of workLogs) {
      for (const resource of log.externalResources || []) {
        if (!externalResourceTotals[resource.type]) {
          externalResourceTotals[resource.type] = { contractor: 0, supervisor: 0 };
        }
        externalResourceTotals[resource.type].contractor += resource.contractorCount;
        externalResourceTotals[resource.type].supervisor += resource.supervisorCount;
      }
    }

    if (Object.keys(externalResourceTotals).length > 0) {
      const resourcesData = [
        ['Type', 'Total Contractor Count', 'Total Supervisor Count'],
        ...Object.entries(externalResourceTotals).map(([type, data]) => [
          type,
          data.contractor,
          data.supervisor,
        ]),
      ];
      const resourcesSheet = XLSX.utils.aoa_to_sheet(resourcesData);
      XLSX.utils.book_append_sheet(workbook, resourcesSheet, 'External Resources');
    }

    // Aggregate legacy resources
    const resourceTotals: Record<string, { count: number; hours: number }> = {};
    for (const log of workLogs) {
      for (const resource of log.resources) {
        if (!resourceTotals[resource.trade]) {
          resourceTotals[resource.trade] = { count: 0, hours: 0 };
        }
        resourceTotals[resource.trade].count += resource.count;
        resourceTotals[resource.trade].hours += resource.count * resource.hours;
      }
    }

    if (Object.keys(resourceTotals).length > 0) {
      const resourcesData = [
        ['Trade', 'Total Count', 'Total Hours'],
        ...Object.entries(resourceTotals).map(([trade, data]) => [trade, data.count, data.hours]),
      ];
      const resourcesSheet = XLSX.utils.aoa_to_sheet(resourcesData);
      XLSX.utils.book_append_sheet(workbook, resourcesSheet, 'Resources (Legacy)');
    }

    // Aggregate equipment
    const equipmentTotals: Record<string, { count: number; hours: number }> = {};
    for (const log of workLogs) {
      for (const eq of log.equipment) {
        if (!equipmentTotals[eq.name]) {
          equipmentTotals[eq.name] = { count: 0, hours: 0 };
        }
        equipmentTotals[eq.name].count += eq.count;
        equipmentTotals[eq.name].hours += eq.count * eq.hours;
      }
    }

    if (Object.keys(equipmentTotals).length > 0) {
      const equipmentData = [
        ['Equipment', 'Total Count', 'Total Hours'],
        ...Object.entries(equipmentTotals).map(([name, data]) => [name, data.count, data.hours]),
      ];
      const equipmentSheet = XLSX.utils.aoa_to_sheet(equipmentData);
      XLSX.utils.book_append_sheet(workbook, equipmentSheet, 'Equipment Summary');
    }

    return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  }

  // ==========================================================================
  // SUMMARY
  // ==========================================================================

  async getProjectWorkLogSummary(projectId: string): Promise<WorkLogSummary> {
    const workLogs = await this.workLogRepo.findByProject(projectId);

    let signedByContractor = 0;
    let signedByInspector = 0;
    let totalWorkerHours = 0;
    let totalEquipmentHours = 0;

    // Status counts
    let draftCount = 0;
    let submittedCount = 0;
    let approvedCount = 0;

    // New resource totals
    let totalContractorResources = 0;
    let totalExternalResources = 0;

    for (const log of workLogs) {
      if (log.contractorSignedAt) signedByContractor++;
      if (log.inspectorSignedAt) signedByInspector++;

      // Count by status
      if (log.status === 'draft') draftCount++;
      else if (log.status === 'submitted') submittedCount++;
      else if (log.status === 'approved') approvedCount++;

      // New resource structure
      for (const resource of log.contractorResources || []) {
        totalContractorResources += resource.contractorCount + resource.supervisorCount;
      }
      for (const resource of log.externalResources || []) {
        totalExternalResources += resource.contractorCount + resource.supervisorCount;
      }

      // Legacy resources
      for (const resource of log.resources) {
        totalWorkerHours += resource.count * resource.hours;
      }

      for (const eq of log.equipment) {
        totalEquipmentHours += eq.count * eq.hours;
      }
    }

    return {
      totalLogs: workLogs.length,
      signedByContractor,
      signedByInspector,
      totalWorkerHours,
      totalEquipmentHours,
      // Extended summary (not in base type but useful)
      draftCount,
      submittedCount,
      approvedCount,
      totalContractorResources,
      totalExternalResources,
    } as WorkLogSummary;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private filterUpdateByRole(
    data: UpdateWorkLogRequest,
    role: WorkLogUserRole
  ): UpdateWorkLogInput {
    const updateData: UpdateWorkLogInput = {};

    // Common fields (all roles can update)
    if (data.logDate !== undefined) updateData.logDate = data.logDate;
    if (data.weatherType !== undefined) updateData.weatherType = data.weatherType;
    if (data.weatherTempCelsius !== undefined)
      updateData.weatherTempCelsius = data.weatherTempCelsius;
    if (data.exactAddress !== undefined) updateData.exactAddress = data.exactAddress;
    if (data.trafficControllersInfo !== undefined)
      updateData.trafficControllersInfo = data.trafficControllersInfo;
    if (data.attachments !== undefined) updateData.attachments = data.attachments;

    // Legacy fields (all roles)
    if (data.resources !== undefined) updateData.resources = data.resources;
    if (data.equipment !== undefined) updateData.equipment = data.equipment;
    if (data.activities !== undefined) updateData.activities = data.activities;
    if (data.issues !== undefined) updateData.issues = data.issues;
    if (data.safetyNotes !== undefined) updateData.safetyNotes = data.safetyNotes;

    // Role-specific fields
    if (role === 'contractor' || role === 'admin') {
      if (data.contractorResources !== undefined)
        updateData.contractorResources = data.contractorResources;
      if (data.contractorWorkDescription !== undefined)
        updateData.contractorWorkDescription = data.contractorWorkDescription;
      if (data.contractorNotes !== undefined) updateData.contractorNotes = data.contractorNotes;
    }

    if (role === 'supervisor' || role === 'admin') {
      if (data.externalResources !== undefined)
        updateData.externalResources = data.externalResources;
      if (data.supervisorWorkDescription !== undefined)
        updateData.supervisorWorkDescription = data.supervisorWorkDescription;
      if (data.supervisorNotes !== undefined) updateData.supervisorNotes = data.supervisorNotes;
    }

    // Only admin can change status directly
    if (role === 'admin' && data.status !== undefined) {
      updateData.status = data.status;
    }

    return updateData;
  }

  private createAuditEntry(context: AuditContext, action: string): WorkLogAuditEntry {
    return {
      id: crypto.randomUUID(),
      userName: context.userName,
      company: context.company,
      role: context.role,
      action,
      timestamp: new Date().toISOString(),
    };
  }
}
