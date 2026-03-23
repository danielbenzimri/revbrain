/**
 * Salesforce Post-Connection Audit Service
 *
 * Runs permission and capability checks against a connected Salesforce org.
 * Returns partial results even if individual checks fail.
 * Each check has a 5-second timeout to prevent blocking the callback flow.
 */

import { logger } from '../lib/logger.ts';

// ============================================================================
// Types
// ============================================================================

export interface ConnectionMetadata {
  cpqInstalled: boolean;
  cpqVersion: string | null;
  rcaAvailable: boolean;
  apiVersion: string;
  dailyApiLimit: number | null;
  dailyApiRemaining: number | null;
  sfEdition: string | null;
  authorizingUserProfile: string | null;
  missingPermissions: string[];
}

interface SalesforceApiVersion {
  label: string;
  url: string;
  version: string;
}

// ============================================================================
// Service
// ============================================================================

export class SalesforceAuditService {
  /**
   * Run post-connection permission audit.
   * Checks CPQ installation, object access, API budget.
   * Returns partial results even if some checks fail.
   * Each check has a 5s timeout.
   */
  async runPostConnectionAudit(
    accessToken: string,
    instanceUrl: string,
    connectionRole: 'source' | 'target'
  ): Promise<ConnectionMetadata> {
    const metadata: ConnectionMetadata = {
      cpqInstalled: false,
      cpqVersion: null,
      rcaAvailable: false,
      apiVersion: '',
      dailyApiLimit: null,
      dailyApiRemaining: null,
      sfEdition: null,
      authorizingUserProfile: null,
      missingPermissions: [],
    };

    // Step 1: Discover latest API version
    const apiVersion = await this.fetchLatestApiVersion(instanceUrl, accessToken);
    if (!apiVersion) {
      logger.warn('Salesforce audit: could not determine API version', {
        instanceUrl,
      });
      return metadata;
    }
    metadata.apiVersion = apiVersion;

    // Steps 2-5 run in parallel for speed
    const [cpqResult, quoteAccess, rcaResult, limitsResult] = await Promise.allSettled([
      this.checkCpqInstallation(instanceUrl, accessToken, apiVersion),
      this.checkObjectAccess(instanceUrl, accessToken, apiVersion, 'SBQQ__Quote__c'),
      connectionRole === 'target'
        ? this.checkObjectAccess(instanceUrl, accessToken, apiVersion, 'ProductSellingModel')
        : Promise.resolve({ accessible: true }),
      this.fetchApiLimits(instanceUrl, accessToken, apiVersion),
    ]);

    // Process CPQ result
    if (cpqResult.status === 'fulfilled' && cpqResult.value) {
      metadata.cpqInstalled = cpqResult.value.installed;
      metadata.cpqVersion = cpqResult.value.version;
    }

    // Process Quote object access
    if (quoteAccess.status === 'fulfilled') {
      if (!quoteAccess.value.accessible) {
        metadata.missingPermissions.push('SBQQ__Quote__c (read)');
      }
    } else {
      metadata.missingPermissions.push('SBQQ__Quote__c (read)');
    }

    // Process RCA availability (target only)
    if (connectionRole === 'target') {
      if (rcaResult.status === 'fulfilled') {
        metadata.rcaAvailable = rcaResult.value.accessible;
        if (!rcaResult.value.accessible) {
          metadata.missingPermissions.push('ProductSellingModel (read)');
        }
      }
    }

    // Process API limits
    if (limitsResult.status === 'fulfilled' && limitsResult.value) {
      metadata.dailyApiLimit = limitsResult.value.limit;
      metadata.dailyApiRemaining = limitsResult.value.remaining;
    }

    return metadata;
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Discover the latest API version from the Salesforce versions endpoint.
   */
  private async fetchLatestApiVersion(
    instanceUrl: string,
    accessToken: string
  ): Promise<string | null> {
    try {
      const response = await this.sfFetch(`${instanceUrl}/services/data/`, accessToken);

      if (!response.ok) {
        return null;
      }

      const versions = (await response.json()) as SalesforceApiVersion[];
      if (!Array.isArray(versions) || versions.length === 0) {
        return null;
      }

      // Versions are sorted ascending; take the last one
      const latest = versions[versions.length - 1];
      return `v${latest.version}`;
    } catch (error) {
      logger.warn('Salesforce audit: failed to fetch API versions', {}, error as Error);
      return null;
    }
  }

  /**
   * Check if Salesforce CPQ (SBQQ) is installed.
   * Tries Tooling API first (InstalledSubscriberPackage), falls back to Publisher query.
   */
  private async checkCpqInstallation(
    instanceUrl: string,
    accessToken: string,
    apiVersion: string
  ): Promise<{ installed: boolean; version: string | null }> {
    // Attempt 1: Tooling API query for installed packages
    try {
      const toolingQuery = encodeURIComponent(
        "SELECT SubscriberPackage.Name, SubscriberPackageVersion.MajorVersion, SubscriberPackageVersion.MinorVersion, SubscriberPackageVersion.PatchVersion FROM InstalledSubscriberPackage WHERE SubscriberPackage.NamespacePrefix = 'SBQQ'"
      );
      const response = await this.sfFetch(
        `${instanceUrl}/services/data/${apiVersion}/tooling/query?q=${toolingQuery}`,
        accessToken
      );

      if (response.ok) {
        const data = (await response.json()) as {
          totalSize: number;
          records: Array<{
            SubscriberPackageVersion?: {
              MajorVersion?: number;
              MinorVersion?: number;
              PatchVersion?: number;
            };
          }>;
        };

        if (data.totalSize > 0) {
          const record = data.records[0];
          const ver = record.SubscriberPackageVersion;
          const version = ver
            ? `${ver.MajorVersion ?? 0}.${ver.MinorVersion ?? 0}.${ver.PatchVersion ?? 0}`
            : null;
          return { installed: true, version };
        }
        return { installed: false, version: null };
      }

      // 403 or other error — try fallback
    } catch {
      // Swallow and try fallback
    }

    // Attempt 2: Publisher query fallback (less restrictive permissions)
    try {
      const publisherQuery = encodeURIComponent(
        "SELECT Id, Name, NamespacePrefix FROM Publisher WHERE NamespacePrefix = 'SBQQ' LIMIT 1"
      );
      const response = await this.sfFetch(
        `${instanceUrl}/services/data/${apiVersion}/query?q=${publisherQuery}`,
        accessToken
      );

      if (response.ok) {
        const data = (await response.json()) as { totalSize: number };
        return { installed: data.totalSize > 0, version: null };
      }
    } catch {
      // Swallow — will return default
    }

    return { installed: false, version: null };
  }

  /**
   * Check if a Salesforce object is accessible by the authorizing user.
   * Uses the describe endpoint which returns 403 if the user lacks access.
   */
  private async checkObjectAccess(
    instanceUrl: string,
    accessToken: string,
    apiVersion: string,
    objectName: string
  ): Promise<{ accessible: boolean }> {
    try {
      const response = await this.sfFetch(
        `${instanceUrl}/services/data/${apiVersion}/sobjects/${objectName}/describe`,
        accessToken
      );

      if (response.ok) {
        return { accessible: true };
      }

      // 403 or 404 means no access or object doesn't exist
      return { accessible: false };
    } catch {
      return { accessible: false };
    }
  }

  /**
   * Fetch API usage limits from the Salesforce limits endpoint.
   */
  private async fetchApiLimits(
    instanceUrl: string,
    accessToken: string,
    apiVersion: string
  ): Promise<{ limit: number; remaining: number } | null> {
    try {
      const response = await this.sfFetch(
        `${instanceUrl}/services/data/${apiVersion}/limits`,
        accessToken
      );

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as Record<string, { Max: number; Remaining: number }>;

      const dailyApi = data['DailyApiRequests'];
      if (dailyApi) {
        return { limit: dailyApi.Max, remaining: dailyApi.Remaining };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Make a fetch request to Salesforce with Bearer auth and a 5s timeout.
   */
  private async sfFetch(url: string, accessToken: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    try {
      return await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
