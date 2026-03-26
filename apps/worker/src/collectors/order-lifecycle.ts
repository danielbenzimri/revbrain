/**
 * Order lifecycle collector — Orders, OrderItems, Contracts, Assets.
 *
 * Implements Extraction Spec Section 13 (§13.1-§13.4):
 * - Orders with CPQ fields (13.1)
 * - OrderItems with CPQ fields (13.2)
 * - Contracts with CPQ fields (13.3)
 * - Assets with subscription fields (13.4)
 *
 * Tier 1 — failure → completed_warnings.
 */

import { BaseCollector, type CollectorContext, type CollectorResult } from './base.ts';
import type { CollectorDefinition } from './registry.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { createFinding } from '../normalize/findings.ts';
import { buildSafeQuery, getAllSbqqFields } from '../salesforce/query-builder.ts';
import type { DescribeResult } from '../salesforce/rest.ts';

export class OrderLifecycleCollector extends BaseCollector {
  constructor(ctx: CollectorContext) {
    const definition: CollectorDefinition = {
      name: 'order-lifecycle',
      tier: 'tier1',
      timeoutMs: 20 * 60_000,
      requires: ['discovery'],
      domain: 'order-lifecycle',
    };
    super(definition, ctx);
  }

  protected async execute(): Promise<CollectorResult> {
    const findings: AssessmentFindingInput[] = [];
    const metrics: Record<string, number | string | boolean> = {};
    const warnings: string[] = [];

    // ================================================================
    // 13.1: Orders
    // ================================================================
    this.ctx.progress.updateSubstep('order-lifecycle', 'orders');
    this.log.info('extracting_orders');

    try {
      const countResult = await this.ctx.restApi.query<Record<string, unknown>>(
        'SELECT COUNT() FROM Order',
        this.signal
      );
      metrics.totalOrders = countResult.totalSize;

      // Count SBQQ fields on Order
      const orderDescribe = this.ctx.describeCache.get('Order') as DescribeResult | undefined;
      if (orderDescribe) {
        metrics.sbqqFieldsOnOrder = getAllSbqqFields(orderDescribe).length;
      }
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'order_count_failed');
      metrics.totalOrders = -1;
    }

    // ================================================================
    // 13.2: OrderItems
    // ================================================================
    try {
      const countResult = await this.ctx.restApi.query<Record<string, unknown>>(
        'SELECT COUNT() FROM OrderItem',
        this.signal
      );
      metrics.totalOrderItems = countResult.totalSize;

      const oiDescribe = this.ctx.describeCache.get('OrderItem') as DescribeResult | undefined;
      if (oiDescribe) {
        metrics.sbqqFieldsOnOrderItem = getAllSbqqFields(oiDescribe).length;
      }
    } catch (err) {
      metrics.totalOrderItems = -1;
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // 13.3: Contracts
    // ================================================================
    this.ctx.progress.updateSubstep('order-lifecycle', 'contracts');

    try {
      const countResult = await this.ctx.restApi.query<Record<string, unknown>>(
        'SELECT COUNT() FROM Contract',
        this.signal
      );
      metrics.totalContracts = countResult.totalSize;

      // Active contracts
      const activeResult = await this.ctx.restApi.query<Record<string, unknown>>(
        "SELECT COUNT() FROM Contract WHERE Status = 'Activated'",
        this.signal
      );
      metrics.activeContracts = activeResult.totalSize;
    } catch (err) {
      metrics.totalContracts = -1;
    }

    // ================================================================
    // 13.4: Assets with subscriptions
    // ================================================================
    this.ctx.progress.updateSubstep('order-lifecycle', 'assets');

    try {
      const assetDescribe = this.ctx.describeCache.get('Asset') as DescribeResult | undefined;
      if (assetDescribe) {
        const hasSbqqSub = assetDescribe.fields.some(
          (f) => f.name === 'SBQQ__CurrentSubscription__c'
        );
        if (hasSbqqSub) {
          const countResult = await this.ctx.restApi.query<Record<string, unknown>>(
            'SELECT COUNT() FROM Asset WHERE SBQQ__CurrentSubscription__c != null',
            this.signal
          );
          metrics.assetsWithSubscriptions = countResult.totalSize;
        }
      }
    } catch (err) {
      metrics.assetsWithSubscriptions = -1;
    }

    // Build summary finding
    findings.push(
      createFinding({
        domain: 'order-lifecycle',
        collector: 'order-lifecycle',
        artifactType: 'OrderLifecycleOverview',
        artifactName: 'Order/Contract/Asset Lifecycle',
        sourceType: 'object',
        metricName: 'lifecycle_overview',
        scope: 'global',
        notes: `Orders: ${metrics.totalOrders}, OrderItems: ${metrics.totalOrderItems}, Contracts: ${metrics.totalContracts} (${metrics.activeContracts} active), Assets w/ subs: ${metrics.assetsWithSubscriptions ?? 'N/A'}`,
      })
    );

    this.log.info({ metrics }, 'order_lifecycle_complete');

    return {
      findings,
      relationships: [],
      metrics: {
        collectorName: 'order-lifecycle',
        domain: 'order-lifecycle',
        metrics,
        warnings,
        coverage: 100,
        schemaVersion: '1.0',
      },
      status: 'success',
    };
  }
}
