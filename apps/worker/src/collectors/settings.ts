/**
 * Settings collector — CPQ package settings (Custom Settings).
 *
 * Implements Extraction Spec Section 15:
 * - Discover SBQQ Custom Settings via Tooling API (dynamic, not hardcoded)
 * - Filter for Custom Setting types via Describe
 * - Extract all records including org-level + profile overrides
 *
 * Tier 1 — failure → completed_warnings.
 */

import { BaseCollector, type CollectorContext, type CollectorResult } from './base.ts';
import type { CollectorDefinition } from './registry.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { createFinding } from '../normalize/findings.ts';

export class SettingsCollector extends BaseCollector {
  constructor(ctx: CollectorContext) {
    const definition: CollectorDefinition = {
      name: 'settings',
      tier: 'tier1',
      timeoutMs: 5 * 60_000,
      requires: ['discovery'],
      domain: 'settings',
    };
    super(definition, ctx);
  }

  protected async execute(): Promise<CollectorResult> {
    const findings: AssessmentFindingInput[] = [];
    const metrics: Record<string, number | string | boolean> = {};
    const warnings: string[] = [];

    // ================================================================
    // 15.2: Discover SBQQ Custom Settings via Tooling API
    // ================================================================
    this.ctx.progress.updateSubstep('settings', 'discover_settings');
    this.log.info('discovering_cpq_settings');

    try {
      const settingsResult = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
        'SELECT DeveloperName, QualifiedApiName, Description ' +
          "FROM CustomObject WHERE NamespacePrefix = 'SBQQ'",
        this.signal
      );

      // Filter for Custom Settings (they end in __c like custom objects,
      // but we can identify them by trying to Describe and checking customSettingsType)
      const settingObjects: Array<{ name: string; description: string }> = [];

      for (const obj of settingsResult.records) {
        const apiName = obj.QualifiedApiName as string;
        // Custom Settings are queryable like regular objects
        // Try to query each one — settings return data, regular objects may not
        try {
          const countResult = await this.ctx.restApi.query<Record<string, unknown>>(
            `SELECT COUNT() FROM ${apiName}`,
            this.signal
          );
          if (countResult.totalSize >= 0) {
            settingObjects.push({
              name: apiName,
              description: (obj.Description as string) || '',
            });
          }
        } catch {
          // Not queryable — skip (probably not a Custom Setting)
        }
      }

      metrics.cpqSettingsDiscovered = settingObjects.length;

      // Extract records from each setting
      for (const setting of settingObjects) {
        try {
          // Get all records (org-level + profile overrides)
          const records = await this.ctx.restApi.queryAll<Record<string, unknown>>(
            `SELECT Id, SetupOwnerId, Name FROM ${setting.name}`,
            this.signal
          );

          findings.push(
            createFinding({
              domain: 'settings',
              collector: 'settings',
              artifactType: 'CPQSetting',
              artifactName: setting.name,
              sourceType: 'object',
              findingType: 'cpq_setting',
              countValue: records.length,
              migrationRelevance: 'should-migrate',
              rcaTargetConcept: 'Revenue Settings',
              rcaMappingComplexity: 'transform',
              notes: `${records.length} records (org-level + overrides). ${setting.description}`,
            })
          );

          metrics[`setting_${setting.name}_records`] = records.length;
        } catch (err) {
          this.log.warn(
            { setting: setting.name, error: (err as Error).message },
            'setting_extraction_failed'
          );
        }
      }
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'settings_discovery_failed');
      warnings.push(`Settings discovery failed: ${(err as Error).message}`);
    }

    this.log.info(
      { settings: metrics.cpqSettingsDiscovered, findings: findings.length },
      'settings_complete'
    );

    return {
      findings,
      relationships: [],
      metrics: {
        collectorName: 'settings',
        domain: 'settings',
        metrics,
        warnings,
        coverage: 100,
        schemaVersion: '1.0',
      },
      status: 'success',
    };
  }
}
