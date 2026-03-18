/**
 * Unit tests for BOQService
 *
 * Tests Bill of Quantities operations: CRUD, hierarchy, Excel import/export.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BOQService } from './boq.service.ts';
import type { BOQRepository, ProjectRepository, BOQItemEntity } from '@revbrain/contract';

// Mock dependencies
vi.mock('../lib/logger.ts', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('BOQService', () => {
  let boqService: BOQService;
  let mockBOQRepo: BOQRepository;
  let mockProjectRepo: ProjectRepository;

  const mockProject = {
    id: 'project-123',
    organizationId: 'org-123',
    name: 'Test Project',
    status: 'active',
  };

  const mockBOQItem: BOQItemEntity = {
    id: 'boq-123',
    organizationId: 'org-123',
    projectId: 'project-123',
    parentId: null,
    code: '1',
    description: 'Foundation Works',
    unit: 'm3',
    contractQuantity: 100,
    unitPriceCents: 10000,
    level: 0,
    sortOrder: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockBOQRepo = {
      findById: vi.fn(),
      findByProject: vi.fn(),
      findByProjectWithTree: vi.fn(),
      findByCode: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteByProject: vi.fn(),
    } as unknown as BOQRepository;

    mockProjectRepo = {
      findById: vi.fn(),
    } as unknown as ProjectRepository;

    boqService = new BOQService(mockBOQRepo, mockProjectRepo);
  });

  // ==========================================================================
  // CRUD OPERATIONS
  // ==========================================================================

  describe('getByProject', () => {
    it('should return all BOQ items for project', async () => {
      const items = [mockBOQItem, { ...mockBOQItem, id: 'boq-456', code: '2' }];
      (mockBOQRepo.findByProject as ReturnType<typeof vi.fn>).mockResolvedValue(items);

      const result = await boqService.getByProject('project-123');

      expect(result).toHaveLength(2);
      expect(mockBOQRepo.findByProject).toHaveBeenCalledWith('project-123');
    });
  });

  describe('getTreeByProject', () => {
    it('should return BOQ tree structure', async () => {
      const tree = [mockBOQItem];
      (mockBOQRepo.findByProjectWithTree as ReturnType<typeof vi.fn>).mockResolvedValue(tree);

      const result = await boqService.getTreeByProject('project-123');

      expect(result).toHaveLength(1);
      expect(mockBOQRepo.findByProjectWithTree).toHaveBeenCalledWith('project-123');
    });
  });

  describe('getById', () => {
    it('should return BOQ item by id', async () => {
      (mockBOQRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockBOQItem);

      const result = await boqService.getById('boq-123');

      expect(result).toEqual(mockBOQItem);
    });

    it('should return null when not found', async () => {
      (mockBOQRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await boqService.getById('invalid-id');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create BOQ item successfully', async () => {
      (mockProjectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockProject);
      (mockBOQRepo.findByCode as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (mockBOQRepo.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockBOQItem);

      const result = await boqService.create({
        organizationId: 'org-123',
        projectId: 'project-123',
        parentId: null,
        code: '1',
        description: 'Foundation Works',
        unit: 'm3',
        contractQuantity: 100,
        unitPriceCents: 10000,
        level: 0,
        sortOrder: 0,
        isActive: true,
      });

      expect(result).toEqual(mockBOQItem);
      expect(mockBOQRepo.create).toHaveBeenCalled();
    });

    it('should throw error when project not found', async () => {
      (mockProjectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        boqService.create({
          organizationId: 'org-123',
          projectId: 'invalid-project',
          parentId: null,
          code: '1',
          description: 'Test',
          unit: null,
          contractQuantity: null,
          unitPriceCents: null,
          level: 0,
          sortOrder: 0,
          isActive: true,
        })
      ).rejects.toThrow('Project not found');
    });

    it('should throw error when code already exists', async () => {
      (mockProjectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockProject);
      (mockBOQRepo.findByCode as ReturnType<typeof vi.fn>).mockResolvedValue(mockBOQItem);

      await expect(
        boqService.create({
          organizationId: 'org-123',
          projectId: 'project-123',
          parentId: null,
          code: '1',
          description: 'Duplicate Code',
          unit: null,
          contractQuantity: null,
          unitPriceCents: null,
          level: 0,
          sortOrder: 0,
          isActive: true,
        })
      ).rejects.toThrow('BOQ item with code "1" already exists');
    });
  });

  describe('update', () => {
    it('should update BOQ item successfully', async () => {
      const updatedItem = { ...mockBOQItem, description: 'Updated Description' };
      (mockBOQRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockBOQItem);
      (mockBOQRepo.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedItem);

      const result = await boqService.update('boq-123', { description: 'Updated Description' });

      expect(result?.description).toBe('Updated Description');
    });

    it('should return null when item not found', async () => {
      (mockBOQRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await boqService.update('invalid-id', { description: 'Test' });

      expect(result).toBeNull();
    });

    it('should throw error when changing to duplicate code', async () => {
      (mockBOQRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockBOQItem);
      (mockBOQRepo.findByCode as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockBOQItem,
        id: 'other-boq',
        code: '2',
      });

      await expect(boqService.update('boq-123', { code: '2' })).rejects.toThrow(
        'BOQ item with code "2" already exists'
      );
    });

    it('should allow updating with same code', async () => {
      const updatedItem = { ...mockBOQItem, description: 'Updated' };
      (mockBOQRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockBOQItem);
      (mockBOQRepo.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedItem);

      const result = await boqService.update('boq-123', { code: '1', description: 'Updated' });

      expect(result).toEqual(updatedItem);
      // findByCode should not be called when code is unchanged
      expect(mockBOQRepo.findByCode).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete BOQ item successfully', async () => {
      (mockBOQRepo.delete as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const result = await boqService.delete('boq-123');

      expect(result).toBe(true);
      expect(mockBOQRepo.delete).toHaveBeenCalledWith('boq-123');
    });

    it('should return false when item not found', async () => {
      (mockBOQRepo.delete as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      const result = await boqService.delete('invalid-id');

      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // SUMMARY
  // ==========================================================================

  describe('getSummary', () => {
    it('should return correct summary for project', async () => {
      const items: BOQItemEntity[] = [
        { ...mockBOQItem, level: 0, contractQuantity: 100, unitPriceCents: 10000 }, // Category 1
        {
          ...mockBOQItem,
          id: 'boq-2',
          code: '1.1',
          level: 1,
          parentId: 'boq-123',
          contractQuantity: 50,
          unitPriceCents: 5000,
        }, // Child (counts)
        {
          ...mockBOQItem,
          id: 'boq-3',
          code: '2',
          level: 0,
          contractQuantity: null,
          unitPriceCents: null,
        }, // Category 2, no value
      ];
      (mockBOQRepo.findByProject as ReturnType<typeof vi.fn>).mockResolvedValue(items);

      const summary = await boqService.getSummary('project-123');

      expect(summary.totalItems).toBe(3);
      expect(summary.categories).toBe(2); // Two root items (level 0)
      // Only leaf nodes count: boq-2 (50 * 5000 = 250000) + boq-3 (no value)
      // boq-123 is a parent so doesn't count
      expect(summary.totalValueCents).toBe(250000);
    });

    it('should return zero values for empty project', async () => {
      (mockBOQRepo.findByProject as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const summary = await boqService.getSummary('project-123');

      expect(summary.totalItems).toBe(0);
      expect(summary.categories).toBe(0);
      expect(summary.totalValueCents).toBe(0);
    });
  });

  // ==========================================================================
  // EXCEL EXPORT
  // ==========================================================================

  describe('exportToExcel', () => {
    it('should export BOQ items to Excel buffer', async () => {
      (mockBOQRepo.findByProject as ReturnType<typeof vi.fn>).mockResolvedValue([mockBOQItem]);

      const buffer = await boqService.exportToExcel('project-123');

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should export empty project', async () => {
      (mockBOQRepo.findByProject as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const buffer = await boqService.exportToExcel('project-123');

      expect(buffer).toBeInstanceOf(Buffer);
    });
  });

  // ==========================================================================
  // EXCEL IMPORT
  // ==========================================================================

  describe('importFromExcel', () => {
    it('should fail when project not found', async () => {
      (mockProjectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await boqService.importFromExcel(
        Buffer.from(''),
        'invalid-project',
        'org-123'
      );

      expect(result.success).toBe(false);
      expect(result.errors[0].message).toBe('Project not found');
    });

    it('should fail when no valid rows in file', async () => {
      (mockProjectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockProject);

      // xlsx parses invalid data as empty sheet, resulting in "no valid rows"
      const result = await boqService.importFromExcel(
        Buffer.from('invalid'),
        'project-123',
        'org-123'
      );

      expect(result.success).toBe(false);
      expect(result.errors[0].message).toBe('No valid rows found');
    });
  });
});
