import type {
  FeeMilestoneRepository,
  FeeMilestoneEntity,
  CreateFeeMilestoneInput,
  UpdateFeeMilestoneInput,
} from '@revbrain/contract';
import { mockFeeMilestones } from '../../mocks/index.ts';
import { generateId } from './helpers.ts';

// Row locking is a no-op in mock mode.
// Concurrency tests must run against drizzle or integration environment.

export class MockFeeMilestoneRepository implements FeeMilestoneRepository {
  async findByAgreementId(feeAgreementId: string): Promise<FeeMilestoneEntity[]> {
    return mockFeeMilestones
      .filter((m) => m.feeAgreementId === feeAgreementId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async findById(id: string): Promise<FeeMilestoneEntity | null> {
    return mockFeeMilestones.find((m) => m.id === id) ?? null;
  }

  async create(data: CreateFeeMilestoneInput): Promise<FeeMilestoneEntity> {
    const entity: FeeMilestoneEntity = {
      id: generateId(),
      feeAgreementId: data.feeAgreementId,
      name: data.name,
      phase: data.phase,
      triggerType: data.triggerType,
      percentageBps: data.percentageBps ?? null,
      amount: data.amount,
      status: data.status ?? 'pending',
      paidVia: data.paidVia ?? 'stripe_invoice',
      requestReason: null,
      requestedBy: null,
      requestedAt: null,
      rejectionReason: null,
      completedBy: null,
      completedAt: null,
      completionEvidence: null,
      stripeInvoiceId: null,
      stripeInvoiceUrl: null,
      stripePaymentIntentId: null,
      invoicedAt: null,
      paidAt: null,
      overdueAt: null,
      overdueReminderSentDay1At: null,
      overdueReminderSentDay7At: null,
      overdueReminderSentDay14At: null,
      sortOrder: data.sortOrder,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockFeeMilestones.push(entity);
    return entity;
  }

  async createMany(data: CreateFeeMilestoneInput[]): Promise<FeeMilestoneEntity[]> {
    const results: FeeMilestoneEntity[] = [];
    for (const d of data) {
      results.push(await this.create(d));
    }
    return results;
  }

  async update(id: string, data: UpdateFeeMilestoneInput): Promise<FeeMilestoneEntity | null> {
    const idx = mockFeeMilestones.findIndex((m) => m.id === id);
    if (idx === -1) return null;
    const updated = { ...mockFeeMilestones[idx], ...data, updatedAt: new Date() };
    mockFeeMilestones[idx] = updated;
    return updated;
  }

  async updateStatus(id: string, status: string): Promise<FeeMilestoneEntity | null> {
    return this.update(id, { status });
  }
}
