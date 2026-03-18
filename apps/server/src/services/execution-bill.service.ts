/**
 * Execution Bill Service
 *
 * Handles contractor execution bills including CRUD operations,
 * workflow transitions, measurements, and exports.
 */

import * as XLSX from 'xlsx';
import type {
  BillRepository,
  BillItemRepository,
  MeasurementRepository,
  BOQRepository,
  ProjectRepository,
  BillEntity,
  BillWithItemsEntity,
  BillItemEntity,
  MeasurementEntity,
  CreateBillInput,
  UpdateBillInput,
  CreateBillItemInput,
  UpdateBillItemInput,
  CreateMeasurementInput,
  BillStatus,
  PaginatedResult,
  FindManyOptions,
} from '@geometrix/contract';
import { AppError, ErrorCodes } from '@geometrix/contract';
import { logger } from '../lib/logger.ts';

// ============================================================================
// TYPES
// ============================================================================

export interface CreateBillRequest {
  projectId: string;
  organizationId: string;
  createdBy: string;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  remarks?: string | null;
}

export interface BillWithCalculations extends BillEntity {
  itemCount: number;
  measurementCount: number;
}

export interface BillSummary {
  totalBills: number;
  draftCount: number;
  submittedCount: number;
  approvedCount: number;
  rejectedCount: number;
  totalValueCents: number;
}

// ============================================================================
// STATUS TRANSITION RULES
// ============================================================================

const VALID_TRANSITIONS: Record<BillStatus, BillStatus[]> = {
  draft: ['submitted'],
  submitted: ['under_review', 'rejected'],
  under_review: ['approved', 'rejected'],
  approved: [], // Terminal state
  rejected: ['draft'], // Can reopen as draft
};

// ============================================================================
// SERVICE
// ============================================================================

export class ExecutionBillService {
  constructor(
    private billRepo: BillRepository,
    private billItemRepo: BillItemRepository,
    private measurementRepo: MeasurementRepository,
    private boqRepo: BOQRepository,
    private projectRepo: ProjectRepository
  ) {}

  // ==========================================================================
  // BILL CRUD
  // ==========================================================================

  async createBill(data: CreateBillRequest): Promise<BillEntity> {
    // Verify project exists and belongs to organization
    const project = await this.projectRepo.findById(data.projectId);
    if (!project) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Project not found', 404);
    }
    if (project.organizationId !== data.organizationId) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied', 403);
    }

    // Get next bill number
    const billNumber = await this.billRepo.getNextBillNumber(data.projectId);

    const billInput: CreateBillInput = {
      organizationId: data.organizationId,
      projectId: data.projectId,
      billNumber,
      periodStart: data.periodStart ?? null,
      periodEnd: data.periodEnd ?? null,
      remarks: data.remarks ?? null,
      createdBy: data.createdBy,
    };

    const bill = await this.billRepo.create(billInput);

    logger.info('Execution bill created', {
      billId: bill.id,
      billNumber: bill.billNumber,
      projectId: data.projectId,
      userId: data.createdBy,
    });

    return bill;
  }

  async getBill(billId: string): Promise<BillEntity | null> {
    return this.billRepo.findById(billId);
  }

  async getBillWithItems(billId: string): Promise<BillWithItemsEntity | null> {
    return this.billRepo.findByIdWithItems(billId);
  }

  async getBillsByProject(
    projectId: string,
    options?: FindManyOptions
  ): Promise<PaginatedResult<BillEntity>> {
    return this.billRepo.findByProjectWithPagination(projectId, options);
  }

  async updateBill(billId: string, data: UpdateBillInput, userId: string): Promise<BillEntity> {
    const bill = await this.billRepo.findById(billId);
    if (!bill) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Bill not found', 404);
    }

    // Only allow editing draft bills
    if (bill.status !== 'draft') {
      throw new AppError(ErrorCodes.BAD_REQUEST, 'Only draft bills can be edited', 400);
    }

    const updated = await this.billRepo.update(billId, data);
    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to update bill', 500);
    }

    logger.info('Execution bill updated', { billId, userId });

    return updated;
  }

  async deleteBill(billId: string, userId: string): Promise<void> {
    const bill = await this.billRepo.findById(billId);
    if (!bill) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Bill not found', 404);
    }

    // Only allow deleting draft bills
    if (bill.status !== 'draft') {
      throw new AppError(ErrorCodes.BAD_REQUEST, 'Only draft bills can be deleted', 400);
    }

    await this.billRepo.delete(billId);

    logger.info('Execution bill deleted', { billId, userId });
  }

  // ==========================================================================
  // WORKFLOW TRANSITIONS
  // ==========================================================================

  async submitBill(
    billId: string,
    userId: string,
    contractorSignatureUrl?: string
  ): Promise<BillEntity> {
    const bill = await this.billRepo.findById(billId);
    if (!bill) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Bill not found', 404);
    }

    this.validateTransition(bill.status, 'submitted');

    // Calculate totals before submission
    const items = await this.billItemRepo.findByBill(billId);
    const { subtotalCents, discountCents, totalCents } = this.calculateBillTotals(items);

    const updateData: UpdateBillInput = {
      status: 'submitted',
      submittedAt: new Date(),
      subtotalCents,
      discountCents,
      totalCents,
    };

    if (contractorSignatureUrl) {
      updateData.contractorSignatureUrl = contractorSignatureUrl;
      updateData.contractorSignedBy = userId;
      updateData.contractorSignedAt = new Date();
    }

    const updated = await this.billRepo.update(billId, updateData);
    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to submit bill', 500);
    }

    logger.info('Execution bill submitted', { billId, userId, totalCents });

    return updated;
  }

  async startReview(billId: string, userId: string): Promise<BillEntity> {
    const bill = await this.billRepo.findById(billId);
    if (!bill) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Bill not found', 404);
    }

    this.validateTransition(bill.status, 'under_review');

    const updated = await this.billRepo.update(billId, {
      status: 'under_review',
    });

    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to start review', 500);
    }

    logger.info('Execution bill review started', { billId, userId });

    return updated;
  }

  async approveBill(
    billId: string,
    userId: string,
    inspectorSignatureUrl?: string
  ): Promise<BillEntity> {
    const bill = await this.billRepo.findById(billId);
    if (!bill) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Bill not found', 404);
    }

    this.validateTransition(bill.status, 'approved');

    const updateData: UpdateBillInput = {
      status: 'approved',
      approvedAt: new Date(),
    };

    if (inspectorSignatureUrl) {
      updateData.inspectorSignatureUrl = inspectorSignatureUrl;
      updateData.inspectorSignedBy = userId;
      updateData.inspectorSignedAt = new Date();
    }

    const updated = await this.billRepo.update(billId, updateData);
    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to approve bill', 500);
    }

    logger.info('Execution bill approved', { billId, userId });

    return updated;
  }

  async rejectBill(billId: string, userId: string, reason: string): Promise<BillEntity> {
    const bill = await this.billRepo.findById(billId);
    if (!bill) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Bill not found', 404);
    }

    this.validateTransition(bill.status, 'rejected');

    const updated = await this.billRepo.update(billId, {
      status: 'rejected',
      rejectedAt: new Date(),
      rejectionReason: reason,
    });

    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to reject bill', 500);
    }

    logger.info('Execution bill rejected', { billId, userId, reason });

    return updated;
  }

  async reopenBill(billId: string, userId: string): Promise<BillEntity> {
    const bill = await this.billRepo.findById(billId);
    if (!bill) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Bill not found', 404);
    }

    this.validateTransition(bill.status, 'draft');

    const updated = await this.billRepo.update(billId, {
      status: 'draft',
      rejectedAt: null,
      rejectionReason: null,
    });

    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to reopen bill', 500);
    }

    logger.info('Execution bill reopened', { billId, userId });

    return updated;
  }

  // ==========================================================================
  // BILL ITEMS
  // ==========================================================================

  async addItemFromBOQ(billId: string, boqItemId: string): Promise<BillItemEntity> {
    const bill = await this.billRepo.findById(billId);
    if (!bill) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Bill not found', 404);
    }

    if (bill.status !== 'draft') {
      throw new AppError(ErrorCodes.BAD_REQUEST, 'Can only add items to draft bills', 400);
    }

    const boqItem = await this.boqRepo.findById(boqItemId);
    if (!boqItem) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'BOQ item not found', 404);
    }

    // Get previous cumulative quantity from earlier bills
    const previousItems = await this.billItemRepo.findByBOQItem(boqItemId);
    const previousCumulative = previousItems
      .filter((i) => i.billId !== billId)
      .reduce((sum, i) => sum + i.cumulativeQuantity, 0);

    const itemInput: CreateBillItemInput = {
      billId,
      boqItemId,
      boqCode: boqItem.code,
      description: boqItem.description,
      unit: boqItem.unit,
      previousQuantity: previousCumulative,
      currentQuantity: 0,
      cumulativeQuantity: previousCumulative,
      unitPriceCents: boqItem.unitPriceCents ?? 0,
      discountPercent: 0,
    };

    return this.billItemRepo.create(itemInput);
  }

  async addItemsFromBOQ(billId: string, boqItemIds: string[]): Promise<BillItemEntity[]> {
    const items: BillItemEntity[] = [];
    for (const boqItemId of boqItemIds) {
      const item = await this.addItemFromBOQ(billId, boqItemId);
      items.push(item);
    }
    return items;
  }

  async updateBillItem(
    itemId: string,
    data: UpdateBillItemInput,
    _userId: string
  ): Promise<BillItemEntity> {
    const item = await this.billItemRepo.findById(itemId);
    if (!item) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Bill item not found', 404);
    }

    const bill = await this.billRepo.findById(item.billId);
    if (!bill || bill.status !== 'draft') {
      throw new AppError(ErrorCodes.BAD_REQUEST, 'Can only edit items in draft bills', 400);
    }

    // Auto-calculate cumulative if current quantity changes
    if (data.currentQuantity !== undefined) {
      data.cumulativeQuantity = item.previousQuantity + data.currentQuantity;
    }

    const updated = await this.billItemRepo.update(itemId, data);
    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to update item', 500);
    }

    return updated;
  }

  async deleteBillItem(itemId: string, _userId: string): Promise<void> {
    const item = await this.billItemRepo.findById(itemId);
    if (!item) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Bill item not found', 404);
    }

    const bill = await this.billRepo.findById(item.billId);
    if (!bill || bill.status !== 'draft') {
      throw new AppError(ErrorCodes.BAD_REQUEST, 'Can only delete items from draft bills', 400);
    }

    await this.billItemRepo.delete(itemId);
  }

  // ==========================================================================
  // MEASUREMENTS
  // ==========================================================================

  async addMeasurement(
    billItemId: string,
    data: { location?: string; quantity: number; remarks?: string },
    userId: string
  ): Promise<MeasurementEntity> {
    const item = await this.billItemRepo.findById(billItemId);
    if (!item) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Bill item not found', 404);
    }

    const bill = await this.billRepo.findById(item.billId);
    if (!bill || bill.status !== 'draft') {
      throw new AppError(ErrorCodes.BAD_REQUEST, 'Can only add measurements to draft bills', 400);
    }

    const measurementInput: CreateMeasurementInput = {
      billItemId,
      location: data.location ?? null,
      quantity: data.quantity,
      measuredBy: userId,
      remarks: data.remarks ?? null,
    };

    const measurement = await this.measurementRepo.create(measurementInput);

    // Update bill item's current quantity based on measurements
    const allMeasurements = await this.measurementRepo.findByBillItem(billItemId);
    const totalMeasured = allMeasurements.reduce((sum, m) => sum + m.quantity, 0);

    await this.billItemRepo.update(billItemId, {
      currentQuantity: totalMeasured,
      cumulativeQuantity: item.previousQuantity + totalMeasured,
    });

    return measurement;
  }

  async getMeasurementsByBillItem(billItemId: string): Promise<MeasurementEntity[]> {
    return this.measurementRepo.findByBillItem(billItemId);
  }

  async deleteMeasurement(measurementId: string, _userId: string): Promise<void> {
    const measurement = await this.measurementRepo.findById(measurementId);
    if (!measurement) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Measurement not found', 404);
    }

    const item = await this.billItemRepo.findById(measurement.billItemId);
    if (!item) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Bill item not found', 404);
    }

    const bill = await this.billRepo.findById(item.billId);
    if (!bill || bill.status !== 'draft') {
      throw new AppError(
        ErrorCodes.BAD_REQUEST,
        'Can only delete measurements from draft bills',
        400
      );
    }

    await this.measurementRepo.delete(measurementId);

    // Recalculate bill item quantities
    const remainingMeasurements = await this.measurementRepo.findByBillItem(item.id);
    const totalMeasured = remainingMeasurements.reduce((sum, m) => sum + m.quantity, 0);

    await this.billItemRepo.update(item.id, {
      currentQuantity: totalMeasured,
      cumulativeQuantity: item.previousQuantity + totalMeasured,
    });
  }

  // ==========================================================================
  // EXPORT
  // ==========================================================================

  async exportToExcel(billId: string): Promise<Buffer> {
    const bill = await this.billRepo.findByIdWithItems(billId);
    if (!bill) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Bill not found', 404);
    }

    const workbook = XLSX.utils.book_new();

    // Bill items sheet
    const itemsData = [
      [
        'Code',
        'Description',
        'Unit',
        'Previous Qty',
        'Current Qty',
        'Cumulative',
        'Unit Price',
        'Discount %',
        'Total',
        'Exception',
        'Remarks',
      ],
      ...bill.items.map((item) => {
        const total = item.currentQuantity * item.unitPriceCents * (1 - item.discountPercent / 100);
        return [
          item.boqCode,
          item.description,
          item.unit ?? '',
          item.previousQuantity,
          item.currentQuantity,
          item.cumulativeQuantity,
          item.unitPriceCents / 100,
          item.discountPercent,
          total / 100,
          item.isException ? 'Yes' : '',
          item.remarks ?? '',
        ];
      }),
    ];

    const itemsSheet = XLSX.utils.aoa_to_sheet(itemsData);
    XLSX.utils.book_append_sheet(workbook, itemsSheet, 'Bill Items');

    // Summary sheet
    const summaryData = [
      ['Bill Number', bill.billNumber],
      ['Status', bill.status],
      ['Period Start', bill.periodStart ? bill.periodStart.toISOString().split('T')[0] : ''],
      ['Period End', bill.periodEnd ? bill.periodEnd.toISOString().split('T')[0] : ''],
      ['Subtotal', bill.subtotalCents / 100],
      ['Discount', bill.discountCents / 100],
      ['Total', bill.totalCents / 100],
      ['Remarks', bill.remarks ?? ''],
    ];

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  }

  // ==========================================================================
  // SUMMARY
  // ==========================================================================

  async getProjectBillSummary(projectId: string): Promise<BillSummary> {
    const bills = await this.billRepo.findByProject(projectId);

    let draftCount = 0;
    let submittedCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;
    let totalValueCents = 0;

    for (const bill of bills) {
      switch (bill.status) {
        case 'draft':
          draftCount++;
          break;
        case 'submitted':
        case 'under_review':
          submittedCount++;
          break;
        case 'approved':
          approvedCount++;
          totalValueCents += bill.totalCents;
          break;
        case 'rejected':
          rejectedCount++;
          break;
      }
    }

    return {
      totalBills: bills.length,
      draftCount,
      submittedCount,
      approvedCount,
      rejectedCount,
      totalValueCents,
    };
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private validateTransition(currentStatus: BillStatus, targetStatus: BillStatus): void {
    const validTargets = VALID_TRANSITIONS[currentStatus];
    if (!validTargets.includes(targetStatus)) {
      throw new AppError(
        ErrorCodes.BAD_REQUEST,
        `Cannot transition from ${currentStatus} to ${targetStatus}`,
        400
      );
    }
  }

  private calculateBillTotals(items: BillItemEntity[]): {
    subtotalCents: number;
    discountCents: number;
    totalCents: number;
  } {
    let subtotalCents = 0;
    let discountCents = 0;

    for (const item of items) {
      const itemSubtotal = Math.round(item.currentQuantity * item.unitPriceCents);
      const itemDiscount = Math.round(itemSubtotal * (item.discountPercent / 100));
      subtotalCents += itemSubtotal;
      discountCents += itemDiscount;
    }

    return {
      subtotalCents,
      discountCents,
      totalCents: subtotalCents - discountCents,
    };
  }
}
