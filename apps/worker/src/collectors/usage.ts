/**
 * Usage collector — quote/order volume, adoption metrics, usage frequency analysis.
 *
 * Implements Extraction Spec Section 12:
 * - Step 12.1: SBQQ__Quote__c volume and status distribution
 * - Step 12.2: SBQQ__QuoteLine__c aggregation per product
 * - Step 12.3: Order and OrderItem volume analysis
 * - Step 12.4: Contract and Subscription lifecycle metrics
 * - Step 12.5: Amendment and renewal frequency
 * - Step 12.6: Feature adoption scoring (which CPQ features are actually used)
 * - Step 12.7: Time-series usage trends (monthly buckets, 12-month window)
 * - Step 12.8: Dormant vs active entity classification
 *
 * See: Implementation Plan Task 4.3
 */

import { BaseCollector, type CollectorContext, type CollectorResult } from './base.ts';
import type { CollectorDefinition } from './registry.ts';

export class UsageCollector extends BaseCollector {
  constructor(ctx: CollectorContext) {
    const definition: CollectorDefinition = {
      name: 'usage',
      tier: 'tier0',
      timeoutMs: 45 * 60_000,
      requires: ['discovery'],
      domain: 'usage',
    };
    super(definition, ctx);
  }

  protected async execute(): Promise<CollectorResult> {
    // TODO: Step 12.1 — Query SBQQ__Quote__c aggregate stats
    //   COUNT by Status, CreatedDate monthly buckets
    //   Use Bulk API for large orgs (>50k quotes)

    // TODO: Step 12.2 — Query SBQQ__QuoteLine__c per-product aggregation
    //   Identify most-quoted products, average bundle size

    // TODO: Step 12.3 — Query Order + OrderItem volume
    //   Distinguish CPQ-generated orders from non-CPQ orders

    // TODO: Step 12.4 — Query Contract + SBQQ__Subscription__c lifecycle
    //   Renewal rate, average contract duration

    // TODO: Step 12.5 — Amendment and renewal frequency
    //   Detect amendment patterns (mid-term changes, co-termination)

    // TODO: Step 12.6 — Feature adoption scoring
    //   Score usage of: bundles, discount schedules, price rules,
    //   product rules, approval chains, guided selling, etc.

    // TODO: Step 12.7 — Build time-series usage trends
    //   Monthly buckets for quotes, orders, amendments over 12 months

    // TODO: Step 12.8 — Classify dormant vs active entities
    //   Products, price rules, discount schedules with no recent usage

    return this.emptyResult('success');
  }
}
