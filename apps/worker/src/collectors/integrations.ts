/**
 * Integrations collector — connected apps, external references, API usage.
 *
 * Implements Extraction Spec Section 11:
 * - Step 11.1: Connected App detection (OAuth consumers)
 * - Step 11.2: Named Credential extraction
 * - Step 11.3: External Service references in CPQ context
 * - Step 11.4: Outbound Message / Platform Event usage
 * - Step 11.5: External ID field detection on CPQ objects
 * - Step 11.6: Apex callout detection (HTTP references in CPQ-related classes)
 * - Step 11.7: Integration complexity scoring
 *
 * Requires: discovery (for object metadata), dependencies (for Apex/flow references)
 *
 * See: Implementation Plan Task 6.3
 */

import { BaseCollector, type CollectorContext, type CollectorResult } from './base.ts';
import type { CollectorDefinition } from './registry.ts';

export class IntegrationsCollector extends BaseCollector {
  constructor(ctx: CollectorContext) {
    const definition: CollectorDefinition = {
      name: 'integrations',
      tier: 'tier2',
      timeoutMs: 10 * 60_000,
      requires: ['discovery', 'dependencies'],
      domain: 'integration',
    };
    super(definition, ctx);
  }

  protected async execute(): Promise<CollectorResult> {
    // TODO: Step 11.1 — Detect Connected Apps
    //   Query ConnectedApplication via Tooling API

    // TODO: Step 11.2 — Query Named Credentials
    //   Detect credentials used by CPQ-related Apex

    // TODO: Step 11.3 — Detect External Service references
    //   Query ExternalServiceRegistration via Tooling API

    // TODO: Step 11.4 — Detect Outbound Messages and Platform Events
    //   Query WorkflowOutboundMessage for CPQ objects
    //   Detect PlatformEvent subscriptions related to CPQ

    // TODO: Step 11.5 — Detect External ID fields on CPQ objects
    //   Filter Describe cache for externalId=true fields

    // TODO: Step 11.6 — Detect Apex callouts in CPQ-related classes
    //   Leverage dependency collector results for Apex class list
    //   Search for Http, HttpRequest, WebServiceCallout patterns

    // TODO: Step 11.7 — Calculate integration complexity score
    //   Factor in: connected apps, callouts, external IDs, platform events

    return this.emptyResult('success');
  }
}
