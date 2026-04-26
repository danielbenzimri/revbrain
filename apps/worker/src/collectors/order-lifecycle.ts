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

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // V11 §6.8.5: Orders — avg orders per Ordered Quote (90-day window)
    // ================================================================
    this.ctx.progress.updateSubstep('order-lifecycle', 'v11-orders');
    try {
      const ordersInWindow = await this.ctx.restApi.query<Record<string, unknown>>(
        'SELECT COUNT() FROM Order WHERE CreatedDate >= LAST_N_DAYS:90',
        this.signal
      );
      metrics.ordersInWindow = ordersInWindow.totalSize;

      const orderedQuotes = await this.ctx.restApi.query<Record<string, unknown>>(
        'SELECT COUNT() FROM SBQQ__Quote__c WHERE SBQQ__Primary__c = true AND SBQQ__Ordered__c = true AND CreatedDate >= LAST_N_DAYS:90',
        this.signal
      );
      metrics.orderedQuotesInWindow = orderedQuotes.totalSize;
      metrics.avgOrdersPerOrderedQuote =
        orderedQuotes.totalSize > 0
          ? Math.round((ordersInWindow.totalSize / orderedQuotes.totalSize) * 10) / 10
          : -1; // denominator zero

      findings.push(
        createFinding({
          domain: 'order-lifecycle',
          collector: 'order-lifecycle',
          artifactType: 'TransactionalObjectDetail',
          artifactName: 'Orders — Quote Split Analysis',
          sourceType: 'object',
          metricName: 'orders_per_quote',
          scope: 'Order',
          detected: true,
          countValue: ordersInWindow.totalSize,
          evidenceRefs: [
            {
              type: 'count',
              value: String(ordersInWindow.totalSize),
              label: 'Orders in 90-day window',
            },
            {
              type: 'count',
              value: String(orderedQuotes.totalSize),
              label: 'Ordered Quotes (Primary=TRUE, Ordered=TRUE)',
            },
            {
              type: 'count',
              value: String(metrics.avgOrdersPerOrderedQuote),
              label: 'Avg Orders per Ordered Quote',
            },
          ],
          notes:
            metrics.avgOrdersPerOrderedQuote > 1
              ? 'Value > 1 indicates order-splitting — adds complexity'
              : orderedQuotes.totalSize === 0
                ? 'Not observed in 90-day window'
                : undefined,
        })
      );
    } catch (err) {
      warnings.push(`V11 orders detail failed: ${(err as Error).message}`);
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // V11 §6.8.6: OrderItems — OLIs not contracted + Revenue transactions
    // ================================================================
    this.ctx.progress.updateSubstep('order-lifecycle', 'v11-order-items');
    try {
      const oiDescribe = this.ctx.describeCache.get('OrderItem') as DescribeResult | undefined;
      if (oiDescribe) {
        // Check for SBQQ__Ordered__c field
        const hasOrderedField = oiDescribe.fields.some((f) => f.name === 'SBQQ__Ordered__c');
        if (hasOrderedField) {
          const notContracted = await this.ctx.restApi.query<Record<string, unknown>>(
            'SELECT COUNT() FROM OrderItem WHERE SBQQ__Ordered__c = false AND CreatedDate >= LAST_N_DAYS:90',
            this.signal
          );
          metrics.oliNotContracted90d = notContracted.totalSize;

          findings.push(
            createFinding({
              domain: 'order-lifecycle',
              collector: 'order-lifecycle',
              artifactType: 'TransactionalObjectDetail',
              artifactName: 'Order Products — Contracting Pattern',
              sourceType: 'object',
              metricName: 'oli_contracting',
              scope: 'OrderItem',
              detected: true,
              countValue: notContracted.totalSize,
              evidenceRefs: [
                {
                  type: 'count',
                  value: String(notContracted.totalSize),
                  label: 'OLIs with Ordered=FALSE (90d)',
                },
              ],
              notes:
                notContracted.totalSize > 0
                  ? 'Per-line contracting detected — indicates more user interaction and complexity'
                  : undefined,
            })
          );
        }

        // Revenue transactions / SF Billing signal
        const hasBillingFields = oiDescribe.fields.some((f) => f.name.startsWith('blng__'));
        metrics.hasBillingFieldsOnOrderItem = hasBillingFields;

        findings.push(
          createFinding({
            domain: 'order-lifecycle',
            collector: 'order-lifecycle',
            artifactType: 'TransactionalObjectDetail',
            artifactName: 'Order Products — Billing Signal',
            sourceType: 'object',
            metricName: 'oli_billing',
            scope: 'OrderItem',
            detected: hasBillingFields,
            notes: hasBillingFields
              ? 'SF Billing fields (blng__) detected on OrderItem — indicates Salesforce Billing in use'
              : 'No SF Billing fields detected on OrderItem',
          })
        );
      }
    } catch (err) {
      warnings.push(`V11 OrderItem detail failed: ${(err as Error).message}`);
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // V11 §6.8.7: Contracts — Renewal/Amendment classification
    // ================================================================
    this.ctx.progress.updateSubstep('order-lifecycle', 'v11-contracts');
    try {
      const contractDescribe = this.ctx.describeCache.get('Contract') as DescribeResult | undefined;
      if (contractDescribe) {
        const fieldNames = new Set(contractDescribe.fields.map((f) => f.name));

        // Renewal Forecast / Renewal Quoted detection
        const hasRenewalForecast = fieldNames.has('SBQQ__RenewalForecast__c');
        const hasRenewalQuoted = fieldNames.has('SBQQ__RenewalQuoted__c');

        let renewalForecastCount = 0;
        let renewalQuotedCount = 0;

        if (hasRenewalForecast) {
          try {
            const result = await this.ctx.restApi.query<Record<string, unknown>>(
              'SELECT COUNT() FROM Contract WHERE SBQQ__RenewalForecast__c = true',
              this.signal
            );
            renewalForecastCount = result.totalSize;
          } catch {
            /* field may not be queryable */
          }
        }

        if (hasRenewalQuoted) {
          try {
            const result = await this.ctx.restApi.query<Record<string, unknown>>(
              'SELECT COUNT() FROM Contract WHERE SBQQ__RenewalQuoted__c = true',
              this.signal
            );
            renewalQuotedCount = result.totalSize;
          } catch {
            /* field may not be queryable */
          }
        }

        // Renewal vs Amendment classification (Priority 1: explicit CPQ lineage fields)
        const hasRenewedContract = fieldNames.has('SBQQ__RenewedContract__c');
        const hasAmendedContract = fieldNames.has('SBQQ__AmendedContract__c');

        let renewalCount = 0;
        let amendmentCount = 0;
        const totalContractsForClassification = (metrics.totalContracts as number) || 0;

        if (hasRenewedContract) {
          try {
            const result = await this.ctx.restApi.query<Record<string, unknown>>(
              'SELECT COUNT() FROM Contract WHERE SBQQ__RenewedContract__c != null',
              this.signal
            );
            renewalCount = result.totalSize;
          } catch {
            /* field may not be queryable */
          }
        }

        if (hasAmendedContract) {
          try {
            const result = await this.ctx.restApi.query<Record<string, unknown>>(
              'SELECT COUNT() FROM Contract WHERE SBQQ__AmendedContract__c != null',
              this.signal
            );
            amendmentCount = result.totalSize;
          } catch {
            /* field may not be queryable */
          }
        }

        const newCount = Math.max(
          0,
          totalContractsForClassification - renewalCount - amendmentCount
        );

        findings.push(
          createFinding({
            domain: 'order-lifecycle',
            collector: 'order-lifecycle',
            artifactType: 'TransactionalObjectDetail',
            artifactName: 'Contracts — Classification & Renewal',
            sourceType: 'object',
            metricName: 'contract_classification',
            scope: 'Contract',
            detected: true,
            countValue: totalContractsForClassification,
            evidenceRefs: [
              {
                type: 'count',
                value: String(totalContractsForClassification),
                label: 'Total Contracts (evaluated population)',
              },
              { type: 'count', value: String(renewalCount), label: 'Renewals' },
              { type: 'count', value: String(amendmentCount), label: 'Amendments' },
              { type: 'count', value: String(newCount), label: 'New / Unclassified' },
              {
                type: 'count',
                value: String(renewalForecastCount),
                label: 'Renewal Forecast = TRUE',
              },
              { type: 'count', value: String(renewalQuotedCount), label: 'Renewal Quoted = TRUE' },
            ],
            notes: [
              `Scope: all-time contracts assessed`,
              `Classification via explicit CPQ lineage fields (SBQQ__RenewedContract__c, SBQQ__AmendedContract__c)`,
              renewalForecastCount > 0
                ? `${renewalForecastCount} contracts have Renewal Forecast enabled`
                : null,
              renewalQuotedCount > 0
                ? `${renewalQuotedCount} contracts have Renewal Quoted enabled`
                : null,
            ]
              .filter(Boolean)
              .join('. '),
          })
        );

        metrics.contractRenewals = renewalCount;
        metrics.contractAmendments = amendmentCount;
        metrics.contractNew = newCount;
        metrics.renewalForecastCount = renewalForecastCount;
        metrics.renewalQuotedCount = renewalQuotedCount;
      }
    } catch (err) {
      warnings.push(`V11 Contract detail failed: ${(err as Error).message}`);
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // V11 §6.8.8: Subscriptions — Amended/Renewed counts
    // ================================================================
    this.ctx.progress.updateSubstep('order-lifecycle', 'v11-subscriptions');
    try {
      const subDescribe = this.ctx.describeCache.get('SBQQ__Subscription__c') as
        | DescribeResult
        | undefined;
      if (subDescribe) {
        const fieldNames = new Set(subDescribe.fields.map((f) => f.name));

        // Total subscriptions
        const totalSubs = await this.ctx.restApi.query<Record<string, unknown>>(
          'SELECT COUNT() FROM SBQQ__Subscription__c',
          this.signal
        );
        metrics.totalSubscriptions = totalSubs.totalSize;

        // Amended (via SBQQ__RevisedSubscription__c)
        let amendedSubs = 0;
        if (fieldNames.has('SBQQ__RevisedSubscription__c')) {
          try {
            const result = await this.ctx.restApi.query<Record<string, unknown>>(
              'SELECT COUNT() FROM SBQQ__Subscription__c WHERE SBQQ__RevisedSubscription__c != null',
              this.signal
            );
            amendedSubs = result.totalSize;
          } catch {
            /* field may not be queryable */
          }
        }

        // Renewed (via SBQQ__RenewedSubscription__c or SBQQ__Renewed__c)
        let renewedSubs = 0;
        const renewedField = fieldNames.has('SBQQ__RenewedSubscription__c')
          ? 'SBQQ__RenewedSubscription__c'
          : fieldNames.has('SBQQ__Renewed__c')
            ? 'SBQQ__Renewed__c'
            : null;

        if (renewedField) {
          try {
            const isCheckbox =
              subDescribe.fields.find((f) => f.name === renewedField)?.type === 'boolean';
            const whereClause = isCheckbox ? `${renewedField} = true` : `${renewedField} != null`;
            const result = await this.ctx.restApi.query<Record<string, unknown>>(
              `SELECT COUNT() FROM SBQQ__Subscription__c WHERE ${whereClause}`,
              this.signal
            );
            renewedSubs = result.totalSize;
          } catch {
            /* field may not be queryable */
          }
        }

        findings.push(
          createFinding({
            domain: 'order-lifecycle',
            collector: 'order-lifecycle',
            artifactType: 'TransactionalObjectDetail',
            artifactName: 'Subscriptions — Lifecycle Analysis',
            sourceType: 'object',
            metricName: 'subscription_lifecycle',
            scope: 'SBQQ__Subscription__c',
            detected: true,
            countValue: totalSubs.totalSize,
            evidenceRefs: [
              { type: 'count', value: String(totalSubs.totalSize), label: 'Total Subscriptions' },
              { type: 'count', value: String(amendedSubs), label: 'Amended Subscriptions' },
              { type: 'count', value: String(renewedSubs), label: 'Renewed Subscriptions' },
              ...(renewedField
                ? [
                    {
                      type: 'field-ref' as const,
                      value: renewedField,
                      label: 'Renewed detection field',
                    },
                  ]
                : []),
            ],
            notes: `All-time counts. Amended detected via SBQQ__RevisedSubscription__c. ${renewedField ? `Renewed detected via ${renewedField}.` : 'No renewal detection field found.'}`,
          })
        );

        metrics.amendedSubscriptions = amendedSubs;
        metrics.renewedSubscriptions = renewedSubs;
      }
    } catch (err) {
      warnings.push(`V11 Subscription detail failed: ${(err as Error).message}`);
    }

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
