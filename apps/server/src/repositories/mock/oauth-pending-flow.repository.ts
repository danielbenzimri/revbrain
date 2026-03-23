import type {
  OauthPendingFlowRepository,
  OauthPendingFlowEntity,
  CreateOauthPendingFlowInput,
} from '@revbrain/contract';

/** In-memory store for pending OAuth flows (not seeded — flows are transient) */
const mockOauthPendingFlows: OauthPendingFlowEntity[] = [];

export class MockOauthPendingFlowRepository implements OauthPendingFlowRepository {
  async create(data: CreateOauthPendingFlowInput): Promise<OauthPendingFlowEntity> {
    const entity: OauthPendingFlowEntity = {
      nonce: data.nonce,
      projectId: data.projectId,
      organizationId: data.organizationId,
      userId: data.userId,
      connectionRole: data.connectionRole,
      codeVerifier: data.codeVerifier,
      oauthBaseUrl: data.oauthBaseUrl,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
    };
    mockOauthPendingFlows.push(entity);
    return entity;
  }

  async findByNonce(nonce: string): Promise<OauthPendingFlowEntity | null> {
    return mockOauthPendingFlows.find((f) => f.nonce === nonce) ?? null;
  }

  async deleteByNonce(nonce: string): Promise<boolean> {
    const idx = mockOauthPendingFlows.findIndex((f) => f.nonce === nonce);
    if (idx === -1) return false;
    mockOauthPendingFlows.splice(idx, 1);
    return true;
  }

  async upsertForProject(data: CreateOauthPendingFlowInput): Promise<OauthPendingFlowEntity> {
    const now = new Date();
    const existingIdx = mockOauthPendingFlows.findIndex(
      (f) => f.projectId === data.projectId && f.connectionRole === data.connectionRole
    );

    if (existingIdx !== -1) {
      const existing = mockOauthPendingFlows[existingIdx];
      // If existing flow is still live, reject
      if (existing.expiresAt.getTime() > now.getTime()) {
        throw new Error(
          `A pending OAuth flow already exists for project ${data.projectId} role ${data.connectionRole}`
        );
      }
      // Expired — remove before inserting replacement
      mockOauthPendingFlows.splice(existingIdx, 1);
    }

    return this.create(data);
  }

  async findLiveByProjectAndRole(
    projectId: string,
    role: string
  ): Promise<OauthPendingFlowEntity | null> {
    const now = new Date();
    return (
      mockOauthPendingFlows.find(
        (f) =>
          f.projectId === projectId &&
          f.connectionRole === role &&
          f.expiresAt.getTime() > now.getTime()
      ) ?? null
    );
  }

  async cleanupExpired(): Promise<number> {
    const now = new Date();
    const beforeLen = mockOauthPendingFlows.length;
    let i = mockOauthPendingFlows.length;
    while (i--) {
      if (mockOauthPendingFlows[i].expiresAt.getTime() <= now.getTime()) {
        mockOauthPendingFlows.splice(i, 1);
      }
    }
    return beforeLen - mockOauthPendingFlows.length;
  }
}
