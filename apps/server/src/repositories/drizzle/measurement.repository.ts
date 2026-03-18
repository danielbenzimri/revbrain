import { db as defaultDb, measurements, billItems, eq, sql } from '@geometrix/database';
import type {
  MeasurementRepository,
  MeasurementEntity,
  CreateMeasurementInput,
  UpdateMeasurementInput,
  FindManyOptions,
} from '@geometrix/contract';
import type { DrizzleDB } from './index.ts';

/**
 * Drizzle implementation of MeasurementRepository
 */
export class DrizzleMeasurementRepository implements MeasurementRepository {
  constructor(private db: DrizzleDB = defaultDb) {}

  // ==========================================================================
  // BASE CRUD
  // ==========================================================================

  async findById(id: string): Promise<MeasurementEntity | null> {
    const result = await this.db.query.measurements.findFirst({
      where: eq(measurements.id, id),
    });
    return result ? this.toEntity(result) : null;
  }

  async findMany(options?: FindManyOptions): Promise<MeasurementEntity[]> {
    const results = await this.db.query.measurements.findMany({
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      orderBy: (m, { desc }) => [desc(m.createdAt)],
    });
    return results.map((r) => this.toEntity(r));
  }

  async create(data: CreateMeasurementInput): Promise<MeasurementEntity> {
    const [measurement] = await this.db
      .insert(measurements)
      .values({
        billItemId: data.billItemId,
        location: data.location ?? null,
        quantity: data.quantity.toString(),
        measuredBy: data.measuredBy,
        remarks: data.remarks ?? null,
      })
      .returning();
    return this.toEntity(measurement);
  }

  async update(id: string, data: UpdateMeasurementInput): Promise<MeasurementEntity | null> {
    const updateData: Record<string, unknown> = {};

    if (data.location !== undefined) updateData.location = data.location;
    if (data.quantity !== undefined) updateData.quantity = data.quantity.toString();
    if (data.remarks !== undefined) updateData.remarks = data.remarks;
    if (data.approvalSignatureUrl !== undefined)
      updateData.approvalSignatureUrl = data.approvalSignatureUrl;
    if (data.approvedBy !== undefined) updateData.approvedBy = data.approvedBy;
    if (data.approvedAt !== undefined) updateData.approvedAt = data.approvedAt;

    if (Object.keys(updateData).length === 0) {
      return this.findById(id);
    }

    const [measurement] = await this.db
      .update(measurements)
      .set(updateData)
      .where(eq(measurements.id, id))
      .returning();

    return measurement ? this.toEntity(measurement) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .delete(measurements)
      .where(eq(measurements.id, id))
      .returning({ id: measurements.id });
    return result.length > 0;
  }

  async count(_filter?: Record<string, unknown>): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)::int` }).from(measurements);
    return result[0]?.count ?? 0;
  }

  // ==========================================================================
  // MEASUREMENT-SPECIFIC QUERIES
  // ==========================================================================

  async findByBillItem(billItemId: string): Promise<MeasurementEntity[]> {
    const results = await this.db.query.measurements.findMany({
      where: eq(measurements.billItemId, billItemId),
      orderBy: (m, { desc }) => [desc(m.measuredAt)],
    });
    return results.map((r) => this.toEntity(r));
  }

  async findByBill(billId: string): Promise<MeasurementEntity[]> {
    // Get all bill item IDs for this bill, then get all measurements
    const items = await this.db.query.billItems.findMany({
      where: eq(billItems.billId, billId),
      columns: { id: true },
    });

    if (items.length === 0) return [];

    const itemIds = items.map((i) => i.id);

    const results = await this.db.query.measurements.findMany({
      where: sql`${measurements.billItemId} = ANY(${itemIds})`,
      orderBy: (m, { desc }) => [desc(m.measuredAt)],
    });

    return results.map((r) => this.toEntity(r));
  }

  async deleteByBillItem(billItemId: string): Promise<number> {
    const result = await this.db
      .delete(measurements)
      .where(eq(measurements.billItemId, billItemId))
      .returning({ id: measurements.id });
    return result.length;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private toEntity(row: typeof measurements.$inferSelect): MeasurementEntity {
    return {
      id: row.id,
      billItemId: row.billItemId,
      location: row.location,
      quantity: parseFloat(row.quantity),
      measuredAt: row.measuredAt,
      measuredBy: row.measuredBy,
      approvalSignatureUrl: row.approvalSignatureUrl,
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt,
      remarks: row.remarks,
      createdAt: row.createdAt,
    };
  }
}
