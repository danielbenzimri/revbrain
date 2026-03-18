import { db as defaultDb, billItems, eq, sql } from '@geometrix/database';
import type {
  BillItemRepository,
  BillItemEntity,
  BillItemWithMeasurementsEntity,
  CreateBillItemInput,
  UpdateBillItemInput,
  FindManyOptions,
} from '@geometrix/contract';
import type { DrizzleDB } from './index.ts';

/**
 * Drizzle implementation of BillItemRepository
 */
export class DrizzleBillItemRepository implements BillItemRepository {
  constructor(private db: DrizzleDB = defaultDb) {}

  // ==========================================================================
  // BASE CRUD
  // ==========================================================================

  async findById(id: string): Promise<BillItemEntity | null> {
    const result = await this.db.query.billItems.findFirst({
      where: eq(billItems.id, id),
    });
    return result ? this.toEntity(result) : null;
  }

  async findMany(options?: FindManyOptions): Promise<BillItemEntity[]> {
    const results = await this.db.query.billItems.findMany({
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
    });
    return results.map((r) => this.toEntity(r));
  }

  async create(data: CreateBillItemInput): Promise<BillItemEntity> {
    const [item] = await this.db
      .insert(billItems)
      .values({
        billId: data.billId,
        boqItemId: data.boqItemId ?? null,
        boqCode: data.boqCode,
        description: data.description,
        unit: data.unit ?? null,
        previousQuantity: data.previousQuantity?.toString() ?? '0',
        currentQuantity: data.currentQuantity?.toString() ?? '0',
        cumulativeQuantity: data.cumulativeQuantity?.toString() ?? '0',
        unitPriceCents: data.unitPriceCents,
        discountPercent: data.discountPercent?.toString() ?? '0',
        remarks: data.remarks ?? null,
        isException: data.isException ?? false,
      })
      .returning();
    return this.toEntity(item);
  }

  async createMany(data: CreateBillItemInput[]): Promise<BillItemEntity[]> {
    if (data.length === 0) return [];

    const items = await this.db
      .insert(billItems)
      .values(
        data.map((d) => ({
          billId: d.billId,
          boqItemId: d.boqItemId ?? null,
          boqCode: d.boqCode,
          description: d.description,
          unit: d.unit ?? null,
          previousQuantity: d.previousQuantity?.toString() ?? '0',
          currentQuantity: d.currentQuantity?.toString() ?? '0',
          cumulativeQuantity: d.cumulativeQuantity?.toString() ?? '0',
          unitPriceCents: d.unitPriceCents,
          discountPercent: d.discountPercent?.toString() ?? '0',
          remarks: d.remarks ?? null,
          isException: d.isException ?? false,
        }))
      )
      .returning();
    return items.map((item) => this.toEntity(item));
  }

  async update(id: string, data: UpdateBillItemInput): Promise<BillItemEntity | null> {
    const updateData: Record<string, unknown> = {};

    if (data.previousQuantity !== undefined)
      updateData.previousQuantity = data.previousQuantity.toString();
    if (data.currentQuantity !== undefined)
      updateData.currentQuantity = data.currentQuantity.toString();
    if (data.cumulativeQuantity !== undefined)
      updateData.cumulativeQuantity = data.cumulativeQuantity.toString();
    if (data.unitPriceCents !== undefined) updateData.unitPriceCents = data.unitPriceCents;
    if (data.discountPercent !== undefined)
      updateData.discountPercent = data.discountPercent.toString();
    if (data.remarks !== undefined) updateData.remarks = data.remarks;
    if (data.isException !== undefined) updateData.isException = data.isException;

    if (Object.keys(updateData).length === 0) {
      return this.findById(id);
    }

    const [item] = await this.db
      .update(billItems)
      .set(updateData)
      .where(eq(billItems.id, id))
      .returning();

    return item ? this.toEntity(item) : null;
  }

  async updateMany(
    _billId: string,
    items: Array<{ id: string; data: UpdateBillItemInput }>
  ): Promise<number> {
    let updatedCount = 0;

    // Use transaction for atomicity
    await this.db.transaction(async (tx) => {
      for (const { id, data } of items) {
        const updateData: Record<string, unknown> = {};

        if (data.previousQuantity !== undefined)
          updateData.previousQuantity = data.previousQuantity.toString();
        if (data.currentQuantity !== undefined)
          updateData.currentQuantity = data.currentQuantity.toString();
        if (data.cumulativeQuantity !== undefined)
          updateData.cumulativeQuantity = data.cumulativeQuantity.toString();
        if (data.unitPriceCents !== undefined) updateData.unitPriceCents = data.unitPriceCents;
        if (data.discountPercent !== undefined)
          updateData.discountPercent = data.discountPercent.toString();
        if (data.remarks !== undefined) updateData.remarks = data.remarks;
        if (data.isException !== undefined) updateData.isException = data.isException;

        if (Object.keys(updateData).length > 0) {
          const result = await tx
            .update(billItems)
            .set(updateData)
            .where(eq(billItems.id, id))
            .returning({ id: billItems.id });
          if (result.length > 0) updatedCount++;
        }
      }
    });

    return updatedCount;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .delete(billItems)
      .where(eq(billItems.id, id))
      .returning({ id: billItems.id });
    return result.length > 0;
  }

  async count(_filter?: Record<string, unknown>): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)::int` }).from(billItems);
    return result[0]?.count ?? 0;
  }

  // ==========================================================================
  // BILL ITEM-SPECIFIC QUERIES
  // ==========================================================================

  async findByBill(billId: string): Promise<BillItemEntity[]> {
    const results = await this.db.query.billItems.findMany({
      where: eq(billItems.billId, billId),
      orderBy: (items, { asc }) => [asc(items.boqCode)],
    });
    return results.map((r) => this.toEntity(r));
  }

  async findByBillWithMeasurements(billId: string): Promise<BillItemWithMeasurementsEntity[]> {
    const results = await this.db.query.billItems.findMany({
      where: eq(billItems.billId, billId),
      with: {
        measurements: true,
      },
      orderBy: (items, { asc }) => [asc(items.boqCode)],
    });

    return results.map((r) => ({
      ...this.toEntity(r),
      measurements: r.measurements.map((m) => ({
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
    }));
  }

  async findByBOQItem(boqItemId: string): Promise<BillItemEntity[]> {
    const results = await this.db.query.billItems.findMany({
      where: eq(billItems.boqItemId, boqItemId),
    });
    return results.map((r) => this.toEntity(r));
  }

  async deleteByBill(billId: string): Promise<number> {
    const result = await this.db
      .delete(billItems)
      .where(eq(billItems.billId, billId))
      .returning({ id: billItems.id });
    return result.length;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private toEntity(row: typeof billItems.$inferSelect): BillItemEntity {
    return {
      id: row.id,
      billId: row.billId,
      boqItemId: row.boqItemId,
      boqCode: row.boqCode,
      description: row.description,
      unit: row.unit,
      previousQuantity: parseFloat(row.previousQuantity ?? '0'),
      currentQuantity: parseFloat(row.currentQuantity ?? '0'),
      cumulativeQuantity: parseFloat(row.cumulativeQuantity ?? '0'),
      unitPriceCents: row.unitPriceCents ?? 0,
      discountPercent: parseFloat(row.discountPercent ?? '0'),
      remarks: row.remarks,
      isException: row.isException ?? false,
      createdAt: row.createdAt,
    };
  }
}
