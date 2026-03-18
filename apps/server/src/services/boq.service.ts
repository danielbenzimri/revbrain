/**
 * BOQ Service
 *
 * Handles Bill of Quantities operations including Excel import,
 * tree management, and CRUD operations.
 */

import * as XLSX from 'xlsx';
import type {
  BOQRepository,
  BOQItemEntity,
  CreateBOQItemInput,
  ProjectRepository,
} from '@revbrain/contract';
import { logger } from '../lib/logger.ts';

// ============================================================================
// TYPES
// ============================================================================

export interface ExcelRow {
  code: string;
  description: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  errors: ImportError[];
  items: BOQItemEntity[];
}

export interface ImportError {
  row: number;
  code?: string;
  message: string;
}

export interface ImportOptions {
  /** Replace existing BOQ items (default: false - merge) */
  replace?: boolean;
  /** Sheet name or index to import (default: first sheet) */
  sheet?: string | number;
  /** Starting row (1-indexed, default: 2 to skip header) */
  startRow?: number;
  /** Multiple columns whose values are joined with dots to form the item code (e.g. ['A','B','C','D']) */
  codeColumns?: string[];
  /** Column mapping */
  columns?: {
    code?: string; // Default: 'A' (ignored when codeColumns is set)
    description?: string; // Default: 'B'
    unit?: string; // Default: 'C'
    quantity?: string; // Default: 'D'
    unitPrice?: string; // Default: 'E'
  };
}

/** Internal type for tracking parent code during import */
interface BOQItemWithParentCode extends CreateBOQItemInput {
  _parentCode: string | null;
}

// ============================================================================
// SERVICE
// ============================================================================

export class BOQService {
  constructor(
    private boqRepo: BOQRepository,
    private projectRepo: ProjectRepository
  ) {}

  // ==========================================================================
  // CRUD OPERATIONS
  // ==========================================================================

  async getByProject(projectId: string): Promise<BOQItemEntity[]> {
    return this.boqRepo.findByProject(projectId);
  }

  async getTreeByProject(projectId: string): Promise<BOQItemEntity[]> {
    return this.boqRepo.findByProjectWithTree(projectId);
  }

  async getById(id: string): Promise<BOQItemEntity | null> {
    return this.boqRepo.findById(id);
  }

  async create(data: CreateBOQItemInput): Promise<BOQItemEntity> {
    // Validate project exists
    const project = await this.projectRepo.findById(data.projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Check for duplicate code
    const existing = await this.boqRepo.findByCode(data.projectId, data.code);
    if (existing) {
      throw new Error(`BOQ item with code "${data.code}" already exists`);
    }

    return this.boqRepo.create(data);
  }

  async update(id: string, data: Partial<CreateBOQItemInput>): Promise<BOQItemEntity | null> {
    const existing = await this.boqRepo.findById(id);
    if (!existing) {
      return null;
    }

    // If code is being changed, check for duplicates
    if (data.code && data.code !== existing.code) {
      const duplicate = await this.boqRepo.findByCode(existing.projectId, data.code);
      if (duplicate) {
        throw new Error(`BOQ item with code "${data.code}" already exists`);
      }
    }

    return this.boqRepo.update(id, data);
  }

  async delete(id: string): Promise<boolean> {
    return this.boqRepo.delete(id);
  }

  // ==========================================================================
  // SUMMARY & STATS
  // ==========================================================================

  async getSummary(
    projectId: string
  ): Promise<{ totalItems: number; categories: number; totalValueCents: number }> {
    const items = await this.boqRepo.findByProject(projectId);

    let totalValueCents = 0;
    let categories = 0;

    for (const item of items) {
      // Count root level items as categories
      if (item.level === 0) {
        categories++;
      }

      // Calculate total value (quantity × unit price) for leaf nodes only
      // Parents aggregate children, so we only count items without children
      const hasChildren = items.some((i) => i.parentId === item.id);
      if (!hasChildren && item.contractQuantity && item.unitPriceCents) {
        totalValueCents += Math.round(item.contractQuantity * item.unitPriceCents);
      }
    }

    return {
      totalItems: items.length,
      categories,
      totalValueCents,
    };
  }

  // ==========================================================================
  // EXCEL EXPORT
  // ==========================================================================

  async exportToExcel(projectId: string): Promise<Buffer> {
    const items = await this.boqRepo.findByProject(projectId);

    // Sort by sortOrder to maintain hierarchy
    const sortedItems = [...items].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();

    // Prepare data with headers
    const data = [
      ['Code', 'Description', 'Unit', 'Quantity', 'Unit Price', 'Total'],
      ...sortedItems.map((item) => {
        const total =
          item.contractQuantity && item.unitPriceCents
            ? (item.contractQuantity * item.unitPriceCents) / 100
            : null;

        return [
          item.code,
          item.description,
          item.unit || '',
          item.contractQuantity ?? '',
          item.unitPriceCents ? item.unitPriceCents / 100 : '',
          total ?? '',
        ];
      }),
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(data);

    // Set column widths
    worksheet['!cols'] = [
      { wch: 15 }, // Code
      { wch: 50 }, // Description
      { wch: 10 }, // Unit
      { wch: 12 }, // Quantity
      { wch: 12 }, // Unit Price
      { wch: 15 }, // Total
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'BOQ');

    // Write to buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return Buffer.from(buffer);
  }

  // ==========================================================================
  // EXCEL IMPORT
  // ==========================================================================

  async importFromExcel(
    buffer: Buffer,
    projectId: string,
    organizationId: string,
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    const errors: ImportError[] = [];
    const { replace = false, sheet = 0, startRow = 2, columns = {}, codeColumns } = options;

    const colMap = {
      code: columns.code || 'A',
      description: columns.description || 'B',
      unit: columns.unit || 'C',
      quantity: columns.quantity || 'D',
      unitPrice: columns.unitPrice || 'E',
    };

    // Validate project exists
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      return {
        success: false,
        imported: 0,
        errors: [{ row: 0, message: 'Project not found' }],
        items: [],
      };
    }

    // Parse Excel file
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'array' });
    } catch (err) {
      logger.error('Failed to parse Excel file', { error: err });
      return {
        success: false,
        imported: 0,
        errors: [{ row: 0, message: 'Failed to parse Excel file' }],
        items: [],
      };
    }

    // Get the target sheet
    const sheetName = typeof sheet === 'number' ? workbook.SheetNames[sheet] : sheet;

    if (!sheetName || !workbook.Sheets[sheetName]) {
      return {
        success: false,
        imported: 0,
        errors: [{ row: 0, message: `Sheet "${sheet}" not found` }],
        items: [],
      };
    }

    const worksheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:E1');

    // Parse rows
    const rows: ExcelRow[] = [];
    for (let rowNum = startRow; rowNum <= range.e.r + 1; rowNum++) {
      // Build code from multiple columns (joined with dots) or single column
      let code: string | undefined;
      if (codeColumns && codeColumns.length > 0) {
        const parts = codeColumns
          .map((col) => {
            const val = this.getCellValue(worksheet, col, rowNum);
            return val ? val.toString().trim().replace(/^\.+/, '').replace(/\.+$/, '') : '';
          })
          .filter((p) => p !== '');
        code = parts.length > 0 ? parts.join('.') : undefined;
      } else {
        code = this.getCellValue(worksheet, colMap.code, rowNum);
      }
      const description = this.getCellValue(worksheet, colMap.description, rowNum);
      const unit = this.getCellValue(worksheet, colMap.unit, rowNum);
      const quantityStr = this.getCellValue(worksheet, colMap.quantity, rowNum);
      const unitPriceStr = this.getCellValue(worksheet, colMap.unitPrice, rowNum);

      // Skip empty rows
      if (!code && !description) continue;

      // Validate required fields
      if (!code) {
        errors.push({ row: rowNum, message: 'Missing code' });
        continue;
      }
      // Default description if missing (matches legacy behavior)
      const descriptionValue = description?.toString().trim() || 'ללא תיאור';

      // Parse numeric values
      const quantity = quantityStr ? parseFloat(quantityStr) : undefined;
      const unitPrice = unitPriceStr ? parseFloat(unitPriceStr) : undefined;

      if (quantityStr && isNaN(quantity!)) {
        errors.push({ row: rowNum, code, message: 'Invalid quantity value' });
        continue;
      }
      if (unitPriceStr && isNaN(unitPrice!)) {
        errors.push({ row: rowNum, code, message: 'Invalid unit price value' });
        continue;
      }

      rows.push({
        code: code.toString().trim(),
        description: descriptionValue,
        unit: unit?.toString().trim() || "יח'",
        quantity,
        unitPrice,
      });
    }

    if (rows.length === 0) {
      return {
        success: false,
        imported: 0,
        errors: errors.length > 0 ? errors : [{ row: 0, message: 'No valid rows found' }],
        items: [],
      };
    }

    // Build hierarchy from codes
    const itemsToCreate = this.buildHierarchy(rows, projectId, organizationId);

    // Check for duplicate codes within import
    const codeSet = new Set<string>();
    for (const item of itemsToCreate) {
      if (codeSet.has(item.code)) {
        errors.push({ row: 0, code: item.code, message: 'Duplicate code in import' });
      }
      codeSet.add(item.code);
    }

    if (errors.some((e) => e.message === 'Duplicate code in import')) {
      return {
        success: false,
        imported: 0,
        errors,
        items: [],
      };
    }

    // Handle existing items
    if (replace) {
      await this.boqRepo.deleteByProject(projectId);
    } else {
      // Check for conflicts with existing items
      for (const item of itemsToCreate) {
        const existing = await this.boqRepo.findByCode(projectId, item.code);
        if (existing) {
          errors.push({
            row: 0,
            code: item.code,
            message: 'Code already exists (use replace mode to overwrite)',
          });
        }
      }

      if (errors.length > 0) {
        return {
          success: false,
          imported: 0,
          errors,
          items: [],
        };
      }
    }

    // Create items in batches to handle parent references
    const createdItems = await this.createItemsWithHierarchy(itemsToCreate);

    logger.info('BOQ import completed', {
      projectId,
      imported: createdItems.length,
      errors: errors.length,
    });

    return {
      success: errors.length === 0,
      imported: createdItems.length,
      errors,
      items: createdItems,
    };
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private getCellValue(worksheet: XLSX.WorkSheet, col: string, row: number): string | undefined {
    const cellAddress = `${col}${row}`;
    const cell = worksheet[cellAddress];
    if (!cell) return undefined;

    // Handle different cell types
    if (cell.t === 'n') return cell.v?.toString();
    if (cell.t === 's') return cell.v as string;
    if (cell.t === 'b') return cell.v ? 'true' : 'false';
    if (cell.w) return cell.w; // Formatted text
    return cell.v?.toString();
  }

  private buildHierarchy(
    rows: ExcelRow[],
    projectId: string,
    organizationId: string
  ): BOQItemWithParentCode[] {
    const items: BOQItemWithParentCode[] = [];
    const codeToItem = new Map<string, BOQItemWithParentCode>();

    // Sort by code to ensure parents are processed first
    const sortedRows = [...rows].sort((a, b) => {
      // Natural sort: 1, 1.1, 1.1.1, 1.2, 2, etc.
      const aParts = a.code.split('.').map((p) => parseInt(p, 10) || 0);
      const bParts = b.code.split('.').map((p) => parseInt(p, 10) || 0);

      for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aVal = aParts[i] ?? 0;
        const bVal = bParts[i] ?? 0;
        if (aVal !== bVal) return aVal - bVal;
      }
      return 0;
    });

    let sortOrder = 0;
    for (const row of sortedRows) {
      const level = this.getCodeLevel(row.code);
      const parentCode = this.getParentCode(row.code);

      const item: CreateBOQItemInput = {
        organizationId,
        projectId,
        parentId: null, // Will be resolved after creation
        code: row.code,
        description: row.description,
        unit: row.unit || null,
        contractQuantity: row.quantity ?? null,
        unitPriceCents: row.unitPrice ? Math.round(row.unitPrice * 100) : null,
        level,
        sortOrder: sortOrder++,
        isActive: true,
      };

      // Store parent code reference for later resolution
      const itemWithParent: BOQItemWithParentCode = { ...item, _parentCode: parentCode };

      items.push(itemWithParent);
      codeToItem.set(row.code, itemWithParent);
    }

    return items;
  }

  private getCodeLevel(code: string): number {
    // Level is determined by number of dots + 1
    // "1" = level 0, "1.1" = level 1, "1.1.1" = level 2
    return code.split('.').length - 1;
  }

  private getParentCode(code: string): string | null {
    const parts = code.split('.');
    if (parts.length <= 1) return null;
    return parts.slice(0, -1).join('.');
  }

  private async createItemsWithHierarchy(items: BOQItemWithParentCode[]): Promise<BOQItemEntity[]> {
    const createdItems: BOQItemEntity[] = [];
    const codeToId = new Map<string, string>();

    // Create items level by level to ensure parents exist first
    const levels = new Map<number, BOQItemWithParentCode[]>();

    for (const item of items) {
      const level = item.level ?? 0;
      if (!levels.has(level)) {
        levels.set(level, []);
      }
      levels.get(level)!.push(item);
    }

    // Sort levels and process from lowest (0) to highest
    const sortedLevels = Array.from(levels.keys()).sort((a, b) => a - b);

    for (const level of sortedLevels) {
      const levelItems = levels.get(level)!;

      for (const item of levelItems) {
        const { _parentCode: parentCode, ...itemData } = item;

        if (parentCode && codeToId.has(parentCode)) {
          itemData.parentId = codeToId.get(parentCode) || null;
        }

        const created = await this.boqRepo.create(itemData);
        createdItems.push(created);
        codeToId.set(itemData.code, created.id);
      }
    }

    return createdItems;
  }
}
