import type {
  FeeAgreementRepository,
  FeeAgreementEntity,
  CreateFeeAgreementInput,
  UpdateFeeAgreementInput,
  // FindManyOptions - not used in this repo
} from '@revbrain/contract';
import { mockFeeAgreements, mockProjects } from '../../mocks/index.ts';
import { generateId } from './helpers.ts';

const ACTIVE_STATUSES = [
  'draft',
  'active_assessment',
  'migration_pending_review',
  'active_migration',
];

export class MockFeeAgreementRepository implements FeeAgreementRepository {
  async findById(id: string): Promise<FeeAgreementEntity | null> {
    return mockFeeAgreements.find((a) => a.id === id) ?? null;
  }

  async findByProjectId(projectId: string): Promise<FeeAgreementEntity[]> {
    return mockFeeAgreements.filter((a) => a.projectId === projectId);
  }

  /**
   * Find the latest non-terminal agreement for a project.
   * ORDER BY version DESC LIMIT 1.
   */
  async findActiveByProjectId(projectId: string): Promise<FeeAgreementEntity | null> {
    const active = mockFeeAgreements
      .filter((a) => a.projectId === projectId && ACTIVE_STATUSES.includes(a.status))
      .sort((a, b) => b.version - a.version);
    return active[0] ?? null;
  }

  async findByOrgId(organizationId: string): Promise<FeeAgreementEntity[]> {
    const orgProjectIds = new Set(
      mockProjects.filter((p) => p.organizationId === organizationId).map((p) => p.id)
    );
    return mockFeeAgreements.filter((a) => orgProjectIds.has(a.projectId));
  }

  async create(data: CreateFeeAgreementInput): Promise<FeeAgreementEntity> {
    const entity: FeeAgreementEntity = {
      id: generateId(),
      projectId: data.projectId,
      supersedesAgreementId: data.supersedesAgreementId ?? null,
      version: data.version ?? 1,
      status: 'draft',
      assessmentFee: data.assessmentFee,
      declaredProjectValue: null,
      capAmount: data.capAmount ?? null,
      calculatedTotalFee: null,
      calculatedRemainingFee: null,
      carriedCreditAmount: data.carriedCreditAmount ?? 0,
      carriedCreditSourceAgreementId: data.carriedCreditSourceAgreementId ?? null,
      paymentTerms: data.paymentTerms ?? 'net_30',
      currency: 'usd',
      createdBy: data.createdBy ?? null,
      assessmentTermsSnapshot: null,
      assessmentTermsSnapshotHash: null,
      acceptedBy: null,
      acceptedAt: null,
      acceptedFromIp: null,
      sowFileId: null,
      migrationTermsSnapshot: null,
      migrationTermsSnapshotHash: null,
      migrationAcceptedBy: null,
      migrationAcceptedAt: null,
      migrationAcceptedFromIp: null,
      assessmentCloseReason: null,
      assessmentCloseNotes: null,
      cancelledBy: null,
      cancellationReason: null,
      cancelledAt: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockFeeAgreements.push(entity);
    return entity;
  }

  async update(id: string, data: UpdateFeeAgreementInput): Promise<FeeAgreementEntity | null> {
    const idx = mockFeeAgreements.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    const updated = { ...mockFeeAgreements[idx], ...data, updatedAt: new Date() };
    mockFeeAgreements[idx] = updated;
    return updated;
  }

  async count(): Promise<number> {
    return mockFeeAgreements.length;
  }
}
