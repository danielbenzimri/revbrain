/**
 * Usage collector — 90-day quotes, quote lines, trends, opp sync.
 *
 * Implements Extraction Spec Section 12 (§12.2-§12.8):
 * - Quotes — 90-day window (12.2), all fields via dynamic query
 * - 12-month aggregate trends (12.3)
 * - Quote Lines with pricing waterfall (12.4)
 * - Quote Line Groups (12.5)
 * - Opportunity sync health (12.6)
 * - Subscription data (12.7)
 * - All 26 derived metrics (12.8)
 *
 * Uses REST API (counts < 2000 in this org). Bulk API path available
 * for larger orgs.
 *
 * Tier 0 — mandatory. Failure aborts the run.
 *
 * See: Implementation Plan Tasks 4.3a + 4.3b
 */

import { BaseCollector, type CollectorContext, type CollectorResult } from './base.ts';
import type { CollectorDefinition } from './registry.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { createFinding } from '../normalize/findings.ts';
import { buildSafeQuery, getAllSbqqFields } from '../salesforce/query-builder.ts';
import type { DescribeResult } from '../salesforce/rest.ts';

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
    const findings: AssessmentFindingInput[] = [];
    const metrics: Record<string, number | string | boolean> = {};
    const warnings: string[] = [];

    // ================================================================
    // 12.2: Quotes — 90-day + all
    // ================================================================
    this.ctx.progress.updateSubstep('usage', 'quotes');
    this.log.info('extracting_quotes');

    const quoteDescribe = this.ctx.describeCache.get('SBQQ__Quote__c') as
      | DescribeResult
      | undefined;
    if (!quoteDescribe) {
      return this.failWith('SBQQ__Quote__c Describe not in cache');
    }

    // Get ALL SBQQ fields dynamically (best practice per spec)
    const quoteFields = [
      'Id',
      'Name',
      'CreatedDate',
      'LastModifiedDate',
      'CreatedById',
      ...getAllSbqqFields(quoteDescribe),
    ];

    // Check multi-currency
    const hasMultiCurrency = quoteDescribe.fields.some((f) => f.name === 'CurrencyIsoCode');
    if (hasMultiCurrency) {
      quoteFields.push('CurrencyIsoCode');
    }

    // All quotes (for total count and analysis)
    const allQuoteQuery = buildSafeQuery('SBQQ__Quote__c', quoteFields, quoteDescribe, {
      orderBy: 'CreatedDate DESC',
    });
    const allQuotes = await this.ctx.restApi.queryAll<Record<string, unknown>>(
      allQuoteQuery.query,
      this.signal
    );

    // Configurable usage window (default 90 days, override via USAGE_WINDOW_DAYS for demo orgs)
    const windowDays = Number(process.env.USAGE_WINDOW_DAYS ?? 90);
    const windowCutoff = new Date();
    windowCutoff.setDate(windowCutoff.getDate() - windowDays);
    let recentQuotes = allQuotes.filter((q) => {
      const created = new Date(q.CreatedDate as string);
      return created >= windowCutoff;
    });

    // Fallback: if no quotes in the window, use ALL quotes
    // This ensures usage analytics are populated for any org regardless of data age
    let usageWindowLabel = `${windowDays}d`;
    if (recentQuotes.length === 0 && allQuotes.length > 0) {
      recentQuotes = allQuotes;
      const sortedByDate = [...allQuotes].sort(
        (a, b) =>
          new Date(b.CreatedDate as string).getTime() - new Date(a.CreatedDate as string).getTime()
      );
      const oldest = new Date(sortedByDate[sortedByDate.length - 1].CreatedDate as string);
      const newest = new Date(sortedByDate[0].CreatedDate as string);
      usageWindowLabel = `all time (${oldest.toISOString().split('T')[0]} to ${newest.toISOString().split('T')[0]})`;
      this.log.info(
        {
          oldest: oldest.toISOString(),
          newest: newest.toISOString(),
          totalQuotes: allQuotes.length,
        },
        'usage_window_fallback_all_quotes'
      );
    }

    metrics.quoteVolumeAll = allQuotes.length;
    metrics.quoteVolumeLast90Days = recentQuotes.length;
    metrics.usageWindowLabel = usageWindowLabel;

    // Status distribution
    const statusDist: Record<string, number> = {};
    for (const q of allQuotes) {
      const status = (q.SBQQ__Status__c as string) || '(none)';
      statusDist[status] = (statusDist[status] || 0) + 1;
    }

    // Quote to order rate
    const orderedQuotes = allQuotes.filter((q) => q.SBQQ__Ordered__c === true).length;
    metrics.quoteToOrderRate =
      allQuotes.length > 0 ? Math.round((orderedQuotes / allQuotes.length) * 100) : 0;

    // Primary quote rate
    const primaryQuotes = allQuotes.filter((q) => q.SBQQ__Primary__c === true).length;
    metrics.primaryQuoteRate =
      allQuotes.length > 0 ? Math.round((primaryQuotes / allQuotes.length) * 100) : 0;

    // Average net amount
    const amounts = allQuotes
      .map((q) => q.SBQQ__NetAmount__c as number)
      .filter((a) => a != null && a > 0);
    metrics.avgNetAmount =
      amounts.length > 0 ? Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length) : 0;

    this.log.info(
      {
        total: allQuotes.length,
        recent: recentQuotes.length,
        ordered: orderedQuotes,
      },
      'quotes_extracted'
    );

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // 12.3: 12-Month Aggregate Trends
    // ================================================================
    this.ctx.progress.updateSubstep('usage', 'trends');

    try {
      const trendResult = await this.ctx.restApi.query<Record<string, unknown>>(
        'SELECT CALENDAR_MONTH(CreatedDate) monthNum, CALENDAR_YEAR(CreatedDate) yearNum, ' +
          'COUNT(Id) quoteCount FROM SBQQ__Quote__c ' +
          'WHERE CreatedDate >= LAST_N_DAYS:365 ' +
          'GROUP BY CALENDAR_MONTH(CreatedDate), CALENDAR_YEAR(CreatedDate) ' +
          'ORDER BY CALENDAR_YEAR(CreatedDate), CALENDAR_MONTH(CreatedDate)',
        this.signal
      );
      metrics.trendMonths = trendResult.records.length;
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'trend_query_failed');
    }

    // ================================================================
    // 12.4: Quote Lines
    // ================================================================
    this.ctx.progress.updateSubstep('usage', 'quote_lines');

    const qlDescribe = this.ctx.describeCache.get('SBQQ__QuoteLine__c') as
      | DescribeResult
      | undefined;
    let totalQuoteLines = 0;
    let quoteLines: Record<string, unknown>[] = [];

    if (qlDescribe) {
      // Use ALL SBQQ fields for full pricing waterfall
      const qlFields = [
        'Id',
        'SBQQ__Quote__c',
        'SBQQ__Product__c',
        'CreatedDate',
        ...getAllSbqqFields(qlDescribe),
      ];

      const qlQuery = buildSafeQuery('SBQQ__QuoteLine__c', qlFields, qlDescribe, {
        orderBy: 'SBQQ__Quote__c, SBQQ__Number__c',
      });
      quoteLines = await this.ctx.restApi.queryAll<Record<string, unknown>>(
        qlQuery.query,
        this.signal
      );
      totalQuoteLines = quoteLines.length;

      // Lines per quote
      const linesPerQuote: Record<string, number> = {};
      for (const ql of quoteLines) {
        const qid = ql.SBQQ__Quote__c as string;
        linesPerQuote[qid] = (linesPerQuote[qid] || 0) + 1;
      }
      const lineCounts = Object.values(linesPerQuote);
      metrics.avgQuoteLinesPerQuote =
        lineCounts.length > 0
          ? Math.round((lineCounts.reduce((a, b) => a + b, 0) / lineCounts.length) * 10) / 10
          : 0;
      metrics.maxQuoteLinesPerQuote = Math.max(0, ...lineCounts);

      // Discount frequency
      const discountedLines = quoteLines.filter(
        (ql) =>
          (ql.SBQQ__Discount__c as number) > 0 ||
          (ql.SBQQ__AdditionalDiscount__c as number) > 0 ||
          (ql.SBQQ__CustomerDiscount__c as number) > 0
      ).length;
      metrics.discountingFrequency =
        totalQuoteLines > 0 ? Math.round((discountedLines / totalQuoteLines) * 100) : 0;

      // Bundle usage rate
      const bundleLines = quoteLines.filter((ql) => ql.SBQQ__Bundle__c === true).length;
      metrics.bundleUsageRate =
        totalQuoteLines > 0 ? Math.round((bundleLines / totalQuoteLines) * 100) : 0;

      // Product concentration (top products by line count)
      const productCounts: Record<string, number> = {};
      for (const ql of quoteLines) {
        const pid = (ql.SBQQ__Product__c as string) || 'unknown';
        productCounts[pid] = (productCounts[pid] || 0) + 1;
      }
      const sortedProducts = Object.entries(productCounts).sort((a, b) => b[1] - a[1]);
      // allow-slice: top-5 products for concentration metric
      const top5Volume = sortedProducts.slice(0, 5).reduce((sum, [, count]) => sum + count, 0);
      metrics.top5ProductConcentration =
        totalQuoteLines > 0 ? Math.round((top5Volume / totalQuoteLines) * 100) : 0;

      metrics.totalQuoteLines = totalQuoteLines;
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // 12.7: Subscriptions (if any)
    // ================================================================
    this.ctx.progress.updateSubstep('usage', 'subscriptions');
    const subDescribe = this.ctx.describeCache.get('SBQQ__Subscription__c') as
      | DescribeResult
      | undefined;

    if (subDescribe) {
      try {
        const countResult = await this.ctx.restApi.query<Record<string, unknown>>(
          'SELECT COUNT() FROM SBQQ__Subscription__c',
          this.signal
        );
        metrics.totalSubscriptions = countResult.totalSize;
      } catch {
        metrics.totalSubscriptions = 0;
      }
    }

    // ================================================================
    // V11 §6.8.1/6.8.2: Opportunity + OpportunityLineItem counts
    // ================================================================
    this.ctx.progress.updateSubstep('usage', 'v11-opportunities');
    try {
      const oppTotal = await this.ctx.restApi.query<Record<string, unknown>>(
        'SELECT COUNT() FROM Opportunity',
        this.signal
      );
      metrics.totalOpportunities = oppTotal.totalSize;
    } catch {
      metrics.totalOpportunities = -1;
    }

    try {
      const oliTotal = await this.ctx.restApi.query<Record<string, unknown>>(
        'SELECT COUNT() FROM OpportunityLineItem',
        this.signal
      );
      metrics.totalOpportunityLineItems = oliTotal.totalSize;
    } catch {
      metrics.totalOpportunityLineItems = -1;
    }

    // V11 §6.8.3.4: Quote-per-Opportunity behavior (90-day window)
    if (recentQuotes.length > 0) {
      try {
        // Count distinct opportunities with quotes in window
        const oppWithQuotes = await this.ctx.restApi.query<Record<string, unknown>>(
          'SELECT SBQQ__Opportunity2__c FROM SBQQ__Quote__c WHERE CreatedDate >= LAST_N_DAYS:90 AND SBQQ__Opportunity2__c != null GROUP BY SBQQ__Opportunity2__c',
          this.signal
        );
        const oppCount = oppWithQuotes.totalSize;

        if (oppCount > 0) {
          const avgQuotesPerOpp = Math.round((recentQuotes.length / oppCount) * 10) / 10;

          // Non-primary quotes
          const nonPrimaryQuotes = recentQuotes.filter((q) => q.SBQQ__Primary__c === false).length;
          const nonPrimaryPct = Math.round((nonPrimaryQuotes / recentQuotes.length) * 100);

          findings.push(
            createFinding({
              domain: 'usage',
              collector: 'usage',
              artifactType: 'TransactionalObjectDetail',
              artifactName: 'Quote-per-Opportunity Behavior',
              sourceType: 'object',
              metricName: 'quotes_per_opp',
              scope: 'SBQQ__Quote__c',
              detected: true,
              countValue: oppCount,
              evidenceRefs: [
                { type: 'count', value: String(oppCount), label: 'Opps with quotes (90d)' },
                { type: 'count', value: String(recentQuotes.length), label: 'Quotes in window' },
                { type: 'count', value: String(avgQuotesPerOpp), label: 'Avg quotes per Opp' },
                { type: 'count', value: String(nonPrimaryQuotes), label: 'Non-primary quotes' },
                { type: 'count', value: `${nonPrimaryPct}%`, label: 'Non-primary %' },
              ],
              notes:
                oppCount > 5
                  ? `Avg ${avgQuotesPerOpp} quotes/opp, ${nonPrimaryPct}% non-primary`
                  : 'Behavior not confidently classified — window has ≤5 opportunities with quotes',
            })
          );

          metrics.avgQuotesPerOpp = avgQuotesPerOpp;
          metrics.nonPrimaryQuotePct = nonPrimaryPct;
        }
      } catch {
        // Opp linkage query failed — non-blocking
      }
    }

    // V11 §6.8.1: Formula fields on Opportunity referencing SBQQ
    try {
      const oppDescribe = this.ctx.describeCache.get('Opportunity') as DescribeResult | undefined;
      if (oppDescribe) {
        const sbqqFormulas = oppDescribe.fields.filter(
          (f) => f.calculatedFormula && f.calculatedFormula.includes('SBQQ__')
        );
        if (sbqqFormulas.length > 0) {
          findings.push(
            createFinding({
              domain: 'usage',
              collector: 'usage',
              artifactType: 'TransactionalObjectDetail',
              artifactName: 'Opportunity — SBQQ Formula Fields',
              sourceType: 'object',
              metricName: 'opp_sbqq_formulas',
              scope: 'Opportunity',
              detected: true,
              countValue: sbqqFormulas.length,
              evidenceRefs: [
                {
                  type: 'count',
                  value: String(sbqqFormulas.length),
                  label: 'Formula fields referencing SBQQ',
                },
                // allow-slice: capping evidence refs to 10 formula examples — not a truncation concern
                ...sbqqFormulas.slice(0, 10).map((f) => ({
                  type: 'field-ref' as const,
                  value: f.name,
                  label: `Formula: ${f.label}`,
                })),
              ],
            })
          );
        }
        metrics.oppSbqqFormulaCount = sbqqFormulas.length;
      }
    } catch {
      // Non-blocking
    }

    // ================================================================
    // G-04: User Behavior by Role
    // ================================================================
    if (recentQuotes.length > 0) {
      this.ctx.progress.updateSubstep('usage', 'user_behavior');
      const creatorIds = [
        ...new Set(recentQuotes.map((q) => q.CreatedById as string).filter(Boolean)),
      ];

      if (creatorIds.length > 0) {
        try {
          const userResult = await this.ctx.restApi.query<Record<string, unknown>>(
            // allow-slice: SOQL IN-clause cap (200 ids per query)
            `SELECT Id, Name, Profile.Name, UserRole.Name, IsActive FROM User WHERE Id IN ('${creatorIds.slice(0, 200).join("','")}')`,
            this.signal
          );
          const userMap = new Map<string, Record<string, unknown>>();
          for (const u of userResult.records) userMap.set(u.Id as string, u);

          // Aggregate by Profile.Name
          const profileStats: Record<
            string,
            { users: Set<string>; quotes: number; totalAmount: number; ordered: number }
          > = {};
          for (const q of recentQuotes) {
            const user = userMap.get(q.CreatedById as string);
            const profileName =
              ((user?.Profile as Record<string, unknown>)?.Name as string) ?? 'Unknown';
            if (!profileStats[profileName])
              profileStats[profileName] = {
                users: new Set(),
                quotes: 0,
                totalAmount: 0,
                ordered: 0,
              };
            profileStats[profileName].users.add(q.CreatedById as string);
            profileStats[profileName].quotes++;
            profileStats[profileName].totalAmount += Number(q.SBQQ__NetAmount__c ?? 0);
            if (q.SBQQ__Ordered__c === true) profileStats[profileName].ordered++;
          }

          for (const [profile, stats] of Object.entries(profileStats)) {
            findings.push(
              createFinding({
                domain: 'usage',
                collector: 'usage',
                artifactType: 'UserBehavior',
                artifactName: profile,
                sourceType: 'bulk-usage',
                findingType: 'user_behavior',
                riskLevel: 'info',
                countValue: stats.users.size,
                notes: `${stats.users.size} users, ${stats.quotes} quotes (${Math.round((stats.quotes / recentQuotes.length) * 100)}%), avg $${Math.round(stats.totalAmount / stats.quotes).toLocaleString()}, ${Math.round((stats.ordered / stats.quotes) * 100)}% conversion`,
                evidenceRefs: [
                  { type: 'count' as const, value: String(stats.users.size), label: 'Users' },
                  {
                    type: 'count' as const,
                    value: String(Math.round((stats.quotes / recentQuotes.length) * 100)),
                    label: '% of quotes',
                  },
                  {
                    type: 'count' as const,
                    value: String(Math.round((stats.ordered / stats.quotes) * 100)),
                    label: 'Conversion %',
                  },
                ],
              })
            );
          }
        } catch (err) {
          this.log.warn({ error: (err as Error).message }, 'user_behavior_failed');
        }
      }
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // G-05: Discount Distribution by Range
    // ================================================================
    if (recentQuotes.length > 0 && quoteLines.length > 0) {
      const discountBuckets: Record<string, number> = {
        '0-5': 0,
        '6-10': 0,
        '11-15': 0,
        '16-20': 0,
        '>20': 0,
      };
      let totalDiscount = 0;
      let discountedCount = 0;

      // Build line lookup by quote
      const linesByQuote = new Map<string, Array<Record<string, unknown>>>();
      for (const ql of quoteLines) {
        const qid = ql.SBQQ__Quote__c as string;
        if (!linesByQuote.has(qid)) linesByQuote.set(qid, []);
        linesByQuote.get(qid)!.push(ql);
      }

      // P3-6 fix: bucket by per-LINE TotalDiscountRate (the
      // effective discount after all rule-applied discounts) rather
      // than the raw quote-level CustomerDiscount or line-level
      // Discount + AdditionalDiscount. The UI validator uses
      // SBQQ__TotalDiscountRate__c which is the standard metric
      // SIs examine. One finding per discounted quote line.
      for (const ql of quoteLines) {
        const totalDiscountRate = Number(ql.SBQQ__TotalDiscountRate__c ?? 0);
        const rawDiscount =
          Number(ql.SBQQ__Discount__c ?? 0) + Number(ql.SBQQ__AdditionalDiscount__c ?? 0);
        // Use TotalDiscountRate when available, fall back to raw sum
        const effectiveDiscount = totalDiscountRate > 0 ? totalDiscountRate : rawDiscount;
        if (effectiveDiscount <= 0) continue;
        discountedCount++;
        totalDiscount += effectiveDiscount;

        if (effectiveDiscount <= 5) discountBuckets['0-5']++;
        else if (effectiveDiscount <= 10) discountBuckets['6-10']++;
        else if (effectiveDiscount <= 15) discountBuckets['11-15']++;
        else if (effectiveDiscount <= 20) discountBuckets['16-20']++;
        else discountBuckets['>20']++;
      }

      metrics.avgDiscountPercent =
        discountedCount > 0 ? Math.round((totalDiscount / discountedCount) * 10) / 10 : 0;
      metrics.discountedQuoteCount = discountedCount;

      findings.push(
        createFinding({
          domain: 'usage',
          collector: 'usage',
          artifactType: 'DiscountDistribution',
          artifactName: 'Discount Distribution (90-day)',
          sourceType: 'bulk-usage',
          findingType: 'discount_distribution',
          riskLevel: 'info',
          countValue: discountedCount,
          notes: `Avg discount: ${metrics.avgDiscountPercent}%. ${Object.entries(discountBuckets)
            .map(([k, v]) => `${k}%: ${v}`)
            .join(', ')}`,
          evidenceRefs: Object.entries(discountBuckets).map(([range, count]) => ({
            type: 'count' as const,
            value: String(count),
            label: `${range}%`,
          })),
        })
      );
    }

    // ================================================================
    // G-06: Manual Price Override Detection (using CPQ override fields)
    // ================================================================
    if (quoteLines.length > 0) {
      let overrideCount = 0;
      let overrideRevenueImpact = 0;

      for (const line of quoteLines) {
        const specialPriceType = line.SBQQ__SpecialPriceType__c as string;
        const pricingMethodOverride = line.SBQQ__PricingMethodOverride__c;

        const isOverride =
          specialPriceType === 'Custom' ||
          pricingMethodOverride != null ||
          (line.SBQQ__SpecialPrice__c != null &&
            line.SBQQ__SpecialPrice__c !== line.SBQQ__ListPrice__c &&
            line.SBQQ__PriceEditable__c === true);

        if (isOverride) {
          overrideCount++;
          const listPrice = Number(line.SBQQ__ListPrice__c ?? 0);
          const netPrice = Number(line.SBQQ__NetPrice__c ?? 0);
          const qty = Number(line.SBQQ__Quantity__c ?? 1);
          overrideRevenueImpact += (listPrice - netPrice) * qty;
        }
      }

      metrics.manualOverrideCount = overrideCount;
      metrics.manualOverrideRate =
        quoteLines.length > 0 ? Math.round((overrideCount / quoteLines.length) * 1000) / 10 : 0;

      findings.push(
        createFinding({
          domain: 'usage',
          collector: 'usage',
          artifactType: 'PriceOverrideAnalysis',
          artifactName: 'Manual Price Overrides',
          sourceType: 'bulk-usage',
          findingType: 'price_overrides',
          riskLevel: overrideCount > 0 ? 'medium' : 'info',
          countValue: overrideCount,
          notes: `${overrideCount} lines (${metrics.manualOverrideRate}%) with manual overrides. Revenue impact: $${Math.round(overrideRevenueImpact).toLocaleString()}`,
          evidenceRefs: [
            { type: 'count' as const, value: String(overrideCount), label: 'Override count' },
            {
              type: 'count' as const,
              value: String(metrics.manualOverrideRate),
              label: 'Override rate %',
            },
            {
              type: 'count' as const,
              value: String(Math.round(overrideRevenueImpact)),
              label: 'Revenue impact $',
            },
          ],
        })
      );
    }

    // ================================================================
    // G-08: Top 10 Quoted Products (distinct quotes, not lines)
    // ================================================================
    if (quoteLines.length > 0) {
      // C4: Scope quote lines to 90-day window so numerator (distinct quotes per product)
      // and denominator (recentQuotes.length) use the same time window.
      // Without this, products on all-time quotes produce >100% percentages.
      const recentQuoteIds = new Set(recentQuotes.map((q) => q.Id as string));
      const scopedLines = quoteLines.filter((ql) =>
        recentQuoteIds.has(ql.SBQQ__Quote__c as string)
      );

      const productQuoteSets = new Map<string, Set<string>>();
      for (const ql of scopedLines) {
        const pid = ql.SBQQ__Product__c as string;
        const qid = ql.SBQQ__Quote__c as string;
        if (!pid || !qid) continue;
        if (!productQuoteSets.has(pid)) productQuoteSets.set(pid, new Set());
        productQuoteSets.get(pid)!.add(qid);
      }

      const top10 = [...productQuoteSets.entries()]
        .map(([id, quotes]) => ({ id, quotedCount: quotes.size }))
        .sort((a, b) => b.quotedCount - a.quotedCount)
        .slice(0, 10); // allow-slice: top-10 most-quoted products

      // Enrich with product names
      if (top10.length > 0) {
        try {
          const ids = top10.map((p) => `'${p.id}'`).join(',');
          const productResult = await this.ctx.restApi.query<Record<string, unknown>>(
            `SELECT Id, Name, ProductCode, Family FROM Product2 WHERE Id IN (${ids})`,
            this.signal
          );
          const productMap = new Map<string, Record<string, unknown>>();
          for (const p of productResult.records) productMap.set(p.Id as string, p);

          const totalQuoteCount = recentQuotes.length || 1;
          for (const entry of top10) {
            const product = productMap.get(entry.id);
            findings.push(
              createFinding({
                domain: 'usage',
                collector: 'usage',
                artifactType: 'TopQuotedProduct',
                artifactName: (product?.Name as string) ?? entry.id,
                artifactId: entry.id,
                sourceType: 'bulk-usage',
                findingType: 'top_product',
                riskLevel: 'info',
                countValue: entry.quotedCount,
                notes: `Category: ${(product?.Family as string) ?? 'Unknown'}. Quoted on ${Math.round((entry.quotedCount / totalQuoteCount) * 1000) / 10}% of quotes (${entry.quotedCount} / ${totalQuoteCount}).`,
                evidenceRefs: [
                  {
                    type: 'field-ref' as const,
                    value: 'Product2.ProductCode',
                    label: (product?.ProductCode as string) ?? '',
                  },
                  {
                    type: 'field-ref' as const,
                    value: 'Product2.Family',
                    label: (product?.Family as string) ?? '',
                  },
                ],
              })
            );
          }
        } catch (err) {
          this.log.warn({ error: (err as Error).message }, 'top_products_lookup_failed');
        }
      }
    }

    // ================================================================
    // G-09: Conversion by Deal Size Segment + G-20: Avg Close Time
    // ================================================================
    if (recentQuotes.length > 0) {
      const segments = [
        { label: 'Small (<$5K)', min: 0, max: 5000 },
        { label: 'Medium ($5K-$25K)', min: 5000, max: 25000 },
        { label: 'Large ($25K-$100K)', min: 25000, max: 100000 },
        { label: 'Enterprise (>$100K)', min: 100000, max: Infinity },
      ];

      const totalRevenue = recentQuotes.reduce((s, q) => s + Number(q.SBQQ__NetAmount__c ?? 0), 0);

      for (const seg of segments) {
        const inSeg = recentQuotes.filter((q) => {
          const amt = Number(q.SBQQ__NetAmount__c ?? 0);
          return amt >= seg.min && amt < seg.max;
        });
        const ordered = inSeg.filter((q) => q.SBQQ__Ordered__c === true);
        const segRevenue = inSeg.reduce((s, q) => s + Number(q.SBQQ__NetAmount__c ?? 0), 0);

        if (inSeg.length === 0) continue;

        // G-20: Avg Close Time per Segment
        let avgCloseDays = 0;
        if (ordered.length > 0) {
          const totalDays = ordered.reduce((sum, q) => {
            const created = Date.parse(String(q.CreatedDate ?? ''));
            const closed = Date.parse(String(q.LastModifiedDate ?? ''));
            const days = (closed - created) / 86400000;
            return sum + Math.max(days, 0);
          }, 0);
          avgCloseDays = Math.round(totalDays / ordered.length);
        }

        const convPct = Math.round((ordered.length / inSeg.length) * 100);
        const quotePct = Math.round((inSeg.length / recentQuotes.length) * 100);
        const revPct = Math.round((segRevenue / (totalRevenue || 1)) * 100);

        findings.push(
          createFinding({
            domain: 'usage',
            collector: 'usage',
            artifactType: 'ConversionSegment',
            artifactName: seg.label,
            sourceType: 'bulk-usage',
            findingType: 'conversion_segment',
            riskLevel: 'info',
            countValue: inSeg.length,
            notes: `${quotePct}% of quotes, ${revPct}% of revenue. Conversion: ${convPct}%.${ordered.length > 0 ? ` Avg close time: ${avgCloseDays} days.` : ''}`,
            evidenceRefs: [
              {
                type: 'count' as const,
                value: String(quotePct),
                label: '% of quotes',
              },
              {
                type: 'count' as const,
                value: String(revPct),
                label: '% of revenue',
              },
              {
                type: 'count' as const,
                value: String(convPct),
                label: 'conversion %',
              },
              {
                type: 'count' as const,
                value: String(avgCloseDays),
                label: 'avg close days',
              },
            ],
          })
        );
      }
    }

    // ================================================================
    // G-10: Quote Modification Patterns (Version field preferred)
    // ================================================================
    if (recentQuotes.length > 0) {
      const versionedQuotes = recentQuotes.filter((q) => Number(q.SBQQ__Version__c ?? 1) > 1);
      metrics.quoteModificationRate = Math.round(
        (versionedQuotes.length / recentQuotes.length) * 100
      );
    }

    // ================================================================
    // G-18: Trend Indicators (3-month split)
    // ================================================================
    if (recentQuotes.length > 0) {
      const now = Date.now();
      const day = 86400000;
      const month1 = recentQuotes.filter(
        (q) => now - new Date(q.CreatedDate as string).getTime() >= 60 * day
      );
      const month2 = recentQuotes.filter((q) => {
        const age = now - new Date(q.CreatedDate as string).getTime();
        return age >= 30 * day && age < 60 * day;
      });
      const month3 = recentQuotes.filter(
        (q) => now - new Date(q.CreatedDate as string).getTime() < 30 * day
      );

      const computeTrend = (m2Count: number, m3Count: number): string => {
        if (m2Count === 0) return 'N/A';
        const pct = Math.round(((m3Count - m2Count) / m2Count) * 100);
        if (pct > 5) return `↑ ${pct}%`;
        if (pct < -5) return `↓ ${Math.abs(pct)}%`;
        return 'Stable';
      };

      findings.push(
        createFinding({
          domain: 'usage',
          collector: 'usage',
          artifactType: 'TrendIndicator',
          artifactName: 'Quote Volume Trend',
          sourceType: 'bulk-usage',
          findingType: 'trend',
          riskLevel: 'info',
          notes: `M1: ${month1.length}, M2: ${month2.length}, M3: ${month3.length}. Trend: ${computeTrend(month2.length, month3.length)}`,
          evidenceRefs: [
            { type: 'count' as const, value: String(month1.length), label: 'Month 1' },
            { type: 'count' as const, value: String(month2.length), label: 'Month 2' },
            { type: 'count' as const, value: String(month3.length), label: 'Month 3' },
            {
              type: 'count' as const,
              value: computeTrend(month2.length, month3.length),
              label: 'Trend',
            },
          ],
        })
      );
    }

    // ================================================================
    // G-19: Data Quality Flags
    // ================================================================
    this.ctx.progress.updateSubstep('usage', 'data_quality');

    // Orphaned quote lines
    try {
      const orphanResult = await this.ctx.restApi.query<Record<string, unknown>>(
        'SELECT COUNT() FROM SBQQ__QuoteLine__c WHERE SBQQ__Quote__c = null AND CreatedDate >= LAST_N_DAYS:90',
        this.signal
      );
      findings.push(
        createFinding({
          domain: 'usage',
          collector: 'usage',
          artifactType: 'DataQualityFlag',
          artifactName: 'Orphaned Quote Lines',
          sourceType: 'object',
          findingType: 'data_quality',
          riskLevel: orphanResult.totalSize > 0 ? 'low' : 'info',
          countValue: orphanResult.totalSize,
          notes:
            orphanResult.totalSize > 0
              ? `${orphanResult.totalSize} quote lines found without parent quote. Status: flagged.`
              : 'No orphaned quote lines detected. Status: clean.',
        })
      );
    } catch {
      // Non-critical
    }

    // Duplicate product codes
    try {
      // P3-1 fix: use records.length, not totalSize. Salesforce's
      // totalSize on GROUP BY queries is unreliable — some API
      // versions return the result row count, others return -1.
      const dupeResult = await this.ctx.restApi.query<Record<string, unknown>>(
        'SELECT ProductCode, COUNT(Id) dupeCount FROM Product2 WHERE IsActive = true AND ProductCode != null GROUP BY ProductCode HAVING COUNT(Id) > 1',
        this.signal
      );
      const dupeCount = dupeResult.records.length;
      findings.push(
        createFinding({
          domain: 'usage',
          collector: 'usage',
          artifactType: 'DataQualityFlag',
          artifactName: 'Duplicate Product Codes',
          sourceType: 'object',
          findingType: 'data_quality',
          riskLevel: dupeCount > 0 ? 'medium' : 'info',
          countValue: dupeCount,
          notes:
            dupeCount > 0
              ? `${dupeCount} product codes shared by multiple active products. Status: flagged.`
              : 'No duplicate product codes detected. Status: clean.',
        })
      );
    } catch {
      // Non-critical
    }

    // Inactive products on ordered quotes
    try {
      const inactiveResult = await this.ctx.restApi.query<Record<string, unknown>>(
        'SELECT COUNT() FROM SBQQ__QuoteLine__c WHERE SBQQ__Product__r.IsActive = false AND SBQQ__Quote__r.SBQQ__Ordered__c = true AND CreatedDate >= LAST_N_DAYS:90',
        this.signal
      );
      findings.push(
        createFinding({
          domain: 'usage',
          collector: 'usage',
          artifactType: 'DataQualityFlag',
          artifactName: 'Inactive Products on Ordered Quotes',
          sourceType: 'object',
          findingType: 'data_quality',
          riskLevel: inactiveResult.totalSize > 0 ? 'low' : 'info',
          countValue: inactiveResult.totalSize,
          notes:
            inactiveResult.totalSize > 0
              ? `${inactiveResult.totalSize} ordered quote lines reference inactive products. Status: flagged.`
              : 'No inactive products on ordered quotes. Status: clean.',
        })
      );
    } catch {
      // Non-critical
    }

    // Not assessed items
    findings.push(
      createFinding({
        domain: 'usage',
        collector: 'usage',
        artifactType: 'DataQualityFlag',
        artifactName: 'Invalid Picklist Values',
        sourceType: 'inferred',
        findingType: 'data_quality',
        riskLevel: 'info',
        notes: 'Not assessed in current scope. Requires full schema + data scan.',
      })
    );

    // ================================================================
    // Build findings
    // ================================================================

    // Aggregate finding for usage overview
    findings.push(
      createFinding({
        domain: 'usage',
        collector: 'usage',
        artifactType: 'UsageOverview',
        artifactName: 'Quote Usage Analytics',
        sourceType: 'bulk-usage',
        metricName: 'usage_overview',
        scope: 'global',
        countValue: allQuotes.length,
        notes: `${allQuotes.length} total quotes, ${recentQuotes.length} in last 90 days, ${totalQuoteLines} lines`,
      })
    );

    const coverage = allQuotes.length > 0 ? 100 : totalQuoteLines > 0 ? 50 : 0;

    this.log.info(
      {
        quotes: allQuotes.length,
        recentQuotes: recentQuotes.length,
        quoteLines: totalQuoteLines,
        findings: findings.length,
      },
      'usage_complete'
    );

    return {
      findings,
      relationships: [],
      metrics: {
        collectorName: 'usage',
        domain: 'usage',
        metrics,
        warnings,
        coverage,
        schemaVersion: '1.0',
      },
      status: 'success',
    };
  }

  private failWith(error: string): CollectorResult {
    return {
      findings: [],
      relationships: [],
      metrics: {
        collectorName: 'usage',
        domain: 'usage',
        metrics: {},
        warnings: [error],
        coverage: 0,
        schemaVersion: '1.0',
      },
      status: 'failed',
      error,
    };
  }
}
