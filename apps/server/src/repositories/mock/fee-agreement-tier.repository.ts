import type {
  FeeAgreementTierRepository,
  FeeAgreementTierEntity,
  CreateFeeAgreementTierInput,
} from '@revbrain/contract';
import { mockFeeAgreementTiers } from '../../mocks/index.ts';
import { generateId } from './helpers.ts';

export class MockFeeAgreementTierRepository implements FeeAgreementTierRepository {
  async findByAgreementId(feeAgreementId: string): Promise<FeeAgreementTierEntity[]> {
    return mockFeeAgreementTiers
      .filter((t) => t.feeAgreementId === feeAgreementId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async createMany(data: CreateFeeAgreementTierInput[]): Promise<FeeAgreementTierEntity[]> {
    const created: FeeAgreementTierEntity[] = data.map((d) => ({
      id: generateId(),
      feeAgreementId: d.feeAgreementId,
      bracketCeiling: d.bracketCeiling,
      rateBps: d.rateBps,
      sortOrder: d.sortOrder,
      createdAt: new Date(),
    }));
    mockFeeAgreementTiers.push(...created);
    return created;
  }

  async deleteByAgreementId(feeAgreementId: string): Promise<boolean> {
    const before = mockFeeAgreementTiers.length;
    const remaining = mockFeeAgreementTiers.filter((t) => t.feeAgreementId !== feeAgreementId);
    mockFeeAgreementTiers.length = 0;
    mockFeeAgreementTiers.push(...remaining);
    return mockFeeAgreementTiers.length < before;
  }
}
