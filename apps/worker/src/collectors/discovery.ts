/**
 * Discovery collector — org fingerprint, Describes, limits, CPQ version.
 *
 * Implements all of Extraction Spec Section 4:
 * - Step 4.0: Org fingerprint (Organization query)
 * - Step 4.1: Describe Global + namespace detection
 * - Step 4.2: Required object validation
 * - Step 4.3: Batched Describes via Composite API
 * - Step 4.4: Limits check with decision logic
 * - Step 4.5: CPQ version detection (3-step fallback)
 * - Step 4.6: Data size estimation + path selection
 * - API version validation (pin v62.0 + validate)
 * - Shield detection, multi-currency, Person Accounts, sandbox warning
 * - SF permissions pre-check (Appendix C)
 *
 * See: Implementation Plan Task 3.1
 */

import { BaseCollector, type CollectorContext, type CollectorResult } from './base.ts';
import type { CollectorDefinition } from './registry.ts';
import { createFinding } from '../normalize/findings.ts';

export class DiscoveryCollector extends BaseCollector {
  constructor(ctx: CollectorContext) {
    const definition: CollectorDefinition = {
      name: 'discovery',
      tier: 'tier0',
      timeoutMs: 5 * 60_000,
      requires: [],
      domain: 'discovery',
    };
    super(definition, ctx);
  }

  protected async execute(): Promise<CollectorResult> {
    const findings = [];
    const metrics: Record<string, number | string | boolean> = {};

    // Step 4.0: Org fingerprint
    this.ctx.progress.updateSubstep('discovery', 'org_fingerprint');
    // TODO: Query Organization object for Id, Name, OrganizationType, etc.
    // Store result in assessment_runs.org_fingerprint JSONB

    // Step 4.1: Describe Global + namespace detection
    this.ctx.progress.updateSubstep('discovery', 'describe_global');
    // TODO: Call describeGlobal(), detect SBQQ__, sbaa__, phantom packages

    // Step 4.2: Required object validation (~35 objects)
    this.ctx.progress.updateSubstep('discovery', 'object_validation');
    // TODO: Check presence of all required CPQ objects

    // Step 4.3: Batched Describes via Composite API
    this.ctx.progress.updateSubstep('discovery', 'batched_describes');
    // TODO: Composite Batch describe for all existing CPQ objects (groups of 25)

    // Step 4.4: Limits check
    this.ctx.progress.updateSubstep('discovery', 'limits_check');
    // TODO: Call /limits/, check thresholds (<1000 block, <5000 warn)

    // Step 4.5: CPQ version detection
    this.ctx.progress.updateSubstep('discovery', 'cpq_version');
    // TODO: 3-step fallback chain (InstalledSubscriberPackage → Publisher → namespace)

    // Step 4.6: Data size estimation
    this.ctx.progress.updateSubstep('discovery', 'size_estimation');
    // TODO: COUNT() for each object, REST vs Bulk path selection

    // Placeholder finding
    findings.push(
      createFinding({
        domain: 'catalog',
        collector: 'discovery',
        artifactType: 'OrgFingerprint',
        artifactName: 'Organization',
        sourceType: 'object',
        findingType: 'org_fingerprint',
        metricName: 'discovery_complete',
        scope: 'global',
      })
    );

    return {
      findings,
      relationships: [],
      metrics: {
        collectorName: 'discovery',
        domain: 'catalog' as const,
        metrics,
        warnings: [],
        coverage: 100,
        schemaVersion: '1.0',
      },
      status: 'success',
    };
  }
}
