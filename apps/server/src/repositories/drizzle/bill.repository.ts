import { db as defaultDb, bills, eq, desc, asc, sql } from '@geometrix/database';
import type {
  BillRepository,
  BillEntity,
  BillWithItemsEntity,
  CreateBillInput,
  UpdateBillInput,
  FindManyOptions,
  PaginatedResult,
  BillStatus,
} from '@geometrix/contract';
import type { DrizzleDB } from './index.ts';

/**
 * Drizzle implementation of BillRepository
 */
export class DrizzleBillRepository implements BillRepository {
  constructor(private db: DrizzleDB = defaultDb) {}

  // ==========================================================================
  // BASE CRUD
  // ==========================================================================

  async findById(id: string): Promise<BillEntity | null> {
    const result = await this.db.query.bills.findFirst({
      where: eq(bills.id, id),
    });
    return result ? this.toEntity(result) : null;
  }

  async findByIdWithItems(id: string): Promise<BillWithItemsEntity | null> {
    const result = await this.db.query.bills.findFirst({
      where: eq(bills.id, id),
      with: {
        items: {
          with: {
            measurements: true,
          },
        },
      },
    });

    if (!result) return null;

    return {
      ...this.toEntity(result),
      items: result.items.map((item) => ({
        id: item.id,
        billId: item.billId,
        boqItemId: item.boqItemId,
        boqCode: item.boqCode,
        description: item.description,
        unit: item.unit,
        previousQuantity: parseFloat(item.previousQuantity ?? '0'),
        currentQuantity: parseFloat(item.currentQuantity ?? '0'),
        cumulativeQuantity: parseFloat(item.cumulativeQuantity ?? '0'),
        unitPriceCents: item.unitPriceCents ?? 0,
        discountPercent: parseFloat(item.discountPercent ?? '0'),
        remarks: item.remarks,
        isException: item.isException ?? false,
        createdAt: item.createdAt,
        measurements: item.measurements.map((m) => ({
          id: m.id,
          billItemId: m.billItemId,
          location: m.location,
          quantity: parseFloat(m.quantity),
          measuredAt: m.measuredAt,
          measuredBy: m.measuredBy,
          approvalSignatureUrl: m.approvalSignatureUrl,
          approvedBy: m.approvedBy,
          approvedAt: m.approvedAt,
          remarks: m.remarks,
          createdAt: m.createdAt,
        })),
      })),
    };
  }

  async findMany(options?: FindManyOptions): Promise<BillEntity[]> {
    const results = await this.db.query.bills.findMany({
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      orderBy: this.buildOrderBy(options?.orderBy),
    });
    return results.map((r) => this.toEntity(r));
  }

  async create(data: CreateBillInput): Promise<BillEntity> {
    const [bill] = await this.db
      .insert(bills)
      .values({
        organizationId: data.organizationId,
        projectId: data.projectId,
        billNumber: data.billNumber,
        periodStart: data.periodStart ?? null,
        periodEnd: data.periodEnd ?? null,
        remarks: data.remarks ?? null,
        createdBy: data.createdBy,
        status: 'draft',
      })
      .returning();
    return this.toEntity(bill);
  }

  async update(id: string, data: UpdateBillInput): Promise<BillEntity | null> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.periodStart !== undefined) updateData.periodStart = data.periodStart;
    if (data.periodEnd !== undefined) updateData.periodEnd = data.periodEnd;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.remarks !== undefined) updateData.remarks = data.remarks;

    // Amounts
    if (data.subtotalCents !== undefined) updateData.subtotalCents = data.subtotalCents;
    if (data.discountCents !== undefined) updateData.discountCents = data.discountCents;
    if (data.totalCents !== undefined) updateData.totalCents = data.totalCents;

    // Contractor signature
    if (data.contractorSignatureUrl !== undefined)
      updateData.contractorSignatureUrl = data.contractorSignatureUrl;
    if (data.contractorSignedBy !== undefined)
      updateData.contractorSignedBy = data.contractorSignedBy;
    if (data.contractorSignedAt !== undefined)
      updateData.contractorSignedAt = data.contractorSignedAt;

    // Inspector signature
    if (data.inspectorSignatureUrl !== undefined)
      updateData.inspectorSignatureUrl = data.inspectorSignatureUrl;
    if (data.inspectorSignedBy !== undefined) updateData.inspectorSignedBy = data.inspectorSignedBy;
    if (data.inspectorSignedAt !== undefined) updateData.inspectorSignedAt = data.inspectorSignedAt;

    // Workflow timestamps
    if (data.submittedAt !== undefined) updateData.submittedAt = data.submittedAt;
    if (data.approvedAt !== undefined) updateData.approvedAt = data.approvedAt;
    if (data.rejectedAt !== undefined) updateData.rejectedAt = data.rejectedAt;
    if (data.rejectionReason !== undefined) updateData.rejectionReason = data.rejectionReason;

    const [bill] = await this.db.update(bills).set(updateData).where(eq(bills.id, id)).returning();

    return bill ? this.toEntity(bill) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(bills).where(eq(bills.id, id)).returning({ id: bills.id });
    return result.length > 0;
  }

  async count(_filter?: Record<string, unknown>): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)::int` }).from(bills);
    return result[0]?.count ?? 0;
  }

  // ==========================================================================
  // BILL-SPECIFIC QUERIES
  // ==========================================================================

  async findByProject(projectId: string, options?: FindManyOptions): Promise<BillEntity[]> {
    const results = await this.db.query.bills.findMany({
      where: eq(bills.projectId, projectId),
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      orderBy: [desc(bills.billNumber)],
    });
    return results.map((r) => this.toEntity(r));
  }

  async findByProjectWithPagination(
    projectId: string,
    options?: FindManyOptions
  ): Promise<PaginatedResult<BillEntity>> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    const [totalResult, items] = await Promise.all([
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(bills)
        .where(eq(bills.projectId, projectId)),
      this.db.query.bills.findMany({
        where: eq(bills.projectId, projectId),
        limit,
        offset,
        orderBy: [desc(bills.billNumber)],
      }),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return {
      data: items.map((r) => this.toEntity(r)),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + items.length < total,
      },
    };
  }

  async findByStatus(organizationId: string, status: BillStatus): Promise<BillEntity[]> {
    const results = await this.db
      .select()
      .from(bills)
      .where(sql`${bills.organizationId} = ${organizationId} AND ${bills.status} = ${status}`)
      .orderBy(desc(bills.createdAt));
    return results.map((r) => this.toEntity(r));
  }

  async getNextBillNumber(projectId: string): Promise<number> {
    const result = await this.db
      .select({ maxNumber: sql<number>`COALESCE(MAX(${bills.billNumber}), 0)::int` })
      .from(bills)
      .where(eq(bills.projectId, projectId));
    return (result[0]?.maxNumber ?? 0) + 1;
  }

  async countByProject(projectId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(bills)
      .where(eq(bills.projectId, projectId));
    return result[0]?.count ?? 0;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private buildOrderBy(orderBy?: { field: string; direction: 'asc' | 'desc' }) {
    if (!orderBy) return [desc(bills.billNumber)];

    switch (orderBy.field) {
      case 'billNumber':
        return orderBy.direction === 'asc' ? asc(bills.billNumber) : desc(bills.billNumber);
      case 'status':
        return orderBy.direction === 'asc' ? asc(bills.status) : desc(bills.status);
      case 'createdAt':
        return orderBy.direction === 'asc' ? asc(bills.createdAt) : desc(bills.createdAt);
      case 'updatedAt':
        return orderBy.direction === 'asc' ? asc(bills.updatedAt) : desc(bills.updatedAt);
      default:
        return [desc(bills.billNumber)];
    }
  }

  private toEntity(row: typeof bills.$inferSelect): BillEntity {
    return {
      id: row.id,
      organizationId: row.organizationId,
      projectId: row.projectId,
      billNumber: row.billNumber,
      periodStart: row.periodStart ?? null,
      periodEnd: row.periodEnd ?? null,
      status: row.status as BillStatus,
      remarks: row.remarks,
      subtotalCents: row.subtotalCents ?? 0,
      discountCents: row.discountCents ?? 0,
      totalCents: row.totalCents ?? 0,
      contractorSignatureUrl: row.contractorSignatureUrl,
      contractorSignedBy: row.contractorSignedBy,
      contractorSignedAt: row.contractorSignedAt ?? null,
      inspectorSignatureUrl: row.inspectorSignatureUrl,
      inspectorSignedBy: row.inspectorSignedBy,
      inspectorSignedAt: row.inspectorSignedAt ?? null,
      submittedAt: row.submittedAt ?? null,
      approvedAt: row.approvedAt ?? null,
      rejectedAt: row.rejectedAt ?? null,
      rejectionReason: row.rejectionReason,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
