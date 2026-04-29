import type {
  PartnerProfileRepository,
  PartnerProfileEntity,
  CreatePartnerProfileInput,
  UpdatePartnerProfileInput,
  FindManyOptions,
} from '@revbrain/contract';
import { mockPartnerProfiles } from '../../mocks/index.ts';
import { generateId, applyPagination, applySorting } from './helpers.ts';

export class MockPartnerProfileRepository implements PartnerProfileRepository {
  async findById(id: string): Promise<PartnerProfileEntity | null> {
    return mockPartnerProfiles.find((p) => p.id === id) ?? null;
  }

  async findByOrgId(organizationId: string): Promise<PartnerProfileEntity | null> {
    return mockPartnerProfiles.find((p) => p.organizationId === organizationId) ?? null;
  }

  async findMany(options?: FindManyOptions): Promise<PartnerProfileEntity[]> {
    let items = [...mockPartnerProfiles];
    const field = (options?.orderBy?.field as keyof PartnerProfileEntity) || 'createdAt';
    items = applySorting(items, field, options?.orderBy?.direction || 'desc');
    return applyPagination(items, options);
  }

  async create(data: CreatePartnerProfileInput): Promise<PartnerProfileEntity> {
    const entity: PartnerProfileEntity = {
      id: generateId(),
      organizationId: data.organizationId,
      tier: data.tier ?? 'standard',
      cumulativeFeesPaid: data.cumulativeFeesPaid ?? 0,
      completedProjectCount: data.completedProjectCount ?? 0,
      tierOverride: null,
      tierOverrideReason: null,
      tierOverrideSetBy: null,
      tierOverrideSetAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockPartnerProfiles.push(entity);
    return entity;
  }

  async update(id: string, data: UpdatePartnerProfileInput): Promise<PartnerProfileEntity | null> {
    const idx = mockPartnerProfiles.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    const updated = { ...mockPartnerProfiles[idx], ...data, updatedAt: new Date() };
    mockPartnerProfiles[idx] = updated;
    return updated;
  }

  async updateCumulativeFees(
    id: string,
    cumulativeFeesPaid: number,
    completedProjectCount: number
  ): Promise<PartnerProfileEntity | null> {
    return this.update(id, { cumulativeFeesPaid, completedProjectCount });
  }

  async count(): Promise<number> {
    return mockPartnerProfiles.length;
  }
}
