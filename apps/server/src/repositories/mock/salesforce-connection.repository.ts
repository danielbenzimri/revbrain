import type {
  SalesforceConnectionRepository,
  SalesforceConnectionEntity,
  CreateSalesforceConnectionInput,
} from '@revbrain/contract';
import { mockSalesforceConnections } from '../../mocks/index.ts';
import { generateId, validateFilters, applyFilters } from './helpers.ts';

const ALLOWED_FILTERS = ['organizationId', 'projectId', 'status', 'connectionRole'] as const;

export class MockSalesforceConnectionRepository implements SalesforceConnectionRepository {
  async findById(id: string): Promise<SalesforceConnectionEntity | null> {
    return mockSalesforceConnections.find((c) => c.id === id) ?? null;
  }

  async findByProjectAndRole(
    projectId: string,
    role: 'source' | 'target'
  ): Promise<SalesforceConnectionEntity | null> {
    return (
      mockSalesforceConnections.find(
        (c) => c.projectId === projectId && c.connectionRole === role
      ) ?? null
    );
  }

  async findByProject(projectId: string): Promise<SalesforceConnectionEntity[]> {
    return mockSalesforceConnections.filter((c) => c.projectId === projectId);
  }

  async findByOrganization(organizationId: string): Promise<SalesforceConnectionEntity[]> {
    return mockSalesforceConnections.filter((c) => c.organizationId === organizationId);
  }

  async findAllActive(): Promise<SalesforceConnectionEntity[]> {
    return mockSalesforceConnections.filter((c) => c.status === 'active');
  }

  async create(data: CreateSalesforceConnectionInput): Promise<SalesforceConnectionEntity> {
    const now = new Date();
    const entity: SalesforceConnectionEntity = {
      id: generateId(),
      projectId: data.projectId,
      organizationId: data.organizationId,
      connectionRole: data.connectionRole,
      salesforceOrgId: data.salesforceOrgId,
      salesforceInstanceUrl: data.salesforceInstanceUrl,
      customLoginUrl: data.customLoginUrl ?? null,
      oauthBaseUrl: data.oauthBaseUrl,
      salesforceUserId: data.salesforceUserId ?? null,
      salesforceUsername: data.salesforceUsername ?? null,
      instanceType: data.instanceType,
      apiVersion: data.apiVersion ?? null,
      connectionMetadata: null,
      status: 'active',
      lastUsedAt: null,
      lastSuccessfulApiCallAt: null,
      lastError: null,
      lastErrorAt: null,
      connectedBy: data.connectedBy,
      disconnectedBy: null,
      disconnectedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    mockSalesforceConnections.push(entity);
    return entity;
  }

  async updateStatus(
    id: string,
    status: string,
    error?: string | null
  ): Promise<SalesforceConnectionEntity | null> {
    const idx = mockSalesforceConnections.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    const now = new Date();
    const updated: SalesforceConnectionEntity = {
      ...mockSalesforceConnections[idx],
      status,
      lastError: error ?? null,
      lastErrorAt: error ? now : mockSalesforceConnections[idx].lastErrorAt,
      updatedAt: now,
    };
    mockSalesforceConnections[idx] = updated;
    return updated;
  }

  async updateMetadata(
    id: string,
    metadata: Record<string, unknown>
  ): Promise<SalesforceConnectionEntity | null> {
    const idx = mockSalesforceConnections.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    const updated: SalesforceConnectionEntity = {
      ...mockSalesforceConnections[idx],
      connectionMetadata: metadata,
      updatedAt: new Date(),
    };
    mockSalesforceConnections[idx] = updated;
    return updated;
  }

  async disconnect(id: string, disconnectedBy: string): Promise<boolean> {
    const idx = mockSalesforceConnections.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    const now = new Date();
    mockSalesforceConnections[idx] = {
      ...mockSalesforceConnections[idx],
      status: 'disconnected',
      disconnectedBy,
      disconnectedAt: now,
      updatedAt: now,
    };
    return true;
  }

  async delete(id: string): Promise<boolean> {
    const idx = mockSalesforceConnections.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    mockSalesforceConnections.splice(idx, 1);
    return true;
  }
}
