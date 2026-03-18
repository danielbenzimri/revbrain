/**
 * Unit tests for WorkLogService
 *
 * Tests work log management: CRUD, status workflow, signatures, attachments.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkLogService, type AuditContext } from './work-log.service.ts';
import type { WorkLogRepository, ProjectRepository, WorkLogEntity } from '@geometrix/contract';

// Mock dependencies
vi.mock('../lib/logger.ts', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('WorkLogService', () => {
  let workLogService: WorkLogService;
  let mockWorkLogRepo: WorkLogRepository;
  let mockProjectRepo: ProjectRepository;

  const mockProject = {
    id: 'project-123',
    organizationId: 'org-123',
    name: 'Test Project',
    status: 'active',
  };

  const mockWorkLog: WorkLogEntity = {
    id: 'worklog-123',
    organizationId: 'org-123',
    projectId: 'project-123',
    logNumber: 1,
    logDate: new Date('2026-02-15'),
    status: 'draft',
    weatherType: 'sunny',
    weatherTempCelsius: 25,
    contractorResources: [],
    externalResources: [],
    resources: [],
    equipment: [],
    contractorWorkDescription: 'Test work',
    supervisorWorkDescription: null,
    contractorNotes: null,
    supervisorNotes: null,
    activities: null,
    issues: null,
    safetyNotes: null,
    trafficControllersInfo: null,
    exactAddress: 'Test Address',
    attachments: [],
    auditLog: [],
    contractorSignatureUrl: null,
    contractorSignedBy: null,
    contractorSignedAt: null,
    inspectorSignatureUrl: null,
    inspectorSignedBy: null,
    inspectorSignedAt: null,
    createdBy: 'user-123',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockContext: AuditContext = {
    userId: 'user-123',
    userName: 'Test User',
    company: 'Test Company',
    role: 'contractor',
  };

  beforeEach(() => {
    mockWorkLogRepo = {
      findById: vi.fn(),
      findByDate: vi.fn(),
      findByProject: vi.fn(),
      findByProjectWithPagination: vi.fn(),
      findByProjectAndStatus: vi.fn(),
      findByDateRange: vi.fn(),
      getNextLogNumber: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as WorkLogRepository;

    mockProjectRepo = {
      findById: vi.fn(),
    } as unknown as ProjectRepository;

    workLogService = new WorkLogService(mockWorkLogRepo, mockProjectRepo);
  });

  // ==========================================================================
  // CREATE WORK LOG
  // ==========================================================================

  describe('createWorkLog', () => {
    it('should create work log successfully', async () => {
      (mockProjectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockProject);
      (mockWorkLogRepo.findByDate as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (mockWorkLogRepo.getNextLogNumber as ReturnType<typeof vi.fn>).mockResolvedValue(1);
      (mockWorkLogRepo.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockWorkLog);

      const result = await workLogService.createWorkLog({
        projectId: 'project-123',
        organizationId: 'org-123',
        createdBy: 'user-123',
        logDate: new Date('2026-02-15'),
        weatherType: 'sunny',
        weatherTempCelsius: 25,
      });

      expect(result).toEqual(mockWorkLog);
      expect(mockWorkLogRepo.create).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when project does not exist', async () => {
      (mockProjectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        workLogService.createWorkLog({
          projectId: 'invalid-project',
          organizationId: 'org-123',
          createdBy: 'user-123',
          logDate: new Date('2026-02-15'),
        })
      ).rejects.toThrow('Project not found');
    });

    it('should throw FORBIDDEN when project belongs to different org', async () => {
      (mockProjectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockProject,
        organizationId: 'different-org',
      });

      await expect(
        workLogService.createWorkLog({
          projectId: 'project-123',
          organizationId: 'org-123',
          createdBy: 'user-123',
          logDate: new Date('2026-02-15'),
        })
      ).rejects.toThrow('Access denied');
    });

    it('should throw BAD_REQUEST when work log already exists for date', async () => {
      (mockProjectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockProject);
      (mockWorkLogRepo.findByDate as ReturnType<typeof vi.fn>).mockResolvedValue(mockWorkLog);

      await expect(
        workLogService.createWorkLog({
          projectId: 'project-123',
          organizationId: 'org-123',
          createdBy: 'user-123',
          logDate: new Date('2026-02-15'),
        })
      ).rejects.toThrow('A work log already exists for this date');
    });
  });

  // ==========================================================================
  // UPDATE WORK LOG
  // ==========================================================================

  describe('updateWorkLog', () => {
    it('should update work log successfully', async () => {
      const updatedWorkLog = { ...mockWorkLog, contractorWorkDescription: 'Updated work' };
      (mockWorkLogRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockWorkLog);
      (mockWorkLogRepo.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedWorkLog);

      const result = await workLogService.updateWorkLog(
        'worklog-123',
        { contractorWorkDescription: 'Updated work' },
        mockContext
      );

      expect(result.contractorWorkDescription).toBe('Updated work');
    });

    it('should throw NOT_FOUND when work log does not exist', async () => {
      (mockWorkLogRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        workLogService.updateWorkLog(
          'invalid-id',
          { contractorWorkDescription: 'Test' },
          mockContext
        )
      ).rejects.toThrow('Work log not found');
    });

    it('should throw BAD_REQUEST when editing approved log as non-admin', async () => {
      (mockWorkLogRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockWorkLog,
        status: 'approved',
      });

      await expect(
        workLogService.updateWorkLog(
          'worklog-123',
          { contractorWorkDescription: 'Test' },
          mockContext
        )
      ).rejects.toThrow('Cannot edit an approved work log');
    });

    it('should allow admin to edit approved log', async () => {
      const approvedLog = { ...mockWorkLog, status: 'approved' as const };
      const updatedLog = { ...approvedLog, contractorWorkDescription: 'Admin update' };
      (mockWorkLogRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(approvedLog);
      (mockWorkLogRepo.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedLog);

      const adminContext: AuditContext = { ...mockContext, role: 'admin' };
      const result = await workLogService.updateWorkLog(
        'worklog-123',
        { contractorWorkDescription: 'Admin update' },
        adminContext
      );

      expect(result.contractorWorkDescription).toBe('Admin update');
    });

    it('should throw BAD_REQUEST when both parties have signed', async () => {
      (mockWorkLogRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockWorkLog,
        contractorSignedAt: new Date(),
        inspectorSignedAt: new Date(),
      });

      await expect(
        workLogService.updateWorkLog(
          'worklog-123',
          { contractorWorkDescription: 'Test' },
          mockContext
        )
      ).rejects.toThrow('Cannot edit a work log that has been signed by both parties');
    });
  });

  // ==========================================================================
  // DELETE WORK LOG
  // ==========================================================================

  describe('deleteWorkLog', () => {
    it('should delete work log successfully', async () => {
      (mockWorkLogRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockWorkLog);
      (mockWorkLogRepo.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await expect(
        workLogService.deleteWorkLog('worklog-123', 'user-123')
      ).resolves.toBeUndefined();
    });

    it('should throw NOT_FOUND when work log does not exist', async () => {
      (mockWorkLogRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(workLogService.deleteWorkLog('invalid-id', 'user-123')).rejects.toThrow(
        'Work log not found'
      );
    });

    it('should throw BAD_REQUEST when work log is signed', async () => {
      (mockWorkLogRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockWorkLog,
        contractorSignedAt: new Date(),
      });

      await expect(workLogService.deleteWorkLog('worklog-123', 'user-123')).rejects.toThrow(
        'Cannot delete a work log that has been signed'
      );
    });

    it('should throw BAD_REQUEST when work log is approved', async () => {
      (mockWorkLogRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockWorkLog,
        status: 'approved',
      });

      await expect(workLogService.deleteWorkLog('worklog-123', 'user-123')).rejects.toThrow(
        'Cannot delete an approved work log'
      );
    });
  });

  // ==========================================================================
  // STATUS WORKFLOW
  // ==========================================================================

  describe('submitWorkLog', () => {
    it('should submit draft work log', async () => {
      const submittedLog = { ...mockWorkLog, status: 'submitted' as const };
      (mockWorkLogRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockWorkLog);
      (mockWorkLogRepo.update as ReturnType<typeof vi.fn>).mockResolvedValue(submittedLog);

      const result = await workLogService.submitWorkLog('worklog-123', mockContext);

      expect(result.status).toBe('submitted');
    });

    it('should throw NOT_FOUND when work log does not exist', async () => {
      (mockWorkLogRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(workLogService.submitWorkLog('invalid-id', mockContext)).rejects.toThrow(
        'Work log not found'
      );
    });

    it('should throw BAD_REQUEST when work log is not draft', async () => {
      (mockWorkLogRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockWorkLog,
        status: 'submitted',
      });

      await expect(workLogService.submitWorkLog('worklog-123', mockContext)).rejects.toThrow(
        "Cannot submit a work log with status 'submitted'"
      );
    });
  });

  describe('approveWorkLog', () => {
    it('should approve submitted work log as supervisor', async () => {
      const submittedLog = { ...mockWorkLog, status: 'submitted' as const };
      const approvedLog = { ...mockWorkLog, status: 'approved' as const };
      (mockWorkLogRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(submittedLog);
      (mockWorkLogRepo.update as ReturnType<typeof vi.fn>).mockResolvedValue(approvedLog);

      const supervisorContext: AuditContext = { ...mockContext, role: 'supervisor' };
      const result = await workLogService.approveWorkLog('worklog-123', supervisorContext);

      expect(result.status).toBe('approved');
    });

    it('should throw FORBIDDEN when contractor tries to approve', async () => {
      const submittedLog = { ...mockWorkLog, status: 'submitted' as const };
      (mockWorkLogRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(submittedLog);

      await expect(workLogService.approveWorkLog('worklog-123', mockContext)).rejects.toThrow(
        'Contractors cannot approve work logs'
      );
    });

    it('should throw BAD_REQUEST when work log is not submitted', async () => {
      (mockWorkLogRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockWorkLog);

      const supervisorContext: AuditContext = { ...mockContext, role: 'supervisor' };
      await expect(workLogService.approveWorkLog('worklog-123', supervisorContext)).rejects.toThrow(
        "Cannot approve a work log with status 'draft'"
      );
    });
  });

  describe('revertToDraft', () => {
    it('should revert to draft as supervisor', async () => {
      const submittedLog = { ...mockWorkLog, status: 'submitted' as const };
      const draftLog = { ...mockWorkLog, status: 'draft' as const };
      (mockWorkLogRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(submittedLog);
      (mockWorkLogRepo.update as ReturnType<typeof vi.fn>).mockResolvedValue(draftLog);

      const supervisorContext: AuditContext = { ...mockContext, role: 'supervisor' };
      const result = await workLogService.revertToDraft('worklog-123', supervisorContext);

      expect(result.status).toBe('draft');
    });

    it('should throw FORBIDDEN when contractor tries to revert', async () => {
      (mockWorkLogRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockWorkLog);

      await expect(workLogService.revertToDraft('worklog-123', mockContext)).rejects.toThrow(
        'Contractors cannot revert work logs'
      );
    });
  });

  // ==========================================================================
  // SIGNATURES
  // ==========================================================================

  describe('signAsContractor', () => {
    it('should sign as contractor', async () => {
      const signedLog = {
        ...mockWorkLog,
        contractorSignatureUrl: 'https://example.com/sig.png',
        contractorSignedBy: 'user-123',
        contractorSignedAt: new Date(),
      };
      (mockWorkLogRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockWorkLog);
      (mockWorkLogRepo.update as ReturnType<typeof vi.fn>).mockResolvedValue(signedLog);

      const result = await workLogService.signAsContractor(
        'worklog-123',
        mockContext,
        'https://example.com/sig.png'
      );

      expect(result.contractorSignatureUrl).toBe('https://example.com/sig.png');
    });

    it('should throw BAD_REQUEST when already signed by contractor', async () => {
      (mockWorkLogRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockWorkLog,
        contractorSignedAt: new Date(),
      });

      await expect(
        workLogService.signAsContractor('worklog-123', mockContext, 'https://example.com/sig.png')
      ).rejects.toThrow('Work log already signed by contractor');
    });
  });

  describe('signAsInspector', () => {
    it('should sign as inspector after contractor signed', async () => {
      const contractorSignedLog = {
        ...mockWorkLog,
        contractorSignedAt: new Date(),
      };
      const inspectorSignedLog = {
        ...contractorSignedLog,
        inspectorSignatureUrl: 'https://example.com/insp-sig.png',
        inspectorSignedBy: 'inspector-123',
        inspectorSignedAt: new Date(),
      };
      (mockWorkLogRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(contractorSignedLog);
      (mockWorkLogRepo.update as ReturnType<typeof vi.fn>).mockResolvedValue(inspectorSignedLog);

      const inspectorContext: AuditContext = {
        userId: 'inspector-123',
        userName: 'Inspector',
        company: 'Inspection Co',
        role: 'supervisor',
      };
      const result = await workLogService.signAsInspector(
        'worklog-123',
        inspectorContext,
        'https://example.com/insp-sig.png'
      );

      expect(result.inspectorSignatureUrl).toBe('https://example.com/insp-sig.png');
    });

    it('should throw BAD_REQUEST when contractor has not signed', async () => {
      (mockWorkLogRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockWorkLog);

      await expect(
        workLogService.signAsInspector('worklog-123', mockContext, 'https://example.com/sig.png')
      ).rejects.toThrow('Work log must be signed by contractor first');
    });

    it('should throw BAD_REQUEST when already signed by inspector', async () => {
      (mockWorkLogRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockWorkLog,
        contractorSignedAt: new Date(),
        inspectorSignedAt: new Date(),
      });

      await expect(
        workLogService.signAsInspector('worklog-123', mockContext, 'https://example.com/sig.png')
      ).rejects.toThrow('Work log already signed by inspector');
    });
  });

  // ==========================================================================
  // ATTACHMENTS
  // ==========================================================================

  describe('addAttachment', () => {
    it('should add attachment to work log', async () => {
      const attachment = {
        id: 'att-123',
        name: 'photo.jpg',
        url: 'https://example.com/photo.jpg',
        type: 'image',
        uploadedAt: new Date().toISOString(),
      };
      const updatedLog = { ...mockWorkLog, attachments: [attachment] };
      (mockWorkLogRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockWorkLog);
      (mockWorkLogRepo.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedLog);

      const result = await workLogService.addAttachment('worklog-123', attachment, mockContext);

      expect(result.attachments).toHaveLength(1);
      expect(result.attachments?.[0].name).toBe('photo.jpg');
    });

    it('should throw NOT_FOUND when work log does not exist', async () => {
      (mockWorkLogRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        workLogService.addAttachment(
          'invalid-id',
          {
            id: 'att-123',
            name: 'photo.jpg',
            url: '',
            type: 'image',
            uploadedAt: '',
          },
          mockContext
        )
      ).rejects.toThrow('Work log not found');
    });
  });

  describe('removeAttachment', () => {
    it('should remove attachment from work log', async () => {
      const attachment = {
        id: 'att-123',
        name: 'photo.jpg',
        url: 'https://example.com/photo.jpg',
        type: 'image',
        uploadedAt: new Date().toISOString(),
      };
      const logWithAttachment = { ...mockWorkLog, attachments: [attachment] };
      const logWithoutAttachment = { ...mockWorkLog, attachments: [] };
      (mockWorkLogRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(logWithAttachment);
      (mockWorkLogRepo.update as ReturnType<typeof vi.fn>).mockResolvedValue(logWithoutAttachment);

      const result = await workLogService.removeAttachment('worklog-123', 'att-123', mockContext);

      expect(result.attachments).toHaveLength(0);
    });

    it('should throw NOT_FOUND when attachment does not exist', async () => {
      (mockWorkLogRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockWorkLog);

      await expect(
        workLogService.removeAttachment('worklog-123', 'invalid-att', mockContext)
      ).rejects.toThrow('Attachment not found');
    });
  });

  // ==========================================================================
  // SUMMARY
  // ==========================================================================

  describe('getProjectWorkLogSummary', () => {
    it('should return project summary', async () => {
      const logs = [
        { ...mockWorkLog, status: 'draft' as const, contractorSignedAt: new Date() },
        { ...mockWorkLog, id: 'worklog-2', status: 'submitted' as const },
        {
          ...mockWorkLog,
          id: 'worklog-3',
          status: 'approved' as const,
          inspectorSignedAt: new Date(),
        },
      ];
      (mockWorkLogRepo.findByProject as ReturnType<typeof vi.fn>).mockResolvedValue(logs);

      const summary = await workLogService.getProjectWorkLogSummary('project-123');

      expect(summary.totalLogs).toBe(3);
      expect(summary.signedByContractor).toBe(1);
      expect(summary.signedByInspector).toBe(1);
    });
  });
});
