/**
 * Settings collector — CPQ package settings, org preferences, feature toggles.
 *
 * Implements Extraction Spec Section 15:
 * - Step 15.1: SBQQ__PackageSetting__c (all CPQ package settings)
 * - Step 15.2: SBQQ__GeneralSetting__c (general configuration)
 * - Step 15.3: SBQQ__LineEditorSetting__c (line editor configuration)
 * - Step 15.4: SBQQ__CalculatorSetting__c (calculator settings)
 * - Step 15.5: SBQQ__PricingGuidanceSetting__c (pricing guidance)
 * - Step 15.6: Custom settings / custom metadata type detection
 * - Step 15.7: Settings comparison against defaults (non-default detection)
 *
 * See: Implementation Plan Task 5.4
 */

import { BaseCollector, type CollectorContext, type CollectorResult } from './base.ts';
import type { CollectorDefinition } from './registry.ts';

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
    // TODO: Step 15.1 — Query SBQQ__PackageSetting__c (singleton)
    //   Extract all populated fields

    // TODO: Step 15.2 — Query SBQQ__GeneralSetting__c
    //   Detect non-default values

    // TODO: Step 15.3 — Query SBQQ__LineEditorSetting__c
    //   Flag settings that affect RCA migration strategy

    // TODO: Step 15.4 — Query SBQQ__CalculatorSetting__c
    //   Detect async calculator mode, batch size overrides

    // TODO: Step 15.5 — Query SBQQ__PricingGuidanceSetting__c
    //   Check if pricing guidance is enabled

    // TODO: Step 15.6 — Detect custom settings and custom metadata types
    //   Query CustomObject where type = 'CustomSetting' or 'CustomMetadata'
    //   Filter for CPQ-related entries

    // TODO: Step 15.7 — Compare settings against known defaults
    //   Flag non-default values as migration-relevant findings

    return this.emptyResult('success');
  }
}
